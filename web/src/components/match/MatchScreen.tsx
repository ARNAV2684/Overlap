"use client";

// MatchScreen.tsx — The match, live or replayed
//
// Purpose: lay out the whole match experience: the score header, the 3D pitch with its story and AI card, replay
//          controls, the viewer's choices, the AI feed, the followed player, and the analytics under the pitch
// Inputs:  providers above it (a stream or replay provider, then MatchExperienceProvider); `intro` above the header
// Outputs: UI
// Spec:    web/specs/screens.md §2

import { useState, type ReactNode } from "react";
import type { ReplaySpeed } from "@/lib/replay-player";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { PitchStage } from "@/components/pitch3d/PitchStage";
import { AiFeed } from "./AiFeed";
import { AnalysisPanel, TAB_FOR_COMPONENT, type Focus } from "./AnalysisPanel";
import { PitchOverlay, PitchUnderlay } from "./PitchOverlay";
import { PlayerFocus } from "./PlayerFocus";
import { ReplayBar } from "./ReplayBar";
import { ScoreHeader } from "./ScoreHeader";
import { ViewerBar } from "./ViewerBar";
import { TrackingHeatPanel } from "./TrackingHeatPanel";

export function MatchScreen({ intro, initialSpeed }: { intro?: ReactNode; initialSpeed?: ReplaySpeed }) {
  const { source } = useExperience();
  const { current } = useFeed();
  const [prefs] = usePreferences();
  const [focus, setFocus] = useState<Focus>(null);
  const [analysis, setAnalysis] = useState(false);

  // Ring the player the current AI card is about, and the followed player
  const highlight = [current?.visual?.highlight?.player_id, prefs.player].filter((x): x is string => Boolean(x));

  const showChart = (component: string, eventId?: string) => {
    const tab = TAB_FOR_COMPONENT[component];
    if (tab) setFocus({ tab, eventId, nonce: Date.now() });
    document.getElementById("analytics")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 pb-16 pt-4 sm:px-6 sm:pt-6">
      {intro}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="ov-broadcast-score">
            <ScoreHeader />
          </div>
          <div className="ov-broadcast-toolbar">
            <div><span className="ov-broadcast-kicker">MATCH CENTRE</span><span className="ov-broadcast-subtitle">Synthetic football · {source === "live" ? "live tracking" : "recorded tracking"}</span></div>
            <div className="ov-mode-switch" role="group" aria-label="Presentation mode">
              <button type="button" aria-pressed={!analysis} onClick={() => setAnalysis(false)}>Watch</button>
              <button type="button" aria-pressed={analysis} onClick={() => setAnalysis(true)}>Analyse</button>
            </div>
          </div>
          <div className="ov-broadcast-pitch relative aspect-[4/3] overflow-hidden sm:aspect-[16/10]">
            <PitchStage highlight={highlight} analysis={analysis}>
              <PitchOverlay analysis={analysis} />
              {source === "replay" && (
                <div className="pointer-events-none absolute bottom-2 right-2 sm:bottom-4 sm:right-4">
                  <ReplayBar initialSpeed={initialSpeed} />
                </div>
              )}
            </PitchStage>
          </div>
          <PitchUnderlay analysis={analysis} />
          <TrackingHeatPanel />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <ViewerBar />
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
