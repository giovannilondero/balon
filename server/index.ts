import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hub, type Peer } from "./hub.ts";
import { networkOf, type NetworkId } from "./network.ts";

const PORT = Number(process.env.PORT ?? 3001);
/** Dietro un reverse proxy l'IP reale arriva in X-Forwarded-For. */
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const DIST = join(import.meta.dir, "../dist");

interface SocketData {
  network: NetworkId;
  peer: Peer | null;
}

const hub = new Hub();

Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() : undefined;
      const network = networkOf(forwarded ?? server.requestIP(req)?.address);
      if (server.upgrade(req, { data: { network, peer: null } })) return;
      return new Response("Upgrade failed", { status: 400 });
    }
    // In produzione (`pnpm build && pnpm start`) serve anche il client.
    if (existsSync(DIST)) {
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(join(DIST, path));
      return file.exists().then((ok) => new Response(ok ? file : Bun.file(join(DIST, "index.html"))));
    }
    return new Response("Client not built: run `pnpm dev` and open the Vite port.", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.data.peer = {
        network: ws.data.network,
        session: null,
        send: (data) => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
      };
      hub.run();
    },
    message(ws, raw) {
      if (ws.data.peer) hub.message(ws.data.peer, String(raw));
    },
    close(ws) {
      if (ws.data.peer) hub.close(ws.data.peer);
    },
  },
});

console.log(`⚽ Server su ws://localhost:${PORT}/ws`);
