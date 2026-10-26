import type { ServerWebSocket } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backToWarmup, MATCH_MINUTES, MAX_PLAYERS, NO_INPUT, startMatch, switchTeam, TICK_RATE } from "../shared/game.ts";
import type { BotLevel, ClientMessage, RoomKind, ServerMessage } from "../shared/protocol.ts";
import { networkOf, type NetworkId } from "./network.ts";
import { BOT_LEVELS } from "./bot.ts";
import { newCode, Room } from "./rooms.ts";

const PORT = Number(process.env.PORT ?? 3001);
/** Dietro un reverse proxy l'IP reale arriva in X-Forwarded-For. */
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const DIST = join(import.meta.dir, "../dist");
/** Quanto teniamo il posto a chi si disconnette (app in background, rete ballerina). */
const GRACE_MS = 20_000;

interface Session {
  id: string;
  token: string;
  ws: Socket | null;
  room: Room | null;
  graceTimer: Timer | null;
}

interface SocketData {
  network: NetworkId;
  session: Session | null;
}

type Socket = ServerWebSocket<SocketData>;

const rooms = new Map<string, Room>();
const sessions = new Map<string, Session>();

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() : undefined;
      const network = networkOf(forwarded ?? server.requestIP(req)?.address);
      if (server.upgrade(req, { data: { network, session: null } })) return;
      return new Response("Upgrade failed", { status: 400 });
    }
    // In produzione (`pnpm build && pnpm start`) serve anche il client.
    if (existsSync(DIST)) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(join(DIST, path));
      return file.exists().then((ok) => new Response(ok ? file : Bun.file(join(DIST, "index.html"))));
    }
    return new Response("Client non buildato: usa `pnpm dev` e apri la porta di Vite.", { status: 404 });
  },
  websocket: {
    message(ws: Socket, raw) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === "hello") return hello(ws, String(msg.token ?? ""));
      if (msg.t === "ping") return send(ws, { t: "pong", c: Number(msg.c) });
      const session = ws.data.session;
      if (!session) return;

      switch (msg.t) {
        case "list":
          return sendRooms(ws);
        case "create":
          return create(ws, session, msg.name, msg.kind, msg.minutes, msg.cpu);
        case "join":
          return joinByCode(ws, session, msg.name, String(msg.code ?? ""));
        case "leave":
          leave(session);
          return send(ws, { t: "left" });
        case "input": {
          const p = session.room?.player(session.id);
          if (p && Array.isArray(msg.i)) {
            p.input = { mx: clampAxis(msg.i[0]), my: clampAxis(msg.i[1]), kick: msg.i[2] === 1 };
          }
          return;
        }
        case "team":
          if (session.room) switchTeam(session.room.state, session.id);
          return;
        case "start": {
          const room = session.room;
          if (!room || room.hostId !== session.id) return;
          if (msg.minutes && (MATCH_MINUTES as readonly number[]).includes(msg.minutes)) room.minutes = msg.minutes;
          startMatch(room.state, room.minutes);
          room.push({ type: "start", tick: room.state.tick + 1 });
          return broadcastRoom(room);
        }
        case "warmup": {
          const room = session.room;
          if (!room || room.hostId !== session.id || room.state.match !== "ended") return;
          backToWarmup(room.state);
          return broadcastRoom(room);
        }
        case "bot": {
          const room = session.room;
          if (!room || room.hostId !== session.id || (msg.team !== "red" && msg.team !== "blue")) return;
          if (msg.delta === 1) room.addBot(msg.team);
          else room.removeBot(msg.team);
          return broadcastRoom(room);
        }
        case "botLevel": {
          const room = session.room;
          if (!room || room.hostId !== session.id || !BOT_LEVELS.includes(msg.level)) return;
          room.setBotLevel(msg.level);
          return broadcastRoom(room);
        }
      }
    },
    close(ws: Socket) {
      const session = ws.data.session;
      if (!session || session.ws !== ws) return;
      session.ws = null;
      const p = session.room?.player(session.id);
      if (p) {
        p.away = true;
        p.input = NO_INPUT;
      }
      session.graceTimer = setTimeout(() => {
        leave(session);
        sessions.delete(session.token);
      }, GRACE_MS);
    },
  },
});

function hello(ws: Socket, token: string) {
  if (token.length < 16 || token.length > 64) return send(ws, { t: "error", message: "Token non valido" });
  let session = sessions.get(token);
  if (session) {
    if (session.graceTimer) clearTimeout(session.graceTimer);
    session.graceTimer = null;
    if (session.ws && session.ws !== ws) session.ws.close(4000, "Sessione aperta altrove");
  } else {
    session = { id: crypto.randomUUID().slice(0, 8), token, ws: null, room: null, graceTimer: null };
    sessions.set(token, session);
  }
  session.ws = ws;
  ws.data.session = session;
  send(ws, { t: "welcome", id: session.id });

  // Riconnessione: si riprende il posto in partita.
  const room = session.room;
  const p = room?.player(session.id);
  if (room && p) {
    p.away = false;
    ws.subscribe(room.topic);
    send(ws, { t: "joined", room: room.info() });
  } else {
    session.room = null;
  }
}

function create(ws: Socket, session: Session, rawName: string, kind: RoomKind, minutes: number, cpu?: BotLevel) {
  const name = cleanName(rawName);
  if (!name) return send(ws, { t: "error", message: NAME_REQUIRED });
  const room = new Room(
    newCode((c) => rooms.has(c)),
    `Partita di ${name}`,
    kind === "online" ? "online" : "local",
    ws.data.network.key,
    (MATCH_MINUTES as readonly number[]).includes(minutes) ? minutes : 3,
    session.id,
  );
  rooms.set(room.code, room);
  console.log(`# ${room.code} creata (${room.kind}, rete ${room.networkKey})`);
  enter(ws, session, room, name);
  if (cpu && BOT_LEVELS.includes(cpu)) {
    room.setBotLevel(cpu);
    const me = room.player(session.id);
    room.addBot(me?.team === "red" ? "blue" : "red");
    broadcastRoom(room);
  }
}

function joinByCode(ws: Socket, session: Session, rawName: string, rawCode: string) {
  const room = rooms.get(rawCode.trim().toUpperCase());
  if (!room) return send(ws, { t: "error", message: "Partita non trovata. Controlla il codice." });
  if (room.kind === "local" && room.networkKey !== ws.data.network.key) {
    return send(ws, { t: "error", message: "Questa partita è riservata alla rete locale di chi l'ha creata." });
  }
  if (session.room === room) return send(ws, { t: "joined", room: room.info() });
  if (room.humans >= MAX_PLAYERS) return send(ws, { t: "error", message: "La partita è piena." });
  const name = cleanName(rawName);
  if (!name) return send(ws, { t: "error", message: NAME_REQUIRED });
  enter(ws, session, room, name);
}

function enter(ws: Socket, session: Session, room: Room, name: string) {
  leave(session);
  session.room = room;
  room.add(session.id, name);
  ws.subscribe(room.topic);
  send(ws, { t: "joined", room: room.info() });
  broadcastRoom(room);
  console.log(`+ ${name} → ${room.code} (${room.state.players.length})`);
}

function leave(session: Session) {
  const room = session.room;
  if (!room) return;
  session.room = null;
  session.ws?.unsubscribe(room.topic);
  room.remove(session.id);
  console.log(`- ${session.id} ← ${room.code} (${room.state.players.length})`);
  // Senza persone la stanza si chiude, anche se ci sono bot.
  if (room.humans === 0) {
    rooms.delete(room.code);
    console.log(`# ${room.code} chiusa`);
  } else {
    broadcastRoom(room);
  }
}

function sendRooms(ws: Socket) {
  const { key, lan } = ws.data.network;
  const visible = [...rooms.values()]
    .filter((r) => r.kind === "local" && r.networkKey === key)
    .map((r) => r.summary());
  send(ws, { t: "rooms", rooms: visible, network: lan ? "lan" : "internet" });
}

function broadcastRoom(room: Room) {
  server.publish(room.topic, JSON.stringify({ t: "room", room: room.info() } satisfies ServerMessage));
}

function send(ws: Socket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

const NAME_REQUIRED = "Scrivi il tuo nome per entrare in partita.";

function cleanName(raw: unknown) {
  return String(raw ?? "").trim().slice(0, 16);
}

function clampAxis(n: unknown) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0;
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
    acc -= DT;
    for (const room of rooms.values()) {
      if (room.tick()) broadcastRoom(room);
      server.publish(room.topic, JSON.stringify(room.snapshot()));
    }
  }
}, 4);

console.log(`⚽ Server su ws://localhost:${PORT}/ws`);
