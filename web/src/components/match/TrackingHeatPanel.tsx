"use client";

// TrackingHeatPanel.tsx — The match, mapped
//
// Purpose: where a team, or one player, has been, for the whole session or one half, as zones on the blue ramp,
//          with how much tracking it is built from. Team, half and player are picked with chips, not dropdowns
// Inputs:  the match memory's per-player heat (charts.ts heatGrid does the density, direction and smoothing)
// Outputs: a viz card
// Spec:    web/specs/charts.md §10
//
// The panel only knows the tracking this page has received: a viewer who joins late sees less, and it never claims
// full-match coverage.

import { useMemo, useState } from "react";
import type { Side } from "@/lib/coordinates";
import { heatGrid } from "@/lib/live/charts";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { HeatMap } from "@/components/charts/HeatMap";
import { Chips, Em, InsightPanel, RampLegend, Toggle, VizCard } from "@/components/viz/Viz";

const PERIODS = [
  { id: "0", label: "All observed" },
  { id: "1", label: "First half" },
  { id: "2", label: "Second half" },
] as const;

export function TrackingHeatPanel() {
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  const [side, setSide] = useState<Side>("home");
  const [player, setPlayer] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("0");
  const team = setup?.teams[side];
  const roster = useMemo(() => (team ? [...team.lineup, ...team.bench] : []), [team]);
  const selected = roster.find((p) => p.player_id === player);
  const p = Number(period);

  const { grid, samples, observed, observedIds } = useMemo(() => {
    void tick;
    const ids = selected ? [selected.player_id] : roster.map((r) => r.player_id);
    const source = {
      heat(id: string) {
        const h = memory.heat(id);
        return h ? { byPeriod: new Map([...h.byPeriod].filter(([q]) => p === 0 || q === p)) } : null;
      },
    };
    let samples = 0;
    let observed = 0;
    const observedIds = new Set<string>();
    for (const r of roster) {
      let count = 0;
      source.heat(r.player_id)?.byPeriod.forEach((cells) => {
        for (const n of cells) count += n;
      });
      if (count) observedIds.add(r.player_id);
      if (ids.includes(r.player_id)) {
        samples += count;
        if (count) observed++;
      }
    }
    return { grid: heatGrid(source, ids, side), samples, observed, observedIds };
  }, [memory, tick, roster, selected, side, p]);

  const label = selected?.name ?? team?.name ?? "Team";
  const players = roster.filter((r) => observedIds.has(r.player_id));

  return (
    <VizCard
      eyebrow="Tracking heatmap · observed"
      title="Where the game happens"
      subtitle={selected ? `${selected.name}'s positions` : `${team?.name ?? "The team"}'s positions, every player together`}
      kpis={[
        { value: samples.toLocaleString("en-US"), label: "Samples" },
        { value: String(observed), label: "Players", focus: true },
      ]}
      controls={
        <>
          <Chips
            label="Heatmap period"
            options={PERIODS}
            value={period}
            onChange={setPeriod}
          />
          {setup && (
            <Toggle
              label="Heatmap team"
              value={side}
              onChange={(s) => {
                setSide(s);
                setPlayer("");
              }}
              options={(["home", "away"] as const).map((s) => ({ id: s, label: setup.teams[s].team_id, dot: overlayColour(setup.teams[s].colours) }))}
            />
          )}
        </>
      }
      aside={
        <div className="flex h-full flex-col gap-3">
          <InsightPanel
            sentence={
              selected ? (
                <>
                  Where <Em>{selected.name}</Em> has been{p ? ` in the ${p === 1 ? "first" : "second"} half` : ""}, from {samples.toLocaleString("en-US")} observed positions.
                </>
              ) : (
                <>
                  Where <Em>{team?.name ?? "the team"}</Em> have been{p ? ` in the ${p === 1 ? "first" : "second"} half` : ""}. Pick a player to see one.
                </>
              )
            }
            note="Built only from the tracking this page has received; joining late leaves out earlier movement. Both halves face the same way, and colours scale to this selection's peak."
          />
        </div>
      }
      footer={
        <>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Heatmap player">
            <button type="button" role="radio" aria-checked={!selected} onClick={() => setPlayer("")} className={`viz-chip shrink-0 ${!selected ? "viz-chip-on" : ""}`}>
              Whole team
            </button>
            {players.map((r) => (
              <button
                key={r.player_id}
                type="button"
                role="radio"
                aria-checked={selected?.player_id === r.player_id}
                onClick={() => setPlayer(r.player_id)}
                className={`viz-chip shrink-0 ${selected?.player_id === r.player_id ? "viz-chip-on" : ""}`}
              >
                <span className="mr-1 font-mono text-[10.5px] opacity-60">{r.shirt}</span>
                {r.name.split(" ").slice(-1)[0]}
              </button>
            ))}
          </div>
          <RampLegend low="Less time" high="More time" />
        </>
      }
    >
      <HeatMap grid={grid} label={label} />
    </VizCard>
  );
}
