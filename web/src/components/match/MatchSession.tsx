"use client";

// MatchSession.tsx — One match, live or replayed, with everything the screen needs
//
// Purpose: pick the provider for the source (the live stream or the archive replay), add the match experience on
//          top, and render the match screen
// Inputs:  matchId, source, the replay's starting speed, an optional intro and an onFrames callback (the home page
//          uses it to notice a live match that has stopped sending)
// Outputs: UI
// Spec:    web/specs/screens.md §2

import { useEffect, type ReactNode } from "react";
import type { ReplaySpeed } from "@/lib/replay-player";
import { useMatchStore } from "@/lib/store-hooks";
import { MatchExperienceProvider } from "@/providers/MatchExperience";
import { MatchStreamProvider } from "@/providers/MatchStreamProvider";
import { ReplayProvider } from "@/providers/ReplayProvider";
import { MatchScreen } from "./MatchScreen";

function FrameWatch({ onFrames }: { onFrames?: () => void }) {
  const store = useMatchStore();
  useEffect(() => {
    if (!onFrames) return;
    return store.onEnvelope((e, receivedAt) => {
      if (e.kind === "positions" && receivedAt !== null) onFrames();
    });
  }, [store, onFrames]);
  return null;
}

export function MatchSession({
  matchId,
  source,
  initialSpeed,
  intro,
  onFrames,
}: {
  matchId: string;
  source: "live" | "replay";
  initialSpeed?: ReplaySpeed;
  intro?: ReactNode;
  onFrames?: () => void;
}) {
  const screen = (
    <MatchExperienceProvider>
      <FrameWatch onFrames={onFrames} />
      <MatchScreen intro={intro} initialSpeed={initialSpeed} />
    </MatchExperienceProvider>
  );
  return source === "live" ? (
    <MatchStreamProvider matchId={matchId}>{screen}</MatchStreamProvider>
  ) : (
    <ReplayProvider matchId={matchId}>{screen}</ReplayProvider>
  );
}
