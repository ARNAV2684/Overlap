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
//
// Match events (goals, cards, corners, throw-ins, free kicks, goal kicks, offsides, fouls) fire once, when the
// smooth playhead reaches them, never for a backlog (a catch-up snapshot, a replay that jumps): they get a mark on
// the grass, a short label at the spot and a line in the event ticker; a goal gets the celebration.

import { useEffect, useRef, type ReactNode } from "react";
import { attacksEast, teamToPitch, type Side } from "@/lib/coordinates";
import { flightAt, shotFlight, type BallPoint, type ShotFlight } from "@/lib/live/ball-flight";
import { bookingsAt, FIELD_EVENT_LABELS, minuteOf, shortName, type FieldEvent } from "@/lib/live/match-events";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { createStage, toWorld, type Stage } from "./scene/stage";
import { PITCH_H, PITCH_W } from "./scene/pitch";
import { CARD_Y } from "./scene/effects";
import { FIGURE_SCALE } from "./scene/figure";

/** km/h at which a running player gets a speed tag (the agents' top-speed tag uses 33, agents/config.py). */
export const SPEED_TAG_KMH = 31;
const TAG_SHOW_MS = 2600;
const TAG_COOLDOWN_MS = 14_000;
/** At most this many speed tags at once, so a fast replay never fills the pitch with labels. */
const MAX_TAGS = 2;

/** An event older than this (match ms) when the playhead reaches it is history, not news: no mark, no ticker. */
const FRESH_MS = 15_000;
/** A page that drew no frame for longer than this (wall ms) was away: what it missed is history, not news. */
const MAX_FRAME_GAP_MS = 3000;
const EVENT_LABEL_MS = 2200;
const TICKER_MS = 3200;
const GOAL_MS = 2900;

const ICONS: Record<FieldEvent["kind"], string> = {
  goal: "⚽",
  card: "",
  corner: "⚑",
  throw_in: "⤴",
  free_kick: "●",
  goal_kick: "⤒",
  offside: "⚐",
  foul: "✕",
};

/** Trail colours of a shot's flight, by outcome (the shot map's colours); a lofted ball leaves a white trail. */
const SHOT_TRAIL: Record<ShotFlight["outcome"], string> = {
  goal: "#ff4f38",
  saved: "#4a90d9",
  missed: "#a4a4bc",
  blocked: "#e8a838",
  woodwork: "#d4637a",
};
/** A tracked ball higher than this (metres) is in the air and leaves a trail. */
const AIRBORNE_M = 0.8;

type Label = { el: HTMLDivElement; seen: boolean };

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function PitchStage({ highlight = [], children }: { highlight?: readonly string[]; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const goalRef = useRef<HTMLDivElement>(null);
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
    const ticker = tickerRef.current!;
    const goalBanner = goalRef.current!;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    // Match events: which have fired, and the ones whose spot label is still up
    const fired = new Set<string>();
    // Shots being flown in 3D
    const shotsFlown = new Set<string>();
    let flights: ShotFlight[] = [];
    let lastPlayhead = -Infinity;
    let lastFrameAt = -Infinity;
    const spots: { key: string; event: FieldEvent; side: Side; until: number; text: string }[] = [];
    let tickerUntil = 0;
    let goalUntil = 0;

    const showTicker = (html: string, now: number) => {
      ticker.innerHTML = html;
      ticker.dataset.on = "true";
      ticker.classList.remove("ov-ticker-in");
      void ticker.offsetWidth; // restart the entrance animation
      ticker.classList.add("ov-ticker-in");
      tickerUntil = now + TICKER_MS;
    };

    const fire = (f: FieldEvent, now: number, time: number) => {
      const { exp: e } = live.current;
      const setup = e.memory.setup();
      if (!setup) return;
      const side: Side = f.teamId === setup.teams.home.team_id ? "home" : "away";
      const team = setup.teams[side];
      const who = f.playerId ? escape(shortName(e.memory.players().get(f.playerId)?.name ?? "")) : "";
      const minute = minuteOf(f.clock);

      if (f.kind === "goal") {
        stage.celebrate(side, f.period, time, calm);
        // The score after this goal, from the goals up to it
        const goals = e.memory.fieldEvents().filter((g) => g.kind === "goal" && g.ms <= f.ms);
        const home = goals.filter((g) => g.teamId === setup.teams.home.team_id).length;
        const away = goals.length - home;
        goalBanner.innerHTML =
          `<div class="ov-goal-word" style="--team:${team.colours.primary};--team2:${team.colours.secondary}">GOAL</div>` +
          `<div class="ov-goal-line"><b>${who}</b> ${minute}${f.penalty ? " (pen)" : ""} · ${escape(team.name)}</div>` +
          `<div class="ov-goal-score">${home} – ${away}</div>`;
        goalBanner.classList.remove("ov-goal-on");
        void goalBanner.offsetWidth;
        goalBanner.classList.add("ov-goal-on");
        goalUntil = now + GOAL_MS;
        if (e.showEvents) showTicker(`<span class="ov-tk-icon">⚽</span><b>${minute}</b> Goal · ${who} · ${escape(team.name)}`, now);
        return;
      }
      if (!e.showEvents) return;
      stage.markEvent(f, side, time);
      const label =
        f.kind === "card" ? (f.card === "yellow" ? "Yellow card" : f.card === "second_yellow" ? "Second yellow · red" : "Red card") : FIELD_EVENT_LABELS[f.kind];
      const icon =
        f.kind === "card"
          ? `<span class="ov-tk-card" data-c="${f.card === "yellow" ? "y" : "r"}"></span>`
          : `<span class="ov-tk-icon">${ICONS[f.kind]}</span>`;
      const detail = f.kind === "card" || f.kind === "offside" || f.kind === "foul" ? who : escape(team.name);
      showTicker(`${icon}<b>${minute}</b> ${label}${detail ? ` · ${detail}` : ""}`, now);
      spots.push({ key: `ev:${f.id}`, event: f, side, until: now + EVENT_LABEL_MS, text: `${icon}${label}` });
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
      const time = (now - start) / 1000;
      const fieldEvents = e.memory.fieldEvents();
      const bookings = sample ? bookingsAt(fieldEvents, sample.matchMs) : new Map();

      // The ball in 3D: a shot in flight, or the smoothed tracked path
      let ball: BallPoint | null = null;
      let trail: string | null = null;
      if (sample) {
        const setup = e.memory.setup();
        const crossedFrom = now - lastFrameAt < MAX_FRAME_GAP_MS ? lastPlayhead : sample.matchMs - FRESH_MS;
        if (sample.matchMs < lastPlayhead - 5000) {
          shotsFlown.clear();
          flights = [];
        }
        if (setup) {
          for (const shot of e.memory.shots()) {
            if (shot.match_ms > sample.matchMs || shotsFlown.has(shot.event_id)) continue;
            shotsFlown.add(shot.event_id);
            if (shot.match_ms <= crossedFrom || !shot.team_id) continue;
            const side: Side = shot.team_id === setup.teams.home.team_id ? "home" : "away";
            const f = shotFlight(shot, attacksEast(side, shot.period) ?? side === "home");
            if (f) flights.push(f);
          }
        }
        flights = flights.filter((f) => f.endMs >= sample.matchMs);
        const flying = flights.find((f) => f.startMs <= sample.matchMs);
        if (flying) {
          ball = flightAt(flying, sample.matchMs);
          trail = SHOT_TRAIL[flying.outcome];
        } else {
          ball = e.ballTrack.at(sample.matchMs);
          trail = ball && ball.z > AIRBORNE_M ? "#ffffff" : null;
        }
      }
      stage.update({ sample, story: e.story, memory: e.memory, highlight: ring, bookings, dt, time, analysis: e.analysis, ball, trail });

      if (sample) {
        // A replay that restarts or jumps back: everything before the playhead is history again
        if (sample.matchMs < lastPlayhead - 5000) fired.clear();
        // An event fires when the playhead crosses it between two frames (whatever the frame rate), unless the page
        // was away for a while; on the first frame only events within FRESH_MS count, so a catch-up is history
        const crossedFrom = now - lastFrameAt < MAX_FRAME_GAP_MS ? lastPlayhead : sample.matchMs - FRESH_MS;
        for (const f of fieldEvents) {
          if (f.ms > sample.matchMs || fired.has(f.id)) continue;
          fired.add(f.id);
          if (f.ms > crossedFrom && sample.rate > 0) fire(f, now, time);
        }
        lastPlayhead = sample.matchMs;
        lastFrameAt = now;
      }
      if (now > tickerUntil && ticker.dataset.on === "true") ticker.dataset.on = "false";
      if (now > goalUntil) goalBanner.classList.remove("ov-goal-on");

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
          // A booked player's label sits above the card over his head
          const at = stage.project(w.x, bookings.has(id) ? CARD_Y + 1.1 : 2.25 * FIGURE_SCALE, w.z);
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
        if (e.analysis && s?.kind === "protect" && s.side) {
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
      // Short labels at the spot of each fresh event
      for (let i = spots.length - 1; i >= 0; i--) {
        const sp = spots[i];
        if (now > sp.until || !sample) {
          spots.splice(i, 1);
          continue;
        }
        const east = attacksEast(sp.side, sp.event.period) ?? sp.side === "home";
        const pt = teamToPitch({ x: sp.event.x, y: sp.event.y }, east);
        const w = toWorld(pt.x, pt.y);
        const at = stage.project(w.x, 0, w.z);
        if (!at) continue;
        const el = label(sp.key, "ov-spot");
        el.innerHTML = sp.text;
        el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -150%)`;
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
      <div ref={goalRef} className="ov-goal pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        ref={tickerRef}
        className="ov-ticker pointer-events-none absolute left-1/2 top-[58px] -translate-x-1/2 sm:left-auto sm:right-4 sm:top-[108px] sm:translate-x-0"
        role="status"
        aria-live="polite"
        data-on="false"
      />
      <div className="ov-stage-fallback pointer-events-none absolute inset-0 hidden place-items-center text-sm text-white/60">
        This browser can&apos;t draw the 3D pitch (WebGL is off).
      </div>
      {children}
    </div>
  );
}
