// MomentumChart.tsx — Momentum, five minutes at a time
//
// Purpose: the stats engine's weighted momentum per 5-minute bucket as a tide: the home team above the line, the
//          away team below, smoothed into curves, with the goals marked where they happened
// Inputs:  momentum points (charts.ts momentumSeries), goals, both teams' colours and names
// Outputs: SVG
// Spec:    web/specs/charts.md §2; the momentum definition is CONTRACTS.md §8

import type { MomentumPoint } from "@/lib/live/charts";
import type { Goal } from "@/lib/live/match-memory";

const W = 1100;
const H = 210;
const MID = H / 2;
const PAD = 14;

/** Catmull-Rom through the points, as cubic Béziers. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function MomentumChart({
  points,
  goals,
  home,
  away,
}: {
  points: readonly MomentumPoint[];
  goals: readonly Goal[];
  home: { name: string; colour: string };
  away: { name: string; colour: string };
}) {
  // Both halves share the width: 9 buckets each (0–45, 45–90), plus stoppage if any
  const perHalf = Math.max(9, ...points.map((p) => p.bucket + 1));
  const halfW = (W - PAD * 3) / 2;
  const xOf = (period: number, bucket: number) => PAD + (period === 2 ? halfW + PAD : 0) + ((bucket + 0.5) / perHalf) * halfW;
  const max = Math.max(4, ...points.map((p) => Math.max(p.home, p.away)));
  const amp = MID - 10;

  const halves = [1, 2].map((period) => {
    const pts = points.filter((p) => p.period === period);
    if (!pts.length) return null;
    const start = { x: xOf(period, 0) - (halfW / perHalf) * 0.5, y: MID };
    const end = { x: xOf(period, pts[pts.length - 1].bucket) + 2, y: MID };
    const homeLine = [start, ...pts.map((p) => ({ x: xOf(period, p.bucket), y: MID - (p.home / max) * amp })), end];
    const awayLine = [start, ...pts.map((p) => ({ x: xOf(period, p.bucket), y: MID + (p.away / max) * amp })), end];
    return { period, homeLine, awayLine };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Momentum: ${home.name} above the line, ${away.name} below`}>
      <defs>
        <linearGradient id="mom-home" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={home.colour} stopOpacity="0.95" />
          <stop offset="100%" stopColor={home.colour} stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="mom-away" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={away.colour} stopOpacity="0.95" />
          <stop offset="100%" stopColor={away.colour} stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {[1, 2].map((period) => (
        <g key={period}>
          <rect x={xOf(period, 0) - halfW / perHalf / 2} y={6} width={halfW} height={H - 12} rx="8" className="fill-ink/[0.025]" />
          {Array.from({ length: perHalf + 1 }, (_, i) => (
            <line
              key={i}
              x1={xOf(period, i) - halfW / perHalf / 2}
              x2={xOf(period, i) - halfW / perHalf / 2}
              y1={10}
              y2={H - 10}
              className="stroke-ink/[0.05]"
            />
          ))}
          <text x={xOf(period, 0) - halfW / perHalf / 2 + 6} y={18} className="fill-ink/30 font-mono text-[11px] font-bold">
            {period === 1 ? "1ST HALF" : "2ND HALF"}
          </text>
        </g>
      ))}
      {halves.map(
        (h) =>
          h && (
            <g key={h.period}>
              <path d={`${smoothPath(h.homeLine)} Z`} fill="url(#mom-home)" />
              <path d={`${smoothPath(h.awayLine)} Z`} fill="url(#mom-away)" />
              <path d={smoothPath(h.homeLine)} fill="none" stroke={home.colour} strokeWidth="1.6" />
              <path d={smoothPath(h.awayLine)} fill="none" stroke={away.colour} strokeWidth="1.6" />
            </g>
          ),
      )}
      <line x1={PAD} x2={W - PAD} y1={MID} y2={MID} className="stroke-ink/30" strokeWidth="1" />
      {goals.map((g, i) => {
        // Place the goal by its clock minute within its half ("45+2:10" counts as 45)
        const clockMin = Number.parseInt(g.clock, 10);
        const within = g.period === 1 ? clockMin : clockMin - 45;
        const x = xOf(g.period, Math.max(0, within / 5) - 0.5);
        const up = g.side === "home";
        return (
          <g key={i} aria-label={`Goal at ${g.clock}`}>
            <line x1={x} x2={x} y1={MID} y2={up ? 26 : H - 26} stroke="#e5484d" strokeWidth="1.2" strokeDasharray="2 2" />
            <circle cx={x} cy={up ? 22 : H - 22} r="9" fill="#e5484d" />
            <text x={x} y={(up ? 22 : H - 22) + 3} textAnchor="middle" className="fill-white font-mono text-[10px] font-black">
              G
            </text>
          </g>
        );
      })}
    </svg>
  );
}
