"use client";

// MatchScreen.tsx — The match, live or replayed
//
// Purpose: lay out the whole match experience: the score header, the Watch / Analyse switch, the 3D pitch with its
//          story and AI card, replay controls, the tracking heatmap, the viewer's choices, the AI feed, the followed
//          player, and the analytics under the pitch
// Inputs:  providers above it (a stream or replay provider, then MatchExperienceProvider); `intro` above the header
// Outputs: UI
// Spec:    web/specs/screens.md §2

import { useState, type ReactNode } from "react";
import type { ReplaySpeed } from "@/lib/replay-player";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { PitchStage } from "@/components/pitch3d/PitchStage";
import { AiFeed } from "./AiFeed";
import { LiveRail } from "./LiveRail";
import { AnalysisPanel, TAB_FOR_COMPONENT, type Focus } from "./AnalysisPanel";
import { PitchOverlay, PitchUnderlay } from "./PitchOverlay";
import { PlayerFocus } from "./PlayerFocus";
import { ReplayBar } from "./ReplayBar";
import { ScoreHeader } from "./ScoreHeader";
import { ViewerBar } from "./ViewerBar";

/** Watch is the clean pitch; Analyse adds the story director's overlays. */
function ModeSwitch() {
  const { analysis, setAnalysis, source } = useExperience();
  const option = (on: boolean) =>
    `rounded-[9px] px-4 py-1.5 text-[12.5px] font-bold transition-colors ${on ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/80"}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="ov-eyebrow">Match centre</p>
        <p className="ov-sub mt-1">{source === "live" ? "Live tracking" : "Recorded tracking"}</p>
      </div>
      <div className="flex shrink-0 rounded-[12px] bg-ink/[0.05] p-1" role="group" aria-label="Presentation mode">
        <button type="button" className={option(!analysis)} aria-pressed={!analysis} onClick={() => setAnalysis(false)} title="The clean pitch">
          Watch
        </button>
        <button type="button" className={option(analysis)} aria-pressed={analysis} onClick={() => setAnalysis(true)} title="The pitch tells the story">
          Analyse
        </button>
      </div>
    </div>
  );
}

export function MatchScreen({ intro, initialSpeed }: { intro?: ReactNode; initialSpeed?: ReplaySpeed }) {
  const { source } = useExperience();
  const { current } = useFeed();
  const [prefs] = usePreferences();
  const [focus, setFocus] = useState<Focus>(null);

  // Ring the player the current AI card is about, and the followed player
  const highlight = [current?.visual?.highlight?.player_id, prefs.player].filter((x): x is string => Boolean(x));

  const showChart = (component: string, eventId?: string) => {
    // Every card opens the analysis tab of its visual (a heatmap card: Players, with the tracking heatmap)
    const tab = TAB_FOR_COMPONENT[component];
    if (tab) setFocus({ tab, eventId, nonce: Date.now() });
    document.getElementById("analytics")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 pb-16 pt-4 sm:px-6 sm:pt-6">
      {intro}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="ov-card overflow-hidden">
            <ScoreHeader />
          </div>
          <ModeSwitch />
          <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] border border-ink/[0.06] sm:aspect-auto sm:h-[64vh] sm:min-h-[460px] xl:h-[68vh]">
            <PitchStage highlight={highlight}>
              <PitchOverlay onShowChart={showChart} />
              {source === "replay" && (
                <div className="pointer-events-none absolute bottom-2 right-2 sm:bottom-4 sm:right-4">
                  <ReplayBar initialSpeed={initialSpeed} />
                </div>
              )}
            </PitchStage>
          </div>
          <PitchUnderlay />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <ViewerBar />
          <LiveRail />
          <PlayerFocus />
          <AiFeed onShowChart={showChart} />
        </aside>
      </div>
      <div id="analytics" className="scroll-mt-20">
        <AnalysisPanel focus={focus} />
      </div>
    </main>
  );
}
