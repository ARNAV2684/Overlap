// effects.ts — Moments drawn on the field
//
// Purpose: the visual layer for what happens in the match (not the agents' commentary):
//            BookingCards  a small yellow or red card above a booked player, popping in when given
//            EventMarkers  short-lived marks at the spot of a corner, throw-in, free kick, goal kick, foul or offside
//            GoalBurst     confetti in the scoring team's colours from the goal mouth, and the net bulging
// Inputs:  world positions (metres, X east, Z south), colours, the camera (cards face it)
// Outputs: the classes below; each has an `object` for the scene, update() per frame and dispose()
// Spec:    web/specs/pitch.md §5

import * as THREE from "three";
import type { Booking } from "@/lib/live/match-events";
import { FIGURE_SCALE } from "./figure";
import { PITCH_H } from "./pitch";

const Y = 0.05;

// ---------------------------------------------------------------------------------------------------------------
// Booking cards
// ---------------------------------------------------------------------------------------------------------------

/** Height of the card's centre above the ground: just over a player's head. */
export const CARD_Y = 2.25 * FIGURE_SCALE + 0.9;
const CARD_W = 1.0;
const CARD_H = 1.38;
/** How long a new card pops before it settles to its small size (wall seconds). */
const POP_S = 0.9;

function cardMaterial(colour: string) {
  // A card with a thin pale edge so it reads against any shirt
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 88;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.roundRect(0, 0, 64, 88, 8);
  g.fill();
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(4, 4, 56, 80, 6);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

export class BookingCards {
  readonly object = new THREE.Group();
  private readonly geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  private readonly mats = { yellow: cardMaterial("#f5c518"), red: cardMaterial("#e5383b") };
  private readonly cards = new Map<string, { mesh: THREE.Mesh; colour: Booking["colour"]; since: number }>();

  /** bookings: who has which card now; positions: where the booked players stand (absent = off the pitch). */
  update(bookings: ReadonlyMap<string, Booking>, positions: ReadonlyMap<string, { x: number; z: number }>, camera: THREE.Camera, time: number) {
    for (const [id, entry] of this.cards) {
      if (!bookings.has(id)) {
        this.object.remove(entry.mesh);
        this.cards.delete(id);
      }
    }
    for (const [id, booking] of bookings) {
      let entry = this.cards.get(id);
      if (!entry || entry.colour !== booking.colour) {
        if (entry) this.object.remove(entry.mesh);
        const mesh = new THREE.Mesh(this.geo, this.mats[booking.colour]);
        mesh.renderOrder = 10;
        this.object.add(mesh);
        entry = { mesh, colour: booking.colour, since: time };
        this.cards.set(id, entry);
      }
      const at = positions.get(id);
      entry.mesh.visible = at !== undefined;
      if (!at) continue;
      // Pop: big and bouncing for a moment, then a small card that rides along above the player
      const t = Math.min(1, (time - entry.since) / POP_S);
      const pop = t < 1 ? 1 + 1.6 * (1 - t) * Math.abs(Math.cos(t * Math.PI * 2.5)) : 1;
      entry.mesh.scale.setScalar(pop);
      entry.mesh.position.set(at.x, CARD_Y + (pop - 1) * 0.6, at.z);
      entry.mesh.quaternion.copy(camera.quaternion);
      entry.mesh.rotateZ(-0.12);
    }
  }

  dispose() {
    this.geo.dispose();
    for (const m of Object.values(this.mats)) {
      m.map?.dispose();
      m.dispose();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Event markers
// ---------------------------------------------------------------------------------------------------------------

export type MarkerShape = "ring" | "line" | "box";

type Marker = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; shape: MarkerShape; born: number; life: number };

/** Short-lived marks on the grass: an expanding ring, a line across the pitch, or a glowing box. */
export class EventMarkers {
  readonly object = new THREE.Group();
  private readonly ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  private readonly dotGeo = new THREE.CircleGeometry(1, 32);
  private readonly planeGeo = new THREE.PlaneGeometry(1, 1);
  private markers: Marker[] = [];

  /** A mark at (x, z) for `life` wall seconds. `w`/`h` size a box; a line runs across the pitch at x. */
  add(shape: MarkerShape, x: number, z: number, colour: string, time: number, life = 2.4, w = 1, h = 1) {
    const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const geo = shape === "ring" ? this.ringGeo : this.planeGeo;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, Y, z);
    mesh.renderOrder = 5;
    if (shape === "line") mesh.scale.set(0.35, PITCH_H, 1);
    if (shape === "box") mesh.scale.set(w, h, 1);
    this.object.add(mesh);
    this.markers.push({ mesh, mat, shape, born: time, life });
    if (shape === "ring") {
      // A filled spot under the ring
      const spotMat = mat.clone();
      const spot = new THREE.Mesh(this.dotGeo, spotMat);
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(x, Y - 0.002, z);
      spot.scale.setScalar(1.1);
      spot.renderOrder = 5;
      this.object.add(spot);
      this.markers.push({ mesh: spot, mat: spotMat, shape: "box", born: time, life });
    }
  }

  update(time: number) {
    this.markers = this.markers.filter((m) => {
      const t = (time - m.born) / m.life;
      if (t >= 1) {
        this.object.remove(m.mesh);
        m.mat.dispose();
        return false;
      }
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - Math.max(0, (t - 0.6) / 0.4);
      if (m.shape === "ring") {
        // Two pulses outward
        const pulse = (t * 2) % 1;
        m.mesh.scale.setScalar(1.2 + pulse * 4.5);
        m.mat.opacity = 0.9 * (1 - pulse) * fadeOut;
      } else if (m.shape === "line") {
        m.mat.opacity = 0.75 * fadeIn * fadeOut * (0.75 + 0.25 * Math.sin(time * 14));
      } else {
        m.mat.opacity = 0.32 * fadeIn * fadeOut;
      }
      return true;
    });
  }

  dispose() {
    this.markers.forEach((m) => m.mat.dispose());
    this.ringGeo.dispose();
    this.dotGeo.dispose();
    this.planeGeo.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Goal burst
// ---------------------------------------------------------------------------------------------------------------

const PARTICLES = 420;
export const BURST_S = 2.6;

export class GoalBurst {
  readonly object: THREE.Points;
  private readonly pos = new Float32Array(PARTICLES * 3);
  private readonly vel = new Float32Array(PARTICLES * 3);
  private readonly col = new Float32Array(PARTICLES * 3);
  private readonly mat: THREE.PointsMaterial;
  private born = -Infinity;
  private net: { mesh: THREE.Mesh; base: number; dir: number } | null = null;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    this.object = new THREE.Points(geo, this.mat);
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Confetti from the goal mouth at world x `goalX` (±52.5), in the team's colours; the net bulges. */
  fire(goalX: number, colours: readonly string[], net: THREE.Mesh, time: number) {
    const dir = goalX > 0 ? -1 : 1; // into the pitch
    const palette = [...colours, "#ffffff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < PARTICLES; i++) {
      const o = i * 3;
      this.pos[o] = goalX + dir * 0.5;
      this.pos[o + 1] = 1 + Math.random() * 1.4;
      this.pos[o + 2] = (Math.random() - 0.5) * 7;
      const speed = 9 + Math.random() * 14;
      const a = (Math.random() - 0.5) * Math.PI * 0.9;
      this.vel[o] = dir * Math.cos(a) * speed * 0.7;
      this.vel[o + 1] = 6 + Math.random() * 12;
      this.vel[o + 2] = Math.sin(a) * speed;
      const c = palette[i % palette.length];
      this.col[o] = c.r;
      this.col[o + 1] = c.g;
      this.col[o + 2] = c.b;
    }
    (this.object.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.born = time;
    this.object.visible = true;
    this.net = { mesh: net, base: net.position.x, dir: -dir };
  }

  get active() {
    return this.object.visible;
  }

  update(time: number, dt: number) {
    const t = (time - this.born) / BURST_S;
    if (this.net) {
      // The net bulges back and settles; it glows a moment
      const k = t < 1 ? Math.sin(Math.min(1, t * 2.2) * Math.PI) * Math.exp(-t * 2) : 0;
      this.net.mesh.scale.x = 1 + k * 0.9;
      this.net.mesh.position.x = this.net.base + this.net.dir * k * 0.9;
      (this.net.mesh.material as THREE.MeshStandardMaterial).opacity = 0.12 + k * 0.35;
      if (t >= 1) this.net = null;
    }
    if (!this.object.visible) return;
    if (t >= 1) {
      this.object.visible = false;
      return;
    }
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < PARTICLES; i++) {
      const o = i * 3;
      this.vel[o + 1] -= 18 * step;
      this.vel[o] *= 0.985;
      this.vel[o + 2] *= 0.985;
      this.pos[o] += this.vel[o] * step;
      this.pos[o + 1] = Math.max(0.05, this.pos[o + 1] + this.vel[o + 1] * step);
      this.pos[o + 2] += this.vel[o + 2] * step;
    }
    (this.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.mat.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
