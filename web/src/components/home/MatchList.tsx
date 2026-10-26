"use client";

// MatchList.tsx — Every match in the archive
//
// Purpose: live matches first, then finished ones, as cards: both clubs, the score, the clock or "Full time", and
//          links to watch live, replay or read the recap
// Inputs:  GET /api/matches (polled)
// Outputs: UI
// Spec:    web/specs/screens.md §5

import Link from "next/link";
import { useEffect, useState } from "react";
import { listMatches } from "@/lib/api";
import type { MatchListItem } from "@/lib/match-list";

export function MatchList() {
  const [matches, setMatches] = useState<MatchListItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () =>
      listMatches()
        .then((l) => {
          if (stop) return;
          setMatches(l);
          setError(false);
        })
        .catch(() => !stop && setError(true));
    load();
    const id = setInterval(load, 6000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-[26px] font-black tracking-tight">Matches</h1>
        <span className="h-px flex-1 bg-ink/[0.06]" />
        <span className="ov-sub">{matches ? `${matches.length} in the archive` : "loading"}</span>
      </div>
      {error && <p className="ov-card p-6 text-ink/60">Can&apos;t reach the match archive. Is the local stack running?</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(matches ?? []).map((m) => (
          <article key={m.match_id} className="ov-card flex flex-col gap-3 p-4 transition-colors hover:border-ink/15">
            <div className="flex items-center justify-between">
              <span className="ov-sub">{m.match_id}</span>
              {m.status === "live" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[9.5px] font-black uppercase tracking-[1px] text-accent">
                  <span className="ov-live-dot" /> {m.clock ?? "Live"}
                </span>
              ) : (
                <span className="font-mono text-[9.5px] font-black uppercase tracking-[1px] text-ink/40">Full time</span>
              )}
            </div>
            {(["home", "away"] as const).map((s) => (
              <div key={s} className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-ink/85">{m[s].name}</span>
                <span className="font-mono text-[18px] font-black tabular">{m.score ? m.score[s] : "–"}</span>
              </div>
            ))}
            <div className="mt-1 flex gap-2">
              <Link href={`/match/${m.match_id}`} className="rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-on-accent hover:bg-accent/90">
                {m.status === "live" ? "Watch live" : "Watch replay"}
              </Link>
              {m.status === "finished" && (
                <Link href={`/match/${m.match_id}/recap`} className="rounded-full border border-ink/10 px-3.5 py-1.5 text-[12.5px] font-bold text-ink/70 hover:text-ink">
                  Recap
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
