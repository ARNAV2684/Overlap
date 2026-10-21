"use client";

// page.tsx — Match picker
//
// Purpose: the entry point: the matches in the match archive, each with its clubs, phase, score and clock, linking a
//          live match to its live screen and a finished one to its replay. Refreshes every 5 s
// Inputs:  listMatches() (src/lib/api.ts: this app's GET /api/matches), NEXT_PUBLIC_DEFAULT_MATCH_ID
// Outputs: a page. If the list can't be read or is empty, it says why and still links to the default match
// Spec:    web/specs/screens.md §1 (match picker); web/specs/realtime.md §5.3. Plan: plans/active/PLAN_web_match-list.md
//
// A page may only export its component, so the parts below stay private to this file.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeaderView } from "@/components/layout/AppHeader";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, listMatches } from "@/lib/api";
import { env } from "@/lib/env";
import { formatPhase } from "@/lib/format";
import type { MatchListItem } from "@/lib/match-list";

/** How often the list is read again, so phases, scores and clocks stay current. */
const REFRESH_MS = 5000;

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; matches: MatchListItem[] }
  /** `unconfigured`: the route answered 503 matches_unavailable (no archive settings). */
  | { kind: "error"; unconfigured: boolean };

function useMatchList(): ListState {
  const [state, setState] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const matches = await listMatches(controller.signal);
        setState({ kind: "ready", matches });
      } catch (error) {
        if (error instanceof ApiError && error.kind === "aborted") return;
        setState({ kind: "error", unconfigured: error instanceof ApiError && error.status === 503 });
      }
      if (!controller.signal.aborted) timer = setTimeout(load, REFRESH_MS);
    }

    void load();
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return state;
}

function DefaultMatchLink() {
  return (
    <Link href={`/match/${env.defaultMatchId}`} className="text-body-sm font-medium text-secondary-text underline underline-offset-4">
      Open {env.defaultMatchId} anyway
    </Link>
  );
}

/** "Northbridge FC 1, Harbour Athletic 0, SYN-0505, live, 62:14. Watch live" (screens.md §1). */
function cardLabel(match: MatchListItem, action: string): string {
  const teams = match.score
    ? `${match.home.name} ${match.score.home}, ${match.away.name} ${match.score.away}`
    : `${match.home.name} against ${match.away.name}`;
  const phase = match.phase ? formatPhase(match.phase).toLowerCase() : "waiting";
  return `${teams}, ${match.match_id}, ${phase}${match.clock ? `, ${match.clock}` : ""}. ${action}`;
}

function MatchCard({ match }: { match: MatchListItem }) {
  const finished = match.status === "finished";
  const action = finished ? "Watch replay" : "Watch live";
  const score = match.score ? `${match.score.home} : ${match.score.away}` : "– : –";
  return (
    <li>
      <Link
        href={finished ? `/replay/${match.match_id}` : `/match/${match.match_id}`}
        className="block rounded-panel focus-visible:outline-offset-2"
        aria-label={cardLabel(match, action)}
      >
        <Card className="flex flex-wrap items-center justify-between gap-4 transition-colors hover:border-line-strong hover:bg-surface-raised motion-reduce:transition-none">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">
              {match.home.name} <span className="text-ink-muted">vs</span> {match.away.name}
            </p>
            <p className="mt-1 font-mono text-label text-ink-muted">{match.match_id}</p>
            <p className="mt-1 text-eyebrow uppercase text-accent-text">{match.phase ? formatPhase(match.phase) : "Waiting"}</p>
          </div>
          <div className="text-center">
            <p className="text-metric numeric">{score}</p>
            {finished ? null : <p className="font-mono text-caption numeric text-ink-muted">{match.clock ?? "–:–"}</p>}
          </div>
          <span className="text-body-sm font-medium text-secondary-text">
            {action} <span aria-hidden="true">→</span>
          </span>
        </Card>
      </Link>
    </li>
  );
}

export default function MatchPickerPage() {
  const state = useMatchList();
  const status = state.kind === "loading" ? "connecting" : state.kind === "ready" ? "live" : "reconnecting";
  const label = state.kind === "ready" ? "Archive online" : state.kind === "error" ? "Archive offline" : undefined;

  return (
    <AppShell>
      <AppHeaderView status={status} statusLabel={label} section="Matches" />
      <main className="flex flex-1 flex-col gap-5 py-8">
        <div>
          <Eyebrow>Local match observatory</Eyebrow>
          <h1 className="mt-2 text-display text-ink">Matches</h1>
          <p className="mt-2 text-body text-ink-muted">
            Synthetic matches from the match archive. Watch a live one as it plays, or replay a finished one.
          </p>
        </div>

        {state.kind === "loading" ? (
          <ul aria-hidden="true" className="space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-28 w-full rounded-panel" />
              </li>
            ))}
          </ul>
        ) : null}

        {state.kind === "error" ? (
          <Card>
            <EmptyState
              title={
                state.unconfigured
                  ? "The match list isn't set up: add the archive settings to web/.env.local (see web/.env.example)."
                  : "Can't read the match archive. Is the local stack running?"
              }
              hint={<DefaultMatchLink />}
            />
          </Card>
        ) : null}

        {state.kind === "ready" && state.matches.length === 0 ? (
          <Card>
            <EmptyState title="No match in the archive yet. Start one with the generator." hint={<DefaultMatchLink />} />
          </Card>
        ) : null}

        {state.kind === "ready" && state.matches.length > 0 ? (
          <ul aria-label="Matches" className="space-y-3">
            {state.matches.map((match) => (
              <MatchCard key={match.match_id} match={match} />
            ))}
          </ul>
        ) : null}
      </main>
      <AppFooter />
    </AppShell>
  );
}
