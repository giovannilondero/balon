// Suoni sintetizzati con WebAudio: niente asset da caricare.

let ctx: AudioContext | null = null;

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playKick(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  gain.gain.setValueAtTime(0.6 * volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.16);
}

export function playPost() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [820, 1230]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}

export function playGoal() {
  if (!ctx) return;
  const t = ctx.currentTime;
  // "Folla": rumore filtrato con inviluppo lungo.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2.5);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  whistle(ctx, t, 0.5);
}

/** Fischi brevi in sequenza; l'ultimo è lungo (1 = inizio, 3 = fine partita). */
export function playWhistle(count: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    whistle(ctx, t + i * 0.32, last && count > 1 ? 0.7 : 0.22);
  }
}

function whistle(ac: AudioContext, t: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.setValueAtTime(2600, t);
  // Il "trillo" del fischietto: vibrato veloce sulla frequenza.
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 30;
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  gain.gain.setValueAtTime(0.08, t + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + duration);
  lfo.stop(t + duration);
}
