"use client";

// FigurePreview.tsx — Player figures on a patch of grass (development only)
//
// Purpose: six figures of two kits, three running in circles at jog, run and sprint speed and three standing, seen
//          from a broadcast-height camera, so changes to figure.ts can be judged in a browser
// Inputs:  none
// Outputs: a WebGL canvas
// Spec:    web/specs/pitch.md §1.2

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createFigure, disposeFigureAssets, type Kit } from "@/components/pitch3d/scene/figure";

const HOME: Omit<Kit, "number"> = { shirt: "#1F6B3A", shorts: "#F4F4F4", socks: "#1F6B3A", ring: "#3ddc84" };
const AWAY: Omit<Kit, "number"> = { shirt: "#F4F4F4", shorts: "#0E2A47", socks: "#F4F4F4", ring: "#7fb2ff" };

export function FigurePreview() {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"broadcast" | "close">("broadcast");
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c120e");
    const camera = new THREE.PerspectiveCamera(view === "close" ? 28 : 34, el.clientWidth / el.clientHeight, 0.1, 500);
    camera.position.set(0, view === "close" ? 7 : 22, view === "close" ? 16 : 34);
    camera.lookAt(0, view === "close" ? 1.6 : 0, 0);
    scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x1d3a22, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
    scene.add(sun);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);
    for (let i = -4; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(5, 60), new THREE.MeshStandardMaterial({ color: "#356f3f", roughness: 0.95 }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(i * 10 + 2.5, 0.005, 0);
      stripe.receiveShadow = true;
      scene.add(stripe);
    }
    const runners = [2.2, 4.5, 7.6].map((speed, i) => ({ fig: createFigure({ ...(i % 2 ? AWAY : HOME), number: String(7 + i) }, i + 1), speed, r: 4 + i * 3.2, a: i }));
    const standing = [0, 1, 2].map((i) => ({ fig: createFigure({ ...(i % 2 ? HOME : AWAY), number: String(2 + i) }, i + 11), x: -6 + i * 6, z: 9 }));
    [...runners.map((r) => r.fig), ...standing.map((s) => s.fig)].forEach((f) => scene.add(f.root));
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const r of runners) {
        const before = r.a;
        r.a += (r.speed / r.r) * dt;
        const x = Math.cos(r.a) * r.r;
        const z = Math.sin(r.a) * r.r - 4;
        r.fig.update(x, z, r.speed, -Math.sin(r.a), Math.cos(r.a), dt, (r.a - before) * r.r);
      }
      for (const s of standing) s.fig.update(s.x, s.z, 0, 0, 1, dt, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      [...runners.map((r) => r.fig), ...standing.map((s) => s.fig)].forEach((f) => f.dispose());
      disposeFigureAssets();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [view]);
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-3 px-3 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <p className="ov-eyebrow">Development preview · player figures</p>
        <div className="viz-toggle">
          {(["broadcast", "close"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={view === v ? "viz-toggle-on" : ""}>
              {v === "broadcast" ? "Broadcast" : "Close"}
            </button>
          ))}
        </div>
      </div>
      <div ref={host} className="h-[70vh] w-full overflow-hidden rounded-[14px]" />
    </main>
  );
}
