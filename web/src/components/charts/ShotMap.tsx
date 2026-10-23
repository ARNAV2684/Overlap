// ShotMap.tsx — Where a team shot from, and how good the chances were
//
// Purpose: every shot of one team on the attacking half, its size by xG and its colour by outcome, goals ringed;
//          the shot the current AI card is about pulses; the best chances listed beside it
// Inputs:  shots with xG from the heavy block (charts.ts xgShots), or, for panels without heavy.shots, the shot
//          events (charts.ts teamShots) at a fixed size; player names; the highlighted event id
// Outputs: a viz card
// Spec:    web/specs/charts.md §4

import type { HeavyShot } from "@/lib/contracts";
import type { ShotDot } from "@/lib/live/charts";
import { Em, EmptyViz, InsightPanel, VizCard, VizPitch } from "@/components/viz/Viz";

const OUTCOME: Record<HeavyShot["outcome"], { colour: string; label: string }> = {
  goal: { colour: "var(--color-shot-goal)", label: "Goal" },
  saved: { colour: "var(--color-shot-saved)", label: "Saved" },
  missed: { colour: "var(--color-shot-missed)", label: "Off target" },
  blocked: { colour: "var(--color-shot-blocked)", label: "Blocked" },
  woodwork: { colour: "var(--color-shot-woodwork)", label: "Woodwork" },
};

type Dot = { id: string; x: number; y: number; outcome: HeavyShot["outcome"]; xg: number | null; minute: number | null; playerId?: string | null };

function dots(xgShots: readonly HeavyShot[] | null, fallback: readonly ShotDot[]): Dot[] {
  if (xgShots)
    return xgShots.map((s) => ({ id: s.event_id, x: s.x, y: s.y, outcome: s.outcome, xg: s.xg, minute: Math.floor(s.match_ms / 60_000) + 1, playerId: s.player_id }));
  return fallback.map((s) => ({ id: s.id, x: s.x, y: s.y, outcome: s.outcome, xg: null, minute: null, playerId: s.playerId }));
}

export function ShotMap({
  shots,
  fallback = [],
  names,
  highlight,
  team,
  controls,
}: {
  shots: readonly HeavyShot[] | null;
  fallback?: readonly ShotDot[];
  names?: ReadonlyMap<string, string>;
  highlight?: string | null;
  team: string;
  controls?: React.ReactNode;
}) {
  const all = dots(shots, fallback);
  const xg = shots ? shots.reduce((s, x) => s + x.xg, 0) : null;
  const onTarget = all.filter((d) => d.outcome === "goal" || d.outcome === "saved").length;
  const goals = all.filter((d) => d.outcome === "goal").length;
  const best = shots ? [...all].sort((a, b) => (b.xg ?? 0) - (a.xg ?? 0)).slice(0, 4) : [];
  const seen = new Set(all.map((d) => d.outcome));
  return (
    <VizCard
      eyebrow="Shot map · this match"
      title={`${team} chances`}
      subtitle={shots ? "Each shot sized by its expected goals" : "Each shot, coloured by what happened"}
      kpis={[
        { value: String(all.length), label: "Shots" },
        { value: xg !== null ? xg.toFixed(2) : "–", label: "xG", focus: true },
        { value: String(onTarget), label: "On target" },
      ]}
      controls={controls}
      aside={
        all.length ? (
          <InsightPanel
            sentence={
              xg !== null ? (
                <>
                  {all.length} shots worth <Em>{xg.toFixed(2)} xG</Em>, {goals} scored: {goals > xg + 0.5 ? "more than the chances suggest" : goals < xg - 0.5 ? "fewer than the chances deserve" : "about what the chances were worth"}.
                </>
              ) : (
                <>
                  {all.length} shots, <Em>{onTarget} on target</Em>.
                </>
              )
            }
            listTitle={best.length ? "Best chances" : undefined}
            items={best.map((d) => ({
              label: `${d.minute}′ ${(d.playerId && names?.get(d.playerId)) || "Shot"} · ${OUTCOME[d.outcome].label}`,
              value: d.xg !== null ? d.xg.toFixed(2) : "",
              dot: OUTCOME[d.outcome].colour,
            }))}
          />
        ) : undefined
      }
      footer={
        all.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(Object.keys(OUTCOME) as HeavyShot["outcome"][])
              .filter((k) => seen.has(k))
              .map((k) => (
                <span key={k} className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/45">
                  <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME[k].colour }} />
                  {OUTCOME[k].label} {all.filter((d) => d.outcome === k).length}
                </span>
              ))}
            {shots && <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink/35">Bigger = higher xG</span>}
          </div>
        ) : undefined
      }
    >
      {!all.length ? (
        <EmptyViz text="No shots yet." />
      ) : (
        <VizPitch half label={`${team} shot map: ${all.length} shots${xg !== null ? `, ${xg.toFixed(2)} xG` : ""}`}>
          {all.map((d) => {
            const x = d.x * 1.05;
            const y = d.y * 0.68;
            const r = d.xg !== null ? 0.8 + Math.sqrt(d.xg) * 4 : 1.3;
            const goal = d.outcome === "goal";
            return (
              <g key={d.id}>
                {d.id === highlight && <circle cx={x} cy={y} r={r + 1.6} fill="none" stroke="#fff" strokeWidth="0.45" className="animate-pulse" />}
                <circle cx={x} cy={y} r={r} fill={OUTCOME[d.outcome].colour} fillOpacity={goal ? 0.95 : 0.6} stroke={goal ? "#fff" : OUTCOME[d.outcome].colour} strokeWidth={goal ? 0.4 : 0.2}>
                  <title>{`${d.minute ? `${d.minute}′ · ` : ""}${OUTCOME[d.outcome].label}${d.xg !== null ? ` · ${d.xg.toFixed(2)} xG` : ""}`}</title>
                </circle>
              </g>
            );
          })}
        </VizPitch>
      )}
    </VizCard>
  );
}
