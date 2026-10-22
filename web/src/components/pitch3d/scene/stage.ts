// stage.ts — The 3D match stage
//
// Purpose: own the WebGL renderer, the stadium lighting, the camera, the 22 figures and the ball, and draw the
//          story director's picture (tide, shape lines, pass network, lane) on the grass every animation frame
// Inputs:  a canvas; per frame: the interpolated sample, the story and the match memory
// Outputs: createStage(): { setSetup, setView, update, project, resize, dispose }
// Spec:    web/specs/pitch.md
//
// Imperative on purpose: 60 frames a second of position updates never go through React.

import * as THREE from "three";
import type { MatchSetup } from "@/lib/contracts";
import { attacksEast, type Side } from "@/lib/coordinates";
import type { MatchMemory } from "@/lib/live/match-memory";
import type { MotionSample } from "@/lib/live/motion";
import { formationLines, territoryFront, type Story } from "@/lib/live/story";
import { createFigure, disposeFigureAssets, type Figure } from "./figure";
import { Discs, Hull, LaneBand, Ribbons, TerritoryTide, type Segment } from "./overlays";
import { createPitch, PITCH_H, PITCH_W } from "./pitch";

export type View = "broadcast" | "close" | "tactical";

/** Pitch frame (0–100) to world metres. */
export const toWorld = (x: number, y: number) => ({ x: x * 1.05 - PITCH_W / 2, z: y * 0.68 - PITCH_H / 2 });

const GK_KITS = ["#c6f432", "#ffb020", "#38e1ff", "#ff5cc8"];

/**
 * A team colour that reads on grass and on dark cards: the primary kit colour, lifted to a readable lightness and
 * saturation, so a deep purple becomes a bright violet rather than turning into the other kit colour. A colour too
 * close to the grass green, or a grey, falls back to the secondary, then to white.
 */
export function overlayColour(colours: { primary: string; secondary: string }): string {
  const lift = (hex: string): string | null => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const grassy = hsl.h > 0.22 && hsl.h < 0.42 && hsl.s > 0.25;
    if (grassy || hsl.s < 0.18) return null;
    c.setHSL(hsl.h, Math.max(hsl.s, 0.62), Math.min(0.68, Math.max(hsl.l, 0.56)));
    return `#${c.getHexString()}`;
  };
  return lift(colours.primary) ?? lift(colours.secondary) ?? "#ffffff";
}

export type StageUpdate = {
  sample: MotionSample | null;
  story: Story | null;
  memory: MatchMemory;
  /** Players to ring (followed player, the current card's player). */
  highlight: ReadonlySet<string>;
  /** Wall seconds since the last update, and since the stage started. */
  dt: number;
  time: number;
};

export type Stage = {
  setSetup(setup: MatchSetup | null): void;
  setView(view: View): void;
  update(u: StageUpdate): void;
  /** World point to CSS pixels in the canvas, or null when behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  resize(width: number, height: number): void;
  dispose(): void;
};

/** Camera elevation, degrees above the pitch, seen from the south touchline. */
const VIEWS: Record<Exclude<View, "close">, { elevation: number }> = {
  broadcast: { elevation: 56 },
  tactical: { elevation: 82 },
};
/** The close camera: a TV-style follow of the ball, this far behind and above it (metres). */
const CLOSE = { back: 30, up: 21, ahead: 2 };
const FOV = 30;
/** Metres kept visible beyond each touchline and goal line, plus room for the broadcast camera's drift. */
const MARGIN_X = 2.5;
const MARGIN_Z = 2.5;
const FOLLOW_MAX = 4;

/**
 * The camera placement at which the whole pitch (plus margins) fills the view: the distance by bisection, then the
 * target nudged so the near and far touchlines sit equally far from the top and bottom edges.
 */
function fitCamera(camera: THREE.PerspectiveCamera, elevationDeg: number): { distance: number; lookZ: number } {
  let lookZ = 0;
  let distance = 100;
  for (let pass = 0; pass < 4; pass++) {
    distance = fitDistance(camera, elevationDeg, lookZ);
    const e = (elevationDeg * Math.PI) / 180;
    const probe = camera.clone();
    probe.position.set(0, Math.sin(e) * distance, lookZ + Math.cos(e) * distance);
    probe.lookAt(0, 0, lookZ);
    probe.updateMatrixWorld();
    const far = new THREE.Vector3(0, 0, -(PITCH_H / 2 + MARGIN_Z)).project(probe).y;
    const near = new THREE.Vector3(0, 0, PITCH_H / 2 + MARGIN_Z).project(probe).y;
    // Positive when there is more room above the far touchline than below the near one
    const imbalance = (1 - far) - (near + 1);
    if (Math.abs(imbalance) < 0.01) break;
    lookZ += imbalance * distance * 0.12;
  }
  return { distance, lookZ };
}

function fitDistance(camera: THREE.PerspectiveCamera, elevationDeg: number, lookZ: number): number {
  const e = (elevationDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  const look = new THREE.Vector3(0, 0, lookZ);
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => new THREE.Vector3(sx * (PITCH_W / 2 + MARGIN_X + FOLLOW_MAX), 0, sz * (PITCH_H / 2 + MARGIN_Z))),
  );
  const probe = camera.clone();
  let lo = 20;
  let hi = 600;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    probe.position.copy(look).addScaledVector(dir, mid);
    probe.lookAt(look);
    probe.updateMatrixWorld();
    const fits = corners.every((c) => {
      const v = c.clone().project(probe);
      return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.95 && v.z < 1;
    });
    if (fits) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0c0d");
  scene.fog = new THREE.Fog("#0b0c0d", 120, 260);

  const camera = new THREE.PerspectiveCamera(FOV, 2, 1, 800);
  let view: View = "broadcast";
  /** Per view: the fitted camera position and target for the current aspect (set in resize). */
  const fitted: Record<Exclude<View, "close">, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
    broadcast: { pos: new THREE.Vector3(0, 80, 80), look: new THREE.Vector3() },
    tactical: { pos: new THREE.Vector3(0, 120, 20), look: new THREE.Vector3() },
  };
  const camPos = fitted.broadcast.pos.clone();
  const camLook = fitted.broadcast.look.clone();
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Floodlit night: cool sky fill, a warm key light with long soft shadows, and two rim lights
  scene.add(new THREE.HemisphereLight("#dbeaff", "#2a4a2a", 1.5));
  const key = new THREE.DirectionalLight("#fff4e0", 2.8);
  key.position.set(-40, 70, 35);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -75;
  sc.right = 75;
  sc.top = 55;
  sc.bottom = -55;
  sc.near = 10;
  sc.far = 200;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const rim1 = new THREE.DirectionalLight("#9fc4ff", 0.6);
  rim1.position.set(60, 40, -50);
  scene.add(rim1);
  const rim2 = new THREE.DirectionalLight("#ffd9b0", 0.35);
  rim2.position.set(-60, 30, -60);
  scene.add(rim2);

  const pitch = createPitch(renderer.capabilities.getMaxAnisotropy());
  scene.add(pitch.group);

  // Overlays, back to front
  const tide = new TerritoryTide();
  const hull = new Hull();
  const lane = new LaneBand();
  const lines = new Ribbons(40);
  const links = new Ribbons(60);
  const markers = new Ribbons(8, "#ffffff", 2);
  const nodes = new Discs(11);
  scene.add(tide.object, hull.object, lane.object, lines.object, links.object, markers.object, nodes.object);

  // Ball
  const ballTex = (() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f7f7f7";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#1a1a1a";
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.arc((i * 37) % 128, ((i * 23) % 64) + 4, 7, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }));
  ball.castShadow = true;
  scene.add(ball);
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.035;
  scene.add(ballShadow);
  let ballSpin = 0;

  let sized = false;
  let setup: MatchSetup | null = null;
  const figures = new Map<string, { figure: Figure; side: Side; last: { x: number; z: number } | null }>();

  function clearFigures() {
    figures.forEach(({ figure }) => {
      scene.remove(figure.root);
      figure.dispose();
    });
    figures.clear();
  }

  function setSetup(next: MatchSetup | null) {
    if (next?.match_id === setup?.match_id) return;
    setup = next;
    clearFigures();
    if (!setup) return;
    let seed = 0;
    let gk = 0;
    const used = [setup.teams.home.colours.primary, setup.teams.away.colours.primary];
    for (const side of ["home", "away"] as const) {
      const team = setup.teams[side];
      const gkColour = GK_KITS.find((c, i) => i >= gk && !used.includes(c)) ?? GK_KITS[gk];
      gk++;
      for (const p of [...team.lineup, ...team.bench]) {
        const isGk = p.pos === "GK";
        const figure = createFigure(
          {
            shirt: isGk ? gkColour : team.colours.primary,
            shorts: isGk ? "#1a1a1a" : team.colours.secondary,
            socks: isGk ? gkColour : team.colours.primary,
            number: String(p.shirt),
            ring: overlayColour(team.colours),
          },
          seed++,
        );
        figure.root.visible = false;
        scene.add(figure.root);
        figures.set(p.player_id, { figure, side, last: null });
      }
    }
  }

  const colourOf = (side: Side) => (setup ? overlayColour(setup.teams[side].colours) : side === "home" ? "#2bb3c0" : "#ff4f38");

  function drawStory(u: StageUpdate, sample: MotionSample) {
    const story = u.story;
    const kind = story?.kind ?? "territory";
    const pos = (id: string) => {
      const p = sample.players.get(id);
      return p ? toWorld(p.x, p.y) : null;
    };

    // Territory tide: always there, strongest when it is the story
    const front = territoryFront(u.memory.balls(), sample.matchMs, sample.period);
    const homeEast = attacksEast("home", sample.period) ?? true;
    const westSide: Side = homeEast ? "home" : "away"; // the team defending the west goal attacks east
    tide.set(toWorld(front.frontX, 50).x, colourOf(westSide), colourOf(westSide === "home" ? "away" : "home"), u.time, kind === "territory" ? 0.5 : 0.16);

    const lineSegs: Segment[] = [];
    const linkSegs: Segment[] = [];
    const markerSegs: Segment[] = [];
    const nodePts: { x: number; z: number; r: number }[] = [];
    let hullPts: { x: number; z: number }[] = [];
    let laneOn = false;

    if (kind === "protect" && story?.side) {
      const side = story.side;
      const rows = formationLines(setup, side, sample, u.memory);
      // Links inside each line, then each player to the nearest teammate in the next line up
      rows.forEach((row, r) => {
        for (let i = 0; i + 1 < row.length; i++) {
          const a = pos(row[i]);
          const b = pos(row[i + 1]);
          if (a && b) lineSegs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, width: 0.38 });
        }
        const next = rows[r + 1];
        if (!next) return;
        for (const id of row) {
          const a = pos(id);
          if (!a) continue;
          let best: { x: number; z: number } | null = null;
          let bestD = Infinity;
          for (const nid of next) {
            const b = pos(nid);
            if (!b) continue;
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (d < bestD) {
              bestD = d;
              best = b;
            }
          }
          if (best) lineSegs.push({ ax: a.x, az: a.z, bx: best.x, bz: best.z, width: 0.2 });
        }
      });
      hullPts = rows.flat().map(pos).filter((p): p is { x: number; z: number } => p !== null);
      // The defensive line now (solid) and before the goal (thin), across the pitch
      const east = attacksEast(side, sample.period) ?? side === "home";
      const lineX = (m: number) => (east ? m : PITCH_W - m) - PITCH_W / 2;
      if (story.lineNow !== undefined) {
        const x = lineX(story.lineNow);
        markerSegs.push({ ax: x, az: -PITCH_H / 2, bx: x, bz: PITCH_H / 2, width: 0.3 });
      }
      if (story.lineBefore !== undefined) {
        const x = lineX(story.lineBefore);
        for (let z = -PITCH_H / 2; z < PITCH_H / 2; z += 4) markerSegs.push({ ax: x, az: z, bx: x, bz: z + 2, width: 0.18 });
      }
    }

    if (kind === "attack" && story?.side) {
      const side = story.side;
      const heavy = u.memory.heavyPanel()?.heavy;
      const net = heavy?.pass_network[side];
      if (net) {
        const max = Math.max(1, ...net.links.map((l) => l.count));
        for (const link of [...net.links].sort((a, b) => b.count - a.count).slice(0, 40)) {
          const a = pos(link.from);
          const b = pos(link.to);
          if (a && b) linkSegs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, width: 0.12 + (link.count / max) * 0.55 });
        }
        const maxPasses = Math.max(1, ...net.nodes.map((n) => n.passes));
        for (const n of net.nodes) {
          const p = pos(n.player_id);
          if (p) nodePts.push({ ...p, r: 0.9 + (n.passes / maxPasses) * 1.4 });
        }
      }
      if (story.channel) {
        const east = attacksEast(side, sample.period) ?? side === "home";
        // Team-frame lane (left = small y facing the opponent) to pitch frame, then world
        const teamY = story.channel === "left" ? 16.7 : story.channel === "right" ? 83.3 : 50;
        const pitchY = east ? teamY : 100 - teamY;
        const z = toWorld(0, pitchY).z;
        const x0 = toWorld(east ? 52 : 48, 0).x;
        const x1 = toWorld(east ? 100 : 0, 0).x;
        lane.set(x0, x1, z, PITCH_H / 3 - 2, colourOf(side), u.time, 0.9);
        laneOn = true;
      }
    }

    if (!laneOn) lane.set(0, 1, 0, 1, "#ffffff", u.time, 0);
    const teamColour = story?.side ? colourOf(story.side) : "#ffffff";
    lines.set(lineSegs, teamColour, lineSegs.length ? 0.92 : 0);
    links.set(linkSegs, teamColour, linkSegs.length ? 0.85 : 0);
    markers.set(markerSegs, "#ffffff", markerSegs.length ? 0.85 : 0);
    nodes.set(nodePts, teamColour, nodePts.length ? 0.9 : 0);
    hull.set(hullPts, teamColour, hullPts.length >= 3 ? 0.13 : 0);
  }

  return {
    setSetup,

    setView(next) {
      view = next;
    },

    update(u) {
      const sample = u.sample;
      // Camera: ease to the chosen view; the broadcast camera drifts with the ball like a real one
      if (view === "close") {
        // Follow the ball, kept inside the pitch so the camera never swings out over the stands
        const b = sample ? toWorld(sample.ball.x, sample.ball.y) : { x: 0, z: 0 };
        const lx = Math.max(-PITCH_W / 2 + 12, Math.min(PITCH_W / 2 - 12, b.x));
        const lz = Math.max(-PITCH_H / 2 + 6, Math.min(PITCH_H / 2 - 6, b.z)) + CLOSE.ahead;
        camPos.lerp(new THREE.Vector3(lx, CLOSE.up, lz + CLOSE.back), Math.min(1, u.dt * 1.2));
        camLook.lerp(new THREE.Vector3(lx, 0, lz), Math.min(1, u.dt * 1.8));
      } else {
        const v = fitted[view];
        const follow =
          view === "broadcast" && sample ? Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, toWorld(sample.ball.x, sample.ball.y).x * 0.14)) : 0;
        camPos.lerp(new THREE.Vector3(v.pos.x + follow, v.pos.y, v.pos.z), Math.min(1, u.dt * 1.4));
        camLook.lerp(new THREE.Vector3(v.look.x + follow, v.look.y, v.look.z), Math.min(1, u.dt * 1.4));
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      if (sample) {
        const b = toWorld(sample.ball.x, sample.ball.y);
        const h = Math.max(0, sample.ball.z) + 0.3;
        ball.position.set(b.x, h, b.z);
        ballSpin += (sample.ball.speedKmh / 3.6) * u.dt * Math.max(0.2, Math.min(sample.rate, 3)) * 1.8;
        ball.rotation.set(ballSpin, ballSpin * 0.3, 0);
        ballShadow.position.set(b.x, 0.035, b.z);
        ballShadow.scale.setScalar(1 / (1 + sample.ball.z * 0.3));
        ball.visible = ballShadow.visible = true;

        for (const [id, entry] of figures) {
          const p = sample.players.get(id);
          if (!p) {
            entry.figure.root.visible = false;
            entry.last = null;
            continue;
          }
          const w = toWorld(p.x, p.y);
          let fx = b.x - w.x;
          let fz = b.z - w.z;
          if (entry.last) {
            const mx = w.x - entry.last.x;
            const mz = w.z - entry.last.z;
            if (Math.hypot(mx, mz) > 0.02) {
              fx = mx;
              fz = mz;
            }
          }
          entry.last = w;
          entry.figure.root.visible = true;
          entry.figure.update(w.x, w.z, p.speedKmh / 3.6, fx, fz, u.dt, sample.rate);
          entry.figure.setHighlight(u.highlight.has(id), "#ff4f38");
        }
        drawStory(u, sample);
      } else {
        ball.visible = ballShadow.visible = false;
        figures.forEach((e) => (e.figure.root.visible = false));
        tide.set(0, "#2bb3c0", "#ff4f38", u.time, 0);
      }
      renderer.render(scene, camera);
    },

    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z > 1) return null;
      const el = renderer.domElement;
      return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
    },

    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      // Narrow screens get a wider lens before the camera has to back away
      camera.fov = camera.aspect < 1.3 ? Math.min(48, FOV * (1.3 / camera.aspect) ** 0.6) : FOV;
      camera.updateProjectionMatrix();
      for (const v of ["broadcast", "tactical"] as const) {
        const { elevation } = VIEWS[v];
        const e = (elevation * Math.PI) / 180;
        const { distance: d, lookZ } = fitCamera(camera, elevation);
        fitted[v].look.set(0, 0, lookZ);
        fitted[v].pos.set(0, Math.sin(e) * d, lookZ + Math.cos(e) * d);
      }
      if (!sized) {
        camPos.copy(fitted.broadcast.pos);
        camLook.copy(fitted.broadcast.look);
        sized = true;
      }
    },

    dispose() {
      clearFigures();
      disposeFigureAssets();
      pitch.dispose();
      [tide, hull, lane, lines, links, markers, nodes].forEach((o) => o.dispose());
      ball.geometry.dispose();
      (ball.material as THREE.Material).dispose();
      ballTex.dispose();
      ballShadow.geometry.dispose();
      (ballShadow.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
