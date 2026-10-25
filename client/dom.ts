export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Gruppo di pulsanti a scelta singola. */
export function chips<T>(
  root: HTMLElement,
  values: readonly T[],
  initial: T,
  label: (v: T) => string,
  onSelect: (v: T) => void,
) {
  const buttons = values.map((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label(v);
    b.classList.toggle("on", v === initial);
    b.addEventListener("click", () => {
      for (const other of buttons) other.classList.toggle("on", other === b);
      onSelect(v);
    });
    return b;
  });
  root.replaceChildren(...buttons);
  return {
    set(v: T) {
      buttons.forEach((b, i) => b.classList.toggle("on", values[i] === v));
    },
  };
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(text: string, kind: "error" | "info" = "error") {
  const el = $("toast");
  el.textContent = text;
  el.className = `show ${kind}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = kind), 3200);
}
