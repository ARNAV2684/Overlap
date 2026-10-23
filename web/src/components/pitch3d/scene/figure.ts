// figure.ts — A 3D footballer
//
// Purpose: a stylised human figure (head, hair, neck, torso, arms, hands, legs, boots) in a team's kit, with a
//          procedural run cycle driven by the player's real speed from tracking
// Inputs:  kit colours, skin tone, shirt number
// Outputs: createFigure(): { root, update(), setHighlight(), dispose }
// Spec:    web/specs/pitch.md §1.2
//
// Built from capsules and spheres, shared per kit, so 22 players cost a few hundred small meshes. Units are metres;
// the whole figure is scaled up a little (FIGURE_SCALE) so players read at full-pitch distance, as broadcast
// graphics do.

import * as THREE from "three";

export const FIGURE_SCALE = 1.8;

export type Kit = {
  shirt: string;
  shorts: string;
  socks: string;
  number: string;
  /** The team's colour for the ring at the player's feet (bright enough to read on grass). */
  ring: string;
};

const SKIN = ["#f1c7a5", "#e0ac83", "#c68a5e", "#a86b43", "#7d4b2c", "#5a3520"];
const HAIR = ["#1b1410", "#2b1d14", "#4a3220", "#6b4a2b", "#c9a46a", "#0d0d0d"];

// Shared geometries (created once)
let geos: Record<string, THREE.BufferGeometry> | null = null;
function geometries() {
  if (geos) return geos;
  geos = {
    head: new THREE.SphereGeometry(0.105, 20, 16),
    nose: new THREE.SphereGeometry(0.025, 8, 6),
    trim: new THREE.CylinderGeometry(0.065, 0.065, 0.035, 12),
    hair: new THREE.SphereGeometry(0.121, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10),
    torso: new THREE.LatheGeometry([
      new THREE.Vector2(0.13, -0.25), new THREE.Vector2(0.145, -0.2),
      new THREE.Vector2(0.16, 0.12), new THREE.Vector2(0.19, 0.2),
      new THREE.Vector2(0.14, 0.27), new THREE.Vector2(0.065, 0.3),
    ], 20),
    hips: new THREE.CapsuleGeometry(0.15, 0.08, 6, 12),
    upperArm: new THREE.CapsuleGeometry(0.052, 0.22, 4, 10),
    foreArm: new THREE.CapsuleGeometry(0.045, 0.22, 4, 10),
    hand: new THREE.SphereGeometry(0.05, 10, 8),
    thigh: new THREE.CapsuleGeometry(0.075, 0.32, 4, 10),
    shin: new THREE.CapsuleGeometry(0.06, 0.34, 4, 10),
    boot: new THREE.SphereGeometry(0.08, 12, 8),
    shadow: new THREE.CircleGeometry(0.42, 24),
    ring: new THREE.RingGeometry(0.62, 0.8, 40),
    base: new THREE.RingGeometry(0.34, 0.46, 32),
  };
  return geos;
}

// Shared materials per colour
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(colour: string, roughness = 0.62) {
  const key = `${colour}|${roughness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness, metalness: 0 });
    matCache.set(key, m);
  }
  return m;
}

/** A shirt with the number on its back: a small canvas texture wrapped on the torso capsule. */
function shirtMaterial(kit: Kit) {
  const key = `shirt|${kit.shirt}|${kit.shorts}|${kit.number}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.fillStyle = kit.shirt;
  g.fillRect(0, 0, 256, 128);
  // Low-contrast fabric ribs and side panels, generated rather than external kit assets.
  g.fillStyle = "rgba(255,255,255,0.035)";
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 1, 128);
  g.fillStyle = kit.shorts;
  g.fillRect(0, 0, 256, 5);
  g.fillRect(0, 120, 256, 3);
  g.globalAlpha = 0.35;
  g.fillRect(0, 0, 7, 128); g.fillRect(126, 0, 7, 128);
  g.globalAlpha = 1;
  const ink = luminance(kit.shirt) > 0.55 ? "#141414" : "#ffffff";
  g.fillStyle = ink;
  g.font = "800 52px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // The capsule's UV seam is at the back's centre line: u=0.75 faces away from the default forward (+Z)
  g.fillText(kit.number, 192, 65);
  g.font = "700 12px Arial, sans-serif";
  g.fillText(kit.number, 64, 46);
  g.fillRect(48, 23, 8, 11); // small fictional chest patch, no club branding
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.68 });
  matCache.set(key, m);
  return m;
}

export function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function limb(geo: THREE.BufferGeometry, material: THREE.Material, length: number) {
  // A pivot at the joint; the capsule hangs below it
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export type Figure = {
  root: THREE.Group;
  /** Moves and animates: position in world metres, speed in m/s of match time, dt in wall seconds. */
  update(x: number, z: number, speed: number, faceX: number, faceZ: number, dt: number, distance: number): void;
  setHighlight(on: boolean, colour?: string): void;
  dispose(): void;
};

export function createFigure(kit: Kit, seed: number): Figure {
  const g = geometries();
  const skin = mat(SKIN[seed % SKIN.length], 0.55);
  const hair = mat(HAIR[(seed * 7) % HAIR.length], 0.8);
  const shirt = shirtMaterial(kit);
  const sleeve = mat(kit.shirt, 0.68);
  const shorts = mat(kit.shorts, 0.7);
  const socks = mat(kit.socks, 0.7);
  const boots = mat(seed % 3 === 0 ? "#e6d575" : seed % 3 === 1 ? "#e6ecec" : "#161b23", 0.48);

  const root = new THREE.Group();
  const body = new THREE.Group(); // scaled, leans and bobs
  body.scale.setScalar(FIGURE_SCALE);
  root.add(body);

  const hips = new THREE.Mesh(g.hips, shorts);
  hips.position.y = 0.92;
  hips.rotation.z = Math.PI / 2;
  hips.castShadow = true;
  body.add(hips);

  const chest = new THREE.Group(); // pivots at the waist for the lean and twist
  chest.position.y = 0.98;
  body.add(chest);
  const torso = new THREE.Mesh(g.torso, shirt);
  torso.position.y = 0.3;
  torso.scale.set(1.1, 1, 0.68);
  torso.castShadow = true;
  chest.add(torso);
  const neck = new THREE.Mesh(g.neck, skin);
  neck.position.y = 0.62;
  chest.add(neck);
  const head = new THREE.Mesh(g.head, skin);
  head.position.y = 0.76;
  head.scale.set(0.94, 1.15, 1);
  head.castShadow = true;
  chest.add(head);
  const nose = new THREE.Mesh(g.nose, skin);
  nose.position.set(0, 0.75, 0.105); chest.add(nose);
  const hairCap = new THREE.Mesh(g.hair, hair);
  hairCap.position.y = 0.79;
  hairCap.scale.set(0.88, 1, 0.9);
  hairCap.rotation.x = -0.25;
  chest.add(hairCap);

  const arms: { upper: THREE.Group; fore: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const upper = limb(g.upperArm, sleeve, 0.3);
    upper.position.set(side * 0.235, 0.52, 0);
    upper.rotation.z = side * 0.12;
    chest.add(upper);
    const fore = limb(g.foreArm, skin, 0.29);
    fore.position.y = -0.3;
    upper.add(fore);
    const hand = new THREE.Mesh(g.hand, skin);
    hand.position.y = -0.31;
    fore.add(hand);
    arms.push({ upper, fore, side });
  }

  const legs: { thigh: THREE.Group; shin: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const thigh = limb(g.thigh, skin, 0.44);
    const shortLeg = new THREE.Mesh(g.thigh, shorts);
    shortLeg.scale.set(1.15, 0.52, 1.15); shortLeg.position.y = -0.1; shortLeg.castShadow = true;
    thigh.add(shortLeg);
    thigh.position.set(side * 0.1, 0.9, 0);
    body.add(thigh);
    // Bare knee to sock: the shin is the sock colour, a skin band sits at the top
    const shin = limb(g.shin, socks, 0.44);
    shin.position.y = -0.42;
    thigh.add(shin);
    const knee = new THREE.Mesh(g.hand, skin);
    knee.scale.set(1.35, 1.2, 1.35);
    knee.position.y = -0.02;
    shin.add(knee);
    const boot = new THREE.Mesh(g.boot, boots);
    boot.position.set(0, -0.47, 0.05);
    boot.castShadow = true;
    boot.scale.set(0.85, 0.5, 1.65);
    shin.add(boot);
    const cuff = new THREE.Mesh(g.trim, mat(kit.shorts));
    cuff.position.y = -0.13; shin.add(cuff);
    legs.push({ thigh, shin, side });
  }

  // A soft contact shadow, and a ring for the highlighted player
  const shadow = new THREE.Mesh(
    g.shadow,
    new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.6, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.scale.set(1.8, 1.2, 1);
  root.add(shadow);
  // A ring in the team colour at the player's feet, so teams read at full-pitch distance
  const baseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(kit.ring), transparent: true, opacity: 0.28, depthWrite: false });
  const base = new THREE.Mesh(g.base, baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.035;
  base.scale.setScalar(FIGURE_SCALE);
  root.add(base);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4f38, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(g.ring, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.scale.setScalar(FIGURE_SCALE);
  ring.visible = false;
  root.add(ring);

  let phase = (seed * 0.37) % (Math.PI * 2);
  let yaw = 0;
  let idle = seed * 1.3;

  return {
    root,
    setHighlight(on, colour) {
      ring.visible = on;
      if (colour) ringMat.color.set(colour);
    },
    update(x, z, speed, faceX, faceZ, dt, distance) {
      root.position.set(x, 0, z);
      // Turn towards where the player is going, or towards the ball when standing
      const target = Math.atan2(faceX, faceZ);
      let diff = target - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      yaw += diff * (1 - Math.exp(-dt * 18));
      root.rotation.y = yaw;

      // Phase follows displayed ground travel, not a separately capped playback clock.
      // A stride grows from walking to sprinting; pause/seek adds no distance.
      const effort = Math.min(1, speed / 7.5);
      const stride = (1.4 + effort * 2.2) * FIGURE_SCALE;
      phase += (distance / stride) * Math.PI * 2;
      idle += dt;
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const swing = effort < 0.02 ? 0 : 0.12 + effort * 0.68;

      legs[0].thigh.rotation.x = s * swing;
      legs[1].thigh.rotation.x = -s * swing;
      legs[0].shin.rotation.x = Math.max(0, -c) * (0.25 + effort * 1.1) + 0.05;
      legs[1].shin.rotation.x = Math.max(0, c) * (0.25 + effort * 1.1) + 0.05;
      arms[0].upper.rotation.x = -s * swing * 0.85;
      arms[1].upper.rotation.x = s * swing * 0.85;
      arms[0].fore.rotation.x = -0.35 - effort * 0.9;
      arms[1].fore.rotation.x = -0.35 - effort * 0.9;
      chest.rotation.x = 0.02 + effort * 0.14;
      chest.rotation.y = s * 0.12 * effort;
      // Standing players breathe and shift their weight a little
      const breathe = effort < 0.1 ? Math.sin(idle * 1.8) * 0.01 : 0;
      body.position.y = Math.abs(c) * 0.035 * effort * FIGURE_SCALE + breathe;
    },
    dispose() {
      (shadow.material as THREE.Material).dispose();
      baseMat.dispose();
      ringMat.dispose();
    },
  };
}

let contact: THREE.CanvasTexture | null = null;
function contactTexture() {
  if (contact) return contact;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const fade = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  fade.addColorStop(0, "rgba(0,0,0,0.9)"); fade.addColorStop(0.45, "rgba(0,0,0,0.4)"); fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 64, 64);
  contact = new THREE.CanvasTexture(c); return contact;
}

/** Releases the shared geometries and materials (call when the last stage goes away). */
export function disposeFigureAssets() {
  if (geos) Object.values(geos).forEach((geo) => geo.dispose());
  geos = null;
  matCache.forEach((m) => {
    m.map?.dispose();
    m.dispose();
  });
  matCache.clear();
  contact?.dispose(); contact = null;
}
