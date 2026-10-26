"use client";

// RecapView.tsx — A finished match, told after the fact
//
// Purpose: the final score, the agents' full-time recap and every moment card of the match, in the viewer's mode and
//          language, read from the insights publisher's history
// Inputs:  matchId; GET /api/matches and /api/match/<id>/insights/history
// Outputs: UI
// Spec:    web/specs/screens.md §6

import Link from "next/link";
import { useEffect, useState } from "react";
import { listMatches } from "@/lib/api";
import type { MatchListItem } from "@/lib/match-list";
import { overlayText, parseInsight, type Insight, type Overlay, type RecapData } from "@/lib/live/insights";
import { audienceGroup } from "@/lib/preferences";
import { usePreferences } from "@/providers/PreferencesProvider";

export function RecapView({ matchId }: { matchId: string }) {
  const [prefs] = usePreferences();
  const [match, setMatch] = useState<MatchListItem | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [cards, setCards] = useState<Overlay[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Club and player recaps need a club or player of this match; casual is always there
  const mode = prefs.mode === "analyst" ? "analyst" : "casual";
  const group = audienceGroup(matchId, mode, prefs);

  useEffect(() => {
    let stop = false;
    listMatches()
      .then((l) => !stop && setMatch(l.find((m) => m.match_id === matchId) ?? null))
      .catch(() => {});
    fetch(`/api/match/${matchId}/insights/history?group=${encodeURIComponent(group)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { envelopes: unknown[] }) => {
        if (stop) return;
        const parsed = body.envelopes.map((e) => parseInsight(e, matchId)).filter((x): x is Insight => x !== null);
        setRecap(parsed.find((i) => i.kind === "recap")?.data as RecapData | undefined ?? null);
        setCards(parsed.filter((i): i is Extract<Insight, { kind: "overlay" }> => i.kind === "overlay").map((i) => i.data).sort((a, b) => a.show_at_ms - b.show_at_ms));
        setState("ready");
      })
      .catch(() => !stop && setState("error"));
    return () => {
      stop = true;
    };
  }, [matchId, group]);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-16 pt-8 sm:px-6">
      <Link href={`/match/${matchId}`} className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-ink/40 hover:text-ink">
        ← Watch the replay
      </Link>
      <section className="ov-card mt-4 p-6 text-center">
        <p className="ov-eyebrow">Full time · {matchId}</p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <p className="text-right text-[18px] font-extrabold">{match?.home.name ?? "Home"}</p>
          <p className="font-mono text-[44px] font-black leading-none tabular">
            {match?.score ? `${match.score.home}` : "–"}
            <span className="mx-2 text-ink/25">:</span>
            {match?.score ? `${match.score.away}` : "–"}
          </p>
          <p className="text-left text-[18px] font-extrabold">{match?.away.name ?? "Away"}</p>
        </div>
      </section>
      <section className="ov-card mt-4 border-accent/25 p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-mono text-[10px] font-black text-on-accent">AI</span>
          <p className="ov-eyebrow">The recap</p>
        </div>
        {state === "loading" && <p className="mt-3 text-ink/50">Loading…</p>}
        {state === "error" && <p className="mt-3 text-ink/50">The recap can&apos;t be read right now.</p>}
        {state === "ready" && !recap && <p className="mt-3 text-ink/50">No recap for this audience yet. It is written at full time.</p>}
        {recap && (
          <div className="mt-3 flex flex-col gap-2">
            {recap.lines.map((l, i) => (
              <p key={i} className="text-[16px] font-semibold leading-relaxed text-ink/90">
                {l.text}
              </p>
            ))}
          </div>
        )}
      </section>
      {cards.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[18px] font-black">Moments of the match</h2>
            <span className="h-px flex-1 bg-ink/[0.06]" />
          </div>
          <ol className="relative flex flex-col gap-3 border-l border-ink/10 pl-5">
            {cards.map((c) => (
              <li key={c.overlay_id} className="relative">
                <span className={`absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full ${c.priority === "high" ? "bg-accent" : "bg-ink/30"}`} />
                <div className="ov-card p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-black">{c.clock.split(":")[0]}′</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-black uppercase tracking-[1px] ${
                        c.verified ? "bg-brass/15 text-brass" : "bg-ink/10 text-ink/55"
                      }`}
                    >
                      {c.verified ? "✓ verified" : c.fallback ? "template" : "unverified"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-snug text-ink/85">{overlayText(c, mode, prefs.lang)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
