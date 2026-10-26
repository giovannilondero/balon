import {
  addPlayer,
  createState,
  MAX_PLAYERS,
  removePlayer,
  step,
  TICK_RATE,
  type GameEvent,
  type GameState,
  type Team,
} from "../shared/game.ts";
import type { RoomInfo, RoomKind, RoomSummary, Snapshot } from "../shared/protocol.ts";
import { BotBrain, botName, type BotLevel } from "./bot.ts";

// Niente lettere/cifre ambigue (0/O, 1/I/L).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class Room {
  readonly state: GameState = createState();
  hostId: string;
  botLevel: BotLevel = "medium";
  private events: GameEvent[] = [];
  private bots = new Map<string, BotBrain>();

  constructor(
    readonly code: string,
    readonly name: string,
    readonly kind: RoomKind,
    /** Rete di chi l'ha creata: per le partite locali è l'unica ammessa. */
    readonly networkKey: string,
    public minutes: number,
    hostId: string,
  ) {
    this.hostId = hostId;
  }

  get topic() {
    return `room:${this.code}`;
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
    if (this.hostId === id) {
      const people = this.state.players.filter((p) => !this.bots.has(p.id));
      const next = people.find((p) => !p.away) ?? people[0];
      if (next) this.hostId = next.id;
    }
  }

  addBot(team: Team) {
    if (this.full) return;
    const id = `cpu-${Math.random().toString(36).slice(2, 8)}`;
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

  isBot(id: string) {
    return this.bots.has(id);
  }

  player(id: string) {
    return this.state.players.find((p) => p.id === id);
  }

  tick() {
    for (const brain of this.bots.values()) {
      const p = this.player(brain.id);
      if (p) brain.update(this.state, p);
    }
    step(this.state, this.events);
  }

  /** Eventi generati fuori dalla simulazione (es. fischio d'inizio). */
  push(event: GameEvent) {
    this.events.push(event);
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      name: this.name,
      kind: this.kind,
      players: this.state.players.length,
      cpu: this.bots.size,
      max: MAX_PLAYERS,
      match: this.state.match,
    };
  }

  info(): RoomInfo {
    return { ...this.summary(), hostId: this.hostId, minutes: this.minutes, bots: this.botCounts(), botLevel: this.botLevel };
  }

  snapshot(): Snapshot {
    const s = this.state;
    const snap: Snapshot = {
      t: "snap",
      tick: s.tick,
      ball: [round(s.ball.x), round(s.ball.y)],
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        x: round(p.x),
        y: round(p.y),
        k: p.input.kick,
        away: p.away,
        bot: this.bots.has(p.id),
      })),
      score: [s.score.red, s.score.blue],
      match: s.match,
      phase: s.phase,
      kickoffTeam: s.kickoffTeam,
      time: Math.ceil(s.timeLeft / TICK_RATE),
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
