"use client";

// PassMap.tsx — A player's or a team's passes
//
// Purpose: each pass as an arrow from where it started to where it ended, on the near-black pitch: completed in the
//          focus blue (brighter when progressive), failed in grey, key passes (a shot followed) in the accent; chips
//          pick which passes show
// Inputs:  passes in the team frame (charts.ts passLines), who they belong to
// Outputs: a viz card
// Spec:    web/specs/charts.md §6

import { useState } from "react";
import type { PassLine } from "@/lib/live/charts";
import { Chips, Em, EmptyViz, InsightPanel, VizCard, VizPitch } from "@/components/viz/Viz";

type Filter = "all" | "completed" | "progressive" | "key";

export function PassMap({ passes, who, controls }: { passes: readonly PassLine[]; who: string; controls?: React.ReactNode }) {
  const [filter, setFilter] = useState<Filter>("all");
  const ok = passes.filter((p) => p.ok);
  const prog = ok.filter((p) => p.progressive);
  const key = passes.filter((p) => p.key);
  const pick = { all: passes, completed: ok, progressive: prog, key }[filter];
  const shown = pick.slice(-160);
  const markerId = `pm-${who.replace(/\W/g, "")}`;
  return (
    <VizCard
      eyebrow="Pass map · this match"
      title={`${who} passes`}
      subtitle="Each pass from where it started to where it ended"
      kpis={[
        { value: String(passes.length), label: "Passes" },
        { value: passes.length ? `${Math.round((ok.length / passes.length) * 100)}%` : "–", label: "Completed", focus: true },
        { value: String(prog.length), label: "Progressive" },
      ]}
      controls={
        <>
          <Chips
            label="Which passes"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: passes.length },
              { id: "completed", label: "Completed", count: ok.length },
              { id: "progressive", label: "Progressive", count: prog.length },
              { id: "key", label: "Key passes", count: key.length },
            ]}
          />
          {controls}
        </>
      }
      aside={
        passes.length ? (
          <InsightPanel
            sentence={
              <>
                <Em>{prog.length} progressive passes</Em> (10 m or more forward into the opponent&apos;s half) and {key.length} that led straight to a shot.
              </>
            }
            note={pick.length > shown.length ? `Showing the newest ${shown.length} of ${pick.length}.` : undefined}
          />
        ) : undefined
      }
    >
      {!passes.length ? (
        <EmptyViz text="No passes yet." />
      ) : (
        <VizPitch label={`${who} passes: ${shown.length} shown`}>
          <defs>
            {[
              ["ok", "var(--color-viz-focus)"],
              ["fail", "#6b6b7a"],
              ["key", "var(--color-accent)"],
            ].map(([k, c]) => (
              <marker key={k} id={`${markerId}-${k}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3" markerHeight="3" orient="auto">
                <path d="M0 0 L6 3 L0 6 z" fill={c} />
              </marker>
            ))}
          </defs>
          {shown.map((p) => {
            const kind = p.key ? "key" : p.ok ? "ok" : "fail";
            const stroke = p.key ? "var(--color-accent)" : p.ok ? "var(--color-viz-focus)" : "#6b6b7a";
            return (
              <line
                key={p.id}
                x1={p.x * 1.05}
                y1={p.y * 0.68}
                x2={p.ex * 1.05}
                y2={p.ey * 0.68}
                stroke={stroke}
                strokeWidth={p.key ? 0.5 : 0.3}
                strokeOpacity={p.ok ? (p.progressive ? 0.95 : 0.5) : 0.4}
                markerEnd={`url(#${markerId}-${kind})`}
              />
            );
          })}
        </VizPitch>
      )}
    </VizCard>
  );
}
