// page.tsx — Compare two players
//
// Purpose: two players side by side: scout cards, one radar for both (the first player's group) and per-90 values
// Inputs:  ?a=<playerId>&b=<playerId>; the season document through src/lib/server/season-store.ts
// Outputs: page
// Spec:    web/specs/screens.md §11

import type { Metadata } from "next";
import { Suspense } from "react";
import { PLAYER_ID, playerView } from "@/lib/season";
import { readSeason } from "@/lib/server/season-store";
import { CompareScreen } from "@/components/season/CompareScreen";

export const metadata: Metadata = { title: "Compare players" };

const SEASON = "S1";
type Props = { searchParams: Promise<{ a?: string; b?: string }> };

async function views(a: string, b: string | null) {
  "use cache";
  const read = await readSeason(SEASON);
  if (!read.ok) return null;
  return { a: playerView(read.doc, a), b: b ? playerView(read.doc, b) : null };
}

export default function ComparePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6"><div className="viz-card min-h-[60vh]" /></main>}>
      <Resolved searchParams={searchParams} />
    </Suspense>
  );
}

async function Resolved({ searchParams }: Props) {
  const { a, b } = await searchParams;
  const loaded = a && PLAYER_ID.test(a) ? await views(a, b && PLAYER_ID.test(b) ? b : null) : null;
  if (!loaded?.a) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-16 text-center text-ink/60">
        Open a player from the league or a club, then choose &ldquo;Compare with…&rdquo;.
      </main>
    );
  }
  return <CompareScreen a={loaded.a} b={loaded.b} />;
}
