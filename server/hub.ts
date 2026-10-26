// Stanze, sessioni e loop di gioco, indipendenti dal trasporto:
// `index.ts` li serve con Bun, `worker.ts` da un Durable Object su Cloudflare.
import { backToWarmup, MATCH_MINUTES, MAX_PLAYERS, NO_INPUT, startMatch, switchTeam, TICK_RATE } from "../shared/game.ts";
import type { BotLevel, ClientMessage, RoomKind, ServerMessage } from "../shared/protocol.ts";
import type { NetworkId } from "./network.ts";
import { BOT_LEVELS } from "./bot.ts";
import { newCode, Room } from "./rooms.ts";

/** Quanto teniamo il posto a chi si disconnette (app in background, rete ballerina). */
const GRACE_MS = 20_000;
const DT = 1000 / TICK_RATE;
/** Il messaggio più lungo del client sta ben sotto: oltre è spazzatura o un attacco. */
const MESSAGE_MAX = 1024;

/** Un browser connesso, qualunque sia il server che lo regge. */
export interface Peer {
  readonly network: NetworkId;
  session: Session | null;
  send(data: string): void;
  close(code: number, reason: string): void;
}

interface Session {
  id: string;
  token: string;
  ws: Peer | null;
  room: Room | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

export class Hub {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, Session>();
  /** Chi riceve gli aggiornamenti di ogni stanza (anche chi è in attesa di riconnessione). */
  private readonly members = new Map<Room, Set<Session>>();
  private loop: ReturnType<typeof setInterval> | null = null;

  message(ws: Peer, raw: string) {
    if (raw.length > MESSAGE_MAX) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // JSON valido non vuol dire un oggetto: con `null` leggere `msg.t` farebbe crollare il server.
    if (typeof msg !== "object" || msg === null) return;
    if (msg.t === "hello") return this.hello(ws, String(msg.token ?? ""));
    if (msg.t === "ping") return send(ws, { t: "pong", c: Number(msg.c) });
    const session = ws.session;
    if (!session) return;

    switch (msg.t) {
      case "list":
        return this.sendRooms(ws);
      case "create":
        return this.create(ws, session, msg.name, msg.kind, msg.minutes, msg.cpu);
      case "join":
        return this.joinByCode(ws, session, msg.name, String(msg.code ?? ""));
      case "leave":
        this.leave(session);
        return send(ws, { t: "left" });
      case "input": {
        const p = session.room?.player(session.id);
        if (p && Array.isArray(msg.i)) {
          p.input = { mx: clampAxis(msg.i[0]), my: clampAxis(msg.i[1]), kick: msg.i[2] === 1 };
        }
        return;
      }
      case "team":
        if (session.room && !switchTeam(session.room.state, session.id)) {
          send(ws, { t: "error", code: "team-switch-locked" });
        }
        return;
      case "start": {
        const room = session.room;
        if (!room || room.hostId !== session.id) return;
        if (msg.minutes && (MATCH_MINUTES as readonly number[]).includes(msg.minutes)) room.minutes = msg.minutes;
        startMatch(room.state, room.minutes);
        room.push({ type: "start", tick: room.state.tick + 1 });
        return this.broadcastRoom(room);
      }
      case "warmup": {
        const room = session.room;
        if (!room || room.hostId !== session.id || room.state.match !== "ended") return;
        backToWarmup(room.state);
        return this.broadcastRoom(room);
      }
      case "bot": {
        const room = session.room;
        if (!room || room.hostId !== session.id || (msg.team !== "red" && msg.team !== "blue")) return;
        if (msg.delta === 1) room.addBot(msg.team);
        else room.removeBot(msg.team);
        return this.broadcastRoom(room);
      }
      case "botLevel": {
        const room = session.room;
        if (!room || room.hostId !== session.id || !BOT_LEVELS.includes(msg.level)) return;
        room.setBotLevel(msg.level);
        return this.broadcastRoom(room);
      }
    }
  }

  close(ws: Peer) {
    const session = ws.session;
    if (!session || session.ws !== ws) return;
    session.ws = null;
    const p = session.room?.player(session.id);
    if (p) {
      p.away = true;
      p.input = NO_INPUT;
    }
    session.graceTimer = setTimeout(() => {
      this.leave(session);
      this.sessions.delete(session.token);
    }, GRACE_MS);
  }

  /**
   * Avvia il loop a passo fisso; si ferma da solo quando non resta nessuno
   * (né sessioni né stanze). setInterval non è preciso, quindi accumuliamo il tempo.
   */
  run() {
    if (this.loop) return;
    let last = performance.now();
    let acc = 0;
    this.loop = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + now - last, DT * 10);
      last = now;
      while (acc >= DT) {
        acc -= DT;
        for (const room of this.rooms.values()) {
          if (room.tick()) this.broadcastRoom(room);
          this.publish(room, JSON.stringify(room.snapshot()));
        }
      }
      if (this.sessions.size === 0 && this.rooms.size === 0 && this.loop) {
        clearInterval(this.loop);
        this.loop = null;
      }
    }, 4);
  }

  private hello(ws: Peer, token: string) {
    // Un hello per connessione (il client lo manda solo all'apertura): cambiando token
    // una connessione sola terrebbe in vita sessioni, e stanze con i loro bot, senza limite.
    if (ws.session) return;
    if (token.length < 16 || token.length > 64) return send(ws, { t: "error", code: "bad-token" });
    let session = this.sessions.get(token);
    if (session) {
      if (session.graceTimer) clearTimeout(session.graceTimer);
      session.graceTimer = null;
      if (session.ws && session.ws !== ws) session.ws.close(4000, "Session opened elsewhere");
    } else {
      session = { id: crypto.randomUUID().slice(0, 8), token, ws: null, room: null, graceTimer: null };
      this.sessions.set(token, session);
    }
    session.ws = ws;
    ws.session = session;
    send(ws, { t: "welcome", id: session.id });

    // Riconnessione: si riprende il posto in partita.
    const room = session.room;
    const p = room?.player(session.id);
    if (room && p) {
      p.away = false;
      send(ws, { t: "joined", room: room.info() });
    } else {
      session.room = null;
    }
  }

  private create(ws: Peer, session: Session, rawName: string, kind: RoomKind, minutes: number, cpu?: BotLevel) {
    const name = cleanName(rawName);
    if (!name) return send(ws, { t: "error", code: "name-required" });
    const room = new Room(
      newCode((c) => this.rooms.has(c)),
      name,
      kind === "online" ? "online" : "local",
      ws.network.key,
      (MATCH_MINUTES as readonly number[]).includes(minutes) ? minutes : 3,
      session.id,
    );
    this.rooms.set(room.code, room);
    this.members.set(room, new Set());
    console.log(`# ${room.code} creata (${room.kind}, rete ${room.networkKey})`);
    this.enter(ws, session, room, name);
    if (cpu && BOT_LEVELS.includes(cpu)) {
      room.setBotLevel(cpu);
      const me = room.player(session.id);
      room.addBot(me?.team === "red" ? "blue" : "red");
      this.broadcastRoom(room);
    }
  }

  private joinByCode(ws: Peer, session: Session, rawName: string, rawCode: string) {
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    if (!room) return send(ws, { t: "error", code: "room-not-found" });
    if (room.kind === "local" && room.networkKey !== ws.network.key) {
      return send(ws, { t: "error", code: "room-local-only" });
    }
    if (session.room === room) return send(ws, { t: "joined", room: room.info() });
    if (room.humans >= MAX_PLAYERS) return send(ws, { t: "error", code: "room-full" });
    const name = cleanName(rawName);
    if (!name) return send(ws, { t: "error", code: "name-required" });
    this.enter(ws, session, room, name);
  }

  private enter(ws: Peer, session: Session, room: Room, name: string) {
    this.leave(session);
    session.room = room;
    room.add(session.id, name);
    this.members.get(room)?.add(session);
    send(ws, { t: "joined", room: room.info() });
    this.broadcastRoom(room);
    console.log(`+ ${name} → ${room.code} (${room.state.players.length})`);
  }

  private leave(session: Session) {
    const room = session.room;
    if (!room) return;
    session.room = null;
    this.members.get(room)?.delete(session);
    room.remove(session.id);
    console.log(`- ${session.id} ← ${room.code} (${room.state.players.length})`);
    // Senza persone la stanza si chiude, anche se ci sono bot.
    if (room.humans === 0) {
      this.rooms.delete(room.code);
      this.members.delete(room);
      console.log(`# ${room.code} chiusa`);
    } else {
      this.broadcastRoom(room);
    }
  }

  private sendRooms(ws: Peer) {
    const { key, lan } = ws.network;
    const visible = [...this.rooms.values()]
      .filter((r) => r.kind === "local" && r.networkKey === key)
      .map((r) => r.summary());
    send(ws, { t: "rooms", rooms: visible, network: lan ? "lan" : "internet" });
  }

  private broadcastRoom(room: Room) {
    this.publish(room, JSON.stringify({ t: "room", room: room.info() } satisfies ServerMessage));
  }

  private publish(room: Room, data: string) {
    for (const session of this.members.get(room) ?? []) session.ws?.send(data);
  }
}

function send(ws: Peer, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

function cleanName(raw: unknown) {
  return String(raw ?? "").trim().slice(0, 16);
}

function clampAxis(n: unknown) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0;
}
