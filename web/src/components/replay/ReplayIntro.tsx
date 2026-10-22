"use client";

// ReplayIntro.tsx — Replay intro and source card
//
// Purpose: the replay screen's intro: eyebrow "Match archive", the page's one h1, the two clubs and the final score
//          once the manifest has loaded, and a source card so a replay is never mistaken for a live match
// Inputs:  ReplayIntro: the player's manifest (useReplayState()); ReplayIntroView: manifest or null
// Outputs: a div (IntroHero)
// Spec:    web/specs/screens.md §1 (replay screen)

import { IntroHero } from "@/components/layout/IntroHero";
import { useReplayState } from "@/components/replay/ReplayProvider";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { ReplayManifest } from "@/lib/replay-envelopes";

function ReplaySourceCard() {
  return (
    <Card className="p-4 sm:p-4">
      <Eyebrow>Source</Eyebrow>
      <p className="mt-1.5 text-body-sm font-medium text-ink">Match archive · stored by the archiver</p>
      <p className="mt-1 text-caption text-ink-muted">A finished match, replayed. Not a live stream.</p>
    </Card>
  );
}

/** The line under the title: "Northbridge FC 1–1 Harbour Athletic · final score". */
export function replaySummary(manifest: ReplayManifest | null): string {
  if (!manifest) return "Loading the match from the archive…";
  const { home, away } = manifest.setup.teams;
  const { score } = manifest.result;
  return `${home.name} ${score.home}–${score.away} ${away.name} · final score`;
}

export function ReplayIntroView({ manifest }: { manifest: ReplayManifest | null }) {
  return (
    <IntroHero
      eyebrow="Match archive"
      title="Replay a finished match."
      description={replaySummary(manifest)}
      aside={<ReplaySourceCard />}
    />
  );
}

export function ReplayIntro() {
  const { manifest } = useReplayState();
  return <ReplayIntroView manifest={manifest} />;
}
