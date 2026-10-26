import {
  addPlayer,
  createState,
  MAX_PLAYERS,
  removePlayer,
  step,
  TICK_RATE,
  type GameEvent,
  type GameState,
} from "../shared/game.ts";
import type { RoomInfo, RoomKind, RoomSummary, Snapshot } from "../shared/protocol.ts";

// Niente lettere/cifre ambigue (0/O, 1/I/L).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export class Room {
  readonly state: GameState = createState();
  hostId: string;
  private events: GameEvent[] = [];

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

  add(id: string, name: string) {
    addPlayer(this.state, id, name);
  }

  /** Rimuove il giocatore; se era l'host passa il ruolo a qualcun altro. */
  remove(id: string) {
    removePlayer(this.state, id);
    if (this.hostId === id) {
      const next = this.state.players.find((p) => !p.away) ?? this.state.players[0];
      if (next) this.hostId = next.id;
    }
  }

  player(id: string) {
    return this.state.players.find((p) => p.id === id);
  }

  tick() {
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
      max: MAX_PLAYERS,
      match: this.state.match,
    };
  }

  info(): RoomInfo {
    return { ...this.summary(), hostId: this.hostId, minutes: this.minutes };
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
