// Simulazione condivisa: gira sul server (autoritativo) ed è pensata per
// poter girare identica anche sul client (predizione, in futuro).
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

const GOAL_PAUSE_TICKS = TICK_RATE * 2.5;

export type Team = "red" | "blue";

export const InputBit = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  kick: 16,
} as const;

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
  input: number;
  prevKick: boolean;
  kickArmed: boolean;
}

export type GameEvent =
  | { type: "kick"; tick: number; id: string; x: number; y: number }
  | { type: "goal"; tick: number; team: Team }
  | { type: "post"; tick: number; x: number; y: number };

export interface GameState {
  tick: number;
  ball: Disc;
  players: PlayerState[];
  score: Record<Team, number>;
  phase: "play" | "goal";
  phaseTimer: number;
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
    phase: "play",
    phaseTimer: 0,
  };
}

export function addPlayer(state: GameState, id: string, name: string): PlayerState {
  const reds = state.players.filter((p) => p.team === "red").length;
  const blues = state.players.length - reds;
  const player: PlayerState = {
    id,
    name,
    team: reds <= blues ? "red" : "blue",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    input: 0,
    prevKick: false,
    kickArmed: false,
  };
  state.players.push(player);
  placePlayer(state, player);
  return player;
}

export function removePlayer(state: GameState, id: string) {
  state.players = state.players.filter((p) => p.id !== id);
}

export function switchTeam(state: GameState, id: string) {
  const p = state.players.find((p) => p.id === id);
  if (!p) return;
  p.team = p.team === "red" ? "blue" : "red";
  placePlayer(state, p);
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
  for (const p of state.players) placePlayer(state, p);
}

export function step(state: GameState, events: GameEvent[]) {
  state.tick++;
  const { ball } = state;

  for (const p of state.players) {
    let dx = 0;
    let dy = 0;
    if (p.input & InputBit.up) dy -= 1;
    if (p.input & InputBit.down) dy += 1;
    if (p.input & InputBit.left) dx -= 1;
    if (p.input & InputBit.right) dx += 1;
    const len = Math.hypot(dx, dy);
    const kick = (p.input & InputBit.kick) !== 0;
    if (len > 0) {
      const a = kick ? PLAYER.kickingAccel : PLAYER.accel;
      p.vx += (dx / len) * a;
      p.vy += (dy / len) * a;
    }

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
        events.push({ type: "kick", tick: state.tick, id: p.id, x: ball.x, y: ball.y });
      }
    }
  }

  integrate(ball, BALL.damping);
  for (const p of state.players) integrate(p, PLAYER.damping);

  for (const p of state.players) {
    collide(p, PLAYER.r, PLAYER.invMass, ball, BALL.r, BALL.invMass, PLAYER.bounce);
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
    const postDisc = { ...post, vx: 0, vy: 0 };
    if (collide(postDisc, FIELD.postR, 0, ball, BALL.r, BALL.invMass, BALL.bounce) && speed > 1.5) {
      events.push({ type: "post", tick: state.tick, x: post.x, y: post.y });
    }
    for (const p of state.players) {
      collide({ ...post, vx: 0, vy: 0 }, FIELD.postR, 0, p, PLAYER.r, PLAYER.invMass, PLAYER.bounce);
    }
  }

  constrainBall(ball);
  for (const p of state.players) constrainPlayer(p);

  if (state.phase === "play") {
    const line = FIELD.w / 2 + BALL.r;
    if (Math.abs(ball.x) > line) {
      const team: Team = ball.x > 0 ? "red" : "blue";
      state.score[team]++;
      state.phase = "goal";
      state.phaseTimer = GOAL_PAUSE_TICKS;
      events.push({ type: "goal", tick: state.tick, team });
    }
  } else if (--state.phaseTimer <= 0) {
    state.phase = "play";
    resetPositions(state);
  }
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
