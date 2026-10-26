import { MATCH_MINUTES } from "../shared/game.ts";
import { BOT_LEVELS, type BotLevel, type RoomKind, type RoomSummary } from "../shared/protocol.ts";
import type { NetClient } from "./net.ts";
import { $, chips, toast } from "./dom.ts";
import { lang, LANG_NAME, LANGS, setLang, t } from "./i18n.ts";

export const levelLabel = (level: BotLevel) => t(`level.${level}`);
export const minutesLabel = (n: number) => t("minutes", { n });
const kindHint = (kind: RoomKind) => t(`home.kind.${kind}.hint`);

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
    // "Giocatore" era il nome di ripiego delle versioni precedenti: va scelto di nuovo.
    const saved = localStorage.getItem("balon:name") ?? "";
    name.value = saved === "Giocatore" ? "" : saved;
    name.addEventListener("change", () => localStorage.setItem("balon:name", name.value.trim()));
    name.addEventListener("input", () => name.classList.remove("missing"));

    const kind = $("kind");
    kind.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      this.kind = btn.dataset.value as RoomKind;
      for (const b of kind.querySelectorAll("button")) b.classList.toggle("on", b === btn);
      $("kind-hint").textContent = kindHint(this.kind);
    });
    $("kind-hint").textContent = kindHint(this.kind);

    chips($("minutes"), MATCH_MINUTES, this.minutes, minutesLabel, (m) => (this.minutes = m));

    $("create").addEventListener("click", () => {
      const name = this.name();
      if (!name) return;
      this.beforeJoin();
      net.send({ t: "create", name, kind: this.kind, minutes: this.minutes });
    });
    chips($("cpu-level"), BOT_LEVELS, this.cpuLevel, levelLabel, (l) => (this.cpuLevel = l));
    chips($("lang"), LANGS, lang, (l) => LANG_NAME[l], setLang);
    $("vs-cpu").addEventListener("click", () => {
      const name = this.name();
      if (!name) return;
      this.beforeJoin();
      // Online = non compare nella lista della rete: è una partita solo tua.
      net.send({ t: "create", name, kind: "online", minutes: this.minutes, cpu: this.cpuLevel });
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

  /** Il nome è obbligatorio: senza, segnala il campo e restituisce null. */
  private name() {
    const input = $<HTMLInputElement>("name");
    const name = input.value.trim();
    if (!name) {
      input.classList.add("missing");
      input.focus();
      toast(t("home.name.required"));
      return null;
    }
    localStorage.setItem("balon:name", name);
    return name;
  }

  join(code: string) {
    const name = this.name();
    if (!name) return;
    this.beforeJoin();
    this.net.send({ t: "join", name, code });
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
        name.textContent = t("room.of", { name: r.host });
        const meta = document.createElement("span");
        meta.className = "meta";
        const state = t(r.match === "running" ? "room.running" : r.match === "ended" ? "room.ended" : "room.waiting");
        const cpu = r.cpu > 0 ? t("room.cpu", { n: r.cpu }) : "";
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
