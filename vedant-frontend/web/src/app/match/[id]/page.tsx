// page.tsx — Live match screen
//
// Purpose: the live screen for one match: connects to its stream and shows it as it arrives
// Inputs:  params.id (the match id, SYN-NNNN)
// Outputs: a page. An id that is not SYN-NNNN shows the not-found page
// Spec:    web/specs/screens.md. web/IMPLEMENTATION_PLAN.md Phase 6
//
// Status: Phase 6 (frame: header, intro, notice, footer). Scoreboard, metrics, timeline, pitch and inspector arrive in
//         Phases 7 to 9; moment cards, stat panels, commentary and the agent trace come later.
//
// With Cache Components, params is only known at request time, so it is read inside <Suspense>. The fallback is the
// same frame in its "Connecting" state, which Next prerenders as the static shell.

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LiveMatchFallback, LiveMatchView } from "@/components/live/LiveMatchView";
import { MatchStreamProvider } from "@/components/live/MatchStreamProvider";
import { isMatchId } from "@/lib/contracts";

type MatchPageProps = { params: Promise<{ id: string }> };

export default function MatchPage({ params }: MatchPageProps) {
  return (
    <Suspense fallback={<LiveMatchFallback />}>
      <LiveMatch params={params} />
    </Suspense>
  );
}

async function LiveMatch({ params }: MatchPageProps) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return (
    <MatchStreamProvider matchId={id}>
      <LiveMatchView />
    </MatchStreamProvider>
  );
}
