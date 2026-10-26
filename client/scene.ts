import * as THREE from "three";
import { BALL, FIELD, PLAYER, type Team } from "../shared/game.ts";
import type { RenderPlayer, RenderState } from "./net.ts";

// Coordinate di gioco (x, y) -> mondo 3D (x, altezza, z = y). Stessa scala.

export const TEAM_COLORS: Record<Team, number> = { red: 0xe5484d, blue: 0x3e7bfa };

const HW = FIELD.w / 2;
const HH = FIELD.h / 2;
const GW = FIELD.goalW / 2;
const GOAL_H = 46;
const CAMERA_TILT = THREE.MathUtils.degToRad(56);

interface PlayerView {
  group: THREE.Group;
  kickRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  team: Team;
  name: string;
  away: boolean;
}

interface Effect {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  life: number;
}

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 10, 6000);
  private ball: THREE.Mesh;
  private ballPrev: { x: number; y: number } | null = null;
  private players = new Map<string, PlayerView>();
  private meMarker: THREE.Mesh;
  private effects: Effect[] = [];
  private shake = 0;
  private cameraBase = new THREE.Vector3();
  private lookTarget = new THREE.Vector3(0, 0, 25);
  private cameraX = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0a1410);
    this.scene.fog = new THREE.Fog(0x0a1410, 1800, 3800);

    this.addLights();
    this.addPitch();
    this.addBoards();
    this.addGoal(-1);
    this.addGoal(1);

    this.ball = makeBall();
    this.scene.add(this.ball);

    this.meMarker = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER.r + 5, PLAYER.r + 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }),
    );
    this.meMarker.rotation.x = -Math.PI / 2;
    this.meMarker.position.y = 0.6;
    this.meMarker.visible = false;
    this.scene.add(this.meMarker);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x203018, 1.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(-450, 1100, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -HW - 150;
    s.right = HW + 150;
    s.top = HH + 250;
    s.bottom = -HH - 250;
    s.near = 100;
    s.far = 2600;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(sun);
  }

  private addPitch() {
    const w = FIELD.w + FIELD.margin * 2;
    const h = FIELD.h + FIELD.margin * 2;
    const tex = new THREE.CanvasTexture(drawPitch());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x14231b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Cartelloni a bordo campo con striscia luminosa. */
  private addBoards() {
    const ox = HW + FIELD.margin + 6;
    const oz = HH + FIELD.margin + 6;
    const body = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.6 });
    const led = new THREE.MeshStandardMaterial({ color: 0x0, emissive: 0x39d98a, emissiveIntensity: 1.4 });
    const add = (x: number, z: number, len: number, alongX: boolean) => {
      const geo = alongX ? new THREE.BoxGeometry(len, 16, 8) : new THREE.BoxGeometry(8, 16, len);
      const m = new THREE.Mesh(geo, body);
      m.position.set(x, 8, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      const stripGeo = alongX ? new THREE.BoxGeometry(len, 3, 8.4) : new THREE.BoxGeometry(8.4, 3, len);
      const strip = new THREE.Mesh(stripGeo, led);
      strip.position.set(x, 13, z);
      this.scene.add(strip);
    };
    add(0, -oz, ox * 2 + 8, true);
    add(0, oz, ox * 2 + 8, true);
    add(-ox, 0, oz * 2, false);
    add(ox, 0, oz * 2, false);
  }

  private addGoal(side: -1 | 1) {
    const x0 = side * HW;
    const x1 = side * (HW + FIELD.goalDepth);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, metalness: 0.2 });
    const r = FIELD.postR * 0.6;

    const bar = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
      const len = from.distanceTo(to);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 16), postMat);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      m.castShadow = true;
      this.scene.add(m);
    };
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    bar(v(x0, 0, -GW), v(x0, GOAL_H, -GW), r);
    bar(v(x0, 0, GW), v(x0, GOAL_H, GW), r);
    bar(v(x0, GOAL_H, -GW), v(x0, GOAL_H, GW), r);
    // Telaio posteriore più sottile.
    for (const z of [-GW, GW]) {
      bar(v(x0, GOAL_H, z), v(x1, GOAL_H * 0.7, z), 1.2);
      bar(v(x1, 0, z), v(x1, GOAL_H * 0.7, z), 1.2);
    }
    bar(v(x1, GOAL_H * 0.7, -GW), v(x1, GOAL_H * 0.7, GW), 1.2);

    // Rete: griglie di linee su retro, lati e tetto.
    const pts: number[] = [];
    const grid = (o: THREE.Vector3, u: THREE.Vector3, w: THREE.Vector3, nu: number, nw: number) => {
      for (let i = 0; i <= nu; i++) {
        const a = o.clone().addScaledVector(u, i / nu);
        const b = a.clone().add(w);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      for (let j = 0; j <= nw; j++) {
        const a = o.clone().addScaledVector(w, j / nw);
        const b = a.clone().add(u);
        pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    };
    const backH = GOAL_H * 0.7;
    grid(v(x1, 0, -GW), v(0, 0, GW * 2), v(0, backH, 0), 24, 4);
    for (const z of [-GW, GW]) {
      // Lato trapezoidale approssimato con griglia verticale + diagonale in alto.
      grid(v(x0, 0, z), v(x1 - x0, 0, 0), v(0, backH, 0), 6, 4);
    }
    grid(v(x0, GOAL_H, -GW), v(0, 0, GW * 2), v(x1 - x0, backH - GOAL_H, 0), 24, 5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const net = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
    );
    this.scene.add(net);
  }

  private resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Cerca la distanza minima a cui gli angoli del campo (cartelloni compresi,
    // più il margine per il pan laterale) restano dentro lo schermo.
    const ox = FIELD.w / 2 + FIELD.margin + 90;
    const oz = FIELD.h / 2 + FIELD.margin + 12;
    const corners = [-ox, ox].flatMap((x) => [-oz, oz].map((z) => new THREE.Vector3(x, 16, z)));
    const p = new THREE.Vector3();
    const fits = (dist: number) => {
      this.placeCamera(dist);
      return corners.every((c) => {
        p.copy(c).project(this.camera);
        return Math.abs(p.x) <= 0.97 && p.y <= 0.8 && p.y >= -0.86;
      });
    };
    let lo = 200;
    let hi = 8000;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.placeCamera(hi);
    this.cameraBase.copy(this.camera.position);
  }

  private placeCamera(dist: number) {
    this.camera.position.set(0, dist * Math.sin(CAMERA_TILT), dist * Math.cos(CAMERA_TILT) + this.lookTarget.z);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
  }

  update(state: RenderState, meId: string | null, dt: number) {
    this.updateBall(state.ball);
    this.updatePlayers(state.players, meId);
    this.updateEffects(dt);
    this.updateCamera(state.ball.x, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateBall(b: { x: number; y: number }) {
    this.ball.position.set(b.x, BALL.r, b.y);
    if (this.ballPrev) {
      const dx = b.x - this.ballPrev.x;
      const dz = b.y - this.ballPrev.y;
      const dist = Math.hypot(dx, dz);
      // Rotolamento senza strisciare: asse = su × direzione, angolo = distanza / raggio.
      if (dist > 0.001 && dist < 80) {
        const axis = new THREE.Vector3(dz / dist, 0, -dx / dist);
        this.ball.rotateOnWorldAxis(axis, dist / BALL.r);
      }
    }
    this.ballPrev = { x: b.x, y: b.y };
  }

  private updatePlayers(list: RenderPlayer[], meId: string | null) {
    const seen = new Set<string>();
    this.meMarker.visible = false;
    for (const p of list) {
      seen.add(p.id);
      let view = this.players.get(p.id);
      if (!view || view.team !== p.team || view.name !== p.name || view.away !== p.away) {
        if (view) removeObject(this.scene, view.group);
        view = makePlayer(p.team, p.name, p.away);
        this.players.set(p.id, view);
        this.scene.add(view.group);
      }
      view.group.position.set(p.x, 0, p.y);
      const mat = view.kickRing.material;
      mat.emissiveIntensity = p.k ? 2.2 : 0.15;
      view.kickRing.scale.setScalar(p.k ? 1.08 : 1);
      if (p.id === meId) {
        this.meMarker.visible = true;
        this.meMarker.position.x = p.x;
        this.meMarker.position.z = p.y;
        (this.meMarker.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(performance.now() / 180) * 0.3;
      }
    }
    for (const [id, view] of this.players) {
      if (!seen.has(id)) {
        removeObject(this.scene, view.group);
        this.players.delete(id);
      }
    }
  }

  kickEffect(x: number, y: number, team: Team | undefined) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({ color: team ? TEAM_COLORS[team] : 0xffffff, transparent: true }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.8, y);
    this.scene.add(mesh);
    this.effects.push({ mesh, age: 0, life: 0.35 });
  }

  goalEffect() {
    this.shake = 1;
  }

  private updateEffects(dt: number) {
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        return false;
      }
      e.mesh.scale.setScalar(BALL.r + t * 40);
      e.mesh.material.opacity = 1 - t;
      return true;
    });
  }

  private updateCamera(ballX: number, dt: number) {
    // Leggero inseguimento laterale della palla per dare vita all'inquadratura.
    this.cameraX += (ballX * 0.12 - this.cameraX) * Math.min(1, dt * 3);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const s = this.shake * this.shake * 14;
    this.camera.position.set(
      this.cameraBase.x + this.cameraX + (Math.random() - 0.5) * s,
      this.cameraBase.y + (Math.random() - 0.5) * s,
      this.cameraBase.z,
    );
    this.camera.lookAt(this.lookTarget.x + this.cameraX, 0, this.lookTarget.z);
  }
}

function removeObject(scene: THREE.Scene, obj: THREE.Object3D) {
  scene.remove(obj);
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      o.geometry.dispose();
      const mat = o.material as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

/** away = disconnesso in attesa di riconnessione: disco semitrasparente. */
function makePlayer(team: Team, name: string, away: boolean): PlayerView {
  const group = new THREE.Group();
  const color = new THREE.Color(TEAM_COLORS[team]);
  const height = 12;
  const fade = away ? { transparent: true, opacity: 0.35 } : {};

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAYER.r, PLAYER.r, height, 48),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, ...fade }),
  );
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);

  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(PLAYER.r * 0.68, 48),
    new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.35), roughness: 0.4, ...fade }),
  );
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = height + 0.05;
  group.add(cap);

  const kickRing = new THREE.Mesh(
    new THREE.TorusGeometry(PLAYER.r + 1.2, 1.5, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 }),
  );
  kickRing.rotation.x = Math.PI / 2;
  kickRing.position.y = height;
  group.add(kickRing);

  kickRing.visible = !away;

  const label = makeLabel(away ? `${name} (offline)` : name);
  label.position.y = 52;
  group.add(label);

  return { group, kickRing, team, name, away };
}

function makeLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.font = "700 34px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, 128, 32);
  g.fillStyle = "#fff";
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(110, 27.5, 1);
  return sprite;
}

/** Pallone classico: 12 pentagoni neri sui vertici di un icosaedro, via vertex color. */
function makeBall() {
  const geo = new THREE.IcosahedronGeometry(BALL.r, 24);
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs: THREE.Vector3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      dirs.push(new THREE.Vector3(0, a, b * phi), new THREE.Vector3(a, b * phi, 0), new THREE.Vector3(b * phi, 0, a));
    }
  }
  dirs.forEach((d) => d.normalize());

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let best = -1;
    for (const d of dirs) best = Math.max(best, v.dot(d));
    const c = best > 0.94 ? 0.06 : best > 0.93 ? 0.4 : 0.96;
    colors.set([c, c, c], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ball = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
  ball.castShadow = true;
  return ball;
}

/** Texture del campo: strisce d'erba e linee bianche. */
function drawPitch() {
  const S = 2; // pixel per unità
  const w = FIELD.w + FIELD.margin * 2;
  const h = FIELD.h + FIELD.margin * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * S;
  canvas.height = h * S;
  const g = canvas.getContext("2d")!;
  g.scale(S, S);
  g.translate(w / 2, h / 2); // origine al centro del campo, come nel gioco

  g.fillStyle = "#2f7d3a";
  g.fillRect(-w / 2, -h / 2, w, h);
  const stripes = 14;
  const sw = FIELD.w / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2) continue;
    g.fillStyle = "#38894a";
    g.fillRect(-HW + i * sw, -h / 2, sw, h);
  }
  // Leggero rumore per non sembrare piatto.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
    g.fillRect((Math.random() - 0.5) * w, (Math.random() - 0.5) * h, 2, 2);
  }

  g.strokeStyle = "rgba(255,255,255,0.88)";
  g.fillStyle = "rgba(255,255,255,0.88)";
  g.lineWidth = 3;
  g.strokeRect(-HW, -HH, FIELD.w, FIELD.h);
  g.beginPath();
  g.moveTo(0, -HH);
  g.lineTo(0, HH);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 90, 0, Math.PI * 2);
  g.stroke();
  dot(g, 0, 0, 4);

  for (const s of [-1, 1]) {
    const line = s * HW;
    g.strokeRect(Math.min(line, line - s * 170), -200, 170, 400);
    g.strokeRect(Math.min(line, line - s * 60), -110, 60, 220);
    dot(g, line - s * 125, 0, 3);
    g.beginPath();
    // Lunetta: la parte del cerchio dal dischetto che esce dall'area.
    const a = Math.acos(45 / 90);
    const mid = s < 0 ? 0 : Math.PI;
    g.arc(line - s * 125, 0, 90, mid - a, mid + a);
    g.stroke();
    // Interno porta un po' più scuro.
    g.fillStyle = "rgba(0,0,0,0.15)";
    g.fillRect(Math.min(line, line + s * FIELD.goalDepth), -GW, FIELD.goalDepth, FIELD.goalW);
    g.fillStyle = "rgba(255,255,255,0.88)";
  }
  for (const [cx, cy, start] of [
    [-HW, -HH, 0],
    [HW, -HH, Math.PI / 2],
    [HW, HH, Math.PI],
    [-HW, HH, -Math.PI / 2],
  ] as const) {
    g.beginPath();
    g.arc(cx, cy, 14, start, start + Math.PI / 2);
    g.stroke();
  }
  return canvas;
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
