// Genera favicon e icone PWA: pallone su prato a strisce con fili d'erba.
// Uso: `pnpm icons` (scrive in client/public/).

import { Resvg } from "@resvg/resvg-js";
import { join } from "node:path";

const OUT = join(import.meta.dir, "../client/public");
const S = 512;

/** PRNG deterministico: le icone non cambiano a ogni esecuzione. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const f = (n: number) => n.toFixed(1);

function grass(blades: boolean) {
  const stripes = 6;
  const w = S / stripes;
  let out = `<rect width="${S}" height="${S}" fill="#2b7f39"/>`;
  for (let i = 0; i < stripes; i += 2) out += `<rect x="${i * w}" width="${w}" height="${S}" fill="#35923f"/>`;
  if (!blades) return out;

  const rand = rng(7);
  const greens = ["#1f6b2c", "#24753a", "#3fa04a", "#4cae55", "#5dbb5f", "#2f8a3e"];
  for (let i = 0; i < 1400; i++) {
    const x = rand() * S;
    const y = rand() * (S + 30);
    const h = 10 + rand() * 18;
    const lean = (rand() - 0.5) * 12;
    const wBase = 1.4 + rand() * 1.6;
    const color = greens[Math.floor(rand() * greens.length)];
    // Filo d'erba: triangolo curvo, base larga e punta sottile.
    out += `<path d="M${f(x - wBase)} ${f(y)} Q${f(x + lean * 0.4)} ${f(y - h * 0.6)} ${f(x + lean)} ${f(y - h)} Q${f(x + lean * 0.4 + wBase * 0.4)} ${f(y - h * 0.5)} ${f(x + wBase)} ${f(y)}Z" fill="${color}" opacity="${f(0.55 + rand() * 0.45)}"/>`;
  }
  return out;
}

function pentagon(cx: number, cy: number, r: number, rot: number, squash = 1, axis = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * 2 * Math.PI) / 5;
    let px = Math.cos(a) * r;
    let py = Math.sin(a) * r;
    // Schiacciamento lungo il raggio per simulare la curvatura della sfera.
    const along = px * Math.cos(axis) + py * Math.sin(axis);
    px -= Math.cos(axis) * along * (1 - squash);
    py -= Math.sin(axis) * along * (1 - squash);
    pts.push([cx + px, cy + py]);
  }
  return pts;
}

function ball(cx: number, cy: number, R: number) {
  const up = -Math.PI / 2;
  const center = pentagon(cx, cy, R * 0.27, up);
  const outer = [0, 1, 2, 3, 4].map((i) => {
    const a = up + (i * 2 * Math.PI) / 5;
    const d = R * 0.84;
    return { a, pts: pentagon(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * 0.27, a + Math.PI, 0.55, a) };
  });
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

  let seams = "";
  outer.forEach(({ pts }, i) => {
    // Cucitura dal vertice del pentagono centrale al vertice interno di quello esterno.
    const inner = pts[0];
    const c = center[i];
    seams += `M${f(c[0])} ${f(c[1])} L${f(inner[0])} ${f(inner[1])} `;
    // Cucitura tra pentagoni esterni vicini.
    const next = outer[(i + 1) % 5].pts;
    seams += `M${f(pts[4][0])} ${f(pts[4][1])} L${f(next[1][0])} ${f(next[1][1])} `;
  });

  return `
  <defs>
    <radialGradient id="ballBase" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#eef1ee"/>
      <stop offset="1" stop-color="#b9c2bb"/>
    </radialGradient>
    <radialGradient id="ballShade" cx="0.38" cy="0.32" r="0.8">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#0b2312" stop-opacity="0.55"/>
    </radialGradient>
    <clipPath id="ballClip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${R * 0.09}"/></filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${R * 0.06}"/></filter>
  </defs>
  <ellipse cx="${cx + R * 0.12}" cy="${cy + R * 0.97}" rx="${R * 0.92}" ry="${R * 0.24}" fill="#062210" opacity="0.6" filter="url(#blur)"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#ballBase)"/>
  <g clip-path="url(#ballClip)">
    <polygon points="${poly(center)}" fill="#151a17"/>
    ${outer.map(({ pts }) => `<polygon points="${poly(pts)}" fill="#151a17"/>`).join("")}
    <path d="${seams}" stroke="#4a524c" stroke-width="${R * 0.025}" stroke-linecap="round" fill="none"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#ballShade)"/>
    <ellipse cx="${cx - R * 0.36}" cy="${cy - R * 0.42}" rx="${R * 0.26}" ry="${R * 0.16}" fill="#fff" opacity="0.7" transform="rotate(-35 ${cx - R * 0.36} ${cy - R * 0.42})" filter="url(#glow)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${R - 1}" fill="none" stroke="#0b2312" stroke-opacity="0.35" stroke-width="2"/>`;
}

function icon({ blades, rounded, ballScale }: { blades: boolean; rounded: boolean; ballScale: number }) {
  const R = S * ballScale;
  const clip = rounded ? `<clipPath id="bg"><rect width="${S}" height="${S}" rx="${S * 0.22}"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    ${clip}
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#03140a" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <g ${rounded ? 'clip-path="url(#bg)"' : ""}>
    ${grass(blades)}
    <rect width="${S}" height="${S}" fill="url(#vignette)"/>
    ${ball(S / 2, S * 0.47, R)}
  </g>
</svg>`;
}

function png(svg: string, size: number) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

// "any": angoli arrotondati. "maskable" e Apple: a tutto campo, il sistema ritaglia,
// quindi il pallone sta dentro la zona sicura (cerchio di raggio 40%).
const any = icon({ blades: true, rounded: true, ballScale: 0.3 });
const full = icon({ blades: true, rounded: false, ballScale: 0.27 });
// Per la favicon i fili d'erba sarebbero rumore: strisce e pallone più grande.
const fav = icon({ blades: false, rounded: true, ballScale: 0.36 });

await Bun.write(join(OUT, "favicon.svg"), fav);
await Bun.write(join(OUT, "favicon-32.png"), png(fav, 32));
await Bun.write(join(OUT, "icon-192.png"), png(any, 192));
await Bun.write(join(OUT, "icon-512.png"), png(any, 512));
await Bun.write(join(OUT, "icon-maskable-512.png"), png(full, 512));
await Bun.write(join(OUT, "apple-touch-icon.png"), png(full, 180));
console.log(`Icone scritte in ${OUT}`);
