import { MATCH_MINUTES, type Team } from "../shared/game.ts";
import { BOT_LEVELS, type RoomInfo } from "../shared/protocol.ts";
import { LEVEL_LABEL } from "./lobby.ts";
import type { NetClient, RenderState } from "./net.ts";
import { $, chips, toast } from "./dom.ts";

const TEAM_NAME: Record<Team, string> = { red: "Rossi", blue: "Blu" };
const TEAM_CSS: Record<Team, string> = { red: "#ff6b70", blue: "#6f9bff" };

export class Hud {
  private hostMinutes = 3;
  private minuteChips;
  private levelChips;
  private text = new Map<string, string>();

  constructor(
    private net: NetClient,
    onLeave: () => void,
  ) {
    this.minuteChips = chips($("host-minutes"), MATCH_MINUTES, this.hostMinutes, (m) => `${m} min`, (m) => (this.hostMinutes = m));
    this.levelChips = chips($("bot-level"), BOT_LEVELS, "medium", (l) => LEVEL_LABEL[l], (level) => net.send({ t: "botLevel", level }));
    $("bot-controls").addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-team]");
      if (!btn) return;
      net.send({ t: "bot", team: btn.dataset.team as Team, delta: btn.dataset.delta === "1" ? 1 : -1 });
    });
    $("start-btn").addEventListener("click", () => net.send({ t: "start", minutes: this.hostMinutes }));
    $("team-btn").addEventListener("click", () => net.send({ t: "team" }));
    $("leave-btn").addEventListener("click", onLeave);
    $("copy-link").addEventListener("click", () => this.share());
  }

  show(room: RoomInfo) {
    $("hud").hidden = false;
    this.setRoom(room);
    this.hostMinutes = room.minutes;
    this.minuteChips.set(room.minutes);
  }

  hide() {
    $("hud").hidden = true;
  }

  setRoom(room: RoomInfo) {
    this.set("bots-red", String(room.bots.red));
    this.set("bots-blue", String(room.bots.blue));
    this.levelChips.set(room.botLevel);
    this.set("room-code", room.code);
    this.set("room-kind", room.kind === "local" ? "Rete locale" : "Online");
  }

  update(state: RenderState, room: RoomInfo | null, meId: string | null) {
    this.set("score-red", String(state.score[0]));
    this.set("score-blue", String(state.score[1]));

    const clock = $("clock");
    let clockText = "Riscaldamento";
    if (state.match === "running") clockText = state.golden ? "Golden goal" : formatTime(state.time);
    else if (state.match === "ended") clockText = "Finale";
    this.set("clock", clockText);
    clock.classList.toggle("golden", state.match === "running" && state.golden);

    this.set("notice", state.phase === "kickoff" ? `Calcio d'inizio: ${TEAM_NAME[state.kickoffTeam]}` : "");
    this.set("ping", this.net.ping === null ? "" : `${this.net.ping} ms`);

    const isHost = room !== null && room.hostId === meId;
    // A fine partita le scelte dell'host stanno nel riepilogo.
    const waiting = state.match === "warmup";
    $("host-panel").hidden = !(waiting && isHost);
    $("wait-host").hidden = !(waiting && !isHost);
    this.set("start-btn", "Inizia partita");
    const host = state.players.find((p) => p.id === room?.hostId);
    this.set("wait-host", `In attesa che ${host?.name ?? "l'host"} avvii la partita`);
  }

  goal(team: Team, scorerName: string | null, ownGoal: boolean) {
    const sub = scorerName ? (ownGoal ? `Autogol di ${scorerName}` : scorerName) : "";
    this.banner("GOL!", sub, TEAM_CSS[team]);
  }

  start() {
    this.banner("Si parte!", "", "#fff");
  }

  golden() {
    this.banner("Golden goal", "Chi segna vince", "#ffe066");
  }

  private banner(title: string, sub: string, color: string) {
    const el = $("banner");
    $("banner-title").textContent = title;
    $("banner-title").style.color = color;
    $("banner-sub").textContent = sub;
    el.classList.remove("show");
    void el.offsetWidth; // riavvia l'animazione
    el.classList.add("show");
  }

  private async share() {
    const room = this.net.room;
    if (!room) return;
    const url = `${location.origin}${location.pathname}?p=${room.code}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Balón", text: "Giochiamo a Balón!", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast("Link copiato negli appunti", "info");
      } else {
        // In http su LAN la clipboard API non c'è: mostriamo il link.
        toast(url, "info");
      }
    } catch {
      /* condivisione annullata */
    }
  }

  /** Scrive nel DOM solo se il testo cambia: update() gira a ogni frame. */
  private set(id: string, text: string) {
    if (this.text.get(id) === text) return;
    this.text.set(id, text);
    $(id).textContent = text;
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
