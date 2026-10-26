import type { GameEvent, GameState, Team } from "./game.ts";

export type RoomKind = "local" | "online";

export type ClientMessage =
  /** Primo messaggio: il token permette di riprendere il posto dopo una disconnessione. */
  | { t: "hello"; token: string }
  | { t: "list" }
  | { t: "create"; name: string; kind: RoomKind; minutes: number }
  | { t: "join"; name: string; code: string }
  | { t: "leave" }
  /** [mx, my, kick] con mx, my in [-100, 100]. */
  | { t: "input"; i: [number, number, 0 | 1] }
  | { t: "team" }
  | { t: "start"; minutes?: number }
  | { t: "ping"; c: number };

export interface RoomSummary {
  code: string;
  name: string;
  kind: RoomKind;
  players: number;
  max: number;
  match: GameState["match"];
}

export interface RoomInfo extends RoomSummary {
  hostId: string;
  minutes: number;
}

export interface SnapshotPlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  /** Tasto calcio premuto. */
  k: boolean;
  away: boolean;
}

export interface Snapshot {
  t: "snap";
  tick: number;
  ball: [number, number];
  players: SnapshotPlayer[];
  score: [number, number];
  match: GameState["match"];
  phase: GameState["phase"];
  kickoffTeam: Team;
  /** Secondi rimanenti. */
  time: number;
  golden: boolean;
  events: GameEvent[];
}

export type ServerMessage =
  | { t: "welcome"; id: string }
  | { t: "rooms"; rooms: RoomSummary[]; network: "lan" | "internet" }
  | { t: "joined"; room: RoomInfo }
  | { t: "room"; room: RoomInfo }
  | { t: "left" }
  | { t: "error"; message: string }
  | { t: "pong"; c: number }
  | Snapshot;
