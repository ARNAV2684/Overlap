"use client";

// PitchOverlay.tsx — Everything drawn in HTML on top of the 3D pitch
//
// Purpose: the story caption (what the pitch is showing and the number behind it), the story chips to pin a story,
//          the camera switch, and the AI moment card when one is due
// Inputs:  the match experience (story, feed, view) and preferences
// Outputs: UI, absolutely positioned inside PitchStage
// Spec:    web/specs/screens.md §2.2–§2.3

import { useEffect, useState } from "react";
import { keyNumber, overlayText } from "@/lib/live/insights";
import { CHART_LABEL } from "@/lib/live/live-insights";
import type { Story, StoryKind } from "@/lib/live/story";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { KindChip, SourceBadge } from "./MomentStrip";

const STORY_LABEL: Record<StoryKind, string> = { territory: "Territory", protect: "Team shape", attack: "Pass network" };
const STORY_HINT: Record<StoryKind, string> = {
  territory: "Who owns the pitch",
  protect: "Lines linked, back to front",
  attack: "Who passes to whom, and the lane",
};

/**
 * Attack by flank, folded: three small lanes (left, centre, right as the team faces the goal), each filled to its
 * share, the main lane brightest, so the split stays readable after the caption folds.
 */
export function FlankBar({ flanks, channel }: { flanks: NonNullable<Story["flanks"]>; channel?: Story["channel"] }) {
  const label = flanks.map((f) => `${f.channel} ${f.share}%`).join(", ");
  return (
    <span className="flex shrink-0 items-end gap-[3px]" role="img" aria-label={`Attack by flank: ${label}`} title={`Attack by flank: ${label}`}>
      {flanks.map((f) => (
        <span key={f.channel} className="flex flex-col items-center gap-[2px]">
          <span className="relative block h-[14px] w-[7px] overflow-hidden rounded-[2px] bg-white/[0.14]">
            <span
              className={`absolute inset-x-0 bottom-0 rounded-[2px] ${f.channel === channel ? "bg-viz-focus" : "bg-white/55"}`}
              style={{ height: `${Math.max(8, f.share)}%` }}
            />
          </span>
          <span className={`font-mono text-[7px] font-black leading-none ${f.channel === channel ? "text-white" : "text-white/45"}`}>
            {f.channel[0].toUpperCase()}
          </span>
        </span>
      ))}
    </span>
  );
}

/** How long the caption stays open over the pitch before it folds to a one-line pill (ms). */
const CAPTION_OPEN_MS = 5000;

/**
 * What the pitch is showing. Over the pitch (`collapsible`) it is light glass and folds to a one-line pill after a
 * few seconds so the field stays visible; hovering, focusing or tapping it opens it again. Under the pitch (phones)
 * it stays open.
 */
export function StoryCaption({ collapsible = false }: { collapsible?: boolean }) {
  const { story } = useExperience();
  const { setup } = useScoreboard();
  if (!story) return null;
  const team = story.side && setup ? setup.teams[story.side] : null;
  // A new story starts open again (the key remounts the card)
  return <CaptionCard key={`${story.kind}-${story.side}`} story={story} team={team} collapsible={collapsible} />;
}

function CaptionCard({
  story,
  team,
  collapsible,
}: {
  story: NonNullable<ReturnType<typeof useExperience>["story"]>;
  team: { colours: { primary: string; secondary: string } } | null;
  collapsible: boolean;
}) {
  const [folded, setFolded] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!collapsible) return;
    const id = setTimeout(() => setFolded(true), CAPTION_OPEN_MS);
    return () => clearTimeout(id);
  }, [collapsible]);
  const open = !collapsible || !folded || hover;
  const dot = team && (
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: team.colours.primary, boxShadow: `0 0 0 2px ${team.colours.secondary}55` }} />
  );

  if (!open) {
    return (
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onFocus={() => setHover(true)}
        onClick={() => setHover(true)}
        className="ov-fade-in pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-[#0e0e10]/45 px-3 py-1.5 text-white backdrop-blur-sm"
        aria-label={`${story.title}. Show details`}
      >
        <span className="font-mono text-[9px] font-black uppercase tracking-[1.6px] text-white/55">{STORY_LABEL[story.kind]}</span>
        {dot}
        <span className="truncate text-[12px] font-bold">{story.title}</span>
        {story.metric && <span className="font-mono text-[12px] font-black text-accent tabular">{story.metric.value}</span>}
        {story.flanks && <FlankBar flanks={story.flanks} channel={story.channel} />}
      </button>
    );
  }

  return (
    <div
      onMouseLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
      className={`ov-rise pointer-events-auto w-full rounded-[14px] border border-white/10 p-3 text-white sm:w-auto sm:max-w-[380px] ${
        collapsible ? "bg-[#0e0e10]/45 backdrop-blur-sm" : "bg-[#0e0e10]/90 backdrop-blur-md"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-black uppercase tracking-[2px] text-white/55">{STORY_LABEL[story.kind]}</span>
        {dot}
      </div>
      <div className="mt-1 flex items-end justify-between gap-4">
        <h3 className="text-[15px] font-extrabold leading-tight tracking-tight [text-shadow:0_1px_6px_rgb(0_0_0/0.5)] sm:text-[16px]">{story.title}</h3>
        {story.metric && (
          <div className="shrink-0 text-right">
            <p className="font-mono text-[18px] font-black leading-none text-accent tabular">{story.metric.value}</p>
            <p className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[1.4px] text-white/50">{story.metric.label}</p>
          </div>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-white/75 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)]">{story.detail}</p>
      {story.flanks && (
        <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Attack by flank">
          {story.flanks.map((f) => (
            <div key={f.channel} className={`rounded-[8px] px-2 py-1.5 ${f.channel === story.channel ? "bg-white/[0.16]" : "bg-white/[0.06]"}`}>
              <p className="font-mono text-[8px] font-bold uppercase tracking-[1.4px] text-white/50">{f.channel}</p>
              <p className="font-mono text-[14px] font-black leading-tight tabular">{f.share}%</p>
              {f.shots !== null && (
                <p className="font-mono text-[9px] text-white/60 tabular">
                  {f.shots} sh · {f.xg?.toFixed(2)} xG
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StoryChips() {
  const { pinned, setPinned, view, setView, showEvents, setShowEvents, analysis } = useExperience();
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[1.2px] transition-colors ${
      active ? "bg-white text-[#0e0e10]" : "text-white/65 hover:text-white"
    }`;
  return (
    <div className="pointer-events-auto flex items-center gap-2 sm:flex-wrap sm:justify-end">
      {analysis && (
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
      )}
      <div className="flex rounded-full border border-white/10 bg-[#0e0e10]/70 p-1 backdrop-blur-md" role="group" aria-label="Camera">
        {(["broadcast", "close", "tactical"] as const).map((v) => (
          <button key={v} type="button" className={chip(view === v)} onClick={() => setView(v)} aria-pressed={view === v}>
            {v === "broadcast" ? "Wide" : v === "close" ? "Close" : "Top"}
          </button>
        ))}
      </div>
      <div className="flex rounded-full border border-white/10 bg-[#0e0e10]/70 p-1 backdrop-blur-md">
        <button
          type="button"
          className={chip(showEvents)}
          onClick={() => setShowEvents(!showEvents)}
          aria-pressed={showEvents}
          title="Corners, throw-ins, free kicks, goal kicks, offsides and fouls on the pitch"
        >
          Events
        </button>
      </div>
    </div>
  );
}

/** A tiny bar-chart glyph for the chart chip. */
function ChartGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
      <rect x="0.5" y="5" width="2" height="4.5" rx="0.4" fill="currentColor" />
      <rect x="4" y="2.5" width="2" height="7" rx="0.4" fill="currentColor" />
      <rect x="7.5" y="0.5" width="2" height="9" rx="0.4" fill="currentColor" />
    </svg>
  );
}

/**
 * The AI moment card in the visual kit's style: the minute and badge, the plain sentence with its key number picked
 * out in the focus blue (and shown big beside it), and a small chip for the chart it points to.
 */
function MomentPopup({ onShowChart }: { onShowChart?: (component: string, eventId?: string) => void }) {
  const { current } = useFeed();
  const { mode } = useExperience();
  const [prefs] = usePreferences();
  if (!current) return null;
  const text = overlayText(current, mode, prefs.lang);
  const key = keyNumber(text);
  const high = current.priority === "high";
  const visual = current.visual;
  return (
    <div
      key={current.overlay_id}
      className="ov-rise pointer-events-auto w-[min(360px,calc(100%-24px))] overflow-hidden rounded-[14px] border border-white/10 bg-[#0b0d12]/60 text-white backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className={`h-[3px] ${high ? "bg-accent" : "bg-viz-focus"}`} />
      <div className="p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-mono text-[11px] font-black tabular ${high ? "text-accent" : "text-white/80"}`}>{current.clock.split(":")[0]}′</span>
          <KindChip card={current} tone="dark" />
          <SourceBadge card={current} tone="dark" />
        </div>
        <div className="mt-2 flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
            {key ? (
              <>
                {key.before}
                <span className="font-mono font-black text-viz-focus">{key.number}</span>
                {key.after}
              </>
            ) : (
              text
            )}
          </p>
          {key && <p className="shrink-0 font-mono text-[26px] font-black leading-none text-viz-focus tabular">{key.number}</p>}
        </div>
        {visual && (
          <button
            type="button"
            onClick={() => onShowChart?.(visual.component, visual.highlight?.event_id)}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[1.2px] text-white/75 transition-colors hover:bg-white/[0.14] hover:text-white"
            title="Open this chart in the analysis below"
          >
            <ChartGlyph />
            {CHART_LABEL[visual.component] ?? visual.component}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Over the pitch on tablets and up; on phones the chips and caption sit under the pitch (PitchUnderlay). */
export function PitchOverlay({ onShowChart }: { onShowChart?: (component: string, eventId?: string) => void } = {}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        <MomentPopup onShowChart={onShowChart} />
        <div className="ml-auto hidden sm:block">
          <StoryChips />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 hidden items-end justify-between gap-3 sm:flex">
        <StoryCaptionIfAnalysing collapsible />
      </div>
    </>
  );
}

export function PitchUnderlay() {
  return (
    <div className="flex flex-col gap-3 sm:hidden">
      <div className="overflow-x-auto rounded-[14px] bg-[#0e0e10] p-2">
        <StoryChips />
      </div>
      <StoryCaptionIfAnalysing />
    </div>
  );
}

/** The caption belongs to Analyse; Watch is the clean pitch. */
function StoryCaptionIfAnalysing({ collapsible = false }: { collapsible?: boolean }) {
  const { analysis } = useExperience();
  return analysis ? <StoryCaption collapsible={collapsible} /> : null;
}
