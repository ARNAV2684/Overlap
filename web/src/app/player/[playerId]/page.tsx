// page.tsx — One player's scout card
//
// Purpose: who a player is (role, foot, the twelve attributes) and what they did (per-90 output against their
//          position group, maps), so a fan or a scout can judge them
// Inputs:  the season document through src/lib/server/season-store.ts
// Outputs: page (404 for an unknown player or one of a reference club)
// Spec:    web/specs/screens.md §10

import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PLAYER_ID, playerView } from "@/lib/season";
import { readSeason } from "@/lib/server/season-store";
import { PlayerScreen } from "@/components/season/PlayerScreen";

export const metadata: Metadata = { title: "Player" };

const SEASON = "S1";
type Props = { params: Promise<{ playerId: string }> };

async function player(playerId: string) {
  "use cache";
  const read = await readSeason(SEASON);
  return read.ok ? playerView(read.doc, playerId) : null;
}

export default function PlayerPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6"><div className="viz-card min-h-[60vh]" /></main>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: Props) {
  const { playerId } = await params;
  const view = PLAYER_ID.test(playerId) ? await player(playerId) : null;
  if (!view) notFound();
  return <PlayerScreen view={view} />;
}
