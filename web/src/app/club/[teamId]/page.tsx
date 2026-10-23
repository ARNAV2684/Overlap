// page.tsx — One club's season
//
// Purpose: how a club plays across the season: Club DNA (designed against measured), where it presses, its chances
//          for and against, when its goals come, and its squad
// Inputs:  the season document through src/lib/server/season-store.ts
// Outputs: page (404 for an unknown club or a reference club)
// Spec:    web/specs/screens.md §9

import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TEAM_ID, teamView } from "@/lib/season";
import { readSeason } from "@/lib/server/season-store";
import { ClubScreen } from "@/components/season/ClubScreen";

export const metadata: Metadata = { title: "Club" };

const SEASON = "S1";
type Props = { params: Promise<{ teamId: string }> };

async function club(teamId: string) {
  "use cache";
  const read = await readSeason(SEASON);
  return read.ok ? teamView(read.doc, teamId) : null;
}

export default function ClubPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6"><div className="viz-card min-h-[60vh]" /></main>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: Props) {
  const { teamId } = await params;
  const view = TEAM_ID.test(teamId) ? await club(teamId) : null;
  if (!view) notFound();
  return <ClubScreen view={view} />;
}
