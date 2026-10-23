// page.tsx — The league
//
// Purpose: the season at a glance: the table with expected points, the title race, how every club plays, leaders
// Inputs:  the season document through src/lib/server/season-store.ts (built by the stats engine)
// Outputs: page
// Spec:    web/specs/screens.md §8

import type { Metadata } from "next";
import { leagueView } from "@/lib/season";
import { readSeason } from "@/lib/server/season-store";
import { LeagueScreen } from "@/components/season/LeagueScreen";

export const metadata: Metadata = { title: "League" };

const SEASON = "S1";

async function league() {
  "use cache";
  const read = await readSeason(SEASON);
  return read.ok ? leagueView(read.doc) : null;
}

export default async function LeaguePage() {
  const view = await league();
  if (!view) {
    return (
      <main className="mx-auto max-w-[900px] px-4 py-16 text-center text-ink/60">
        The season hasn&apos;t been built yet. Run <code className="font-mono">python main.py season</code> in{" "}
        <code className="font-mono">stats/</code> (stats/specs/season.md).
      </main>
    );
  }
  return <LeagueScreen view={view} />;
}
