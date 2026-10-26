import type { Controls } from "./input.ts";

const STICK_RADIUS = 56;
const DEADZONE = 0.12;

/**
 * Stick "flottante" nella metà sinistra (appare dove appoggi il pollice)
 * e pulsante di calcio a destra. Visibile solo su dispositivi touch.
 */
export function setupTouch(root: HTMLElement, controls: Controls) {
  const zone = root.querySelector<HTMLElement>("#stick-zone")!;
  const base = root.querySelector<HTMLElement>("#stick-base")!;
  const knob = root.querySelector<HTMLElement>("#stick-knob")!;
  const kick = root.querySelector<HTMLElement>("#kick-btn")!;

  let pointer: number | null = null;
  let origin = { x: 0, y: 0 };

  const placeBase = (x: number, y: number) => {
    base.style.translate = `${x}px ${y}px`;
  };
  const rest = () => {
    const r = zone.getBoundingClientRect();
    origin = { x: r.left + r.width * 0.32, y: r.top + r.height * 0.68 };
    placeBase(origin.x, origin.y);
    knob.style.translate = "0 0";
    base.classList.remove("active");
  };
  rest();
  window.addEventListener("resize", rest);

  zone.addEventListener("pointerdown", (e) => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    origin = { x: e.clientX, y: e.clientY };
    placeBase(origin.x, origin.y);
    base.classList.add("active");
    navigator.vibrate?.(5);
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    knob.style.translate = `${dx}px ${dy}px`;
    const mag = Math.min(1, len / STICK_RADIUS);
    if (mag < DEADZONE) return controls.setStick(0, 0);
    // Direzione per intensità rimappata oltre la deadzone, così si parte morbidi da 0.
    const strength = (mag - DEADZONE) / (1 - DEADZONE);
    const clampedLen = Math.min(len, STICK_RADIUS);
    controls.setStick((dx / clampedLen) * strength, (dy / clampedLen) * strength);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    controls.setStick(0, 0);
    rest();
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);

  const kickDown = (e: PointerEvent) => {
    e.preventDefault();
    kick.setPointerCapture(e.pointerId);
    kick.classList.add("pressed");
    controls.setKick(true);
    navigator.vibrate?.(12);
  };
  const kickUp = () => {
    kick.classList.remove("pressed");
    controls.setKick(false);
  };
  kick.addEventListener("pointerdown", kickDown);
  kick.addEventListener("pointerup", kickUp);
  kick.addEventListener("pointercancel", kickUp);

  // Safari iOS ignora user-scalable=no e, con tap ripetuti sul calcio, zooma
  // comunque: bloccare i touch nativi sui controlli (i pointer event arrivano lo stesso)
  // e il pinch, che Safari espone come gesturestart.
  const block = (e: Event) => e.preventDefault();
  for (const el of [zone, kick]) {
    el.addEventListener("touchstart", block, { passive: false });
    el.addEventListener("touchend", block, { passive: false });
  }
  document.addEventListener("gesturestart", block);
  document.addEventListener("dblclick", block);
}

export const isTouchDevice = () => matchMedia("(pointer: coarse)").matches;
