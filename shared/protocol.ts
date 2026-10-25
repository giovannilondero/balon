import type { GameEvent, Team } from "./game.ts";

export type ClientMessage =
  | { t: "join"; name: string }
  | { t: "input"; bits: number }
  | { t: "team" };

export interface SnapshotPlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  /** Tasto calcio premuto. */
  k: boolean;
}

export interface Snapshot {
  t: "snap";
  tick: number;
  ball: [number, number];
  players: SnapshotPlayer[];
  score: [number, number];
  phase: "play" | "goal";
  events: GameEvent[];
}

export type ServerMessage = { t: "welcome"; id: string } | Snapshot;
