// Simulazione condivisa: gira sul server, che fa fede, e identica sul client,
// che la simula in anticipo (`client/predict.ts`).
// Unità: velocità in unità/tick, a TICK_RATE tick al secondo.
// Coordinate di gioco: x lungo il campo, y lungo la larghezza (in 3D diventa z).

export const TICK_RATE = 60;

export const FIELD = {
  w: 1100,
  h: 640,
  goalW: 190,
  goalDepth: 55,
  margin: 70,
  postR: 7,
  centerR: 90,
} as const;

export const BALL = { r: 11, invMass: 1, damping: 0.99, bounce: 0.5 } as const;

export const PLAYER = {
  r: 20,
  invMass: 0.5,
  damping: 0.96,
  accel: 0.13,
  kickingAccel: 0.085,
  bounce: 0.5,
  kickStrength: 5.5,
  kickReach: 5,
} as const;

export const MAX_PLAYERS = 10;
export const MATCH_MINUTES = [2, 3, 5, 10] as const;

const GOAL_PAUSE_TICKS = TICK_RATE * 2.5;
/** Se nessuno batte il calcio d'inizio entro questo tempo, si gioca comunque. */
const KICKOFF_TIMEOUT_TICKS = TICK_RATE * 5;

export type Team = "red" | "blue";

/** Input analogico: mx, my interi in [-100, 100]. La tastiera usa gli estremi. */
export interface Input {
  mx: number;
  my: number;
  kick: boolean;
}

export const NO_INPUT: Input = { mx: 0, my: 0, kick: false };

export interface Disc {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PlayerState extends Disc {
  id: string;
  name: string;
  team: Team;
  input: Input;
  prevKick: boolean;
  kickArmed: boolean;
  /** Disconnesso ma con il posto tenuto per la riconnessione. */
  away: boolean;
}

export type GameEvent =
  | { type: "kick"; tick: number; id: string; x: number; y: number }
  | { type: "goal"; tick: number; team: Team; scorer: string | null }
  | { type: "post"; tick: number; x: number; y: number }
  | { type: "start"; tick: number }
  | { type: "golden"; tick: number }
  | { type: "end"; tick: number; winner: Team | null };

export interface PlayerStats {
  id: string;
  name: string;
  team: Team;
  goals: number;
  ownGoals: number;
  kicks: number;
  touches: number;
}

export interface GoalRecord {
  /** Secondi di gioco effettivo dall'inizio della partita. */
  time: number;
  team: Team;
  scorerId: string | null;
  scorerName: string | null;
  own: boolean;
}

export interface MatchStats {
  /** Tick di gioco effettivo (esclusi kickoff e pause dopo i gol). */
  playTicks: number;
  goals: GoalRecord[];
  players: Record<string, PlayerStats>;
  /** Tick di possesso per squadra (squadra dell'ultimo tocco). */
  possession: Record<Team, number>;
}

export interface MatchSummary {
  winner: Team | null;
  score: [number, number];
  /** Decisa al golden goal. */
  golden: boolean;
  /** Durata effettiva in secondi. */
  duration: number;
  goals: GoalRecord[];
  players: PlayerStats[];
  /** Percentuale di possesso dei rossi (i blu sono il complemento). */
  possessionRed: number;
  mvpId: string | null;
}

/**
 * match: warmup = palleggio libero, running = partita col timer, ended = risultato.
 * ball:  kickoff = attesa del calcio d'inizio, play = gioco, goal = pausa dopo un gol.
 */
export interface GameState {
  tick: number;
  ball: Disc;
  players: PlayerState[];
  score: Record<Team, number>;
  match: "warmup" | "running" | "ended";
  phase: "kickoff" | "play" | "goal";
  phaseTimer: number;
  kickoffTeam: Team;
  /** Tick rimanenti di partita. */
  timeLeft: number;
  golden: boolean;
  /** Ultimo giocatore che ha toccato la palla, per attribuire i gol. */
  lastTouch: string | null;
  stats: MatchStats;
  /** Riepilogo dell'ultima partita conclusa. */
  summary: MatchSummary | null;
}

const POSTS: { x: number; y: number }[] = [
  { x: -FIELD.w / 2, y: -FIELD.goalW / 2 },
  { x: -FIELD.w / 2, y: FIELD.goalW / 2 },
  { x: FIELD.w / 2, y: -FIELD.goalW / 2 },
  { x: FIELD.w / 2, y: FIELD.goalW / 2 },
];

export function createState(): GameState {
  return {
    tick: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    players: [],
    score: { red: 0, blue: 0 },
    match: "warmup",
    phase: "play",
    phaseTimer: 0,
    kickoffTeam: "red",
    timeLeft: 0,
    golden: false,
    lastTouch: null,
    stats: emptyStats(),
    summary: null,
  };
}

function emptyStats(): MatchStats {
  return { playTicks: 0, goals: [], players: {}, possession: { red: 0, blue: 0 } };
}

/** Statistiche del giocatore, create al primo uso; nome e squadra restano aggiornati. */
function statsOf(state: GameState, p: PlayerState): PlayerStats {
  const s = (state.stats.players[p.id] ??= { id: p.id, name: p.name, team: p.team, goals: 0, ownGoals: 0, kicks: 0, touches: 0 });
  s.name = p.name;
  s.team = p.team;
  return s;
}

/** Senza squadra esplicita va in quella con meno giocatori. */
export function addPlayer(state: GameState, id: string, name: string, team?: Team): PlayerState {
  const reds = state.players.filter((p) => p.team === "red").length;
  const blues = state.players.length - reds;
  const player: PlayerState = {
    id,
    name,
    team: team ?? (reds <= blues ? "red" : "blue"),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    input: NO_INPUT,
    prevKick: false,
    kickArmed: false,
    away: false,
  };
  state.players.push(player);
  placePlayer(state, player);
  return player;
}

export function removePlayer(state: GameState, id: string) {
  state.players = state.players.filter((p) => p.id !== id);
}

/**
 * In riscaldamento si cambia liberamente. A partita iniziata solo per riequilibrare:
 * la tua squadra deve avere almeno 2 giocatori in più dell'altra (chi è offline non conta).
 */
export function canSwitchTeam(
  players: readonly Pick<PlayerState, "id" | "team" | "away">[],
  match: GameState["match"],
  id: string,
) {
  const me = players.find((p) => p.id === id);
  if (!me) return false;
  if (match === "warmup") return true;
  const count = (team: Team) => players.filter((p) => p.team === team && !p.away).length;
  return count(me.team) - count(me.team === "red" ? "blue" : "red") >= 2;
}

/** Restituisce false se il cambio non è consentito. */
export function switchTeam(state: GameState, id: string) {
  const p = state.players.find((p) => p.id === id);
  if (!p || !canSwitchTeam(state.players, state.match, id)) return false;
  p.team = p.team === "red" ? "blue" : "red";
  placePlayer(state, p);
  return true;
}

export function startMatch(state: GameState, minutes: number) {
  state.score = { red: 0, blue: 0 };
  state.match = "running";
  state.timeLeft = Math.round(minutes * 60 * TICK_RATE);
  state.golden = false;
  state.kickoffTeam = Math.random() < 0.5 ? "red" : "blue";
  state.stats = emptyStats();
  for (const p of state.players) statsOf(state, p);
  resetPositions(state);
}

/** Torna al palleggio libero dopo una partita. */
export function backToWarmup(state: GameState) {
  state.match = "warmup";
  state.score = { red: 0, blue: 0 };
  state.golden = false;
  resetPositions(state);
}

/** Il calcio d'inizio vale solo in partita e con entrambe le squadre in campo. */
function kickoffRules(state: GameState) {
  return state.match === "running" && state.players.some((p) => p.team === "red") && state.players.some((p) => p.team === "blue");
}

/** Rosso difende a sinistra (x < 0), blu a destra. */
function placePlayer(state: GameState, player: PlayerState) {
  const mates = state.players.filter((p) => p.team === player.team);
  const i = mates.indexOf(player);
  const side = player.team === "red" ? -1 : 1;
  const slots = [0, -140, 140, -260, 260];
  player.x = side * (FIELD.w / 4 + (i >= slots.length ? 60 : 0));
  player.y = slots[i % slots.length];
  player.vx = player.vy = 0;
}

export function resetPositions(state: GameState) {
  state.ball = { x: 0, y: 0, vx: 0, vy: 0 };
  state.lastTouch = null;
  for (const p of state.players) placePlayer(state, p);
  state.phase = kickoffRules(state) ? "kickoff" : "play";
  state.phaseTimer = KICKOFF_TIMEOUT_TICKS;
}

export function step(state: GameState, events: GameEvent[]) {
  state.tick++;
  const { ball } = state;
  const running = state.match === "running";
  // A partita finita i comandi non contano: i dischi rallentano fino a fermarsi.
  const frozen = state.match === "ended";

  for (const p of state.players) {
    const input = frozen ? NO_INPUT : p.input;
    let dx = input.mx / 100;
    let dy = input.my / 100;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const kick = input.kick;
    const a = kick ? PLAYER.kickingAccel : PLAYER.accel;
    p.vx += dx * a;
    p.vy += dy * a;

    // Il calcio parte alla pressione e resta "carico" finché tieni premuto,
    // così puoi premere prima di arrivare sulla palla. Un calcio per pressione.
    if (kick && !p.prevKick) p.kickArmed = true;
    if (!kick) p.kickArmed = false;
    p.prevKick = kick;

    if (p.kickArmed) {
      const kx = ball.x - p.x;
      const ky = ball.y - p.y;
      const d = Math.hypot(kx, ky);
      if (d > 0 && d <= PLAYER.r + BALL.r + PLAYER.kickReach) {
        ball.vx += (kx / d) * PLAYER.kickStrength * BALL.invMass;
        ball.vy += (ky / d) * PLAYER.kickStrength * BALL.invMass;
        p.kickArmed = false;
        state.lastTouch = p.id;
        if (running) statsOf(state, p).kicks++;
        events.push({ type: "kick", tick: state.tick, id: p.id, x: ball.x, y: ball.y });
      }
    }
  }

  integrate(ball, BALL.damping);
  for (const p of state.players) integrate(p, PLAYER.damping);

  for (const p of state.players) {
    if (!collide(p, PLAYER.r, PLAYER.invMass, ball, BALL.r, BALL.invMass, PLAYER.bounce)) continue;
    // Un tocco conta quando la palla passa a un giocatore diverso, non a ogni tick di contatto.
    if (running && state.lastTouch !== p.id) statsOf(state, p).touches++;
    state.lastTouch = p.id;
  }
  for (let i = 0; i < state.players.length; i++) {
    for (let j = i + 1; j < state.players.length; j++) {
      const a = state.players[i];
      const b = state.players[j];
      collide(a, PLAYER.r, PLAYER.invMass, b, PLAYER.r, PLAYER.invMass, PLAYER.bounce);
    }
  }
  for (const post of POSTS) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (collide({ ...post, vx: 0, vy: 0 }, FIELD.postR, 0, ball, BALL.r, BALL.invMass, BALL.bounce) && speed > 1.5) {
      events.push({ type: "post", tick: state.tick, x: post.x, y: post.y });
    }
    for (const p of state.players) {
      collide({ ...post, vx: 0, vy: 0 }, FIELD.postR, 0, p, PLAYER.r, PLAYER.invMass, PLAYER.bounce);
    }
  }

  constrainBall(ball);
  for (const p of state.players) {
    constrainPlayer(p);
    if (state.phase === "kickoff") constrainKickoff(p, p.team === state.kickoffTeam);
  }

  if (state.phase === "kickoff") {
    if (ball.vx !== 0 || ball.vy !== 0 || !kickoffRules(state) || --state.phaseTimer <= 0) state.phase = "play";
  } else if (state.phase === "play") {
    if (running) {
      state.stats.playTicks++;
      const holder = state.players.find((p) => p.id === state.lastTouch);
      if (holder) state.stats.possession[holder.team]++;
    }
    if (running && !state.golden && --state.timeLeft <= 0) {
      state.timeLeft = 0;
      if (state.score.red === state.score.blue) {
        state.golden = true;
        events.push({ type: "golden", tick: state.tick });
      } else {
        endMatch(state, events);
      }
    }
    const line = FIELD.w / 2 + BALL.r;
    // A partita finita la palla può finire in rete, ma non è più gol.
    if (Math.abs(ball.x) > line && state.match !== "ended") {
      const team: Team = ball.x > 0 ? "red" : "blue";
      events.push({ type: "goal", tick: state.tick, team, scorer: state.lastTouch });
      state.phase = "goal";
      state.phaseTimer = GOAL_PAUSE_TICKS;
      if (state.match === "running") {
        recordGoal(state, team);
        state.score[team]++;
        state.kickoffTeam = team === "red" ? "blue" : "red";
        if (state.golden) endMatch(state, events);
      }
    }
  } else if (--state.phaseTimer <= 0) {
    resetPositions(state);
  }
}

function recordGoal(state: GameState, team: Team) {
  const scorer = state.players.find((p) => p.id === state.lastTouch);
  const own = scorer !== undefined && scorer.team !== team;
  if (scorer) {
    const s = statsOf(state, scorer);
    if (own) s.ownGoals++;
    else s.goals++;
  }
  state.stats.goals.push({
    time: Math.floor(state.stats.playTicks / TICK_RATE),
    team,
    scorerId: scorer?.id ?? null,
    scorerName: scorer?.name ?? null,
    own,
  });
}

function endMatch(state: GameState, events: GameEvent[]) {
  const { red, blue } = state.score;
  const winner: Team | null = red === blue ? null : red > blue ? "red" : "blue";
  for (const p of state.players) statsOf(state, p);
  const players = Object.values(state.stats.players);
  const { possession } = state.stats;
  const held = possession.red + possession.blue;
  // Migliore in campo: i gol pesano più di tutto, poi tiri e tocchi.
  const rating = (p: PlayerStats) => p.goals * 10 - p.ownGoals * 5 + p.kicks + p.touches * 0.3;
  const mvp = players.reduce<PlayerStats | null>((best, p) => (!best || rating(p) > rating(best) ? p : best), null);
  state.summary = {
    winner,
    score: [red, blue],
    golden: state.golden,
    duration: Math.floor(state.stats.playTicks / TICK_RATE),
    goals: state.stats.goals,
    players,
    possessionRed: held ? Math.round((possession.red / held) * 100) : 50,
    mvpId: mvp && rating(mvp) > 0 ? mvp.id : null,
  };
  state.match = "ended";
  state.golden = false;
  events.push({ type: "end", tick: state.tick, winner });
}

function integrate(d: Disc, damping: number) {
  d.x += d.vx;
  d.y += d.vy;
  d.vx *= damping;
  d.vy *= damping;
}

/** Collisione elastica tra due dischi. invMass 0 = statico. */
function collide(
  a: Disc,
  ar: number,
  aInv: number,
  b: Disc,
  br: number,
  bInv: number,
  bounce: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const rs = ar + br;
  if (d2 >= rs * rs || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const total = aInv + bInv;
  const pen = rs - d;
  a.x -= nx * pen * (aInv / total);
  a.y -= ny * pen * (aInv / total);
  b.x += nx * pen * (bInv / total);
  b.y += ny * pen * (bInv / total);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = (-(1 + bounce) * rv) / total;
    a.vx -= j * nx * aInv;
    a.vy -= j * ny * aInv;
    b.vx += j * nx * bInv;
    b.vy += j * ny * bInv;
  }
  return true;
}

function constrainBall(b: Disc) {
  const hw = FIELD.w / 2;
  const hh = FIELD.h / 2;
  const gw = FIELD.goalW / 2;
  const r = BALL.r;

  if (Math.abs(b.x) > hw) {
    // Dentro la porta: la rete assorbe molto.
    const lim = gw - r;
    if (b.y > lim) {
      b.y = lim;
      if (b.vy > 0) b.vy = -b.vy * 0.3;
    } else if (b.y < -lim) {
      b.y = -lim;
      if (b.vy < 0) b.vy = -b.vy * 0.3;
    }
    const back = hw + FIELD.goalDepth - r;
    if (Math.abs(b.x) > back) {
      b.x = Math.sign(b.x) * back;
      b.vx = -b.vx * 0.15;
      b.vy *= 0.5;
    }
    return;
  }

  if (b.y > hh - r) {
    b.y = hh - r;
    if (b.vy > 0) b.vy = -b.vy * BALL.bounce;
  } else if (b.y < -hh + r) {
    b.y = -hh + r;
    if (b.vy < 0) b.vy = -b.vy * BALL.bounce;
  }
  if (Math.abs(b.y) > gw && Math.abs(b.x) > hw - r) {
    const s = Math.sign(b.x);
    b.x = s * (hw - r);
    if (b.vx * s > 0) b.vx = -b.vx * BALL.bounce;
  }
}

function constrainPlayer(p: Disc) {
  const limX = FIELD.w / 2 + FIELD.margin - PLAYER.r;
  const limY = FIELD.h / 2 + FIELD.margin - PLAYER.r;
  if (Math.abs(p.x) > limX) {
    p.x = Math.sign(p.x) * limX;
    p.vx = 0;
  }
  if (Math.abs(p.y) > limY) {
    p.y = Math.sign(p.y) * limY;
    p.vy = 0;
  }
}

/**
 * Durante il calcio d'inizio ognuno resta nella propria metà; chi non batte
 * resta anche fuori dal cerchio di centrocampo.
 */
function constrainKickoff(p: PlayerState, kicking: boolean) {
  const side = p.team === "red" ? -1 : 1;
  const limit = kicking ? 0 : PLAYER.r;
  if (p.x * side < limit) {
    p.x = side * limit;
    if (p.vx * side < 0) p.vx = 0;
  }
  if (!kicking) {
    const d = Math.hypot(p.x, p.y);
    const min = FIELD.centerR + PLAYER.r;
    if (d < min) {
      const nx = d > 0 ? p.x / d : side;
      const ny = d > 0 ? p.y / d : 0;
      p.x = nx * min;
      p.y = ny * min;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }
}
