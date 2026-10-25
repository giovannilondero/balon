import { TICK_RATE, type GameEvent } from "../shared/game.ts";
import type { ClientMessage, ServerMessage, Snapshot, SnapshotPlayer } from "../shared/protocol.ts";

/** Ritardo di rendering rispetto all'ultimo stato ricevuto, in tick. */
const INTERP_TICKS = 3;
const TICKS_PER_MS = TICK_RATE / 1000;

export interface RenderState {
  ball: { x: number; y: number };
  players: SnapshotPlayer[];
  score: [number, number];
  phase: Snapshot["phase"];
}

export class NetClient {
  id: string | null = null;
  connected = false;
  onEvent: (e: GameEvent) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  private ws: WebSocket | null = null;
  private snaps: Snapshot[] = [];
  private events: GameEvent[] = [];
  private clockOffset: number | null = null;

  connect(name: string) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.onStatus(true);
      this.send({ t: "join", name });
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus(false);
    };
    ws.onmessage = (e) => this.receive(JSON.parse(e.data) as ServerMessage);
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private receive(msg: ServerMessage) {
    if (msg.t === "welcome") {
      this.id = msg.id;
      return;
    }
    // Stima del tick del server sul nostro orologio, smussata contro il jitter.
    const target = msg.tick - performance.now() * TICKS_PER_MS;
    if (this.clockOffset === null || Math.abs(target - this.clockOffset) > 30) {
      this.clockOffset = target;
    } else {
      this.clockOffset += (target - this.clockOffset) * 0.05;
    }
    this.snaps.push(msg);
    this.events.push(...msg.events);
  }

  /** Stato interpolato da mostrare adesso. Gli eventi escono in sync con l'immagine. */
  sample(now: number): RenderState | null {
    if (this.snaps.length === 0 || this.clockOffset === null) return null;
    const renderTick = now * TICKS_PER_MS + this.clockOffset - INTERP_TICKS;

    while (this.snaps.length > 2 && this.snaps[1].tick <= renderTick) this.snaps.shift();
    while (this.events.length && this.events[0].tick <= renderTick) this.onEvent(this.events.shift()!);

    const a = this.snaps[0];
    const b = this.snaps[1];
    if (!b || renderTick <= a.tick) return fromSnap(a);
    const t = Math.min(1, (renderTick - a.tick) / (b.tick - a.tick));
    const prev = new Map(a.players.map((p) => [p.id, p]));
    return {
      ball: { x: lerp(a.ball[0], b.ball[0], t), y: lerp(a.ball[1], b.ball[1], t) },
      players: b.players.map((p) => {
        const q = prev.get(p.id);
        return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) } : p;
      }),
      score: b.score,
      phase: b.phase,
    };
  }
}

function fromSnap(s: Snapshot): RenderState {
  return { ball: { x: s.ball[0], y: s.ball[1] }, players: s.players, score: s.score, phase: s.phase };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
