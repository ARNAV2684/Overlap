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
    const blade = (n - 0.5) * 34;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + blade * 0.55));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + blade));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + blade * 0.35));
    const v = 128 + (n - 0.5) * 200;
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v;
    bimg.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  b.putImageData(bimg, 0, 0);
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

function goal(material: THREE.Material, netMaterial: THREE.Material, east: boolean) {
  const group = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.44, 12);
  const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 7.32, 12);
  for (const z of [-3.66, 3.66]) {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(0, 1.22, z);
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(barGeo, material);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, 2.44, 0);
  bar.castShadow = true;
  group.add(bar);
  // The net: a light box open at the front
  const net = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32), netMaterial);
  net.position.set(east ? 1 : -1, 1.22, 0);
  group.add(net);
  group.position.set(east ? PITCH_W / 2 : -PITCH_W / 2, 0, 0);
  return group;
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
    new THREE.MeshStandardMaterial({ map: colourTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.92, metalness: 0 }),
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
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4f38 });
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

  const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35 });
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    roughness: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  group.add(goal(postMat, netMat, false), goal(postMat, netMat, true));

  return {
    group,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
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
