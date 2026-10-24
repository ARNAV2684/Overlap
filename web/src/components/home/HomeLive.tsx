"use client";

// HomeLive.tsx — The home page
//
// Purpose: open on a match being played: the newest live match if one is sending, otherwise a replay of the newest
//          finished match at 5×, so the pitch is never empty. Switches to a live match when one starts
// Inputs:  GET /api/matches (polled), frames from the chosen live match
// Outputs: UI
// Spec:    web/specs/screens.md §1
//
// A match the archive lists as live may have stopped sending (the generator was stopped mid-match). It gets
// QUIET_MS to send a frame; if none comes it is marked quiet and the home page plays a replay instead.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listMatches } from "@/lib/api";
import type { MatchListItem } from "@/lib/match-list";
import { MatchSession } from "@/components/match/MatchSession";
import { Wordmark } from "@/components/shell/TopNav";
import { StartMatchButton } from "./StartMatchButton";

const POLL_MS = 8000;
const QUIET_MS = 9000;

type Choice = { matchId: string; source: "live" | "replay" } | null;

export function HomeLive() {
  const [matches, setMatches] = useState<MatchListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [quiet, setQuiet] = useState<ReadonlySet<string>>(new Set());
  const [choice, setChoice] = useState<Choice>(null);
  const lastFrame = useRef(0);
  // Clock per match at the previous poll: a live match whose clock moved is really being played
  const clocks = useRef(new Map<string, string | null>());
  const [moving, setMoving] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let stop = false;
    const load = () =>
      listMatches()
        .then((list) => {
          if (stop) return;
          const next = new Set<string>();
          for (const m of list) {
            const before = clocks.current.get(m.match_id);
            if (m.status === "live" && before !== undefined && before !== m.clock) next.add(m.match_id);
            clocks.current.set(m.match_id, m.clock);
          }
          setMoving(next);
          setMatches(list);
          setError(false);
        })
        .catch(() => !stop && setError(true));
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  // Choose: a live match that is not quiet, else the newest finished match as a replay
  useEffect(() => {
    if (!matches) return;
    // Prefer a match whose clock is moving; otherwise the highest match number (the newest run)
    const candidates = matches
      .filter((m) => m.status === "live" && !quiet.has(m.match_id))
      .sort((a, b) => Number(moving.has(b.match_id)) - Number(moving.has(a.match_id)) || b.match_id.localeCompare(a.match_id));
    const live = candidates[0];
    const finished = matches.find((m) => m.status === "finished");
    setChoice((current) => {
      if (live) {
        if (current?.matchId === live.match_id && current.source === "live") return current;
        lastFrame.current = performance.now();
        return { matchId: live.match_id, source: "live" };
      }
      if (current?.source === "replay") return current; // keep playing the replay already chosen
      return finished ? { matchId: finished.match_id, source: "replay" } : null;
    });
  }, [matches, quiet, moving]);

  // A live choice must keep sending frames
  const onFrames = useCallback(() => {
    lastFrame.current = performance.now();
  }, []);
  useEffect(() => {
    if (choice?.source !== "live") return;
    const id = setInterval(() => {
      if (performance.now() - lastFrame.current > QUIET_MS) setQuiet((q) => new Set(q).add(choice.matchId));
    }, 1000);
    return () => clearInterval(id);
  }, [choice]);

  const others = (matches ?? []).filter((m) => m.match_id !== choice?.matchId).slice(0, 8);

  const intro = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[26px] font-black leading-none tracking-tight sm:text-[32px]">
          <Wordmark />
        </h1>
        <p className="mt-1.5 text-[14px] font-medium text-ink/45">Every match, explained as it happens.</p>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="ov-sub mr-1 shrink-0">{choice?.source === "live" ? "Also" : "Matches"}</span>
        {others.map((m) => (
          <Link
            key={m.match_id}
            href={`/match/${m.match_id}`}
            className="flex shrink-0 items-center gap-2 rounded-full border border-ink/[0.08] bg-ink/[0.03] px-3 py-1.5 text-[12px] font-bold text-ink/75 transition-colors hover:border-ink/20 hover:text-ink"
          >
            {m.status === "live" && !quiet.has(m.match_id) && <span className="ov-live-dot" />}
            {m.home.team_id} <span className="font-mono tabular text-ink">{m.score ? `${m.score.home}–${m.score.away}` : "v"}</span> {m.away.team_id}
          </Link>
        ))}
      </div>
    </div>
  );

  if (!choice) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        {intro}
        <div className="ov-card mt-6 grid min-h-[50vh] place-items-center p-10 text-center">
          <div>
            <p className="text-[18px] font-bold">{error ? "Can't reach the match archive" : matches ? "No match yet" : "Finding a match…"}</p>
            <p className="mt-2 text-[14px] text-ink/50">
              {error
                ? "Check the archive settings in web/.env.local and that the local stack is running."
                : "Start one with the generator: uv run python cli.py live --hubs emulator --speed 20"}
            </p>
            {!error && matches && (
              <div className="mt-4 flex justify-center">
                <StartMatchButton />
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <MatchSession
      key={`${choice.source}:${choice.matchId}`}
      matchId={choice.matchId}
      source={choice.source}
      initialSpeed={5}
      onFrames={choice.source === "live" ? onFrames : undefined}
      intro={
        <>
          {intro}
          {choice.source === "replay" && (
            <div className="-mt-1 flex flex-col gap-2">
              <p className="text-[13px] text-ink/45">
                No match is live right now, so here is the latest one again. It switches to live as soon as a match kicks off.
              </p>
              <StartMatchButton />
            </div>
          )}
        </>
      }
    />
  );
}
