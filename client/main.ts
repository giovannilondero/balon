import { NetClient } from "./net.ts";
import { GameScene } from "./scene.ts";
import { listenInput } from "./input.ts";
import { playGoal, playKick, playPost, unlockAudio } from "./audio.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const scene = new GameScene($("game"));
const net = new NetClient();

const form = $<HTMLFormElement>("join");
const nameInput = $<HTMLInputElement>("name");
nameInput.value = localStorage.getItem("balon:name") ?? "";

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim() || "Giocatore";
  localStorage.setItem("balon:name", name);
  unlockAudio();
  form.hidden = true;
  $("hud").hidden = false;
  net.connect(name);
  listenInput(
    (bits) => net.send({ t: "input", bits }),
    () => net.send({ t: "team" }),
  );
});

let lastPlayers = new Map<string, { team: "red" | "blue" }>();

net.onStatus = (ok) => {
  $("status").textContent = ok ? "" : "Disconnesso — ricarica la pagina";
};

net.onEvent = (e) => {
  if (e.type === "kick") {
    scene.kickEffect(e.x, e.y, lastPlayers.get(e.id)?.team);
    playKick();
  } else if (e.type === "post") {
    playPost();
  } else if (e.type === "goal") {
    const banner = $("banner");
    banner.textContent = "GOL!";
    banner.style.color = e.team === "red" ? "#ff6b70" : "#6f9bff";
    banner.classList.remove("show");
    void banner.offsetWidth; // riavvia l'animazione
    banner.classList.add("show");
    scene.goalEffect();
    playGoal();
  }
};

let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  const state = net.sample(now) ?? { ball: { x: 0, y: 0 }, players: [], score: [0, 0] as [number, number], phase: "play" as const };
  lastPlayers = new Map(state.players.map((p) => [p.id, p]));
  $("score-red").textContent = String(state.score[0]);
  $("score-blue").textContent = String(state.score[1]);
  scene.update(state, net.id, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
