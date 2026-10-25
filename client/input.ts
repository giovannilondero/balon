import { InputBit } from "../shared/game.ts";

const KEYS: Record<string, number> = {
  KeyW: InputBit.up,
  ArrowUp: InputBit.up,
  KeyS: InputBit.down,
  ArrowDown: InputBit.down,
  KeyA: InputBit.left,
  ArrowLeft: InputBit.left,
  KeyD: InputBit.right,
  ArrowRight: InputBit.right,
  Space: InputBit.kick,
  KeyX: InputBit.kick,
};

/** Chiama onChange con la bitmask degli input ogni volta che cambia. */
export function listenInput(onChange: (bits: number) => void, onTeamSwitch: () => void) {
  const down = new Set<string>();
  let bits = 0;

  const update = () => {
    let next = 0;
    for (const code of down) next |= KEYS[code] ?? 0;
    if (next !== bits) {
      bits = next;
      onChange(bits);
    }
  };

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "KeyT" && !e.repeat) onTeamSwitch();
    if (!(e.code in KEYS)) return;
    e.preventDefault();
    down.add(e.code);
    update();
  });
  window.addEventListener("keyup", (e) => {
    down.delete(e.code);
    update();
  });
  window.addEventListener("blur", () => {
    down.clear();
    update();
  });
}
