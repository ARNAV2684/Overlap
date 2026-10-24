"use client";

// ScoreHeader.tsx — Teams, score and clock
//
// Purpose: the top of the match screen as a clean broadcast scoreboard: both clubs with their kit crests, the score
//          in big mono digits with the clock, phase and a live momentum sparkline under it, whether this is live or a
//          replay, and each team's score sheet (scorers and red cards) underneath. A goal makes the score flash
// Inputs:  the match store's scoreboard and connection; the stream source; the match memory at the playhead
// Outputs: UI
// Spec:    web/specs/screens.md §2.1

import { useEffect, useMemo, useRef, useState } from "react";
import type { Phase, Team } from "@/lib/contracts";
import { formatPhase } from "@/lib/format";
import { momentumSeries, type MomentumPoint } from "@/lib/live/charts";
import { scoreSheet, type SheetEntry } from "@/lib/live/match-events";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { useExperience } from "@/providers/MatchExperience";
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

/** "Calverholme Athletic" → ["Calverholme", "Athletic"]: the first word, then the rest (empty for one-word names). */
export function splitTeamName(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  return [words[0] ?? "", words.slice(1).join(" ")];
}

/**
 * A club's name on two stacked lines, the first word and then the rest, the same way for both teams and mirrored:
 * the home name reads from its crest on the left, the away name from its crest on the right. Each line truncates
 * rather than wrapping, so the two sides always line up.
 */
function TeamName({ name, align }: { name: string; align: "left" | "right" }) {
  const [first, rest] = splitTeamName(name);
  return (
    <span
      className={`flex min-w-0 max-w-full flex-col text-[12px] font-extrabold leading-[1.15] text-ink/90 sm:text-[19px] ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
    >
      <span className="block max-w-full truncate">{first}</span>
      <span className={`block max-w-full truncate ${rest ? "text-ink/60" : "invisible"}`} aria-hidden={rest ? undefined : true}>
        {rest || "\u00a0"}
      </span>
    </span>
  );
}

function SheetIcon({ kind }: { kind: SheetEntry["kind"] }) {
  if (kind === "goal") return <span aria-label="Goal" className="text-[11px] leading-none">⚽</span>;
  return <span aria-label="Red card" className="inline-block h-[11px] w-[8px] shrink-0 rounded-[2px] bg-[#e5383b]" />;
}

/**
 * One team's scorers and red cards: one entry per player with all their minutes (`Sartori 6′ 45′ 90′`), in the order
 * each player first appears; the entry that changed last rises in. Phones show the icons and minutes only.
 */
function Sheet({ entries, align }: { entries: readonly SheetEntry[]; align: "left" | "right" }) {
  if (!entries.length) return <div />;
  const newest = entries.reduce((a, b) => (b.lastMs > a.lastMs ? b : a)).id;
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 ${align === "right" ? "justify-end text-right" : ""}`}>
      {entries.map((e) => (
        <li
          key={e.id}
          className={`flex items-center gap-1.5 text-[12px] font-semibold text-ink/65 ${e.id === newest ? "ov-rise" : ""}`}
        >
          <SheetIcon kind={e.kind} />
          <span className="hidden sm:inline">{e.name}</span>
          <span className="font-mono text-[11px] font-bold text-ink/45">
            {e.minutes.map((m) => (m.note ? `${m.minute} ${m.note}` : m.minute)).join(" ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Momentum as a sparkline: one bar per 5-minute bucket, home above the line and away below, each bar the gap between
 * the two sides' weighted attacking actions in that bucket. Half time is a faint gap.
 */
export function MomentumSpark({ points, colours }: { points: readonly MomentumPoint[]; colours: { home: string; away: string } }) {
  const W = 150;
  const H = 24;
  const slots = Math.max(18, points.length);
  const top = Math.max(1, ...points.map((p) => Math.abs(p.home - p.away)));
  const bw = W / slots;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-6 w-[150px]" role="img" aria-label="Momentum so far, home above the line">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" />
      {points.map((p, i) => {
        const d = p.home - p.away;
        const h = (Math.abs(d) / top) * (H / 2 - 1);
        const x = i * bw + (p.period === 2 ? 1 : 0);
        return (
          <rect
            key={`${p.period}:${p.bucket}`}
            x={x + 0.4}
            y={d >= 0 ? H / 2 - h : H / 2}
            width={Math.max(1, bw - 1.2)}
            height={Math.max(0.6, h)}
            rx="0.5"
            fill={d >= 0 ? colours.home : colours.away}
            opacity={i === points.length - 1 ? 1 : 0.75}
          />
        );
      })}
    </svg>
  );
}

export function ScoreHeader() {
  const board = useScoreboard();
  const { status } = useConnection();
  const source = useStreamSource();
  const home = board.setup?.teams.home ?? null;
  const away = board.setup?.teams.away ?? null;
  const score = board.score;
  const { memory, playheadMs, tick } = useExperience();
  // Scorers and cards up to what the pitch is showing (the stream runs a little ahead of the picture)
  const sheet = useMemo(() => {
    void tick;
    return scoreSheet(memory.fieldEvents(), board.setup, playheadMs);
  }, [memory, board.setup, playheadMs, tick]);
  const momentum = useMemo(() => {
    void tick;
    return momentumSeries(memory);
  }, [memory, tick]);
  const colours = {
    home: home ? overlayColour(home.colours) : "#2bb3c0",
    away: away ? overlayColour(away.colours) : "#ff4f38",
  };

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
    <div
      className="flex flex-col gap-3 p-4 sm:p-5"
      // A faint wash of each team's kit colour from its side of the header
      style={{ background: `linear-gradient(110deg, ${home?.colours.primary ?? "#123d45"}1f, transparent 40%, transparent 60%, ${away?.colours.primary ?? "#46316f"}1f)` }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="ov-eyebrow truncate">
          {board.setup ? `${board.setup.competition} · ${board.setup.venue.name}` : "Match"}
          <span className="ml-2 font-normal normal-case tracking-normal text-ink/40">{board.matchId}</span>
        </p>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[1.4px] ${badge.cls}`}>
          {live && status === "live" && <span className="ov-live-dot" />}
          {badge.text}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-6">
        <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <Crest team={home} size={48} />
          <TeamName name={home?.name ?? "Home"} align="left" />
        </div>
        <div className="flex flex-col items-center">
          <div key={flash} className={`flex items-baseline gap-1.5 font-mono text-[34px] font-black leading-none tabular sm:gap-2 sm:text-[52px] ${flash ? "ov-flash-score" : ""}`}>
            <span>{score?.home ?? "–"}</span>
            <span className="text-ink/25">:</span>
            <span>{score?.away ?? "–"}</span>
          </div>
          <p className="mt-1.5 font-mono text-[14px] font-black leading-none tabular text-ink sm:text-[16px]">
            {board.clock || "0:00"}
            <span className="ml-2 font-sans text-[11px] font-semibold text-ink/50">{phaseLabel(board.phase, board.period)}</span>
          </p>
          {momentum.length > 0 && (
            <div className="mt-1.5 text-ink" title="Momentum by 5 minutes: home above the line, away below">
              <MomentumSpark points={momentum} colours={colours} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col-reverse items-end gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <TeamName name={away?.name ?? "Away"} align="right" />
          <Crest team={away} size={48} />
        </div>
      </div>
      {(sheet.home.length > 0 || sheet.away.length > 0) && (
        <div className="grid grid-cols-2 gap-4 border-t border-ink/[0.06] pt-2.5" aria-label="Score sheet">
          <Sheet entries={sheet.home} align="left" />
          <Sheet entries={sheet.away} align="right" />
        </div>
      )}
    </div>
  );
}
