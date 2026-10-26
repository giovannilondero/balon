// Predizione: invece di aspettare che il server confermi ogni tasto, il client
// simula la partita in anticipo con la stessa fisica del server (`shared/game.ts`),
// ripartendo dall'ultimo stato ricevuto. I propri comandi sono quelli veri, quelli
// degli altri restano gli ultimi noti. A ogni stato nuovo si risimula da lì, e lo
// scarto rispetto a quanto già mostrato si riassorbe in pochi frame invece di saltare.
import { createState, step, TICK_RATE, type GameEvent, type GameState, type Input, type Team } from "../shared/game.ts";
import type { Snapshot } from "../shared/protocol.ts";

/** Oltre questo anticipo sull'ultimo stato ricevuto (connessione ferma) la simulazione si ferma. */
const MAX_AHEAD = 2 * TICK_RATE;
/** Scarti più grandi sono teletrasporti (gol, cambio squadra): si mostrano subito. */
const SNAP_DISTANCE = 60;
/** Quanto in fretta si riassorbe lo scarto tra predizione e server (1/s). */
const ERROR_DECAY = 12;
const BALL_KEY = " ball";

export interface RenderPlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  /** Tasto calcio premuto. */
  k: boolean;
  away: boolean;
  bot: boolean;
}

export interface RenderState {
  ball: { x: number; y: number };
  players: RenderPlayer[];
  score: [number, number];
  match: GameState["match"];
  phase: GameState["phase"];
  kickoffTeam: Team;
  /** Secondi rimanenti. */
  time: number;
  golden: boolean;
}

type Point = { x: number; y: number };

export class Predictor {
  private base: Snapshot | null = null;
  private fresh = false;
  private state: GameState | null = null;
  /** Posizioni al tick prima di `state`, per disegnare tra un tick e l'altro. */
  private prev = new Map<string, Point>();
  private error = new Map<string, Point>();
  /** I propri comandi, ognuno col tick da cui vale. */
  private inputs: { tick: number; input: Input }[] = [];
  /** Gli eventi simulati si buttano: fanno fede quelli del server. */
  private readonly scratch: GameEvent[] = [];

  get ready() {
    return this.base !== null;
  }

  reset() {
    this.base = null;
    this.state = null;
    this.prev.clear();
    this.error.clear();
    this.inputs = [];
  }

  receive(snap: Snapshot) {
    if (this.base && snap.tick <= this.base.tick) return;
    this.base = snap;
    this.fresh = true;
  }

  record(tick: number, input: Input) {
    while (this.inputs.length && this.inputs.at(-1)!.tick >= tick) this.inputs.pop();
    this.inputs.push({ tick, input });
  }

  /** Lo stato da mostrare al tick (frazionario) `target`; `meId` è chi gioca da qui. */
  sample(target: number, meId: string | null, dt: number): RenderState | null {
    const base = this.base;
    if (!base) return null;
    if (this.fresh || !this.state) this.rebase(base, meId);
    const state = this.state!;
    const goal = Math.min(Math.floor(target), base.tick + MAX_AHEAD);
    this.advance(state, goal, meId);
    // Ferma (connessione persa o tick non ancora raggiunto): niente interpolazione oltre lo stato.
    const frac = state.tick === Math.floor(target) ? target - state.tick : 1;

    const decay = Math.exp(-ERROR_DECAY * dt);
    for (const [key, e] of this.error) {
      e.x *= decay;
      e.y *= decay;
      if (Math.abs(e.x) + Math.abs(e.y) < 0.01) this.error.delete(key);
    }
    const shown = (key: string, now: Point) => {
      const before = this.prev.get(key) ?? now;
      const e = this.error.get(key);
      return { x: lerp(before.x, now.x, frac) + (e?.x ?? 0), y: lerp(before.y, now.y, frac) + (e?.y ?? 0) };
    };
    const meta = new Map(base.players.map((p) => [p.id, p]));
    return {
      ball: shown(BALL_KEY, state.ball),
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        ...shown(p.id, p),
        k: p.input.kick,
        away: p.away,
        bot: meta.get(p.id)?.bot ?? false,
      })),
      score: base.score,
      match: base.match,
      phase: base.phase,
      kickoffTeam: base.kickoffTeam,
      time: Math.ceil(base.timeLeft / TICK_RATE),
      golden: base.golden,
    };
  }

  /** Riparte dallo stato del server; lo scarto con la predizione precedente diventa errore da riassorbire. */
  private rebase(base: Snapshot, meId: string | null) {
    this.fresh = false;
    const old = this.state;
    const next = fromSnapshot(base);
    this.prev = positions(next);
    if (old && old.tick > next.tick && old.tick - next.tick <= MAX_AHEAD) {
      this.advance(next, old.tick, meId);
      const after = positions(next);
      for (const [key, was] of positions(old)) {
        const now = after.get(key);
        if (!now) continue;
        const e = this.error.get(key) ?? { x: 0, y: 0 };
        e.x += was.x - now.x;
        e.y += was.y - now.y;
        if (Math.hypot(e.x, e.y) > SNAP_DISTANCE) this.error.delete(key);
        else this.error.set(key, e);
      }
    } else {
      this.error.clear();
    }
    this.state = next;
    // Serve solo il comando in corso al tick dello stato e quelli successivi.
    while (this.inputs.length > 1 && this.inputs[1].tick <= base.tick) this.inputs.shift();
  }

  private advance(state: GameState, to: number, meId: string | null) {
    while (state.tick < to) {
      this.prev = positions(state);
      const me = meId === null ? undefined : state.players.find((p) => p.id === meId);
      if (me) me.input = this.inputAt(state.tick + 1) ?? me.input;
      step(state, this.scratch);
      this.scratch.length = 0;
    }
  }

  private inputAt(tick: number) {
    let found: Input | undefined;
    for (const entry of this.inputs) {
      if (entry.tick > tick) break;
      found = entry.input;
    }
    return found;
  }
}

function fromSnapshot(s: Snapshot): GameState {
  const state = createState();
  state.tick = s.tick;
  state.ball = { x: s.ball[0], y: s.ball[1], vx: s.ball[2], vy: s.ball[3] };
  state.players = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    input: { mx: p.i[0], my: p.i[1], kick: p.i[2] === 1 },
    prevKick: p.pk,
    kickArmed: p.ka,
    away: p.away,
  }));
  state.score = { red: s.score[0], blue: s.score[1] };
  state.match = s.match;
  state.phase = s.phase;
  state.phaseTimer = s.phaseTimer;
  state.kickoffTeam = s.kickoffTeam;
  state.timeLeft = s.timeLeft;
  state.golden = s.golden;
  return state;
}

function positions(state: GameState) {
  const map = new Map<string, Point>([[BALL_KEY, { x: state.ball.x, y: state.ball.y }]]);
  for (const p of state.players) map.set(p.id, { x: p.x, y: p.y });
  return map;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
