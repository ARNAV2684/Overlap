// XgRace.tsx — The xG race
//
// Purpose: both teams' expected goals adding up shot by shot through the match, each goal marked on its team's
//          line, so the viewer sees who created more and when
// Inputs:  both sides' shots with xG from the heavy block, the current match minute, team names and colours
// Outputs: a viz card
// Spec:    web/specs/charts.md §11

import type { HeavyShot } from "@/lib/contracts";
import { xgRace, type XgStep } from "@/lib/live/charts";
import { Em, EmptyViz, InsightPanel, VizCard } from "@/components/viz/Viz";

type TeamInfo = { name: string; colour: string };
const W = 160;
const H = 70;
const PAD = { l: 9, r: 4, t: 5, b: 9 };

function path(steps: readonly XgStep[], sx: (m: number) => number, sy: (v: number) => number): string {
  let d = `M${sx(steps[0].minute)} ${sy(steps[0].total)}`;
  for (let i = 1; i < steps.length; i++) d += ` H${sx(steps[i].minute)} V${sy(steps[i].total)}`;
  return d;
}

export function XgRace({
  home,
  away,
  homeShots,
  awayShots,
  minute,
  clock,
}: {
  home: TeamInfo;
  away: TeamInfo;
  homeShots: readonly HeavyShot[] | null;
  awayShots: readonly HeavyShot[] | null;
  minute: number;
  /** The match clock the numbers are at, e.g. 67:12. */
  clock: string;
}) {
  if (!homeShots || !awayShots) {
    return (
      <VizCard eyebrow="xG race · this match" title="Who created more">
        <EmptyViz text="The xG race needs shots with xG from the stats engine; this match's panels don't have them." />
      </VizCard>
    );
  }
  const end = Math.max(90, minute);
  const h = xgRace(homeShots, minute);
  const a = xgRace(awayShots, minute);
  const top = Math.max(1, Math.ceil(Math.max(h[h.length - 1].total, a[a.length - 1].total) * 2) / 2);
  const sx = (m: number) => PAD.l + (Math.min(m, end) / end) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const ht = h[h.length - 1].total;
  const at = a[a.length - 1].total;
  const leader = ht >= at ? home : away;
  return (
    <VizCard
      eyebrow="xG race · this match"
      title="Who created more"
      subtitle="Expected goals adding up shot by shot; dots are goals"
      kpis={[
        { value: ht.toFixed(2), label: home.name.split(" ")[0], focus: ht >= at },
        { value: at.toFixed(2), label: away.name.split(" ")[0], focus: at > ht },
      ]}
      aside={
        <InsightPanel
          sentence={
            homeShots.length + awayShots.length === 0 ? (
              "No shots yet."
            ) : (
              <>
                {leader.name} lead the chances by <Em>{Math.abs(ht - at).toFixed(2)} xG</Em> at {clock}.
              </>
            )
          }
          listTitle="Shots and xG"
          items={[
            { label: home.name, value: `${homeShots.length} · ${ht.toFixed(2)}`, dot: home.colour },
            { label: away.name, value: `${awayShots.length} · ${at.toFixed(2)}`, dot: away.colour },
          ]}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-pitch block w-full" role="img" aria-label={`xG race: ${home.name} ${ht.toFixed(2)}, ${away.name} ${at.toFixed(2)}`}>
        <rect width={W} height={H} fill="var(--color-viz-bg)" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(top * f)} y2={sy(top * f)} stroke="var(--color-viz-line)" strokeWidth="0.25" />
            <text x={PAD.l - 1.5} y={sy(top * f) + 0.8} textAnchor="end" className="viz-svg-axis">
              {(top * f).toFixed(1)}
            </text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75, 90].map((m) => (
          <text key={m} x={sx(m)} y={H - 3} textAnchor="middle" className="viz-svg-axis">
            {m}′
          </text>
        ))}
        <line x1={sx(45)} x2={sx(45)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-viz-line)" strokeDasharray="1 1" strokeWidth="0.3" />
        {[
          { steps: a, team: away },
          { steps: h, team: home },
        ].map(({ steps, team }) => (
          <g key={team.name}>
            <path d={path(steps, sx, sy)} fill="none" stroke={team.colour} strokeWidth="0.9" strokeLinejoin="round" />
            {steps
              .filter((s) => s.goal)
              .map((s) => (
                <circle key={s.shotId} cx={sx(s.minute)} cy={sy(s.total)} r="1.5" fill={team.colour} stroke="#fff" strokeWidth="0.4" />
              ))}
          </g>
        ))}
      </svg>
    </VizCard>
  );
}
