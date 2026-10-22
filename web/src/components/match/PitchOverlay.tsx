"use client";

// PitchOverlay.tsx — Everything drawn in HTML on top of the 3D pitch
//
// Purpose: the story caption (what the pitch is showing and the number behind it), the story chips to pin a story,
//          the camera switch, and the AI moment card when one is due
// Inputs:  the match experience (story, feed, view) and preferences
// Outputs: UI, absolutely positioned inside PitchStage
// Spec:    web/specs/screens.md §2.2–§2.3

import { overlayText } from "@/lib/live/insights";
import type { StoryKind } from "@/lib/live/story";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";

const STORY_LABEL: Record<StoryKind, string> = { territory: "Territory", protect: "Team shape", attack: "Pass network" };
const STORY_HINT: Record<StoryKind, string> = {
  territory: "Who owns the pitch",
  protect: "Lines linked, back to front",
  attack: "Who passes to whom, and the lane",
};

export const COMPONENT_LABEL: Record<string, string> = {
  shot_map: "Shot map",
  key_events: "Key events",
  momentum_tide: "Momentum",
  pressing_zones: "Pressing",
  stat_bars: "Team stats",
  pass_network: "Pass network",
  heatmap_zones: "Heatmap",
};

export function VerifiedBadge({ verified, fallback }: { verified: boolean; fallback: boolean }) {
  if (verified)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#4ade80]/15 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[1px] text-[#4ade80]">
        ✓ Numbers verified
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[1px] text-white/60">
      {fallback ? "Template · checked" : "Unverified"}
    </span>
  );
}

function StoryCaption() {
  const { story } = useExperience();
  const { setup } = useScoreboard();
  if (!story) return null;
  const team = story.side && setup ? setup.teams[story.side] : null;
  return (
    <div className="ov-rise pointer-events-auto max-w-[min(440px,calc(100%-24px))] rounded-[14px] border border-white/10 bg-[#0e0e10]/80 p-3.5 text-white backdrop-blur-md sm:p-4" key={`${story.kind}-${story.side}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9.5px] font-black uppercase tracking-[2px] text-white/45">{STORY_LABEL[story.kind]}</span>
        {team && <span className="h-2 w-2 rounded-full" style={{ background: team.colours.primary, boxShadow: `0 0 0 2px ${team.colours.secondary}55` }} />}
      </div>
      <div className="mt-1 flex items-end justify-between gap-4">
        <h3 className="text-[17px] font-extrabold leading-tight tracking-tight sm:text-[19px]">{story.title}</h3>
        {story.metric && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-[22px] font-black leading-none text-accent tabular">{story.metric.value}</p>
            <p className="mt-1 font-mono text-[8.5px] font-bold uppercase tracking-[1.4px] text-white/40">{story.metric.label}</p>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-white/70">{story.detail}</p>
    </div>
  );
}

function StoryChips() {
  const { pinned, setPinned, view, setView } = useExperience();
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[1.2px] transition-colors ${
      active ? "bg-white text-[#0e0e10]" : "text-white/65 hover:text-white"
    }`;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-full border border-white/10 bg-[#0e0e10]/70 p-1 backdrop-blur-md" role="group" aria-label="What the pitch shows">
        <button type="button" className={chip(pinned === null)} onClick={() => setPinned(null)} aria-pressed={pinned === null} title="The story director picks">
          Auto
        </button>
        {(Object.keys(STORY_LABEL) as StoryKind[]).map((k) => (
          <button key={k} type="button" className={chip(pinned === k)} onClick={() => setPinned(k)} aria-pressed={pinned === k} title={STORY_HINT[k]}>
            {STORY_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="flex rounded-full border border-white/10 bg-[#0e0e10]/70 p-1 backdrop-blur-md" role="group" aria-label="Camera">
        {(["broadcast", "close", "tactical"] as const).map((v) => (
          <button key={v} type="button" className={chip(view === v)} onClick={() => setView(v)} aria-pressed={view === v}>
            {v === "broadcast" ? "Wide" : v === "close" ? "Close" : "Top"}
          </button>
        ))}
      </div>
    </div>
  );
}

function MomentPopup() {
  const { current } = useFeed();
  const { mode } = useExperience();
  const [prefs] = usePreferences();
  if (!current) return null;
  const text = overlayText(current, mode, prefs.lang);
  const high = current.priority === "high";
  return (
    <div
      key={current.overlay_id}
      className="ov-rise pointer-events-auto w-[min(400px,calc(100%-24px))] overflow-hidden rounded-[14px] border border-white/10 bg-[#0e0e10]/85 text-white shadow-2xl backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className={`h-[3px] ${high ? "bg-accent" : "bg-white/30"}`} />
      <div className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[1px] text-white">{current.clock.split(":")[0]}′ · AI moment</span>
          <VerifiedBadge verified={current.verified} fallback={current.fallback} />
          {current.visual && <span className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-white/40">{COMPONENT_LABEL[current.visual.component] ?? current.visual.component}</span>}
        </div>
        <p className="mt-2 text-[15px] font-semibold leading-snug sm:text-[16px]">{text}</p>
      </div>
    </div>
  );
}

export function PitchOverlay() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        <MomentPopup />
        <div className="ml-auto">
          <StoryChips />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3 sm:inset-x-4 sm:bottom-4">
        <StoryCaption />
      </div>
    </>
  );
}
