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
  // Fischietto.
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.setValueAtTime(2600, t);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 30;
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(osc.frequency);
  og.gain.setValueAtTime(0.08, t);
  og.gain.setValueAtTime(0.08, t + 0.5);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc.connect(og).connect(ctx.destination);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 0.6);
  lfo.stop(t + 0.6);
}
