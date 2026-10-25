import type { ServerWebSocket } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  addPlayer,
  createState,
  InputBit,
  removePlayer,
  step,
  switchTeam,
  TICK_RATE,
  type GameEvent,
} from "../shared/game.ts";
import type { ClientMessage, ServerMessage, Snapshot } from "../shared/protocol.ts";

const PORT = Number(process.env.PORT ?? 3001);
const DIST = join(import.meta.dir, "../dist");
const ALL_INPUTS = Object.values(InputBit).reduce((a, b) => a | b, 0);

type Socket = ServerWebSocket<{ id: string; joined: boolean }>;

const state = createState();
let pendingEvents: GameEvent[] = [];

const server = Bun.serve<{ id: string; joined: boolean }>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const id = crypto.randomUUID().slice(0, 8);
      if (server.upgrade(req, { data: { id, joined: false } })) return;
      return new Response("Upgrade failed", { status: 400 });
    }
    // In produzione (`bun run build && bun start`) serve anche il client.
    if (existsSync(DIST)) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(join(DIST, path));
      return file.exists().then((ok) => new Response(ok ? file : Bun.file(join(DIST, "index.html"))));
    }
    return new Response("Client non buildato: usa `bun run dev` e apri la porta di Vite.", { status: 404 });
  },
  websocket: {
    message(ws: Socket, raw) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === "join" && !ws.data.joined) {
        const name = String(msg.name ?? "").trim().slice(0, 16) || "Giocatore";
        addPlayer(state, ws.data.id, name);
        ws.data.joined = true;
        ws.subscribe("game");
        send(ws, { t: "welcome", id: ws.data.id });
        console.log(`+ ${name} (${ws.data.id}) — ${state.players.length} giocatori`);
      } else if (msg.t === "input") {
        const p = state.players.find((p) => p.id === ws.data.id);
        if (p) p.input = Number(msg.bits) & ALL_INPUTS;
      } else if (msg.t === "team") {
        switchTeam(state, ws.data.id);
      }
    },
    close(ws: Socket) {
      removePlayer(state, ws.data.id);
      console.log(`- ${ws.data.id} — ${state.players.length} giocatori`);
    },
  },
});

function send(ws: Socket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

const round = (n: number) => Math.round(n * 100) / 100;

function snapshot(): Snapshot {
  return {
    t: "snap",
    tick: state.tick,
    ball: [round(state.ball.x), round(state.ball.y)],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      x: round(p.x),
      y: round(p.y),
      k: (p.input & InputBit.kick) !== 0,
    })),
    score: [state.score.red, state.score.blue],
    phase: state.phase,
    events: pendingEvents,
  };
}

// Loop a passo fisso: setInterval non è preciso, quindi accumuliamo il tempo.
const DT = 1000 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc = Math.min(acc + now - last, DT * 10);
  last = now;
  while (acc >= DT) {
    step(state, pendingEvents);
    acc -= DT;
    server.publish("game", JSON.stringify(snapshot()));
    pendingEvents = [];
  }
}, 4);

console.log(`⚽ Server su ws://localhost:${PORT}/ws`);
