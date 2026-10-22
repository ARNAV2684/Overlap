"use client";

// MatchById.tsx — Open one match by its id
//
// Purpose: decide live or replay for /match/<id> (the archive's status says which) and render the session; /replay/<id>
//          always replays
// Inputs:  matchId, forceReplay
// Outputs: UI
// Spec:    web/specs/screens.md §2

import Link from "next/link";
import { useEffect, useState } from "react";
import { listMatches } from "@/lib/api";
import { MatchSession } from "./MatchSession";

export function MatchById({ matchId, forceReplay = false }: { matchId: string; forceReplay?: boolean }) {
  const [source, setSource] = useState<"live" | "replay" | null>(forceReplay ? "replay" : null);

  useEffect(() => {
    if (forceReplay) return;
    let stop = false;
    listMatches()
      .then((list) => {
        if (stop) return;
        const m = list.find((x) => x.match_id === matchId);
        setSource(m?.status === "live" ? "live" : "replay");
      })
      .catch(() => !stop && setSource("live"));
    return () => {
      stop = true;
    };
  }, [matchId, forceReplay]);

  if (!source) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="ov-card grid min-h-[60vh] place-items-center text-ink/50">Opening {matchId}…</div>
      </main>
    );
  }
  return (
    <MatchSession
      key={`${source}:${matchId}`}
      matchId={matchId}
      source={source}
      initialSpeed={5}
      intro={
        <div className="flex items-center justify-between">
          <Link href="/matches" className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-ink/40 hover:text-ink">
            ← All matches
          </Link>
          {source === "replay" && (
            <Link href={`/match/${matchId}/recap`} className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-ink/40 hover:text-ink">
              Recap →
            </Link>
          )}
        </div>
      }
    />
  );
}
