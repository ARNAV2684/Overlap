// PressingZones.tsx — Where a team presses
//
// Purpose: the stats engine's pressing grid as zones on the blue ramp with their counts, the share in each third,
//          the press line, and the busiest zones in words
// Inputs:  one side's grid [col][row] (9 columns from its own goal, 6 rows from its left; CONTRACTS.md §7.4), the
//          team's PPDA and press height from the light panel
// Outputs: a viz card
// Spec:    web/specs/charts.md §9

import { busiestZones, thirds } from "@/lib/live/charts";
import { Em, EmptyViz, InsightPanel, PitchLine, RampLegend, StatStrip, VizCard, VizPitch, ZoneGrid } from "@/components/viz/Viz";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PressingZones({
  grid,
  team,
  ppda,
  heightM,
  controls,
}: {
  grid: readonly (readonly number[])[] | null;
  team: string;
  ppda: number | null;
  heightM: number | null;
  controls?: React.ReactNode;
}) {
  const t = grid ? thirds(grid) : null;
  const busiest = grid ? busiestZones(grid) : [];
  const ahead = t ? t.middle + t.final : 0;
  return (
    <VizCard
      eyebrow="Pressing zones · this match"
      title={`Where ${team} press`}
      subtitle="Pressures in each zone, the team attacking left to right"
      kpis={[
        { value: t ? String(t.total) : "–", label: "Pressures" },
        { value: heightM !== null ? heightM.toFixed(0) : "–", label: "Press ht (m)", focus: true },
        { value: ppda !== null ? ppda.toFixed(1) : "–", label: "PPDA 10′" },
      ]}
      controls={controls}
      aside={
        t && t.total > 0 ? (
          <InsightPanel
            sentence={
              <>
                {team} make <Em>{pct(ahead)}</Em> of their pressures outside their own third
                {heightM !== null ? (
                  <>
                    , with the press line at <Em>{heightM.toFixed(0)} m</Em> from their goal
                  </>
                ) : null}
                .
              </>
            }
            listTitle="Busiest zones"
            items={busiest.map((z) => ({ label: z.label, value: String(z.count) }))}
            note="PPDA is opponent passes allowed per defensive action over the last 10 minutes: lower means a harder press."
          />
        ) : undefined
      }
      footer={t && t.total > 0 ? <RampLegend /> : undefined}
    >
      {!grid || !t || t.total === 0 ? (
        <EmptyViz text="No pressing actions yet." />
      ) : (
        <>
          <StatStrip
            cells={[
              { value: pct(t.own), label: "Own third", share: t.own },
              { value: pct(t.middle), label: "Middle third", share: t.middle },
              { value: pct(t.final), label: "Final third", share: t.final },
            ]}
          />
          <VizPitch footer={heightM !== null} label={`${team} pressing zones: ${t.total} pressures`}>
            <ZoneGrid grid={grid} showCounts />
            {heightM !== null && <PitchLine xM={heightM} label={`PRESS LINE ${heightM.toFixed(0)}`} />}
          </VizPitch>
        </>
      )}
    </VizCard>
  );
}
