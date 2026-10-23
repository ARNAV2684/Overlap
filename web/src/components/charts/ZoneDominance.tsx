// ZoneDominance.tsx — Who owns which part of the pitch
//
// Purpose: for each of the 18 touch zones, which team had more of the ball there, coloured in that team's colour
//          by how clearly, with the home team attacking left to right; a count of zones owned in each third
// Inputs:  both sides' touch zones from the heavy block ([channel][col], each in its own frame; CONTRACTS.md §7.4)
// Outputs: a viz card
// Spec:    web/specs/charts.md §12

import { dominance } from "@/lib/live/charts";
import { Em, EmptyViz, InsightPanel, VizCard, VizPitch } from "@/components/viz/Viz";

type TeamInfo = { name: string; colour: string };

export function ZoneDominance({
  home,
  away,
  zonesHome,
  zonesAway,
}: {
  home: TeamInfo;
  away: TeamInfo;
  zonesHome: readonly (readonly number[])[] | null;
  zonesAway: readonly (readonly number[])[] | null;
}) {
  const grid = zonesHome && zonesAway ? dominance(zonesHome, zonesAway) : null;
  const cells = grid?.flat().filter((v): v is number => v !== null) ?? [];
  const owned = { home: cells.filter((v) => v > 0.55).length, away: cells.filter((v) => v < 0.45).length };
  const contested = cells.length - owned.home - owned.away;
  const finalThird = (side: "home" | "away") =>
    (grid ?? []).slice(4).flat().filter((v) => v !== null && (side === "home" ? v > 0.55 : v < 0.45)).length;
  const cw = 105 / 6;
  const rh = 68 / 3;
  return (
    <VizCard
      eyebrow="Zone dominance · this match"
      title="Who owns the pitch"
      subtitle={`Each zone in the colour of the team with more of the ball there, ${home.name} attacking left to right`}
      kpis={[
        { value: String(owned.home), label: `${home.name.split(" ")[0]} zones`, focus: true },
        { value: String(contested), label: "Contested" },
        { value: String(owned.away), label: `${away.name.split(" ")[0]} zones` },
      ]}
      aside={
        cells.length ? (
          <InsightPanel
            sentence={
              <>
                {owned.home >= owned.away ? home.name : away.name} own <Em>{Math.max(owned.home, owned.away)} of 18 zones</Em>
                {", "}
                {finalThird(owned.home >= owned.away ? "home" : "away")} of them in the attacking third.
              </>
            }
            listTitle="Zones owned"
            items={[
              { label: home.name, value: String(owned.home), dot: home.colour },
              { label: "Contested (45–55%)", value: String(contested) },
              { label: away.name, value: String(owned.away), dot: away.colour },
            ]}
            note="A zone is owned at 55% or more of both teams' touches in it."
          />
        ) : undefined
      }
    >
      {!grid || !cells.length ? (
        <EmptyViz text="Zone dominance appears after the first minute." />
      ) : (
        <VizPitch label={`Zone dominance: ${home.name} ${owned.home}, ${away.name} ${owned.away}, contested ${contested}`}>
          {grid.map((col, c) =>
            col.map((v, r) => {
              if (v === null) return null;
              const homeLead = v >= 0.5;
              const strength = Math.min(1, Math.abs(v - 0.5) * 2.4);
              return (
                <g key={`${c}:${r}`}>
                  <rect
                    x={c * cw + 0.3}
                    y={r * rh + 0.3}
                    width={cw - 0.6}
                    height={rh - 0.6}
                    fill={homeLead ? home.colour : away.colour}
                    fillOpacity={0.08 + strength * 0.72}
                  />
                  <text x={c * cw + cw / 2} y={r * rh + rh / 2 + 1.2} textAnchor="middle" className="viz-svg-count">
                    {Math.round((homeLead ? v : 1 - v) * 100)}%
                  </text>
                </g>
              );
            }),
          )}
        </VizPitch>
      )}
    </VizCard>
  );
}
