import { NetClient, type RenderState } from "./net.ts";
import { GameScene } from "./scene.ts";
import { Controls } from "./input.ts";
import { isTouchDevice, setupTouch } from "./touch.ts";
import { Lobby } from "./lobby.ts";
import { Hud } from "./hud.ts";
import { SummaryView } from "./summary.ts";
import { $, toast } from "./dom.ts";
import { playGoal, playKick, playPost, playWhistle, unlockAudio } from "./audio.ts";

const IDLE: RenderState = {
  ball: { x: 0, y: 0 },
  players: [],
  score: [0, 0],
  match: "warmup",
  phase: "play",
  kickoffTeam: "red",
  time: 0,
  golden: false,
};

const touch = isTouchDevice();
document.body.classList.toggle("touch", touch);

const scene = new GameScene($("game"));
const net = new NetClient();
const controls = new Controls(
  (i) => net.send({ t: "input", i }),
  () => net.send({ t: "team" }),
);
if (touch) setupTouch($("touch"), controls);

const lobby = new Lobby(net, () => {
  unlockAudio();
  // Su mobile proviamo schermo intero + orizzontale; se il browser non vuole, pazienza.
  if (touch && !document.fullscreenElement) {
    document.documentElement
      .requestFullscreen?.()
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
      .catch(() => {});
  }
});
const leave = () => net.send({ t: "leave" });
const hud = new Hud(net, leave);
const summary = new SummaryView(net, leave);
/** Quando è finita la partita: il riepilogo arriva dopo un attimo, per vedere il fischio finale. */
let endedAt: number | null = null;
const SUMMARY_DELAY_MS = 1300;

lobby.show();

net.onStatus = (s) => {
  lobby.setConnection(s === "online" ? "" : s === "connecting" ? "Connessione al server…" : "Server non raggiungibile, riprovo…");
  if (s === "online" && !net.room) net.send({ t: "list" });
  if (s === "offline" && net.room) toast("Connessione persa, mi riconnetto…");
};
net.onRooms = (rooms) => lobby.renderRooms(rooms);
net.onError = (message) => toast(message);
net.onRoom = (room) => {
  const playing = room !== null;
  document.body.classList.toggle("playing", playing);
  controls.enabled = playing;
  if (!playing) controls.reset();
  if (room) {
    lobby.hide();
    if ($("hud").hidden) hud.show(room);
    else hud.setRoom(room);
    history.replaceState(null, "", `?p=${room.code}`);
  } else {
    hud.hide();
    lobby.show();
    history.replaceState(null, "", location.pathname);
  }
};

let names = new Map<string, { name: string; team: "red" | "blue" }>();

net.onEvent = (e) => {
  switch (e.type) {
    case "kick":
      scene.kickEffect(e.x, e.y, names.get(e.id)?.team);
      return playKick();
    case "post":
      return playPost();
    case "goal": {
      const scorer = e.scorer ? names.get(e.scorer) : undefined;
      hud.goal(e.team, scorer?.name ?? null, scorer !== undefined && scorer.team !== e.team);
      scene.goalEffect();
      return playGoal();
    }
    case "start":
      hud.start();
      return playWhistle(1);
    case "golden":
      hud.golden();
      return playWhistle(2);
    case "end":
      endedAt = performance.now();
      return playWhistle(3);
  }
};

let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  const state = (net.room && net.sample(now)) || IDLE;
  names = new Map(state.players.map((p) => [p.id, p]));
  if (net.room) hud.update(state, net.room, net.id);
  if (state.match !== "ended") endedAt = null;
  // Se rientri in una partita già finita endedAt è null: riepilogo subito.
  const showSummary = net.room !== null && state.match === "ended" && (endedAt === null || now - endedAt > SUMMARY_DELAY_MS);
  summary.update(showSummary, net.room, net.id);
  $("touch").hidden = !(net.room && touch && !showSummary);
  scene.update(state, net.id, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
