// Il deploy su Cloudflare: il client compilato è servito come asset statico
// (`wrangler.jsonc`), le partite vivono in un solo Durable Object con lo stesso
// `Hub` del server Bun. A questo Worker arriva solo `/ws`.
import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS } from "../shared/game.ts";
import { Hub, type Peer } from "./hub.ts";
import { networkOf } from "./network.ts";

/**
 * Un telefono che va in standby non saluta: smette e basta di parlare. Il client
 * manda un ping ogni 2 s, ma Chrome sveglia una tab nascosta da un po' solo una
 * volta al minuto: oltre questo silenzio la connessione si considera persa.
 */
const SILENT_MS = 90_000;
/** Tutte le stanze stanno in un oggetto solo: oltre questo numero di connessioni rifiutiamo. */
const MAX_CONNECTIONS = 500;
/** Due stanze piene dietro lo stesso router ci stanno; uno script che apre socket no. */
const MAX_CONNECTIONS_PER_ADDRESS = 2 * MAX_PLAYERS;

interface Env {
  readonly MATCHES: DurableObjectNamespace<Matches>;
}

/**
 * Tutte le stanze in un oggetto solo, come il processo Bun: chi cerca le partite
 * della propria rete le vede tutte. Resta in memoria finché c'è qualcuno
 * connesso; niente viene salvato, quindi un deploy chiude le partite in corso.
 */
export class Matches extends DurableObject<Env> {
  private readonly hub = new Hub();
  private readonly seen = new Map<Peer, number>();
  private readonly addresses = new Map<Peer, string>();
  private watchdog: ReturnType<typeof setInterval> | null = null;

  override fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const address = request.headers.get("CF-Connecting-IP") ?? "";
    if (this.seen.size >= MAX_CONNECTIONS || this.connectionsFrom(address) >= MAX_CONNECTIONS_PER_ADDRESS) {
      return new Response("Too many connections", { status: 429 });
    }
    const { 0: client, 1: socket } = new WebSocketPair();
    socket.accept();
    const peer: Peer = {
      network: networkOf(address || undefined),
      session: null,
      send: (data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      },
      close: (code, reason) => socket.close(code, reason),
    };
    this.seen.set(peer, performance.now());
    this.addresses.set(peer, address);
    socket.addEventListener("message", (event) => {
      this.seen.set(peer, performance.now());
      if (typeof event.data !== "string") return;
      // Un'eccezione qui riavvierebbe l'oggetto, chiudendo le partite di tutti: paga solo chi l'ha causata.
      try {
        this.hub.message(peer, event.data);
      } catch (error) {
        console.error("messaggio non gestito", error);
        this.drop(peer);
        socket.close(1011, "error");
      }
    });
    socket.addEventListener("close", () => this.drop(peer));
    socket.addEventListener("error", () => this.drop(peer));
    this.hub.run();
    this.watch();
    return new Response(null, { status: 101, webSocket: client });
  }

  private drop(peer: Peer) {
    if (!this.seen.delete(peer)) return;
    this.addresses.delete(peer);
    this.hub.close(peer);
  }

  private connectionsFrom(address: string) {
    let count = 0;
    for (const other of this.addresses.values()) if (other === address) count++;
    return count;
  }

  private watch() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      const now = performance.now();
      for (const [peer, at] of this.seen) {
        if (now - at <= SILENT_MS) continue;
        this.drop(peer);
        peer.close(1001, "silent");
      }
      if (this.seen.size === 0 && this.watchdog) {
        clearInterval(this.watchdog);
        this.watchdog = null;
      }
    }, 5_000);
  }
}

export default {
  fetch: (request, env) => {
    if (new URL(request.url).pathname !== "/ws") return new Response("Not found", { status: 404 });
    return env.MATCHES.getByName("matches").fetch(request);
  },
} satisfies ExportedHandler<Env>;
