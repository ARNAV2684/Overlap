"use client";

// ScoreHeader.tsx — Teams, score and clock
//
// Purpose: the top of the match screen: both clubs with their kit crests, the score in big mono digits, the clock and
//          phase, and whether this is live or a replay. A goal makes the score flash
// Inputs:  the match store's scoreboard and connection; the stream source
// Outputs: UI
// Spec:    web/specs/screens.md §2.1

import { useEffect, useRef, useState } from "react";
import type { Phase, Team } from "@/lib/contracts";
import { formatPhase } from "@/lib/format";
import { useConnection, useScoreboard } from "@/lib/store-hooks";
import { useStreamSource } from "@/lib/stream-source";

export function Crest({ team, size = 40 }: { team: Pick<Team, "team_id" | "colours"> | null; size?: number }) {
  if (!team) return <span className="rounded-full bg-ink/10" style={{ width: size, height: size }} />;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-mono font-black shadow-[inset_0_0_0_2px_rgb(255_255_255/0.15)]"
      style={{ width: size, height: size, background: team.colours.primary, color: team.colours.secondary, fontSize: size * 0.27 }}
      aria-hidden="true"
    >
      {team.team_id}
    </span>
  );
}

/** "1st half" while play is on (the phase alone would just say "Live", which a replay is not). */
function phaseLabel(phase: Phase | null, period: number): string {
  if (!phase) return "Before kick-off";
  if (phase !== "live") return formatPhase(phase);
  return period === 1 ? "1st half" : period === 2 ? "2nd half" : period >= 3 && period <= 4 ? "Extra time" : "Penalties";
}

export function ScoreHeader() {
  const board = useScoreboard();
  const { status } = useConnection();
  const source = useStreamSource();
  const home = board.setup?.teams.home ?? null;
  const away = board.setup?.teams.away ?? null;
  const score = board.score;

  // Flash the score when it changes (not on the first value)
  const last = useRef<string | null>(null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const key = score ? `${score.home}-${score.away}` : null;
    if (last.current !== null && key !== null && key !== last.current) setFlash((f) => f + 1);
    last.current = key;
  }, [score]);

  const live = source === "live" && board.phase !== "full_time";
  const badge =
    source === "replay"
      ? { text: "Replay", cls: "bg-ink/10 text-ink/70" }
      : board.phase === "full_time"
        ? { text: "Full time", cls: "bg-ink/10 text-ink/70" }
        : status === "live"
          ? { text: "Live", cls: "bg-accent-soft text-accent" }
          : { text: status === "stale" ? "Waiting for data" : "Connecting", cls: "bg-ink/10 text-ink/60" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ov-eyebrow">
            {board.setup ? `${board.setup.competition} · ${board.setup.venue.name}` : "Match"}
          </p>
          <p className="ov-sub mt-1">{board.matchId}</p>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[1.4px] ${badge.cls}`}>
            {live && status === "live" && <span className="ov-live-dot" />}
            {badge.text}
          </span>
          <p className="mt-1.5 font-mono text-[26px] font-black leading-none tabular text-ink sm:text-[30px]">{board.clock || "0:00"}</p>
          <p className="ov-sub mt-1">{phaseLabel(board.phase, board.period)}</p>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <Crest team={home} />
          <span className="line-clamp-2 text-[15px] font-extrabold leading-tight text-ink/90 sm:text-[19px]">{home?.name ?? "Home"}</span>
        </div>
        <div key={flash} className={`flex items-baseline gap-2 font-mono text-[38px] font-black leading-none tabular sm:text-[52px] ${flash ? "ov-flash-score" : ""}`}>
          <span>{score?.home ?? "–"}</span>
          <span className="text-ink/25">:</span>
          <span>{score?.away ?? "–"}</span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-3">
          <span className="line-clamp-2 text-right text-[15px] font-extrabold leading-tight text-ink/90 sm:text-[19px]">{away?.name ?? "Away"}</span>
          <Crest team={away} />
        </div>
      </div>
    </div>
  );
}
