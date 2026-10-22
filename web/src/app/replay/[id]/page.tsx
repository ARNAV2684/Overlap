// page.tsx — Replay
//
// Purpose: play a finished, archived match at 1×, 5× or 20× on the live screen's panels
// Inputs:  params.id (the match id, SYN-NNNN)
// Outputs: a page. An id that is not SYN-NNNN shows the not-found page
// Spec:    web/specs/screens.md §1 (replay screen), web/specs/realtime.md §5. Plan: plans/active/PLAN_web_replay.md
//
// With Cache Components, params is only known at request time, so it is read inside <Suspense>. The fallback is the
// same screen in its "Loading" state, which Next prerenders as the static shell.

import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ReplayFallback, ReplayMatchView } from "@/components/replay/ReplayMatchView";
import { ReplayProvider } from "@/components/replay/ReplayProvider";
import { isMatchId } from "@/lib/contracts";

type ReplayPageProps = { params: Promise<{ id: string }> };

/** The root layout's title says "Live stream"; a replay must not. */
export const metadata: Metadata = { title: "Overlap · Replay" };

export default function ReplayPage({ params }: ReplayPageProps) {
  return (
    <Suspense fallback={<ReplayFallback />}>
      <Replay params={params} />
    </Suspense>
  );
}

async function Replay({ params }: ReplayPageProps) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return (
    <ReplayProvider matchId={id}>
      <ReplayMatchView />
    </ReplayProvider>
  );
}
