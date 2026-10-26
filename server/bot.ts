// Giocatori controllati dal computer. Il bot non tocca la fisica: produce lo
// stesso Input [mx, my, kick] di un giocatore umano, quindi gioca con le stesse regole.

import { BALL, FIELD, PLAYER, type GameState, type Input, type PlayerState, type Team } from "../shared/game.ts";
import { BOT_LEVELS, type BotLevel } from "../shared/protocol.ts";

export { BOT_LEVELS, type BotLevel };

interface LevelParams {
  /** Ogni quanti tick il bot ricalcola la decisione (tempo di reazione). */
  thinkEvery: number;
  /** Frazione della velocità massima. */
  speed: number;
  /** Errore di mira, in radianti. */
  aimNoise: number;
  /** Quanto deve essere allineato alla porta per tirare (coseno). */
  shootAlign: number;
  /** Quanti tick avanti prevede la traiettoria della palla. */
  lookahead: number;
}

const LEVELS: Record<BotLevel, LevelParams> = {
  easy: { thinkEvery: 14, speed: 0.68, aimNoise: 0.35, shootAlign: 0.6, lookahead: 4 },
  medium: { thinkEvery: 7, speed: 0.86, aimNoise: 0.15, shootAlign: 0.8, lookahead: 10 },
  hard: { thinkEvery: 2, speed: 1, aimNoise: 0.05, shootAlign: 0.9, lookahead: 18 },
};

const CONTACT = PLAYER.r + BALL.r;
const HW = FIELD.w / 2;

export class BotBrain {
  private nextThink = 0;
  private input: Input = { mx: 0, my: 0, kick: false };
  private wantsKick = false;
  /** Punto della porta avversaria a cui mira, scelto a ogni azione. */
  private aimY = 0;
  /** Tick passati attaccato alla palla: serve a sbloccare le mischie. */
  private contactTicks = 0;

  constructor(
    readonly id: string,
    public level: BotLevel,
  ) {}

  /** Da chiamare a ogni tick, prima della simulazione. */
  update(state: GameState, me: PlayerState) {
    const params = LEVELS[this.level];
    if (state.tick >= this.nextThink) {
      // Un po' di variazione nel tempo di reazione, così più bot non si muovono all'unisono.
      this.nextThink = state.tick + params.thinkEvery + Math.floor(Math.random() * 3);
      this.decide(state, me, params);
    }
    // Il calcio parte sulla pressione: un tick premuto, poi rilasciato.
    const kick = this.wantsKick && !me.input.kick;
    if (kick) this.wantsKick = false;
    me.input = { ...this.input, kick };
  }

  private decide(state: GameState, me: PlayerState, params: LevelParams) {
    const dir = me.team === "red" ? 1 : -1; // verso cui attacca
    const ball = state.ball;
    const mates = state.players.filter((p) => p.team === me.team);

    if (state.phase === "goal") return this.moveTo(me, homeSpot(me, mates), params, 0.6);

    const kickoffWait = state.phase === "kickoff" && state.kickoffTeam !== me.team;
    const chaser = closestTo(mates, ball);
    if (kickoffWait || chaser !== me) return this.support(state, me, mates, params);

    // Palla prevista tra qualche tick (con l'attrito della palla).
    const t = params.lookahead;
    const travel = (1 - BALL.damping ** t) / (1 - BALL.damping);
    const bx = ball.x + ball.vx * travel;
    const by = ball.y + ball.vy * travel;

    // Dove mirare: dentro la porta, con un errore che dipende dal livello.
    if (Math.abs(ball.x - me.x) > 200 || Math.random() < 0.05) {
      this.aimY = (Math.random() - 0.5) * FIELD.goalW * 0.55;
    }
    let ax = dir * HW - bx;
    let ay = this.aimY - by;
    // Vicino alla propria porta conta allontanare la palla, non tirare.
    const fromOwnX = bx + dir * HW;
    const fromOwnD = Math.hypot(fromOwnX, by);
    if (fromOwnD < 300) {
      const len = Math.hypot(ax, ay);
      ax = ax / len + (fromOwnX / fromOwnD) * 1.5;
      ay = ay / len + (by / fromOwnD) * 1.5;
    }
    const noise = (Math.random() - 0.5) * 2 * params.aimNoise;
    [ax, ay] = rotate(ax, ay, noise);
    const alen = Math.hypot(ax, ay);
    ax /= alen;
    ay /= alen;

    // Punto dietro la palla, sulla linea palla → porta.
    const behindX = bx - ax * (CONTACT + 3);
    const behindY = by - ay * (CONTACT + 3);

    // Se sono davanti alla palla devo girarle attorno, altrimenti la spingo verso la mia porta.
    const relX = me.x - bx;
    const relY = me.y - by;
    const ahead = relX * ax + relY * ay;
    if (ahead > -CONTACT * 0.5) {
      const side = relX * -ay + relY * ax >= 0 ? 1 : -1;
      const off = CONTACT + 26;
      this.moveTo(me, { x: bx - ax * off - ay * off * side, y: by - ay * off + ax * off * side }, params, 1);
      this.wantsKick = false;
      return;
    }
    this.moveTo(me, { x: behindX + ax * 6, y: behindY + ay * 6 }, params, 1);

    // Tiro: abbastanza vicino, allineato con la porta e nella metà giusta.
    const dx = ball.x - me.x;
    const dy = ball.y - me.y;
    const d = Math.hypot(dx, dy);
    const inReach = d <= CONTACT + PLAYER.kickReach - 1;
    const align = (dx * ax + dy * ay) / (d || 1);
    const distToGoal = Math.abs(dir * HW - ball.x);
    const shoot = inReach && align > params.shootAlign && distToGoal < FIELD.w * 0.6;
    this.contactTicks = inReach ? this.contactTicks + params.thinkEvery : 0;
    const unstick = this.contactTicks > 45 && dx * dir > 0;
    // Rinvio: palla vicina alla propria porta, basta che vada nella direzione giusta.
    const clear = inReach && Math.abs(-dir * HW - ball.x) < FIELD.w * 0.25 && dx * dir > 0 && align > 0.3;
    this.wantsKick = shoot || clear || unstick;
    if (this.wantsKick) this.contactTicks = 0;
  }

  /** Chi non va sulla palla copre: un difensore tra palla e porta, gli altri di appoggio. */
  private support(state: GameState, me: PlayerState, mates: PlayerState[], params: LevelParams) {
    const dir = me.team === "red" ? 1 : -1;
    const ball = state.ball;
    const others = mates.filter((p) => p !== closestTo(mates, ball)).sort((a, b) => a.id.localeCompare(b.id));
    const role = Math.max(0, others.indexOf(me));
    this.wantsKick = false;

    if (role === 0) {
      // Difensore: sul segmento porta → palla, a un terzo della distanza.
      const gx = -dir * HW;
      const k = 0.32;
      let x = gx + (ball.x - gx) * k;
      const y = ball.y * k;
      x = dir > 0 ? Math.min(x, -40) : Math.max(x, 40);
      return this.moveTo(me, { x, y }, params, 0.9);
    }
    // Appoggio: un po' dietro la palla, sulle fasce.
    const lane = role % 2 === 1 ? -1 : 1;
    return this.moveTo(me, { x: ball.x - dir * 160, y: lane * FIELD.h * 0.28 }, params, 0.8);
  }

  /** Steering con frenata: punta al bersaglio tenendo conto della velocità attuale. */
  private moveTo(me: PlayerState, target: { x: number; y: number }, params: LevelParams, urgency: number) {
    const brake = 10;
    const dx = target.x - (me.x + me.vx * brake);
    const dy = target.y - (me.y + me.vy * brake);
    const d = Math.hypot(dx, dy);
    if (d < 3) {
      this.input = { mx: 0, my: 0, kick: false };
      return;
    }
    const mag = Math.min(1, d / 30) * params.speed * urgency;
    this.input = { mx: Math.round((dx / d) * mag * 100), my: Math.round((dy / d) * mag * 100), kick: false };
  }
}

function closestTo(players: PlayerState[], ball: { x: number; y: number }) {
  let best: PlayerState | undefined;
  let bestD = Infinity;
  for (const p of players) {
    if (p.away) continue;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function homeSpot(me: PlayerState, mates: PlayerState[]) {
  const side = me.team === "red" ? -1 : 1;
  const i = mates.indexOf(me);
  return { x: side * FIELD.w * 0.25, y: (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 120 };
}

function rotate(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

const BOT_ID_PREFIX = "cpu-";

export function newBotId() {
  return `${BOT_ID_PREFIX}${Math.random().toString(36).slice(2, 8)}`;
}

/** Vale anche per bot già rimossi dalla stanza (es. nel riepilogo di fine partita). */
export function isBotId(id: string) {
  return id.startsWith(BOT_ID_PREFIX);
}

export function botName(team: Team, n: number) {
  return `CPU ${team === "red" ? "R" : "B"}${n}`;
}
