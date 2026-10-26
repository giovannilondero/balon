import { MATCH_MINUTES } from "../shared/game.ts";
import { BOT_LEVELS, type BotLevel, type RoomKind, type RoomSummary } from "../shared/protocol.ts";
import type { NetClient } from "./net.ts";
import { $, chips } from "./dom.ts";

export const LEVEL_LABEL: Record<BotLevel, string> = { easy: "Facile", medium: "Medio", hard: "Difficile" };

const KIND_HINT: Record<RoomKind, string> = {
  local: "Visibile e accessibile solo a chi è connesso alla tua stessa rete.",
  online: "Chiunque abbia il codice o il link può entrare.",
};

export class Lobby {
  private kind: RoomKind = "local";
  private minutes = 3;
  private cpuLevel: BotLevel = "medium";
  private poll: ReturnType<typeof setInterval> | null = null;

  constructor(
    private net: NetClient,
    private beforeJoin: () => void,
  ) {
    const name = $<HTMLInputElement>("name");
    name.value = localStorage.getItem("balon:name") ?? "";
    name.addEventListener("change", () => localStorage.setItem("balon:name", name.value.trim()));

    const kind = $("kind");
    kind.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      this.kind = btn.dataset.value as RoomKind;
      for (const b of kind.querySelectorAll("button")) b.classList.toggle("on", b === btn);
      $("kind-hint").textContent = KIND_HINT[this.kind];
    });
    $("kind-hint").textContent = KIND_HINT[this.kind];

    chips($("minutes"), MATCH_MINUTES, this.minutes, (m) => `${m} min`, (m) => (this.minutes = m));

    $("create").addEventListener("click", () => {
      this.beforeJoin();
      net.send({ t: "create", name: this.name(), kind: this.kind, minutes: this.minutes });
    });
    chips($("cpu-level"), BOT_LEVELS, this.cpuLevel, (l) => LEVEL_LABEL[l], (l) => (this.cpuLevel = l));
    $("vs-cpu").addEventListener("click", () => {
      this.beforeJoin();
      // Online = non compare nella lista della rete: è una partita solo tua.
      net.send({ t: "create", name: this.name(), kind: "online", minutes: this.minutes, cpu: this.cpuLevel });
    });
    $("join-code").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = $<HTMLInputElement>("code").value.trim();
      if (code) this.join(code);
    });

    const invite = new URLSearchParams(location.search).get("p");
    if (invite) {
      $("invite").hidden = false;
      $("invite-code").textContent = invite.toUpperCase();
      $("invite-join").addEventListener("click", () => this.join(invite));
    }
  }

  private name() {
    const name = $<HTMLInputElement>("name").value.trim() || "Giocatore";
    localStorage.setItem("balon:name", name);
    return name;
  }

  join(code: string) {
    this.beforeJoin();
    this.net.send({ t: "join", name: this.name(), code });
  }

  show() {
    $("home").hidden = false;
    this.net.send({ t: "list" });
    this.poll ??= setInterval(() => this.net.send({ t: "list" }), 2000);
  }

  hide() {
    $("home").hidden = true;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  renderRooms(rooms: RoomSummary[]) {
    const list = $("room-list");
    list.replaceChildren(
      ...rooms.map((r) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        const name = document.createElement("span");
        name.textContent = r.name;
        const meta = document.createElement("span");
        meta.className = "meta";
        const state = r.match === "running" ? "in corso" : r.match === "ended" ? "finita" : "in attesa";
        const cpu = r.cpu > 0 ? ` (${r.cpu} CPU)` : "";
        meta.textContent = `${r.players}/${r.max}${cpu} · ${state}`;
        btn.append(name, meta);
        btn.disabled = r.players - r.cpu >= r.max; // i bot lasciano il posto
        btn.addEventListener("click", () => this.join(r.code));
        li.append(btn);
        return li;
      }),
    );
    $("room-empty").hidden = rooms.length > 0;
  }

  setConnection(text: string) {
    $("conn").textContent = text;
  }
}
