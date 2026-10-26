import type { GameEvent, GameState, MatchSummary, PlayerStats, Team } from "./game.ts";

export type RoomKind = "local" | "online";

export type BotLevel = "easy" | "medium" | "hard";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "medium", "hard"];

export type ClientMessage =
  /** Primo messaggio: il token permette di riprendere il posto dopo una disconnessione. */
  | { t: "hello"; token: string }
  | { t: "list" }
  /** cpu: crea la partita con un avversario controllato dal computer. */
  | { t: "create"; name: string; kind: RoomKind; minutes: number; cpu?: BotLevel }
  | { t: "join"; name: string; code: string }
  | { t: "leave" }
  /**
   * [mx, my, kick] con mx, my in [-100, 100]. k: il tick da cui vale, già simulato
   * dal client in anticipo; il server lo applica a quel tick (o appena arriva, se è tardi).
   */
  | { t: "input"; i: [number, number, 0 | 1]; k?: number }
  | { t: "team" }
  | { t: "start"; minutes?: number }
  /** Solo host: chiude il riepilogo e torna al palleggio libero. */
  | { t: "warmup" }
  /** Solo host: aggiunge (+1) o toglie (-1) un bot a una squadra. */
  | { t: "bot"; team: Team; delta: 1 | -1 }
  | { t: "botLevel"; level: BotLevel }
  | { t: "ping"; c: number };

export interface RoomSummary {
  code: string;
  /** Nome di chi l'ha creata: il titolo della stanza lo compone il client, nella sua lingua. */
  host: string;
  kind: RoomKind;
  players: number;
  /** Quanti dei giocatori sono bot. */
  cpu: number;
  max: number;
  match: GameState["match"];
}

export interface RoomInfo extends RoomSummary {
  hostId: string;
  minutes: number;
  bots: Record<Team, number>;
  botLevel: BotLevel;
  /** Riepilogo dell'ultima partita: resta disponibile anche a chi rientra dopo la fine. */
  lastMatch: MatchReport | null;
}

export type MatchReport = Omit<MatchSummary, "players"> & { players: (PlayerStats & { bot: boolean })[] };

/** Lo stato completo, velocità comprese: il client ci riparte per simulare in anticipo. */
export interface SnapshotPlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Comandi in corso: [mx, my, kick]. */
  i: [number, number, 0 | 1];
  /** prevKick e kickArmed della simulazione. */
  pk: boolean;
  ka: boolean;
  away: boolean;
  bot: boolean;
}

export interface Snapshot {
  t: "snap";
  tick: number;
  /** [x, y, vx, vy] */
  ball: [number, number, number, number];
  players: SnapshotPlayer[];
  score: [number, number];
  match: GameState["match"];
  phase: GameState["phase"];
  phaseTimer: number;
  kickoffTeam: Team;
  /** Tick rimanenti. */
  timeLeft: number;
  golden: boolean;
  events: GameEvent[];
}

/** Il server manda solo il codice: il testo lo traduce il client. */
export type ErrorCode = "bad-token" | "name-required" | "room-not-found" | "room-local-only" | "room-full" | "team-switch-locked";

export type ServerMessage =
  | { t: "welcome"; id: string }
  | { t: "rooms"; rooms: RoomSummary[]; network: "lan" | "internet" }
  | { t: "joined"; room: RoomInfo }
  | { t: "room"; room: RoomInfo }
  | { t: "left" }
  | { t: "error"; code: ErrorCode }
  /** a: ultimo tick simulato dalla stanza all'arrivo del ping, per misurare quanto anticipare i comandi. */
  | { t: "pong"; c: number; a?: number }
  | Snapshot;
