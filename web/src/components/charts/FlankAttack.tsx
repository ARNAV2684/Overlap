// FlankAttack.tsx — Attack by flank
//
// Purpose: how a team attacked down the left, through the centre and down the right: the share of its touches in
//          the attacking half in each lane, with the shots and xG that came from there
// Inputs:  the side's touch zones and shots with xG from the heavy block (CONTRACTS.md §7.4)
// Outputs: a viz card
// Spec:    web/specs/charts.md §12

import type { HeavyShot } from "@/lib/contracts";
import { flanks } from "@/lib/live/charts";
import { Em, EmptyViz, InsightPanel, RampLegend, StatStrip, VizCard, VizPitch, rampColour } from "@/components/viz/Viz";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function FlankAttack({
  team,
  zones,
  shots,
  controls,
}: {
  team: string;
  zones: readonly (readonly number[])[] | null;
  shots: readonly HeavyShot[] | null;
  controls?: React.ReactNode;
}) {
  const lanes = zones ? flanks(zones, shots) : [];
  const total = lanes.reduce((s, l) => s + l.touchShare, 0);
  const top = [...lanes].sort((a, b) => b.touchShare - a.touchShare)[0];
  const max = Math.max(1e-9, ...lanes.map((l) => l.touchShare));
  const rh = 68 / 3;
  return (
    <VizCard
      eyebrow="Attack by flank · this match"
      title={`How ${team} attack`}
      subtitle="Touches in the attacking half down each lane, with the shots that came from it"
      kpis={lanes.map((l) => ({ value: pct(l.touchShare), label: `${l.label}`, focus: l === top }))}
      controls={controls}
      aside={
        total > 0 && top ? (
          <InsightPanel
            sentence={
              <>
                {team} go <Em>{top.label === "Centre" ? "through the middle" : `down the ${top.label.toLowerCase()}`}</Em> most:{" "}
                {pct(top.touchShare)} of their touches in the attacking half.
              </>
            }
            listTitle="Lanes · shots and xG"
            items={lanes.map((l) => ({ label: `${l.label} · ${l.shots} shots`, value: shots ? `${l.xg.toFixed(2)} xG` : "–" }))}
            note={shots ? undefined : "xG per lane appears when the stats engine sends shots with xG."}
          />
        ) : undefined
      }
      footer={total > 0 ? <RampLegend /> : undefined}
    >
      {total === 0 ? (
        <EmptyViz text="No touches in the attacking half yet." />
      ) : (
        <>
          <StatStrip cells={lanes.map((l) => ({ value: pct(l.touchShare), label: `${l.label} channel`, share: l.touchShare, focus: l === top }))} />
          <VizPitch half label={`${team} attack by flank: ${lanes.map((l) => `${l.label} ${pct(l.touchShare)}`).join(", ")}`}>
            {lanes.map((l) => (
              <g key={l.channel}>
                <rect x="52.5" y={l.channel * rh + 0.3} width="52.5" height={rh - 0.6} fill={rampColour(l.touchShare / max)} />
                <text x="78.75" y={l.channel * rh + rh / 2} textAnchor="middle" className="viz-svg-count" style={{ fontSize: "5px" }}>
                  {pct(l.touchShare)}
                </text>
                <text x="78.75" y={l.channel * rh + rh / 2 + 4.2} textAnchor="middle" className="viz-svg-label" style={{ fontSize: "2.6px" }}>
                  {l.shots} SHOTS{shots ? ` · ${l.xg.toFixed(2)} xG` : ""}
                </text>
              </g>
            ))}
            {(shots ?? []).map((s) => (
              <circle key={s.event_id} cx={s.x * 1.05} cy={s.y * 0.68} r={0.6 + Math.sqrt(s.xg) * 2.2} fill="#fff" fillOpacity={s.outcome === "goal" ? 0.95 : 0.35} />
            ))}
          </VizPitch>
        </>
      )}
    </VizCard>
  );
}
