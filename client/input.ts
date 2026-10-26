// Unisce tastiera e controlli touch in un unico input analogico [mx, my, kick].
// Lo schermo e il campo hanno gli stessi assi: destra = +x, giù = +y.

export type InputTuple = [number, number, 0 | 1];

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const KICK = new Set(["Space", "KeyX"]);

export class Controls {
  enabled = false;
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private touchKick = false;
  private last = "";

  constructor(
    private onChange: (input: InputTuple) => void,
    onTeamSwitch: () => void,
  ) {
    window.addEventListener("keydown", (e) => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      if (e.code === "KeyT" && !e.repeat) onTeamSwitch();
      if (!(e.code in MOVE) && !KICK.has(e.code)) return;
      e.preventDefault();
      this.keys.add(e.code);
      this.update();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.update();
    });
    window.addEventListener("blur", () => this.reset());
  }

  setStick(x: number, y: number) {
    this.stick = { x, y };
    this.update();
  }

  setKick(down: boolean) {
    this.touchKick = down;
    this.update();
  }

  reset() {
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.touchKick = false;
    this.update();
  }

  private update() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const m = MOVE[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    if (x === 0 && y === 0) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const kick = this.touchKick || [...this.keys].some((k) => KICK.has(k));
    const input: InputTuple = [Math.round(clamp(x) * 100), Math.round(clamp(y) * 100), kick ? 1 : 0];
    const key = input.join();
    if (key !== this.last) {
      this.last = key;
      this.onChange(input);
    }
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
