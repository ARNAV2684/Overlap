// MomentumTide.tsx — Momentum tide
//
// Purpose: the momentum of the match in 5-minute spells: each team's weighted actions (CONTRACTS.md §8), home up from
//          the centre line and away down, one column per spell, the halves side by side
// Inputs:  buckets (from tideSeries(): every heavy bucket, with the light panel's current one; empty before the first
//          panel: a waiting message), home / away (club names), className
// Outputs: an SVG with role="img" and a label naming the latest spell's numbers; a <title> per spell
// Spec:    web/specs/charts.md §2 (momentum tide)
//
// Heights are scaled to the largest value so far, so the tide rescales as the match goes on. Colours come from
// --team-home / --team-away. No window or highlight yet: they come with overlays.

import { memo } from "react";
import { cn } from "@/lib/cn";
import type { MomentumBucket } from "@/lib/contracts";
import { bucketLabel, periodName, tideMax } from "@/lib/stat-charts";

type MomentumTideProps = {
  buckets: readonly MomentumBucket[];
  home: string;
  away: string;
  className?: string;
};

/** SVG user units. */
const BAR = 6;
const STEP = 7;
const GROUP_GAP = 6;
const HALF_HEIGHT = 26;
const TOP = 2;
const MID = TOP + HALF_HEIGHT;
const LABEL_Y = MID + HALF_HEIGHT + 7;
const HEIGHT = LABEL_Y + 2;

const points = (value: number) => value.toFixed(1);

function layout(buckets: readonly MomentumBucket[]) {
  const groups: { period: number; x: number; width: number; bars: (MomentumBucket & { x: number })[] }[] = [];
  let x = 0;
  for (const b of buckets) {
    let group = groups.at(-1);
    if (!group || group.period !== b.period) {
      if (group) x += GROUP_GAP - (STEP - BAR);
      group = { period: b.period, x, width: 0, bars: [] };
      groups.push(group);
    }
    group.bars.push({ ...b, x });
    group.width = x + BAR - group.x;
    x += STEP;
  }
  return { groups, width: Math.max(x - (STEP - BAR), BAR) };
}

function MomentumTideView({ buckets, home, away, className }: MomentumTideProps) {
  if (buckets.length === 0) {
    return <p className={cn("py-6 text-center text-body-sm text-ink-muted", className)}>Waiting for the first stat panel.</p>;
  }

  const max = tideMax(buckets);
  const scale = (value: number) => (value / max) * HALF_HEIGHT;
  const { groups, width } = layout(buckets);
  const last = buckets[buckets.length - 1];
  const label =
    `Momentum by 5-minute spell, ${home} above the line and ${away} below. ` +
    `Latest spell, ${bucketLabel(last)}: ${home} ${points(last.home)}, ${away} ${points(last.away)}.`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-team-home" />
          {home} ▲
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-team-away" />
          {away} ▼
        </li>
      </ul>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label} className="block h-auto w-full">
        {groups.map((group) => (
          <g key={group.period}>
            <line x1={group.x} x2={group.x + group.width} y1={MID} y2={MID} className="stroke-line-strong" strokeWidth={0.4} />
            {group.bars.map((b) => (
              <g key={b.bucket}>
                <title>{`${bucketLabel(b)}: ${home} ${points(b.home)}, ${away} ${points(b.away)}`}</title>
                <rect x={b.x} y={TOP} width={BAR} height={HALF_HEIGHT * 2} className="fill-transparent" />
                <rect x={b.x} y={MID - scale(b.home)} width={BAR} height={scale(b.home)} rx={0.6} className="fill-team-home" />
                <rect x={b.x} y={MID} width={BAR} height={scale(b.away)} rx={0.6} className="fill-team-away" />
              </g>
            ))}
            <text
              x={group.x + group.width / 2}
              y={LABEL_Y}
              textAnchor="middle"
              aria-hidden="true"
              className="fill-ink-muted text-[4px]"
            >
              {periodName(group.period)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Memoised on the buckets: the section rebuilds them only when a panel changes. */
export const MomentumTide = memo(MomentumTideView);
