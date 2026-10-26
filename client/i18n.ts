export type Lang = "it" | "en";
export const LANGS: readonly Lang[] = ["it", "en"];
/** Ogni lingua col suo nome, così chi non la capisce la riconosce comunque. */
export const LANG_NAME: Record<Lang, string> = { it: "Italiano", en: "English" };

const it = {
  "home.name.label": "Il tuo nome",
  "home.name.placeholder": "Come ti chiami?",
  "home.name.required": "Scrivi il tuo nome per entrare in partita.",
  "home.invite": "Sei stato invitato alla partita",
  "home.join": "Entra",
  "home.rooms.title": "Partite sulla tua rete",
  "home.rooms.empty": "Nessuna partita locale. Creane una!",
  "home.create.title": "Crea partita",
  "home.create": "Crea partita",
  "home.kind.local": "Rete locale",
  "home.kind.online": "Online con codice",
  "home.kind.local.hint": "Visibile e accessibile solo a chi è connesso alla tua stessa rete.",
  "home.kind.online.hint": "Chiunque abbia il codice o il link può entrare.",
  "home.training": "Allenamento",
  "home.vsCpu": "Gioca contro la CPU",
  "home.code.placeholder": "Codice",
  "home.install.title": "Installa l'app",
  "home.install.hint": "Aggiungila alla schermata Home: si apre a schermo intero, senza barre del browser.",
  "home.install.ios": "Tocca Condividi e poi «Aggiungi alla schermata Home».",
  "home.install.button": "Installa Balón",
  "room.of": "Partita di {name}",
  "room.running": "in corso",
  "room.ended": "finita",
  "room.waiting": "in attesa",
  "room.cpu": " ({n} CPU)",
  "level.easy": "Facile",
  "level.medium": "Medio",
  "level.hard": "Difficile",
  minutes: "{n} min",
  "conn.connecting": "Connessione al server…",
  "conn.offline": "Server non raggiungibile, riprovo…",
  "conn.lost": "Connessione persa, mi riconnetto…",
  "conn.roomGone": "Connessione persa: la partita non è più disponibile.",
  "error.name-required": "Scrivi il tuo nome per entrare in partita.",
  "error.room-not-found": "Partita non trovata. Controlla il codice.",
  "error.room-local-only": "Questa partita è riservata alla rete locale di chi l'ha creata.",
  "error.room-full": "La partita è piena.",
  "error.team-switch-locked": "A partita iniziata puoi cambiare squadra solo se l'altra ha almeno 2 giocatori in meno.",
  "error.bad-token": "Sessione non valida, ricarica la pagina.",
  "team.red": "Rossi",
  "team.blue": "Blu",
  "score.red": "ROSSI",
  "score.blue": "BLU",
  "hud.kind.local": "Rete locale",
  "hud.kind.online": "Online",
  "hud.invite": "Invita",
  "hud.invite.title": "Copia link d'invito",
  "hud.team": "Cambia squadra",
  "hud.team.title": "Cambia squadra (T)",
  "hud.leave": "Esci",
  "hud.leave.title": "Esci dalla partita",
  "hud.cpu.remove.red": "Togli CPU ai Rossi",
  "hud.cpu.add.red": "Aggiungi CPU ai Rossi",
  "hud.cpu.remove.blue": "Togli CPU ai Blu",
  "hud.cpu.add.blue": "Aggiungi CPU ai Blu",
  "hud.help": "<kbd>WASD</kbd>/<kbd>frecce</kbd> muovi · <kbd>Spazio</kbd> calcia · <kbd>T</kbd> cambia squadra",
  "hud.start": "Inizia partita",
  "hud.waitHost": "In attesa che {name} avvii la partita",
  "hud.host": "l'host",
  "hud.kickoff": "Calcio d'inizio: {team}",
  "clock.warmup": "Riscaldamento",
  "clock.golden": "Golden goal",
  "clock.final": "Finale",
  "banner.goal": "GOL!",
  "banner.ownGoal": "Autogol di {name}",
  "banner.start": "Si parte!",
  "banner.golden": "Golden goal",
  "banner.golden.sub": "Chi segna vince",
  "share.text": "Giochiamo a Balón!",
  "share.copied": "Link copiato negli appunti",
  "sum.golden": "Decisa al golden goal",
  "sum.end": "Fine partita · {time}",
  "sum.win.red": "Vincono i Rossi!",
  "sum.win.blue": "Vincono i Blu!",
  "sum.draw": "Pareggio",
  "sum.possession": "Possesso palla",
  "sum.ownGoal": " (autogol)",
  "sum.ownGoals": "{goals} ({n} aut.)",
  "sum.you": "tu",
  "sum.col.player": "Giocatore",
  "sum.col.goals": "Gol",
  "sum.col.shots": "Tiri",
  "sum.col.touches": "Tocchi",
  "sum.rematch": "Rivincita",
  "sum.warmup": "Riscaldamento",
  "sum.leave": "Esci",
  "sum.wait": "In attesa che {name} scelga se fare la rivincita",
  "touch.kick": "CALCIA",
  rotate: "Ruota il telefono in orizzontale",
};

export type Key = keyof typeof it;

const en: Record<Key, string> = {
  "home.name.label": "Your name",
  "home.name.placeholder": "What's your name?",
  "home.name.required": "Enter your name to join a match.",
  "home.invite": "You've been invited to match",
  "home.join": "Join",
  "home.rooms.title": "Matches on your network",
  "home.rooms.empty": "No local matches. Create one!",
  "home.create.title": "Create a match",
  "home.create": "Create match",
  "home.kind.local": "Local network",
  "home.kind.online": "Online with code",
  "home.kind.local.hint": "Only visible to and joinable by people on your network.",
  "home.kind.online.hint": "Anyone with the code or the link can join.",
  "home.training": "Practice",
  "home.vsCpu": "Play against the CPU",
  "home.code.placeholder": "Code",
  "home.install.title": "Install the app",
  "home.install.hint": "Add it to your Home Screen: it opens full screen, without the browser bars.",
  "home.install.ios": "Tap Share, then “Add to Home Screen”.",
  "home.install.button": "Install Balón",
  "room.of": "{name}'s match",
  "room.running": "in progress",
  "room.ended": "finished",
  "room.waiting": "waiting",
  "room.cpu": " ({n} CPU)",
  "level.easy": "Easy",
  "level.medium": "Medium",
  "level.hard": "Hard",
  minutes: "{n} min",
  "conn.connecting": "Connecting to the server…",
  "conn.offline": "Server unreachable, retrying…",
  "conn.lost": "Connection lost, reconnecting…",
  "conn.roomGone": "Connection lost: the match is no longer available.",
  "error.name-required": "Enter your name to join a match.",
  "error.room-not-found": "Match not found. Check the code.",
  "error.room-local-only": "This match is reserved for the local network of whoever created it.",
  "error.room-full": "The match is full.",
  "error.team-switch-locked": "Once the match has started, you can only switch if the other team has at least 2 fewer players.",
  "error.bad-token": "Invalid session, please reload the page.",
  "team.red": "Red",
  "team.blue": "Blue",
  "score.red": "RED",
  "score.blue": "BLUE",
  "hud.kind.local": "Local network",
  "hud.kind.online": "Online",
  "hud.invite": "Invite",
  "hud.invite.title": "Copy invite link",
  "hud.team": "Switch team",
  "hud.team.title": "Switch team (T)",
  "hud.leave": "Leave",
  "hud.leave.title": "Leave the match",
  "hud.cpu.remove.red": "Remove a CPU from Red",
  "hud.cpu.add.red": "Add a CPU to Red",
  "hud.cpu.remove.blue": "Remove a CPU from Blue",
  "hud.cpu.add.blue": "Add a CPU to Blue",
  "hud.help": "<kbd>WASD</kbd>/<kbd>arrows</kbd> move · <kbd>Space</kbd> kick · <kbd>T</kbd> switch team",
  "hud.start": "Start match",
  "hud.waitHost": "Waiting for {name} to start the match",
  "hud.host": "the host",
  "hud.kickoff": "Kick-off: {team}",
  "clock.warmup": "Warm-up",
  "clock.golden": "Golden goal",
  "clock.final": "Full time",
  "banner.goal": "GOAL!",
  "banner.ownGoal": "Own goal by {name}",
  "banner.start": "Kick-off!",
  "banner.golden": "Golden goal",
  "banner.golden.sub": "Next goal wins",
  "share.text": "Let's play Balón!",
  "share.copied": "Link copied to clipboard",
  "sum.golden": "Decided by golden goal",
  "sum.end": "Full time · {time}",
  "sum.win.red": "Red wins!",
  "sum.win.blue": "Blue wins!",
  "sum.draw": "Draw",
  "sum.possession": "Possession",
  "sum.ownGoal": " (own goal)",
  "sum.ownGoals": "{goals} ({n} OG)",
  "sum.you": "you",
  "sum.col.player": "Player",
  "sum.col.goals": "Goals",
  "sum.col.shots": "Shots",
  "sum.col.touches": "Touches",
  "sum.rematch": "Rematch",
  "sum.warmup": "Warm-up",
  "sum.leave": "Leave",
  "sum.wait": "Waiting for {name} to decide on a rematch",
  "touch.kick": "KICK",
  rotate: "Rotate your phone to landscape",
};

const DICT: Record<Lang, Record<Key, string>> = { it, en };
const STORAGE = "balon:lang";

/** Scelta salvata, altrimenti la prima lingua del browser che conosciamo; inglese di ripiego. */
function detect(): Lang {
  const saved = localStorage.getItem(STORAGE);
  if (LANGS.includes(saved as Lang)) return saved as Lang;
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = l.slice(0, 2).toLowerCase() as Lang;
    if (LANGS.includes(base)) return base;
  }
  return "en";
}

export const lang = detect();
document.documentElement.lang = lang;

export function t(key: Key, params: Record<string, string | number> = {}) {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));
}

/** Cambiare lingua ricarica la pagina: i testi si rigenerano tutti da capo. */
export function setLang(next: Lang) {
  if (next === lang) return;
  localStorage.setItem(STORAGE, next);
  location.reload();
}

/** Traduce i testi fissi dell'HTML: data-i18n (testo), data-i18n-html, -placeholder, -title, -aria-label. */
export function translatePage(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as Key);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml as Key);
  for (const attr of ["placeholder", "title", "aria-label"] as const) {
    for (const el of root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`) as Key));
    }
  }
}
