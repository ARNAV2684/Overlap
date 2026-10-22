"use client";

// PitchStage.tsx — The live 3D pitch
//
// Purpose: mount the WebGL stage, run its animation loop from the match experience, and float HTML labels over it:
//          speed tags when a player crosses a threshold, the followed player's name, and the story's line markers
// Inputs:  the match experience and preferences from context; `highlight` player ids from the screen
// Outputs: UI (a canvas and a label layer; children are drawn on top, for the caption and controls)
// Spec:    web/specs/pitch.md
//
// Speed tags come straight from tracking (CONTRACTS.md §4 speed_kmh), the same numbers the stats engine uses; the
// threshold matches the agents' top-speed tag. A player is tagged at most once per cooldown.

import { useEffect, useRef, type ReactNode } from "react";
import { attacksEast } from "@/lib/coordinates";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { createStage, toWorld, type Stage } from "./scene/stage";
import { PITCH_H, PITCH_W } from "./scene/pitch";
import { FIGURE_SCALE } from "./scene/figure";

/** km/h at which a running player gets a speed tag (the agents' top-speed tag uses 33, agents/config.py). */
export const SPEED_TAG_KMH = 31;
const TAG_SHOW_MS = 2600;
const TAG_COOLDOWN_MS = 14_000;
/** At most this many speed tags at once, so a fast replay never fills the pitch with labels. */
const MAX_TAGS = 2;

type Label = { el: HTMLDivElement; seen: boolean };

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function PitchStage({ highlight = [], children }: { highlight?: readonly string[]; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const exp = useExperience();
  const [prefs] = usePreferences();

  // The loop reads these through refs, so changing them never restarts the stage
  const live = useRef({ exp, prefs, highlight });
  useEffect(() => {
    live.current = { exp, prefs, highlight };
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const layer = labelsRef.current!;
    let stage: Stage;
    try {
      stage = createStage(canvas);
    } catch {
      wrap.dataset.webgl = "unavailable";
      return;
    }
    stageRef.current = stage;

    const resize = () => stage.resize(wrap.clientWidth, wrap.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const labels = new Map<string, Label>();
    const tagUntil = new Map<string, number>();
    const tagNext = new Map<string, number>();
    /** The fastest the player went while tagged: the tag shows the burst, not the jog after it. */
    const tagPeak = new Map<string, number>();
    const label = (key: string, cls: string) => {
      let l = labels.get(key);
      if (!l) {
        const el = document.createElement("div");
        el.className = cls;
        layer.appendChild(el);
        l = { el, seen: true };
        labels.set(key, l);
      }
      l.seen = true;
      return l.el;
    };

    let raf = 0;
    let last = performance.now();
    const start = last;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { exp: e, prefs: p, highlight: hl } = live.current;
      const setup = e.memory.setup();
      stage.setSetup(setup);
      stage.setView(e.view);
      const sample = e.motion.sample(now);
      const ring = new Set(hl);
      if (p.player) ring.add(p.player);
      stage.update({ sample, story: e.story, memory: e.memory, highlight: ring, dt, time: (now - start) / 1000 });

      labels.forEach((l) => (l.seen = false));
      if (sample) {
        const meta = e.memory.players();
        for (const [id, pose] of sample.players) {
          const m = meta.get(id);
          if (!m) continue;
          const w = toWorld(pose.x, pose.y);
          const followed = id === p.player;
          // Speed tags
          const showing = [...tagUntil.values()].filter((t) => t > now).length;
          if (pose.speedKmh >= SPEED_TAG_KMH && now >= (tagNext.get(id) ?? 0) && sample.rate > 0 && showing < MAX_TAGS) {
            tagUntil.set(id, now + TAG_SHOW_MS);
            tagNext.set(id, now + TAG_COOLDOWN_MS);
            tagPeak.set(id, pose.speedKmh);
          }
          const tagged = now < (tagUntil.get(id) ?? 0);
          if (tagged) tagPeak.set(id, Math.max(tagPeak.get(id) ?? 0, pose.speedKmh));
          if (!tagged && !followed) continue;
          const at = stage.project(w.x, 2.25 * FIGURE_SCALE, w.z);
          if (!at) continue;
          const el = label(`p:${id}`, "ov-tag");
          const surname = escape(m.name.split(" ").slice(-1)[0]);
          el.innerHTML = tagged
            ? `<b>${m.shirt}</b> ${surname}<span class="ov-tag-speed">⚡ ${(tagPeak.get(id) ?? pose.speedKmh).toFixed(1)} km/h</span>`
            : `<b>${m.shirt}</b> ${surname}`;
          el.dataset.kind = tagged ? "speed" : "follow";
          el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
        }
        // Story markers: the defensive line now and before the goal
        const s = e.story;
        if (s?.kind === "protect" && s.side) {
          const east = attacksEast(s.side, sample.period) ?? s.side === "home";
          const lineX = (m: number) => (east ? m : PITCH_W - m) - PITCH_W / 2;
          // "Now" sits at the near touchline, "before" at the far one, so the two never overlap
          const put = (key: string, metres: number | undefined, text: string, near: boolean) => {
            if (metres === undefined) return;
            const at = stage.project(lineX(metres), 0, near ? PITCH_H / 2 + 3 : -PITCH_H / 2 - 1.5);
            if (!at) return;
            const el = label(key, "ov-marker");
            el.textContent = text;
            el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
          };
          put("m:now", s.lineNow, "Defensive line now", true);
          if (s.lineBefore !== undefined && s.lineNow !== undefined && Math.abs(s.lineBefore - s.lineNow) >= 1.5) {
            put("m:before", s.lineBefore, "Before the goal", false);
          }
        }
      }
      labels.forEach((l, key) => {
        if (!l.seen) {
          l.el.remove();
          labels.delete(key);
        }
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      labels.forEach((l) => l.el.remove());
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  return (
    <div ref={wrapRef} className="ov-stage relative h-full w-full overflow-hidden bg-[#0b0c0d]">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Live 3D pitch with the players' tracked positions" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="ov-stage-fallback pointer-events-none absolute inset-0 hidden place-items-center text-sm text-white/60">
        This browser can&apos;t draw the 3D pitch (WebGL is off).
      </div>
      {children}
    </div>
  );
}
