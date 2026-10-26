import { canSwitchTeam, MATCH_MINUTES, type Team } from "../shared/game.ts";
import { BOT_LEVELS, type RoomInfo } from "../shared/protocol.ts";
import { levelLabel, minutesLabel } from "./lobby.ts";
import type { NetClient, RenderState } from "./net.ts";
import { $, chips, toast } from "./dom.ts";
import { t } from "./i18n.ts";

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
    this.minuteChips = chips($("host-minutes"), MATCH_MINUTES, this.hostMinutes, minutesLabel, (m) => (this.hostMinutes = m));
    this.levelChips = chips($("bot-level"), BOT_LEVELS, "medium", levelLabel, (level) => net.send({ t: "botLevel", level }));
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
    this.set("room-kind", t(room.kind === "local" ? "hud.kind.local" : "hud.kind.online"));
  }

  update(state: RenderState, room: RoomInfo | null, meId: string | null) {
    this.set("score-red", String(state.score[0]));
    this.set("score-blue", String(state.score[1]));

    const clock = $("clock");
    let clockText = t("clock.warmup");
    if (state.match === "running") clockText = state.golden ? t("clock.golden") : formatTime(state.time);
    else if (state.match === "ended") clockText = t("clock.final");
    this.set("clock", clockText);
    clock.classList.toggle("golden", state.match === "running" && state.golden);

    $<HTMLButtonElement>("team-btn").disabled = meId === null || !canSwitchTeam(state.players, state.match, meId);

    this.set("notice", state.phase === "kickoff" ? t("hud.kickoff", { team: t(`team.${state.kickoffTeam}`) }) : "");
    this.set("ping", this.net.ping === null ? "" : `${this.net.ping} ms`);

    const isHost = room !== null && room.hostId === meId;
    // A fine partita le scelte dell'host stanno nel riepilogo.
    const waiting = state.match === "warmup";
    $("host-panel").hidden = !(waiting && isHost);
    $("wait-host").hidden = !(waiting && !isHost);
    this.set("start-btn", t("hud.start"));
    const host = state.players.find((p) => p.id === room?.hostId);
    this.set("wait-host", t("hud.waitHost", { name: host?.name ?? t("hud.host") }));
  }

  goal(team: Team, scorerName: string | null, ownGoal: boolean) {
    const sub = scorerName ? (ownGoal ? t("banner.ownGoal", { name: scorerName }) : scorerName) : "";
    this.banner(t("banner.goal"), sub, TEAM_CSS[team]);
  }

  start() {
    this.banner(t("banner.start"), "", "#fff");
  }

  golden() {
    this.banner(t("banner.golden"), t("banner.golden.sub"), "#ffe066");
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
        await navigator.share({ title: "Balón", text: t("share.text"), url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast(t("share.copied"), "info");
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
