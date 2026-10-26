import { NetClient, type RenderState } from "./net.ts";
import { GameScene } from "./scene.ts";
import { Controls } from "./input.ts";
import { isTouchDevice, setupTouch } from "./touch.ts";
import { Lobby } from "./lobby.ts";
import { Hud } from "./hud.ts";
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
const hud = new Hud(net, () => {
  net.send({ t: "leave" });
});

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
  $("touch").hidden = !(playing && touch);
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
      hud.end(e.winner);
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
  scene.update(state, net.id, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
