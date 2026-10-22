// ShotMap.tsx — Where a team shot from
//
// Purpose: every shot of one team on the attacking half, coloured by outcome; goals larger and ringed; the shot the
//          current AI card is about is highlighted
// Inputs:  shots in the team frame (charts.ts teamShots), the highlighted event id, the team colour
// Outputs: SVG with a legend
// Spec:    web/specs/charts.md §4. Shot size is fixed until per-shot xG reaches the screen (heavy.shots)

import type { ShotDot } from "@/lib/live/charts";
import { MiniPitch, toM } from "./MiniPitch";

const OUTCOME: Record<ShotDot["outcome"], { colour: string; label: string }> = {
  goal: { colour: "var(--color-shot-goal)", label: "Goal" },
  saved: { colour: "var(--color-shot-saved)", label: "Saved" },
  missed: { colour: "var(--color-shot-missed)", label: "Off target" },
  blocked: { colour: "var(--color-shot-blocked)", label: "Blocked" },
  woodwork: { colour: "var(--color-shot-woodwork)", label: "Woodwork" },
};

export function ShotMap({ shots, highlight, team }: { shots: readonly ShotDot[]; highlight?: string | null; team: string }) {
  const seen = new Set(shots.map((s) => s.outcome));
  return (
    <div>
      <MiniPitch half label={`${team} shot map: ${shots.length} shots`}>
        {shots.map((s) => {
          const p = toM(s.x, s.y);
          const goal = s.outcome === "goal";
          const hot = s.id === highlight;
          return (
            <g key={s.id}>
              {hot && <circle cx={p.x} cy={p.y} r={3.6} fill="none" stroke="#fff" strokeWidth="0.5" className="animate-pulse" />}
              {goal && <line x1={p.x} y1={p.y} x2={105} y2={34} stroke={OUTCOME.goal.colour} strokeWidth="0.25" strokeDasharray="0.8 0.8" opacity="0.7" />}
              <circle cx={p.x} cy={p.y} r={goal ? 1.9 : 1.25} fill={OUTCOME[s.outcome].colour} fillOpacity={goal ? 1 : 0.85} stroke={goal ? "#fff" : "none"} strokeWidth="0.35">
                <title>{`${s.clock} · ${OUTCOME[s.outcome].label}${s.speedKmh ? ` · ${Math.round(s.speedKmh)} km/h` : ""}`}</title>
              </circle>
            </g>
          );
        })}
      </MiniPitch>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {(Object.keys(OUTCOME) as ShotDot["outcome"][])
          .filter((k) => seen.has(k))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/45">
              <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME[k].colour }} />
              {OUTCOME[k].label} {shots.filter((s) => s.outcome === k).length}
            </span>
          ))}
        {!shots.length && <span className="text-sm text-ink/40">No shots yet.</span>}
      </div>
    </div>
  );
}
