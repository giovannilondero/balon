import { $ } from "./dom.ts";

/** Evento non standard di Chrome/Edge/Samsung: permette di aprire il prompt d'installazione quando vogliamo noi. */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const installed = () =>
  matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS si presenta come Mac: lo riconosciamo dal touch.
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Sezione "Installa l'app" della home. Dove il browser lo consente usa il prompt nativo;
 * su iOS, che non ha un'API, spiega i passaggi da Condividi. Già installata: niente.
 */
export function setupInstall() {
  if (installed()) return;
  const section = $("install");
  const button = $<HTMLButtonElement>("install-app");
  let deferred: InstallPromptEvent | null = null;

  if (ios) {
    $("install-hint").textContent = "Tocca Condividi e poi «Aggiungi alla schermata Home».";
    button.hidden = true;
    section.hidden = false;
  }

  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    section.hidden = false;
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    section.hidden = true;
  });

  button.addEventListener("click", async () => {
    if (!deferred) return;
    const prompt = deferred;
    // Il prompt si usa una volta sola: se lo rifiuti, la sezione torna al prossimo beforeinstallprompt.
    deferred = null;
    section.hidden = true;
    await prompt.prompt();
  });
}
