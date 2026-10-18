"use client";

// page.tsx — Match picker
//
// Purpose: the entry point: the matches the stream server is playing, each with its phase, score and clock and a link to
//          its live screen. Refreshes every 5 s
// Inputs:  listMatches() (src/lib/api.ts: GET /mock/matches on NEXT_PUBLIC_STREAM_BASE_URL), NEXT_PUBLIC_DEFAULT_MATCH_ID
// Outputs: a page. If the server cannot be reached or plays nothing, it says so and still links to the default match
// Spec:    web/specs/screens.md §1 (match picker). web/IMPLEMENTATION_PLAN.md Phase 10 step 5
//
// The list endpoint belongs to the mock (provisional shape, see api.ts); the screen relay and real Azure do not have one
// yet. A page may only export its component, so the parts below stay private to this file.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeaderView } from "@/components/layout/AppHeader";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, listMatches, type MatchSummary } from "@/lib/api";
import { env } from "@/lib/env";
import { formatPhase } from "@/lib/format";

/** How often the list is read again, so phases, scores and clocks stay current. */
const REFRESH_MS = 5000;

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; matches: MatchSummary[] }
  | { kind: "error"; message: string };

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
        setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
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

function MatchCard({ match }: { match: MatchSummary }) {
  const score = match.score ? `${match.score.home} : ${match.score.away}` : "– : –";
  return (
    <li>
      <Link
        href={`/match/${match.match_id}`}
        className="block rounded-panel focus-visible:outline-offset-2"
        aria-label={`${match.match_id}, ${match.phase ? formatPhase(match.phase) : "waiting"}, ${score.replace(" : ", " to ")}${match.clock ? `, ${match.clock}` : ""}. Watch live`}
      >
        <Card className="flex items-center justify-between gap-4 transition-colors hover:border-line-strong hover:bg-surface-raised motion-reduce:transition-none">
          <div className="min-w-0">
            <p className="font-mono text-label text-ink-muted">{match.match_id}</p>
            <p className="mt-1 text-eyebrow uppercase text-accent-text">{match.phase ? formatPhase(match.phase) : "Waiting"}</p>
          </div>
          <div className="text-center">
            <p className="text-metric numeric">{score}</p>
            <p className="font-mono text-caption numeric text-ink-muted">{match.clock ?? "–:–"}</p>
          </div>
          <span className="text-body-sm font-medium text-secondary-text">
            Watch live <span aria-hidden="true">→</span>
          </span>
        </Card>
      </Link>
    </li>
  );
}

export default function MatchPickerPage() {
  const state = useMatchList();
  const status = state.kind === "loading" ? "connecting" : state.kind === "ready" ? "live" : "reconnecting";
  const label = state.kind === "ready" ? "Stream online" : state.kind === "error" ? "Stream offline" : undefined;

  return (
    <AppShell>
      <AppHeaderView status={status} statusLabel={label} />
      <main className="flex flex-1 flex-col gap-5 py-8">
        <div>
          <Eyebrow>Local match observatory</Eyebrow>
          <h1 className="mt-2 text-display text-ink">Matches on the stream</h1>
          <p className="mt-2 text-body text-ink-muted">
            Synthetic matches from {env.streamBaseUrl}. Pick one to watch it live.
          </p>
        </div>

        {state.kind === "loading" ? (
          <ul aria-hidden="true" className="space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-[86px] w-full rounded-panel" />
              </li>
            ))}
          </ul>
        ) : null}

        {state.kind === "error" ? (
          <Card>
            <EmptyState
              title={`Cannot reach the stream server at ${env.streamBaseUrl}. Is it running?`}
              hint={<DefaultMatchLink />}
            />
          </Card>
        ) : null}

        {state.kind === "ready" && state.matches.length === 0 ? (
          <Card>
            <EmptyState title="The stream server is not playing any match right now." hint={<DefaultMatchLink />} />
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
