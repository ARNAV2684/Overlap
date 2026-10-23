"use client";

// TrackingHeatPanel.tsx — The match, mapped
//
// Purpose: a large heatmap under the pitch: where a team, or one player, has been, for the whole session or one
//          period, with how much tracking it is built from
// Inputs:  the match memory's per-player heat (charts.ts heatGrid does the density, direction and smoothing)
// Outputs: UI
// Spec:    web/specs/charts.md §10
//
// The panel only knows the tracking this page has received: a viewer who joins late sees less, and it never claims
// full-match coverage.

import { useMemo, useState } from "react";
import type { Side } from "@/lib/coordinates";
import { heatGrid } from "@/lib/live/charts";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { HeatMap } from "@/components/charts/HeatMap";

const PERIODS = [
  { value: 0, label: "All observed" },
  { value: 1, label: "First half" },
  { value: 2, label: "Second half" },
  { value: 3, label: "Extra time · first" },
  { value: 4, label: "Extra time · second" },
] as const;

const selectCls =
  "w-full max-w-[240px] appearance-none rounded-[10px] border border-ink/10 bg-ink/[0.03] px-3 py-2 pr-8 text-[13px] font-semibold text-ink outline-none transition-colors hover:border-ink/20 focus-visible:border-accent";

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="ov-sub">{label}</span>
      <span className="relative">
        {children}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink/40">▼</span>
      </span>
    </label>
  );
}

export function TrackingHeatPanel() {
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  const [side, setSide] = useState<Side>("home");
  const [player, setPlayer] = useState("");
  const [period, setPeriod] = useState(0);
  const team = setup?.teams[side];
  const roster = useMemo(() => (team ? [...team.lineup, ...team.bench] : []), [team]);
  const selected = roster.find((p) => p.player_id === player);

  const { grid, samples, observed } = useMemo(() => {
    void tick;
    const ids = selected ? [selected.player_id] : roster.map((p) => p.player_id);
    // The chosen period only, through the same heat reader the analytics use
    const source = {
      heat(id: string) {
        const h = memory.heat(id);
        return h ? { byPeriod: new Map([...h.byPeriod].filter(([p]) => period === 0 || p === period)) } : null;
      },
    };
    let samples = 0;
    let observed = 0;
    for (const id of ids) {
      let count = 0;
      source.heat(id)?.byPeriod.forEach((cells) => {
        for (const n of cells) count += n;
      });
      samples += count;
      if (count) observed++;
    }
    return { grid: heatGrid(source, ids, side), samples, observed };
  }, [memory, tick, roster, selected, side, period]);

  const label = selected?.name ?? team?.name ?? "Team";

  return (
    <section className="ov-card overflow-hidden" aria-label="Tracking heatmap">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div>
          <p className="ov-eyebrow">The match, mapped</p>
          <h2 className="mt-1.5 text-[20px] font-black tracking-tight sm:text-[24px]">Where the game happens.</h2>
          <p className="mt-0.5 text-[13px] text-ink/50">Explore the spaces a team or player occupies.</p>
        </div>
        <span className="ov-sub shrink-0 rounded-[6px] border border-ink/10 px-2 py-1.5">Tracking · observed</span>
      </header>

      <div className="flex flex-wrap items-end gap-3 px-4 pt-4 sm:px-5">
        <div className="flex rounded-[12px] bg-ink/[0.05] p-1" role="group" aria-label="Heatmap team">
          {(["home", "away"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => {
                setSide(s);
                setPlayer("");
              }}
              className={`flex items-center gap-2 rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
                side === s ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: setup?.teams[s].colours.primary }} />
              {setup?.teams[s].team_id ?? s}
            </button>
          ))}
        </div>
        <Picker label="Player">
          <select aria-label="Heatmap player" className={selectCls} value={selected?.player_id ?? ""} onChange={(e) => setPlayer(e.target.value)}>
            <option value="">Whole team</option>
            {roster.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {p.shirt} · {p.name}
              </option>
            ))}
          </select>
        </Picker>
        <Picker label="Period">
          <select aria-label="Heatmap period" className={selectCls} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Picker>
      </div>

      <div className="grid items-center gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_210px]">
        <HeatMap grid={grid} colour={team?.colours.primary ?? "#38bdf8"} label={label} />
        <div className="hidden md:block">
          <p className="ov-eyebrow">Read the pitch</p>
          <h3 className="mt-2 text-[18px] font-extrabold leading-tight tracking-tight">
            {selected ? "Every run leaves a trace." : "Find the areas of influence."}
          </h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink/55">Warmer areas show more observed player positions.</p>
          <dl className="mt-4 flex flex-col gap-1.5 border-y border-ink/[0.08] py-3 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/55">Position samples</dt>
              <dd className="font-mono font-bold tabular">{samples.toLocaleString("en-US")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/55">Players observed</dt>
              <dd className="font-mono font-bold tabular">{observed}</dd>
            </div>
          </dl>
          <p className="ov-sub mt-3">
            Defend <span className="mx-2 text-accent">→</span> Attack
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink/45">Both halves face the same way. Colours scale to this selection’s peak.</p>
        </div>
      </div>
      <footer className="border-t border-ink/[0.06] px-4 py-3 text-[11.5px] leading-snug text-ink/45 sm:px-5">
        Built from the tracking this page has received. Joining late may leave out earlier movement, so this is not a
        complete-match record.
      </footer>
    </section>
  );
}
