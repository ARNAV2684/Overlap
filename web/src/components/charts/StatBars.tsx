// StatBars.tsx — Team stats head to head
//
// Purpose: the light stat panel as split bars: each row's two numbers and a bar split in the kit colours
// Inputs:  the newest stat panel, both teams' colours
// Outputs: UI
// Spec:    web/specs/charts.md §3; values sent as null (low_sample) read "–", never 0 (CONTRACTS.md §7.4)

import type { StatPanel, TeamPanel } from "@/lib/contracts";

type Row = { key: keyof TeamPanel; label: string; fmt: (v: number) => string; lowerIsBetter?: boolean };

const ROWS: Row[] = [
  { key: "possession_pct", label: "Possession", fmt: (v) => `${Math.round(v)}%` },
  { key: "xg", label: "Expected goals", fmt: (v) => v.toFixed(2) },
  { key: "shots", label: "Shots", fmt: (v) => String(Math.round(v)) },
  { key: "shots_on_target", label: "On target", fmt: (v) => String(Math.round(v)) },
  { key: "passes", label: "Passes", fmt: (v) => String(Math.round(v)) },
  { key: "pass_completion_pct", label: "Pass accuracy", fmt: (v) => `${Math.round(v)}%` },
  { key: "momentum_share_last_10min_pct", label: "Momentum · 10′", fmt: (v) => `${Math.round(v)}%` },
  { key: "ppda_last_10min", label: "PPDA · 10′", fmt: (v) => v.toFixed(1), lowerIsBetter: true },
  { key: "press_height_last_10min_m", label: "Press height · 10′", fmt: (v) => `${Math.round(v)} m` },
];

export function StatBars({ panel, homeColour, awayColour }: { panel: StatPanel | null; homeColour: string; awayColour: string }) {
  if (!panel) return <p className="py-6 text-center text-sm text-ink/40">Stats start with the first panel, a second after kick-off.</p>;
  return (
    <div className="flex flex-col gap-3.5">
      {ROWS.map((row) => {
        const h = panel.teams.home[row.key] as number | null;
        const a = panel.teams.away[row.key] as number | null;
        const known = h !== null && a !== null;
        const total = known ? Math.abs(h) + Math.abs(a) : 0;
        let share = known && total > 0 ? Math.abs(h) / total : 0.5;
        if (row.lowerIsBetter && known && total > 0) share = 1 - share;
        const homeLeads = known && (row.lowerIsBetter ? h < a : h > a);
        const awayLeads = known && (row.lowerIsBetter ? a < h : a > h);
        return (
          <div key={row.key}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className={`font-mono text-[14px] font-black tabular ${homeLeads ? "text-ink" : "text-ink/55"}`}>{h === null ? "–" : row.fmt(h)}</span>
              <span className="ov-sub">{row.label}</span>
              <span className={`font-mono text-[14px] font-black tabular ${awayLeads ? "text-ink" : "text-ink/55"}`}>{a === null ? "–" : row.fmt(a)}</span>
            </div>
            <div className="flex h-[5px] gap-[3px] overflow-hidden rounded-full">
              <div className="h-full rounded-l-full transition-[flex-grow] duration-700" style={{ flexGrow: known ? share : 0.5, background: known ? homeColour : "rgb(var(--ov-ink-rgb) / 0.1)" }} />
              <div className="h-full rounded-r-full transition-[flex-grow] duration-700" style={{ flexGrow: known ? 1 - share : 0.5, background: known ? awayColour : "rgb(var(--ov-ink-rgb) / 0.1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
