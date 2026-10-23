"use client";

// LiveRail.tsx — The live numbers beside the pitch
//
// Purpose: the match's key numbers as a broadcast rail, updating as the stat panels arrive (about once a second):
//          xG and shots as big mono numbers, a mini xG race, possession, how hard and high each side presses, with
//          the side that leads each row picked out, and each team's attack by flank over the last few minutes
// Inputs:  the match experience (latest stat panel and its heavy block, and the events for the flanks) and the setup
// Outputs: UI
// Spec:    web/specs/screens.md §2.7; web/specs/design-system.md §4.1

import { useMemo } from "react";
import type { MatchSetup, StatPanel } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";
import { xgRace, xgShots } from "@/lib/live/charts";
import { CHANNELS, flankShares, LANE_WINDOW_MS, type Channel } from "@/lib/live/story";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { overlayColour } from "@/components/pitch3d/scene/stage";

type Row = { label: string; home: number | null; away: number | null; digits?: number; suffix?: string; lowerIsBetter?: boolean };

function Bar({ row, colours }: { row: Row; colours: { home: string; away: string } }) {
  const h = row.home ?? 0;
  const a = row.away ?? 0;
  const total = h + a || 1;
  const better = row.home === null || row.away === null ? null : row.lowerIsBetter ? (h < a ? "home" : h > a ? "away" : null) : h > a ? "home" : h < a ? "away" : null;
  const fmt = (v: number | null) => (v === null ? "–" : `${v.toFixed(row.digits ?? 0)}${row.suffix ?? ""}`);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className={`font-mono font-bold tabular ${better === "home" ? "text-ink" : "text-ink/50"}`}>{fmt(row.home)}</span>
        <span className="text-[11.5px] text-ink/50">{row.label}</span>
        <span className={`font-mono font-bold tabular ${better === "away" ? "text-ink" : "text-ink/50"}`}>{fmt(row.away)}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full ring-1 ring-ink/10">
        <span className="rounded-l-full" style={{ width: `${(h / total) * 100}%`, background: colours.home, opacity: better === "away" ? 0.45 : 1 }} />
        <span className="rounded-r-full" style={{ width: `${(a / total) * 100}%`, background: colours.away, opacity: better === "home" ? 0.45 : 1 }} />
      </div>
    </div>
  );
}

function MiniRace({ home, away, minute, colours }: { home: ReturnType<typeof xgRace>; away: ReturnType<typeof xgRace>; minute: number; colours: { home: string; away: string } }) {
  const W = 120;
  const H = 34;
  const end = Math.max(90, minute);
  const top = Math.max(0.5, home[home.length - 1].total, away[away.length - 1].total) * 1.1;
  const sx = (m: number) => (Math.min(m, end) / end) * W;
  const sy = (v: number) => H - 2 - (v / top) * (H - 4);
  const path = (steps: ReturnType<typeof xgRace>) => steps.reduce((d, s, i) => (i ? `${d} H${sx(s.minute)} V${sy(s.total)}` : `M0 ${sy(0)}`), "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="viz-pitch block w-full" role="img" aria-label="xG race so far">
      <rect width={W} height={H} fill="var(--color-viz-bg)" />
      <line x1={sx(45)} x2={sx(45)} y1="0" y2={H} stroke="var(--color-viz-line)" strokeDasharray="1 1" strokeWidth="0.4" />
      <path d={path(away)} fill="none" stroke={colours.away} strokeWidth="1.1" />
      <path d={path(home)} fill="none" stroke={colours.home} strokeWidth="1.1" />
      {[...home.map((s) => ({ s, c: colours.home })), ...away.map((s) => ({ s, c: colours.away }))]
        .filter(({ s }) => s.goal)
        .map(({ s, c }) => (
          <circle key={s.shotId} cx={sx(s.minute)} cy={sy(s.total)} r="1.6" fill={c} stroke="#fff" strokeWidth="0.5" />
        ))}
    </svg>
  );
}

type Flanks = Record<Side, Record<Channel, number> | null>;

/**
 * Attack by flank for both teams: each lane's share of the team's final-third actions over the last few minutes
 * (left, centre, right as each team faces the goal it attacks), the main lane in the team's colour.
 */
function FlankRow({ setup, flanks, colours }: { setup: MatchSetup; flanks: Flanks; colours: { home: string; away: string } }) {
  return (
    <div aria-label="Attack by flank">
      <div className="flex items-baseline justify-between text-[11.5px] text-ink/50">
        <span>Attack by flank</span>
        <span className="font-mono text-[10px] tabular">last {LANE_WINDOW_MS / 60_000}′</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {(["home", "away"] as const).map((side) => {
          const shares = flanks[side];
          const top = shares ? CHANNELS.reduce((a, b) => (shares[b] > shares[a] ? b : a)) : null;
          return (
            <div key={side} className="grid grid-cols-[52px_1fr_1fr_1fr] items-center gap-1">
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold text-ink/60">
                <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-ink/25" style={{ background: colours[side] }} />
                {setup.teams[side].team_id}
              </span>
              {CHANNELS.map((c) => (
                <span
                  key={c}
                  className={`flex items-baseline justify-between rounded-[6px] px-1.5 py-0.5 font-mono text-[10px] tabular ${
                    c === top ? "font-black text-ink" : "bg-ink/[0.05] font-bold text-ink/55"
                  }`}
                  style={c === top ? { background: `color-mix(in srgb, ${colours[side]} 28%, transparent)` } : undefined}
                >
                  <span className="text-[8.5px] uppercase tracking-[1px] opacity-70">{c === "centre" ? "Mid" : c}</span>
                  <span>{shares ? `${shares[c]}%` : "–"}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiveRail() {
  const { memory, tick, playheadMs } = useExperience();
  const { setup } = useScoreboard();
  const panels = useMemo(() => {
    void tick;
    return { panel: memory.latestPanel(), heavy: memory.heavyPanel() };
  }, [memory, tick]);
  // Counted at the picture's playhead, so a replay never shows the flanks of minutes still to come
  const flanks = useMemo(() => {
    void tick;
    return flankShares(memory.events(), memory.setup(), playheadMs);
  }, [memory, tick, playheadMs]);
  if (!setup) return null;
  return <LiveRailView setup={setup} panel={panels.panel} heavyPanel={panels.heavy} flanks={flanks} />;
}

/**
 * The rail for one moment of the match: the latest panel, the latest panel with a heavy block, and attack by flank
 * (left out when not given).
 */
export function LiveRailView({
  setup,
  panel,
  heavyPanel,
  flanks,
}: {
  setup: MatchSetup;
  panel: StatPanel | null;
  heavyPanel: StatPanel | null;
  flanks?: Flanks;
}) {
  const minute = (panel?.match_ms ?? 0) / 60_000;
  const hs = xgShots(heavyPanel?.heavy, "home");
  const as = xgShots(heavyPanel?.heavy, "away");
  const data = { panel, minute, race: hs && as ? { home: xgRace(hs, minute), away: xgRace(as, minute) } : null };
  const colours = { home: overlayColour(setup.teams.home.colours), away: overlayColour(setup.teams.away.colours) };
  const t = data.panel?.teams;
  const xg = { home: t?.home.xg ?? null, away: t?.away.xg ?? null };
  const rows: Row[] = [
    { label: "Possession", home: t?.home.possession_pct ?? null, away: t?.away.possession_pct ?? null, suffix: "%" },
    { label: "Shots on target", home: t?.home.shots_on_target ?? null, away: t?.away.shots_on_target ?? null },
    { label: "Pass accuracy", home: t?.home.pass_completion_pct ?? null, away: t?.away.pass_completion_pct ?? null, suffix: "%" },
    { label: "Momentum 10′", home: t?.home.momentum_share_last_10min_pct ?? null, away: t?.away.momentum_share_last_10min_pct ?? null, suffix: "%" },
    { label: "PPDA 10′ (lower presses harder)", home: t?.home.ppda_last_10min ?? null, away: t?.away.ppda_last_10min ?? null, digits: 1, lowerIsBetter: true },
    { label: "Press height 10′", home: t?.home.press_height_last_10min_m ?? null, away: t?.away.press_height_last_10min_m ?? null, suffix: " m" },
  ];
  return (
    <section className="viz-card" aria-label="Live match numbers">
      <div className="flex items-center justify-between">
        <p className="ov-eyebrow text-ink/45">Live numbers · {data.panel?.clock ?? "0:00"}</p>
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-live">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
          Every second
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        {(["home", "away"] as const).map((s, i) => (
          <div key={s} className={i ? "order-3 text-right" : "order-1"}>
            <p className="font-mono text-[30px] font-bold leading-none tabular">{xg[s] !== null ? xg[s]!.toFixed(2) : "–"}</p>
            <p className={`mt-1 flex items-center gap-1.5 text-[11.5px] text-ink/55 ${i ? "justify-end" : ""}`}>
              <span className="h-2 w-2 rounded-full ring-1 ring-ink/25" style={{ background: colours[s] }} />
              {setup.teams[s].team_id} · {t?.[s].shots ?? 0} shots
            </p>
          </div>
        ))}
        <p className="order-2 pb-5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-ink/40">xG</p>
      </div>
      {data.race && (
        <div className="mt-3">
          <MiniRace home={data.race.home} away={data.race.away} minute={data.minute} colours={colours} />
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <Bar key={r.label} row={r} colours={colours} />
        ))}
        {flanks && <FlankRow setup={setup} flanks={flanks} colours={colours} />}
      </div>
    </section>
  );
}
