import {
  addPlayer,
  createState,
  MAX_PLAYERS,
  removePlayer,
  step,
  TICK_RATE,
  type GameEvent,
  type GameState,
  type Input,
  type Team,
} from "../shared/game.ts";
import type { RoomInfo, RoomKind, RoomSummary, Snapshot } from "../shared/protocol.ts";
import { BotBrain, botName, isBotId, newBotId, type BotLevel } from "./bot.ts";

// Niente lettere/cifre ambigue (0/O, 1/I/L).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Un comando non può prenotare un tick più lontano di così: oltre è un orologio sballato. */
const MAX_INPUT_AHEAD = 2 * TICK_RATE;
/** Comandi in attesa per giocatore: un client onesto ne ha pochi in volo. */
const MAX_QUEUED_INPUTS = 32;

export class Room {
  readonly state: GameState = createState();
  hostId: string;
  botLevel: BotLevel = "medium";
  private events: GameEvent[] = [];
  private bots = new Map<string, BotBrain>();
  /** Comandi arrivati in anticipo, ognuno col tick da cui vale. */
  private queued = new Map<string, { tick: number; input: Input }[]>();

  constructor(
    readonly code: string,
    readonly hostName: string,
    readonly kind: RoomKind,
    /** Rete di chi l'ha creata: per le partite locali è l'unica ammessa. */
    readonly networkKey: string,
    public minutes: number,
    hostId: string,
  ) {
    this.hostId = hostId;
  }

  get full() {
    return this.state.players.length >= MAX_PLAYERS;
  }

  /** Giocatori umani (connessi o in attesa di riconnessione). */
  get humans() {
    return this.state.players.filter((p) => !this.bots.has(p.id)).length;
  }

  add(id: string, name: string) {
    // Se è piena di CPU, un bot lascia il posto a una persona.
    if (this.full) {
      const counts = this.botCounts();
      if (counts.red + counts.blue > 0) this.removeBot(counts.red >= counts.blue ? "red" : "blue");
    }
    addPlayer(this.state, id, name);
  }

  /** Rimuove il giocatore; se era l'host passa il ruolo a un'altra persona. */
  remove(id: string) {
    removePlayer(this.state, id);
    this.queued.delete(id);
    if (this.hostId === id) {
      const people = this.state.players.filter((p) => !this.bots.has(p.id));
      const next = people.find((p) => !p.away) ?? people[0];
      if (next) this.hostId = next.id;
    }
  }

  addBot(team: Team) {
    if (this.full) return;
    const id = newBotId();
    addPlayer(this.state, id, botName(team, this.botCounts()[team] + 1), team);
    this.bots.set(id, new BotBrain(id, this.botLevel));
  }

  removeBot(team: Team) {
    const bot = this.state.players.findLast((p) => p.team === team && this.bots.has(p.id));
    if (!bot) return;
    removePlayer(this.state, bot.id);
    this.bots.delete(bot.id);
  }

  setBotLevel(level: BotLevel) {
    this.botLevel = level;
    for (const brain of this.bots.values()) brain.level = level;
  }

  botCounts(): Record<Team, number> {
    const counts = { red: 0, blue: 0 };
    for (const p of this.state.players) if (this.bots.has(p.id)) counts[p.team]++;
    return counts;
  }

  /** Il comando vale dal tick `tick` (il client lo sta già mostrando); senza tick, o in ritardo, dal prossimo. */
  queueInput(id: string, input: Input, tick: unknown) {
    const next = this.state.tick + 1;
    const at = Number.isInteger(tick) ? Math.min(Math.max(tick as number, next), next + MAX_INPUT_AHEAD) : next;
    const queue = this.queued.get(id) ?? [];
    // I comandi arrivano in ordine: uno con un tick precedente sostituisce quelli dopo.
    while (queue.length && queue.at(-1)!.tick >= at) queue.pop();
    queue.push({ tick: at, input });
    if (queue.length > MAX_QUEUED_INPUTS) queue.shift();
    this.queued.set(id, queue);
  }

  clearInputs(id: string) {
    this.queued.delete(id);
  }

  isBot(id: string) {
    return this.bots.has(id);
  }

  player(id: string) {
    return this.state.players.find((p) => p.id === id);
  }

  /** Avanza di un tick. Restituisce true se la partita è appena finita. */
  tick() {
    const next = this.state.tick + 1;
    for (const [id, queue] of this.queued) {
      const p = this.player(id);
      while (queue.length && queue[0].tick <= next) {
        const { input } = queue.shift()!;
        if (p) p.input = input;
      }
      if (!queue.length) this.queued.delete(id);
    }
    for (const brain of this.bots.values()) {
      const p = this.player(brain.id);
      if (p) brain.update(this.state, p);
    }
    const summary = this.state.summary;
    step(this.state, this.events);
    return this.state.summary !== summary;
  }

  /** Eventi generati fuori dalla simulazione (es. fischio d'inizio). */
  push(event: GameEvent) {
    this.events.push(event);
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      host: this.hostName,
      kind: this.kind,
      players: this.state.players.length,
      cpu: this.bots.size,
      max: MAX_PLAYERS,
      match: this.state.match,
    };
  }

  info(): RoomInfo {
    const last = this.state.summary;
    return {
      ...this.summary(),
      hostId: this.hostId,
      minutes: this.minutes,
      bots: this.botCounts(),
      botLevel: this.botLevel,
      lastMatch: last && { ...last, players: last.players.map((p) => ({ ...p, bot: isBotId(p.id) })) },
    };
  }

  snapshot(): Snapshot {
    const s = this.state;
    const { ball } = s;
    const snap: Snapshot = {
      t: "snap",
      tick: s.tick,
      ball: [round(ball.x), round(ball.y), roundV(ball.vx), roundV(ball.vy)],
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        x: round(p.x),
        y: round(p.y),
        vx: roundV(p.vx),
        vy: roundV(p.vy),
        i: [p.input.mx, p.input.my, p.input.kick ? 1 : 0],
        pk: p.prevKick,
        ka: p.kickArmed,
        away: p.away,
        bot: this.bots.has(p.id),
      })),
      score: [s.score.red, s.score.blue],
      match: s.match,
      phase: s.phase,
      phaseTimer: s.phaseTimer,
      kickoffTeam: s.kickoffTeam,
      timeLeft: s.timeLeft,
      golden: s.golden,
      events: this.events,
    };
    this.events = [];
    return snap;
  }
}

export function newCode(taken: (code: string) => boolean) {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken(code)) return code;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
/** Le velocità sono piccole (unità/tick): servono più decimali perché la predizione non devii. */
const roundV = (n: number) => Math.round(n * 1000) / 1000;
