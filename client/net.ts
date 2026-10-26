import { TICK_RATE, type GameEvent } from "../shared/game.ts";
import type { ClientMessage, RoomInfo, RoomSummary, ServerMessage, Snapshot } from "../shared/protocol.ts";
import { t } from "./i18n.ts";
import type { InputTuple } from "./input.ts";
import { Predictor, type RenderState } from "./predict.ts";

export type { RenderPlayer, RenderState } from "./predict.ts";

const TICKS_PER_MS = TICK_RATE / 1000;
/**
 * Il client mostra la partita in anticipo sul server di quanto serve ai suoi comandi
 * per arrivare in tempo: il ritardo misurato dai ping (il peggiore degli ultimi),
 * più questo margine in tick.
 */
const LEAD_MARGIN = 1;
const LEAD_SAMPLES = 10;
const LEAD_START = 6;
/** Di quanto l'anticipo può correggere la velocità del tempo mostrato, per non dare scatti. */
const LEAD_SLEW = 0.1;

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
  private predictor = new Predictor();
  private events: GameEvent[] = [];
  /** Tick del server ≈ ora × TICK_RATE + offset, misurato sugli snapshot arrivati prima. */
  private clockOffset: number | null = null;
  private lead = LEAD_START;
  private leadSamples: number[] = [];
  /** Il tick (frazionario) mostrato all'ultimo frame. */
  private shownTick: number | null = null;
  private shownAt = 0;
  private retry = 0;
  private lastInput: InputTuple | null = null;

  constructor() {
    this.open();
    setInterval(() => this.send({ t: "ping", c: performance.now() }), 1000);
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

  /** I comandi valgono dal prossimo tick mostrato: il client li simula subito, il server a quel tick. */
  input(i: InputTuple) {
    this.lastInput = i;
    let k: number | undefined;
    if (this.room && this.shownTick !== null) {
      k = Math.floor(this.shownTick) + 1;
      this.predictor.record(k, { mx: i[0], my: i[1], kick: i[2] === 1 });
    }
    this.send({ t: "input", i, k });
  }

  send(msg: ClientMessage) {
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
        this.resetTiming();
        if (this.lastInput) this.input(this.lastInput);
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
        if (msg.a !== undefined && this.clockOffset !== null) this.measureLead(msg.a + 1 - (msg.c * TICKS_PER_MS + this.clockOffset));
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
      if (this.room === room && !this.predictor.ready) {
        this.room = null;
        this.onRoom(null);
        this.onError(t("conn.roomGone"));
      }
    }, 1500);
    this.resetTiming();
  }

  private resetTiming() {
    this.predictor.reset();
    this.events = [];
    this.clockOffset = null;
    this.shownTick = null;
    // Le misure sono relative all'orologio della stanza: con una stanza nuova non valgono più.
    this.leadSamples = [];
  }

  /** `late`: quanti tick dopo il nostro orologio è arrivato un ping al server. */
  private measureLead(late: number) {
    this.leadSamples.push(late);
    if (this.leadSamples.length > LEAD_SAMPLES) this.leadSamples.shift();
    this.lead = Math.min(2 * TICK_RATE, Math.max(1, Math.max(...this.leadSamples) + LEAD_MARGIN));
  }

  private receiveSnapshot(msg: Snapshot) {
    // Si segue lo snapshot arrivato prima: quelli rallentati dal jitter non devono
    // spostare l'orologio. Scende piano, nel caso il server rallenti davvero.
    const estimate = msg.tick - performance.now() * TICKS_PER_MS;
    if (this.clockOffset === null || Math.abs(estimate - this.clockOffset) > 2 * TICK_RATE) this.clockOffset = estimate;
    else if (estimate > this.clockOffset) this.clockOffset = estimate;
    else this.clockOffset += (estimate - this.clockOffset) * 0.01;
    this.predictor.receive(msg);
    this.events.push(...msg.events);
  }

  /** Stato da mostrare adesso, simulato in anticipo. Gli eventi escono quando arrivano. */
  sample(now: number, dt: number): RenderState | null {
    while (this.events.length) this.onEvent(this.events.shift()!);
    if (this.clockOffset === null) return null;
    const ideal = now * TICKS_PER_MS + this.clockOffset + this.lead;
    if (this.shownTick === null || Math.abs(ideal - this.shownTick) > TICK_RATE) {
      this.shownTick = ideal;
    } else {
      // Il tempo mostrato non torna mai indietro: si avvicina all'ideale andando un po' più piano o più veloce.
      const elapsed = (now - this.shownAt) * TICKS_PER_MS;
      const natural = this.shownTick + elapsed;
      this.shownTick = natural + Math.max(-LEAD_SLEW * elapsed, Math.min(LEAD_SLEW * elapsed, ideal - natural));
    }
    this.shownAt = now;
    return this.predictor.sample(this.shownTick, this.id, dt);
  }
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
