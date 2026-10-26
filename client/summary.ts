import type { Team } from "../shared/game.ts";
import type { MatchReport, RoomInfo } from "../shared/protocol.ts";
import type { NetClient } from "./net.ts";
import { $ } from "./dom.ts";
import { t } from "./i18n.ts";

const TEAM_CSS: Record<Team, string> = { red: "#ff6b70", blue: "#6f9bff" };

/** Schermata di fine partita: risultato, marcatori, possesso e statistiche. */
export class SummaryView {
  private rendered: MatchReport | null = null;
  private renderedFor = "";

  constructor(
    private net: NetClient,
    onLeave: () => void,
  ) {
    $("sum-rematch").addEventListener("click", () => net.send({ t: "start", minutes: net.room?.minutes }));
    $("sum-warmup").addEventListener("click", () => net.send({ t: "warmup" }));
    $("sum-leave").addEventListener("click", onLeave);
  }

  /** Da chiamare a ogni frame: ridisegna solo se cambiano dati o ruoli. */
  update(visible: boolean, room: RoomInfo | null, meId: string | null) {
    const el = $("summary");
    const report = room?.lastMatch ?? null;
    if (!visible || !report) {
      el.hidden = true;
      return;
    }
    const key = `${room!.hostId}|${meId}`;
    if (report !== this.rendered || key !== this.renderedFor) {
      this.render(report, room!, meId);
      this.rendered = report;
      this.renderedFor = key;
    }
    el.hidden = false;
  }

  private render(report: MatchReport, room: RoomInfo, meId: string | null) {
    const { winner } = report;
    $("sum-eyebrow").textContent = report.golden ? t("sum.golden") : t("sum.end", { time: formatTime(report.duration) });
    const title = $("sum-title");
    title.textContent = winner ? t(`sum.win.${winner}`) : t("sum.draw");
    title.style.color = winner ? TEAM_CSS[winner] : "#fff";
    $("sum-red").textContent = String(report.score[0]);
    $("sum-blue").textContent = String(report.score[1]);

    $("pos-red").style.width = `${report.possessionRed}%`;
    $("pos-red-label").textContent = `${report.possessionRed}%`;
    $("pos-blue-label").textContent = `${100 - report.possessionRed}%`;

    // Tabellino: una riga per marcatore, con i minuti dei gol.
    for (const team of ["red", "blue"] as const) {
      const byScorer = new Map<string, { name: string; own: boolean; times: number[] }>();
      for (const g of report.goals.filter((g) => g.team === team)) {
        const key = `${g.scorerId}|${g.own}`;
        const row = byScorer.get(key) ?? { name: g.scorerName ?? "?", own: g.own, times: [] };
        row.times.push(g.time);
        byScorer.set(key, row);
      }
      $(`goals-${team}`).replaceChildren(
        ...[...byScorer.values()].map((row) => {
          const li = document.createElement("li");
          const count = row.times.length > 1 ? ` ×${row.times.length}` : "";
          li.append(span("scorer", `${row.name}${count}`));
          if (row.own) li.append(span("own", t("sum.ownGoal")));
          li.append(span("time", row.times.map(formatTime).join(", ")));
          return li;
        }),
      );
    }

    // Prima i vincitori, poi per gol, tiri e tocchi.
    const order = (team: Team) => (team === (winner ?? "red") ? 0 : 1);
    const players = [...report.players].sort(
      (a, b) => order(a.team) - order(b.team) || b.goals - a.goals || b.kicks - a.kicks || b.touches - a.touches,
    );
    $("sum-players").querySelector("tbody")!.replaceChildren(
      ...players.map((p) => {
        const tr = document.createElement("tr");
        if (p.id === meId) tr.className = "me";
        const name = document.createElement("td");
        name.append(span(`dot ${p.team}`, ""), p.name);
        if (p.id === meId) name.append(span("tag", t("sum.you")));
        else if (p.bot) name.append(span("tag", "CPU"));
        if (p.id === report.mvpId) name.append(span("mvp", "MVP"));
        const goals = p.ownGoals ? t("sum.ownGoals", { goals: p.goals, n: p.ownGoals }) : String(p.goals);
        tr.append(name, cell(goals), cell(String(p.kicks)), cell(String(p.touches)));
        return tr;
      }),
    );

    const isHost = room.hostId === meId;
    $("sum-rematch").hidden = !isHost;
    $("sum-warmup").hidden = !isHost;
    const host = report.players.find((p) => p.id === room.hostId);
    $("sum-wait").hidden = isHost;
    $("sum-wait").textContent = t("sum.wait", { name: host?.name ?? t("hud.host") });
  }
}

function span(className: string, text: string) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function cell(text: string) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
