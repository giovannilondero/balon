import { TICK_RATE, type GameEvent } from "../shared/game.ts";
import type { ClientMessage, RoomInfo, RoomSummary, ServerMessage, Snapshot } from "../shared/protocol.ts";
import { t } from "./i18n.ts";

/** Ritardo di rendering rispetto all'ultimo stato ricevuto, in tick. */
const INTERP_TICKS = 3;
const TICKS_PER_MS = TICK_RATE / 1000;

export type RenderState = Omit<Snapshot, "t" | "tick" | "ball" | "events"> & { ball: { x: number; y: number } };

export type ConnectionStatus = "connecting" | "online" | "offline";

export class NetClient {
  id: string | null = null;
  room: RoomInfo | null = null;
  ping: number | null = null;
  status: ConnectionStatus = "connecting";

  onStatus: (s: ConnectionStatus) => void = () => {};
  onRooms: (rooms: RoomSummary[], network: "lan" | "internet") => void = () => {};
  onRoom: (room: RoomInfo | null) => void = () => {};
  onError: (message: string) => void = () => {};
  onEvent: (e: GameEvent) => void = () => {};

  private ws: WebSocket | null = null;
  private token = sessionToken();
  private snaps: Snapshot[] = [];
  private events: GameEvent[] = [];
  private clockOffset: number | null = null;
  private retry = 0;
  private lastInput: ClientMessage | null = null;

  constructor() {
    this.open();
    setInterval(() => this.send({ t: "ping", c: performance.now() }), 2000);
  }

  private open() {
    this.setStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: "hello", token: this.token } satisfies ClientMessage));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.setStatus("offline");
      // Riconnessione con backoff: il server ci tiene il posto per qualche secondo.
      const delay = Math.min(5000, 300 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
    ws.onmessage = (e) => this.receive(JSON.parse(e.data) as ServerMessage);
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.onStatus(s);
  }

  send(msg: ClientMessage) {
    if (msg.t === "input") this.lastInput = msg;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private receive(msg: ServerMessage) {
    switch (msg.t) {
      case "welcome":
        this.id = msg.id;
        this.setStatus("online");
        // Se il server non ci rimette in partita, la stanza è persa.
        if (this.room) this.waitRejoin();
        return;
      case "rooms":
        return this.onRooms(msg.rooms, msg.network);
      case "joined":
        this.room = msg.room;
        this.snaps = [];
        this.events = [];
        this.clockOffset = null;
        if (this.lastInput) this.send(this.lastInput);
        return this.onRoom(msg.room);
      case "room":
        this.room = msg.room;
        return this.onRoom(msg.room);
      case "left":
        this.room = null;
        return this.onRoom(null);
      case "error":
        return this.onError(t(`error.${msg.code}`));
      case "pong":
        this.ping = Math.round(performance.now() - msg.c);
        return;
      case "snap":
        return this.receiveSnapshot(msg);
    }
  }

  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private waitRejoin() {
    const room = this.room;
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = setTimeout(() => {
      if (this.room === room && this.snaps.length === 0) {
        this.room = null;
        this.onRoom(null);
        this.onError(t("conn.roomGone"));
      }
    }, 1500);
    this.snaps = [];
  }

  private receiveSnapshot(msg: Snapshot) {
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
      ...fromSnap(b),
      ball: { x: lerp(a.ball[0], b.ball[0], t), y: lerp(a.ball[1], b.ball[1], t) },
      players: b.players.map((p) => {
        const q = prev.get(p.id);
        return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) } : p;
      }),
    };
  }
}

function fromSnap({ t: _t, tick: _tick, events: _e, ball, ...rest }: Snapshot): RenderState {
  return { ...rest, ball: { x: ball[0], y: ball[1] } };
}

/** Un token per scheda: più schede = più giocatori, ma un reload riprende il posto. */
function sessionToken() {
  let token = sessionStorage.getItem("balon:token");
  if (!token) {
    // randomUUID esiste solo in contesto sicuro, e in LAN si va in http.
    token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("balon:token", token);
  }
  return token;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
