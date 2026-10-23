// StatBars.tsx — Stat bars
//
// Purpose: both teams' numbers from the latest stat panel, side by side, with a split bar on the rows where more
//          means more of the thing (possession, shots, xG, passes, momentum share)
// Inputs:  panel (the latest StatPanel, or null before the first: a waiting message), home / away (club names),
//          className
// Outputs: a <table> with a caption; the bars are aria-hidden because the numbers are in the cells
// Spec:    web/specs/charts.md §2 (stat bars)
//
// Team colours come from --team-home / --team-away, which the section sets from the setup (teamColourStyle). A null
// value reads "Not enough data" and gets no bar (CONTRACTS.md §7.4). No window or highlight yet: they come with overlays.

import { memo } from "react";
import { cn } from "@/lib/cn";
import type { StatPanel } from "@/lib/contracts";
import { NOT_ENOUGH_DATA, statRows } from "@/lib/stat-charts";

type StatBarsProps = {
  panel: StatPanel | null;
  home: string;
  away: string;
  className?: string;
};

function SplitBar({ share }: { share: number }) {
  return (
    <div aria-hidden="true" className="mt-1.5 flex h-1.5 overflow-hidden rounded-pill bg-surface-raised">
      <div className="bg-team-home" style={{ width: `${(share * 100).toFixed(1)}%` }} />
      <div className="flex-1 bg-team-away" />
    </div>
  );
}

function Value({ text, align }: { text: string; align: "left" | "right" }) {
  const low = text === NOT_ENOUGH_DATA;
  return (
    <td
      className={cn(
        "w-[30%] py-2 align-top",
        align === "left" ? "text-left" : "text-right",
        low ? "text-caption text-ink-muted" : "font-mono text-body-sm numeric text-ink",
      )}
    >
      {text}
    </td>
  );
}

function StatBarsView({ panel, home, away, className }: StatBarsProps) {
  if (!panel) {
    return <p className={cn("py-6 text-center text-body-sm text-ink-muted", className)}>Waiting for the first stat panel.</p>;
  }

  return (
    <div className={className}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Team stats at {panel.clock}</caption>
        <thead>
          <tr className="text-caption font-semibold text-ink-muted">
            <th scope="col" className="pb-1 text-left font-semibold">
              {home}
            </th>
            <th scope="col" className="pb-1">
              <span className="sr-only">Stat</span>
            </th>
            <th scope="col" className="pb-1 text-right font-semibold">
              {away}
            </th>
          </tr>
        </thead>
        <tbody>
          {statRows(panel).map((row) => (
            <tr key={row.key} className="border-t border-line">
              <Value text={row.home} align="left" />
              <th scope="row" className="px-2 py-2 text-center align-top text-caption font-normal text-ink-muted">
                {row.label}
                {row.share === null ? null : <SplitBar share={row.share} />}
              </th>
              <Value text={row.away} align="right" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-ink-muted">
        PPDA is opponent passes per defensive action: lower means more intense pressing.
      </p>
    </div>
  );
}

/** Memoised on the panel: the store keeps the same panel object until a newer one arrives. */
export const StatBars = memo(StatBarsView);
