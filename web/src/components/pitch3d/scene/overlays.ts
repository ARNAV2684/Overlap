// overlays.ts — Tactical graphics painted on the grass
//
// Purpose: the drawing primitives the story director's pictures are made of:
//            TerritoryTide  two team tints split by a moving, wavy front (the momentum "tide")
//            Ribbons        flat glowing strips on the grass between points (pass network links, shape lines)
//            Discs          rings under players, sized by involvement (pass network nodes)
//            Hull           a translucent fill over a team's block
//            LaneBand       an animated arrow band down one attacking lane
//            FlankLanes     the three lanes of an attacking third, each as bright as its share of the attack
// Inputs:  world coordinates (metres, X east, Z south) and colours
// Outputs: the classes below; each has an `object` to add to the scene and a dispose()
// Spec:    web/specs/pitch.md §4

import * as THREE from "three";
import { PITCH_H, PITCH_W } from "./pitch";

const Y = 0.03;

export class TerritoryTide {
  readonly object: THREE.Mesh;
  private readonly uniforms: {
    uFront: { value: number };
    uTime: { value: number };
    uWest: { value: THREE.Color };
    uEast: { value: THREE.Color };
    uOpacity: { value: number };
  };

  constructor() {
    this.uniforms = {
      uFront: { value: 0 },
      uTime: { value: 0 },
      uWest: { value: new THREE.Color("#0e7c7b") },
      uEast: { value: new THREE.Color("#4b2a7b") },
      uOpacity: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFront; uniform float uTime; uniform float uOpacity;
        uniform vec3 uWest; uniform vec3 uEast;
        varying vec2 vPos;
        void main() {
          // vPos.x runs east, vPos.y runs north (the plane is laid flat)
          float wave = sin(vPos.y * 0.11 + uTime * 0.9) * 1.6 + sin(vPos.y * 0.29 - uTime * 1.4) * 0.7;
          float edge = vPos.x - (uFront + wave);
          vec3 col = edge < 0.0 ? uWest : uEast;
          float glow = exp(-abs(edge) * 0.9);
          // Tint fades towards each goal so the front reads strongest
          float depth = 0.55 + 0.45 * exp(-abs(edge) * 0.025);
          float a = uOpacity * (0.42 * depth + 0.5 * glow);
          vec3 c = mix(col, vec3(1.0), glow * 0.65);
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_H, 1, 1), material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.y = Y - 0.01;
    this.object.renderOrder = 1;
  }

  /** frontX in world metres; west/east are the colours of the teams defending each end. */
  set(frontX: number, west: string, east: string, time: number, opacity: number) {
    const u = this.uniforms;
    u.uFront.value += (frontX - u.uFront.value) * 0.06;
    u.uTime.value = time;
    u.uWest.value.set(west);
    u.uEast.value.set(east);
    u.uOpacity.value += (opacity - u.uOpacity.value) * 0.08;
    this.object.visible = u.uOpacity.value > 0.01;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

export type Segment = { ax: number; az: number; bx: number; bz: number; width: number };

/** Up to `max` flat strips, rebuilt every frame from the segments given. Two layers: a soft glow and a core. */
export class Ribbons {
  readonly object = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly corePos: Float32Array;
  private readonly glowPos: Float32Array;
  private readonly coreMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private opacity = 0;

  constructor(private readonly max: number, colour = "#ffffff", private readonly glowScale = 3.2) {
    const make = (pos: Float32Array, material: THREE.Material) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const index: number[] = [];
      for (let i = 0; i < max; i++) {
        const o = i * 4;
        index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
      }
      geo.setIndex(index);
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      return mesh;
    };
    this.corePos = new Float32Array(max * 12);
    this.glowPos = new Float32Array(max * 12);
    this.coreMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.glow = make(this.glowPos, this.glowMat);
    this.core = make(this.corePos, this.coreMat);
    this.object.add(this.glow, this.core);
  }

  private fill(pos: Float32Array, segments: readonly Segment[], scale: number, lift: number) {
    pos.fill(0);
    segments.slice(0, this.max).forEach((s, i) => {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * (s.width * scale) * 0.5;
      const nz = (dx / len) * (s.width * scale) * 0.5;
      const o = i * 12;
      pos.set([s.ax + nx, Y + lift, s.az + nz, s.ax - nx, Y + lift, s.az - nz, s.bx + nx, Y + lift, s.bz + nz, s.bx - nx, Y + lift, s.bz - nz], o);
    });
  }

  set(segments: readonly Segment[], colour: string, opacity: number) {
    this.opacity += (opacity - this.opacity) * 0.1;
    this.object.visible = this.opacity > 0.01 && segments.length > 0;
    if (!this.object.visible) return;
    this.coreMat.color.set(colour);
    this.glowMat.color.set(colour);
    this.coreMat.opacity = this.opacity * 0.95;
    this.glowMat.opacity = this.opacity * 0.22;
    this.fill(this.corePos, segments, 1, 0.006);
    this.fill(this.glowPos, segments, this.glowScale, 0);
    (this.core.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.glow.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.core.geometry.dispose();
    this.glow.geometry.dispose();
    this.coreMat.dispose();
    this.glowMat.dispose();
  }
}

/** Rings on the grass at points, each with its own size. */
export class Discs {
  readonly object: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly material: THREE.MeshBasicMaterial;
  private opacity = 0;

  constructor(private readonly max: number) {
    this.material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.object = new THREE.InstancedMesh(new THREE.RingGeometry(0.72, 1, 36), this.material, max);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
    this.object.count = 0;
  }

  set(points: readonly { x: number; z: number; r: number }[], colour: string, opacity: number) {
    this.opacity += (opacity - this.opacity) * 0.1;
    this.object.visible = this.opacity > 0.01 && points.length > 0;
    this.material.color.set(colour);
    this.material.opacity = this.opacity;
    const n = Math.min(points.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      this.dummy.position.set(p.x, Y + 0.012, p.z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(p.r);
      this.dummy.updateMatrix();
      this.object.setMatrixAt(i, this.dummy.matrix);
    }
    this.object.count = n;
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

/** A filled polygon on the grass (a team's block), as a fan from its centre. */
export class Hull {
  readonly object: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly material: THREE.MeshBasicMaterial;
  private opacity = 0;

  constructor(private readonly max = 24) {
    this.pos = new Float32Array((max + 2) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 1; i <= max; i++) index.push(0, i, i + 1);
    geo.setIndex(index);
    this.material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.object = new THREE.Mesh(geo, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  /** Points in any order; the convex hull is drawn. */
  set(points: readonly { x: number; z: number }[], colour: string, opacity: number) {
    this.opacity += (opacity - this.opacity) * 0.08;
    const hull = convexHull(points).slice(0, this.max);
    this.object.visible = this.opacity > 0.01 && hull.length >= 3;
    if (!this.object.visible) return;
    this.material.color.set(colour);
    this.material.opacity = this.opacity;
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
    const cz = hull.reduce((s, p) => s + p.z, 0) / hull.length;
    this.pos.fill(0);
    this.pos.set([cx, Y - 0.004, cz], 0);
    const ring = [...hull, hull[0]];
    ring.forEach((p, i) => this.pos.set([p.x, Y - 0.004, p.z], (i + 1) * 3));
    // Unused fan triangles collapse onto the last point
    for (let i = ring.length; i <= this.max; i++) this.pos.set([hull[0].x, Y - 0.004, hull[0].z], (i + 1) * 3);
    (this.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

/** Andrew's monotone chain. */
export function convexHull(points: readonly { x: number; z: number }[]) {
  const p = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (p.length < 3) return p;
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: { x: number; z: number }[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: { x: number; z: number }[] = [];
  for (const pt of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** An animated band of chevrons running towards a goal along one lane. */
export class LaneBand {
  readonly object: THREE.Mesh;
  private readonly uniforms: { uTime: { value: number }; uColour: { value: THREE.Color }; uOpacity: { value: number }; uDir: { value: number } };
  private opacity = 0;

  constructor() {
    this.uniforms = { uTime: { value: 0 }, uColour: { value: new THREE.Color("#ff4f38") }, uOpacity: { value: 0 }, uDir: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; uniform float uDir; uniform vec3 uColour;
        varying vec2 vUv;
        void main() {
          float u = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
          float across = abs(vUv.y - 0.5) * 2.0;
          // Chevrons: stripes bent into arrows, moving towards the goal
          float chevron = fract((u + across * 0.18) * 7.0 - uTime * 0.9);
          float stripe = smoothstep(0.0, 0.08, chevron) * (1.0 - smoothstep(0.32, 0.42, chevron));
          float edge = 1.0 - smoothstep(0.8, 1.0, across);
          float fade = smoothstep(0.0, 0.25, u);
          float a = uOpacity * edge * fade * (0.16 + 0.5 * stripe);
          gl_FragColor = vec4(uColour, a);
        }`,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.y = Y + 0.002;
    this.object.renderOrder = 2;
  }

  /** From world x0 to x1 (the goal end), centred on z, `width` metres wide. */
  set(x0: number, x1: number, z: number, width: number, colour: string, time: number, opacity: number) {
    this.opacity += (opacity - this.opacity) * 0.08;
    this.object.visible = this.opacity > 0.01;
    this.object.position.x = (x0 + x1) / 2;
    this.object.position.z = z;
    this.object.scale.set(Math.abs(x1 - x0), width, 1);
    this.uniforms.uDir.value = x1 > x0 ? 1 : -1;
    this.uniforms.uTime.value = time;
    this.uniforms.uColour.value.set(colour);
    this.uniforms.uOpacity.value = this.opacity;
  }

  dispose() {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

/** One lane of an attacking third: world x from the third's start to the goal line, centred on z. */
export type FlankLane = { x0: number; x1: number; z: number; width: number; share: number };

/**
 * Attack by flank on the grass: three stripes over the attacking third (left, centre, right), each lit by its share
 * of the team's final-third actions, brightest at the goal end. The labels with the numbers are HTML (PitchStage).
 */
export class FlankLanes {
  readonly object = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly uniforms: { uColour: { value: THREE.Color }; uOpacity: { value: number }; uDir: { value: number } }[] = [];
  private readonly opacity = [0, 0, 0];
  /** The last lanes drawn, so the stripes fade out in place when the story moves on. */
  private last: readonly FlankLane[] = [];

  constructor() {
    for (let i = 0; i < 3; i++) {
      const uniforms = { uColour: { value: new THREE.Color("#ffffff") }, uOpacity: { value: 0 }, uDir: { value: 1 } };
      const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; uniform float uDir; uniform vec3 uColour;
          varying vec2 vUv;
          void main() {
            float u = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
            float across = abs(vUv.y - 0.5) * 2.0;
            // A soft fill that brightens towards the goal, with a crisp edge so the three lanes read apart
            float fill = 0.35 + 0.65 * smoothstep(0.0, 1.0, u);
            float edge = smoothstep(0.86, 0.94, across) * (1.0 - smoothstep(0.96, 1.0, across));
            float inside = 1.0 - smoothstep(0.94, 1.0, across);
            float a = uOpacity * (inside * fill * 0.55 + edge * 0.9);
            gl_FragColor = vec4(uColour, a);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = Y + 0.001;
      mesh.renderOrder = 2;
      this.meshes.push(mesh);
      this.uniforms.push(uniforms);
      this.object.add(mesh);
    }
  }

  /** Lanes in any order (shares in %); `opacity` is the brightest lane's, the others scale by their share. */
  set(lanes: readonly FlankLane[], colour: string, opacity: number) {
    if (lanes.length) this.last = lanes;
    const top = Math.max(1, ...this.last.map((l) => l.share));
    let any = false;
    this.meshes.forEach((mesh, i) => {
      const lane = this.last[i];
      const target = lane && lanes.length ? opacity * (0.15 + 0.85 * (lane.share / top)) : 0;
      this.opacity[i] += (target - this.opacity[i]) * 0.08;
      mesh.visible = this.opacity[i] > 0.01 && lane !== undefined;
      if (!lane) return;
      any ||= mesh.visible;
      mesh.position.x = (lane.x0 + lane.x1) / 2;
      mesh.position.z = lane.z;
      mesh.scale.set(Math.abs(lane.x1 - lane.x0), lane.width, 1);
      const u = this.uniforms[i];
      u.uDir.value = lane.x1 > lane.x0 ? 1 : -1;
      u.uColour.value.set(colour);
      u.uOpacity.value = this.opacity[i];
    });
    this.object.visible = any;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
