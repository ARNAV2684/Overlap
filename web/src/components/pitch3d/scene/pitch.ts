// pitch.ts — The grass, the markings and the stadium around them
//
// Purpose: build the pitch surface: mown grass with stripes and blade-level noise, crisp white markings, a darker
//          apron, advertising boards and the stadium floor, all generated in code (no image files)
// Inputs:  THREE, the renderer's max anisotropy
// Outputs: createPitch(): { group, dispose }
// Spec:    web/specs/pitch.md §1
//
// World axes: X east (pitch x), Z south (pitch y), Y up. The pitch is centred on the origin, 105 × 68 m.

import * as THREE from "three";

export const PITCH_W = 105;
export const PITCH_H = 68;
/** Grass beyond the touchlines, metres. */
export const APRON = 7;
/** Texture pixels per metre. */
const PPM = 24;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grass colour and a matching bump map: mowing stripes, clumps and fine blade noise. */
function grassCanvases(widthM: number, heightM: number) {
  const w = Math.round(widthM * PPM);
  const h = Math.round(heightM * PPM);
  const colour = document.createElement("canvas");
  const bump = document.createElement("canvas");
  colour.width = bump.width = w;
  colour.height = bump.height = h;
  const c = colour.getContext("2d")!;
  const b = bump.getContext("2d")!;
  const rand = mulberry32(7);

  // Base and mowing stripes: 20 bands across the length, alternating light and dark, as a groundsman cuts them
  const stripes = 20;
  const pitchLeft = APRON * PPM;
  const stripeW = (PITCH_W * PPM) / stripes;
  c.fillStyle = "#2f7a33";
  c.fillRect(0, 0, w, h);
  for (let i = -2; i < stripes + 2; i++) {
    c.fillStyle = i % 2 === 0 ? "#3a8a3c" : "#2c7531";
    c.fillRect(pitchLeft + i * stripeW, 0, stripeW + 1, h);
  }
  // Soft clumps of lighter and darker grass so no two metres look alike
  for (let i = 0; i < 2600; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 6 + rand() * 40;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.5;
    g.addColorStop(0, light ? "rgba(120,190,90,0.10)" : "rgba(10,50,15,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Blade noise, per pixel, in colour and in the bump map
  const img = c.getImageData(0, 0, w, h);
  const bimg = b.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rand();
    const blade = (n - 0.5) * 24;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + blade * 0.55));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + blade));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + blade * 0.35));
    const v = 128 + (n - 0.5) * 200;
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v;
    bimg.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  b.putImageData(bimg, 0, 0);
  // Worn goalmouth turf, soft and irregular rather than a painted brown rectangle.
  for (const end of [0, 1]) {
    const gx = (APRON + end * PITCH_W) * PPM;
    const gy = (APRON + PITCH_H / 2) * PPM;
    c.save(); c.translate(gx, gy); c.scale(0.75, 1.4);
    const wear = c.createRadialGradient(0, 0, 0, 0, 0, 4 * PPM);
    wear.addColorStop(0, "rgba(147,122,71,0.25)"); wear.addColorStop(0.5, "rgba(127,115,65,0.12)"); wear.addColorStop(1, "rgba(127,115,65,0)");
    c.fillStyle = wear; c.fillRect(-4 * PPM, -4 * PPM, 8 * PPM, 8 * PPM); c.restore();
  }
  // A gentle vignette towards the corners, where floodlights reach less
  const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.28)");
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
  return { colour, bump };
}

/** The markings, drawn in metres onto a transparent canvas the size of the grass texture. */
function markingsCanvas(widthM: number, heightM: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthM * PPM);
  canvas.height = Math.round(heightM * PPM);
  const g = canvas.getContext("2d")!;
  g.scale(PPM, PPM);
  g.translate(APRON, APRON);
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 0.13;
  g.lineJoin = "round";
  const L = PITCH_W;
  const W = PITCH_H;
  g.strokeRect(0, 0, L, W);
  g.beginPath();
  g.moveTo(L / 2, 0);
  g.lineTo(L / 2, W);
  g.stroke();
  g.beginPath();
  g.arc(L / 2, W / 2, 9.15, 0, Math.PI * 2);
  g.stroke();
  const spot = (x: number, y: number, r = 0.22) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  spot(L / 2, W / 2, 0.3);
  for (const end of [0, 1] as const) {
    const x0 = end === 0 ? 0 : L;
    const dir = end === 0 ? 1 : -1;
    // Penalty area, goal area, spot and arc
    g.strokeRect(end === 0 ? 0 : L - 16.5, W / 2 - 20.16, 16.5, 40.32);
    g.strokeRect(end === 0 ? 0 : L - 5.5, W / 2 - 9.16, 5.5, 18.32);
    spot(x0 + dir * 11, W / 2);
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (end === 0) g.arc(11, W / 2, 9.15, -a, a);
    else g.arc(L - 11, W / 2, 9.15, Math.PI - a, Math.PI + a);
    g.stroke();
  }
  // Corner arcs
  for (const [cx, cy, s] of [
    [0, 0, 0],
    [L, 0, Math.PI / 2],
    [L, W, Math.PI],
    [0, W, (3 * Math.PI) / 2],
  ] as const) {
    g.beginPath();
    g.arc(cx, cy, 1, s, s + Math.PI / 2);
    g.stroke();
  }
  return canvas;
}

/** A goal's net: the cords (one draw call) and a faint fill, in a group whose origin is on the goal line. */
export type NetHandle = { object: THREE.Group; cords: THREE.LineBasicMaterial; fill: THREE.MeshStandardMaterial };

/** Goal depth at the ground and at the crossbar (the net slopes from the top-back bar down to the ground bar). */
const NET_DEPTH = 2.0;
const NET_TOP_DEPTH = 1.0;
const GOAL_H = 2.44;
const GOAL_HALF_W = 3.66;
const POST_R = 0.06;

/**
 * Net cords as line segments: the roof and back as one sagging surface along the goal's profile, and the two sides
 * clipped to it. `dir` is +1 for the east goal (the net runs east of the goal line), -1 for the west.
 */
function netCords(dir: number): THREE.BufferGeometry {
  const pts: number[] = [];
  // The profile from the crossbar back over the roof and down to the ground bar, by arc length t in 0..1
  const roof = NET_TOP_DEPTH;
  const slope = Math.hypot(NET_DEPTH - NET_TOP_DEPTH, GOAL_H);
  const total = roof + slope;
  const profile = (t: number) => {
    const d = t * total;
    if (d <= roof) return { x: d, y: GOAL_H };
    const k = (d - roof) / slope;
    return { x: roof + k * (NET_DEPTH - NET_TOP_DEPTH), y: GOAL_H * (1 - k) };
  };
  // Sag: the middle of the net hangs back and down a little
  const point = (u: number, t: number) => {
    const pr = profile(t);
    const sag = Math.sin(Math.PI * u) * Math.sin(Math.PI * t) * 0.16;
    return [dir * (pr.x + sag * 0.6), pr.y - sag, -GOAL_HALF_W + u * 2 * GOAL_HALF_W];
  };
  const U = 26;
  const T = 16;
  for (let i = 0; i <= U; i++) {
    for (let j = 0; j < T; j++) pts.push(...point(i / U, j / T), ...point(i / U, (j + 1) / T));
  }
  for (let j = 0; j <= T; j++) {
    for (let i = 0; i < U; i++) pts.push(...point(i / U, j / T), ...point((i + 1) / U, j / T));
  }
  // Sides: vertical and horizontal cords inside the profile, at each post
  const backAt = (y: number) => (y >= GOAL_H ? NET_TOP_DEPTH : NET_TOP_DEPTH + (1 - y / GOAL_H) * (NET_DEPTH - NET_TOP_DEPTH));
  for (const z of [-GOAL_HALF_W, GOAL_HALF_W]) {
    for (let x = 0.2; x < NET_DEPTH; x += 0.2) {
      // The cord runs from the ground up to where the back slope (or the roof) meets it
      const top = x <= NET_TOP_DEPTH ? GOAL_H : GOAL_H * (1 - (x - NET_TOP_DEPTH) / (NET_DEPTH - NET_TOP_DEPTH));
      pts.push(dir * x, 0, z, dir * x, top, z);
    }
    for (let y = 0.2; y < GOAL_H; y += 0.2) pts.push(0, y, z, dir * backAt(y), y, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

/** A tube between two points, for the goal frame's bars. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  return mesh;
}

function goal(postMat: THREE.Material, frameMat: THREE.Material, east: boolean) {
  const group = new THREE.Group();
  const dir = east ? 1 : -1;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(dir * x, y, z);
  // Posts and crossbar (12 cm, white), with rounded corners where they meet
  for (const z of [-GOAL_HALF_W, GOAL_HALF_W]) {
    group.add(bar(v(0, 0, z), v(0, GOAL_H, z), POST_R, postMat));
    const joint = new THREE.Mesh(new THREE.SphereGeometry(POST_R, 16, 12), postMat);
    joint.position.copy(v(0, GOAL_H, z));
    group.add(joint);
  }
  group.add(bar(v(0, GOAL_H, -GOAL_HALF_W), v(0, GOAL_H, GOAL_HALF_W), POST_R, postMat));
  // The frame behind: top-back stanchions, the slope down to the ground bar, and the ground bars (thinner, grey)
  for (const z of [-GOAL_HALF_W, GOAL_HALF_W]) {
    group.add(bar(v(0, GOAL_H, z), v(NET_TOP_DEPTH, GOAL_H, z), 0.025, frameMat));
    group.add(bar(v(NET_TOP_DEPTH, GOAL_H, z), v(NET_DEPTH, 0.02, z), 0.025, frameMat));
    group.add(bar(v(0, 0.02, z), v(NET_DEPTH, 0.02, z), 0.02, frameMat));
  }
  group.add(bar(v(NET_TOP_DEPTH, GOAL_H, -GOAL_HALF_W), v(NET_TOP_DEPTH, GOAL_H, GOAL_HALF_W), 0.025, frameMat));
  group.add(bar(v(NET_DEPTH, 0.02, -GOAL_HALF_W), v(NET_DEPTH, 0.02, GOAL_HALF_W), 0.02, frameMat));

  // The net: cords plus a faint fill, in one group that a goal can push back (its origin is on the goal line)
  const net = new THREE.Group();
  const cords = new THREE.LineBasicMaterial({ color: 0xe6eef2, transparent: true, opacity: 0.5, depthWrite: false });
  net.add(new THREE.LineSegments(netCords(dir), cords));
  const fill = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.04,
    roughness: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(NET_DEPTH, GOAL_H, GOAL_HALF_W * 2), fill);
  box.position.set((dir * NET_DEPTH) / 2, GOAL_H / 2, 0);
  net.add(box);
  group.add(net);
  group.position.set(east ? PITCH_W / 2 : -PITCH_W / 2, 0, 0);
  return { group, net: { object: net, cords, fill } satisfies NetHandle };
}

export function createPitch(maxAnisotropy: number) {
  const group = new THREE.Group();
  const widthM = PITCH_W + APRON * 2;
  const heightM = PITCH_H + APRON * 2;
  const { colour, bump } = grassCanvases(widthM, heightM);

  const colourTex = new THREE.CanvasTexture(colour);
  colourTex.colorSpace = THREE.SRGBColorSpace;
  colourTex.anisotropy = maxAnisotropy;
  const bumpTex = new THREE.CanvasTexture(bump);
  bumpTex.anisotropy = maxAnisotropy;
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(widthM, heightM),
    new THREE.MeshStandardMaterial({ map: colourTex, bumpMap: bumpTex, bumpScale: 0.4, roughness: 0.92, metalness: 0 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);

  const linesTex = new THREE.CanvasTexture(markingsCanvas(widthM, heightM));
  linesTex.colorSpace = THREE.SRGBColorSpace;
  linesTex.anisotropy = maxAnisotropy;
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(widthM, heightM),
    new THREE.MeshStandardMaterial({ map: linesTex, transparent: true, roughness: 0.8, depthWrite: false }),
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.012;
  lines.receiveShadow = true;
  group.add(lines);

  // Stadium floor beyond the apron, and advertising boards along the touchlines
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  group.add(floor);

  const boardMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd8b46a });
  const boards: [number, number, number, number][] = [
    [0, -(PITCH_H / 2 + APRON - 1.2), PITCH_W + 8, 0],
    [0, PITCH_H / 2 + APRON - 1.2, PITCH_W + 8, 0],
    [-(PITCH_W / 2 + APRON - 1.2), 0, PITCH_H + 8, Math.PI / 2],
    [PITCH_W / 2 + APRON - 1.2, 0, PITCH_H + 8, Math.PI / 2],
  ];
  for (const [x, z, len, rot] of boards) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.15), boardMat);
    board.position.set(x, 0.45, z);
    board.rotation.y = rot;
    board.castShadow = true;
    group.add(board);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.16), glowMat);
    strip.position.set(x, 0.86, z);
    strip.rotation.y = rot;
    group.add(strip);
  }

  // Floodlight masts at the four corners, outside the pitch: slim steel and softly glowing lamp heads (the stage
  // supplies the actual light)
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4652, metalness: 0.6, roughness: 0.45 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.85 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (PITCH_W / 2 + APRON + 5);
      const z = sz * (PITCH_H / 2 + APRON + 5);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 26, 8), steel);
      mast.position.set(x, 13, z);
      group.add(mast);
      const head = new THREE.Group();
      head.position.set(x, 26.2, z);
      head.lookAt(0, 0, 0);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.3), steel);
      head.add(rack);
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 2; j++) {
          const light = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.7), lamp);
          light.position.set(-1.68 + i * 0.84, -0.5 + j, 0.17);
          head.add(light);
        }
      }
      group.add(head);
    }
  }

  // Goals: glossy white posts and bar, grey frame behind
  const postMat = new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.22, metalness: 0.08 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.3 });
  const west = goal(postMat, frameMat, false);
  const east = goal(postMat, frameMat, true);
  group.add(west.group, east.group);

  return {
    group,
    /** The two nets, so a goal can make one ripple. */
    nets: { west: west.net, east: east.net },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.bumpMap?.dispose();
          m.dispose();
        }
      });
    },
  };
}
