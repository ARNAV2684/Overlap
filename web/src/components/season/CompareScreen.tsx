"use client";

// CompareScreen.tsx — Two players side by side
//
// Purpose: compare two players: their attributes, one radar with both (the first player's group values as
//          percentiles of that group) and their per-90 values; a picker of the first player's peers
// Inputs:  two PlayerViews (the second may be null until one is picked)
// Outputs: UI
// Spec:    web/specs/screens.md §11

import Link from "next/link";
import { playerValue, type PlayerView } from "@/lib/season";
import { InsightPanel, VizCard } from "@/components/viz/Viz";
import { attributeTone, VALUE_LABEL } from "./PlayerScreen";

const SECOND = "#f5a524";

export function CompareScreen({ a, b }: { a: PlayerView; b: PlayerView | null }) {
  const keys = a.radar;
  const C = 50;
  const R = 34;
  const angle = (i: number) => -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
  const at = (i: number, v: number) => [C + Math.cos(angle(i)) * R * (v / 100), C + Math.sin(angle(i)) * R * (v / 100)] as const;
  const pa = keys.map((k) => a.player.percentiles?.[k] ?? 0);
  // The second player is placed among the first player's group, so both shapes share one scale
  const pb = b ? keys.map((k) => (b.player.group === a.player.group ? b.player.percentiles?.[k] ?? null : null) ?? 0) : [];
  const attrs = Object.keys(a.player.attr);
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6">
      <Link href={`/player/${a.player.player_id}`} className="ov-eyebrow text-ink/45 hover:text-ink">
        ← {a.player.name}
      </Link>
      <VizCard
        eyebrow={`Compare · ${(a.player.group ?? "").replace("_", " ")}`}
        title={b ? `${a.player.name} or ${b.player.name}?` : `Compare ${a.player.name} with…`}
        subtitle="Pick a player from the same position group"
        controls={
          <div className="flex flex-wrap gap-1.5">
            {a.peers
              .filter((p) => p.player_id !== a.player.player_id)
              .slice(0, 24)
              .map((p) => (
                <Link key={p.player_id} href={`/compare?a=${a.player.player_id}&b=${p.player_id}`} className={`viz-chip ${b?.player.player_id === p.player_id ? "viz-chip-on" : ""}`}>
                  {p.name}
                </Link>
              ))}
          </div>
        }
      >
        {!b ? (
          <p className="text-[13px] text-ink/50">Choose a second player above.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <svg viewBox="0 0 100 100" className="viz-pitch mx-auto block w-full max-w-[440px]" role="img" aria-label={`Radar: ${a.player.name} against ${b.player.name}`}>
              <rect width="100" height="100" fill="var(--color-viz-bg)" />
              {[25, 50, 75, 100].map((v) => (
                <polygon key={v} points={keys.map((_, i) => at(i, v).join(",")).join(" ")} fill="none" stroke="var(--color-viz-line)" strokeWidth="0.2" />
              ))}
              {keys.map((k, i) => {
                const [lx, ly] = at(i, 120);
                return (
                  <text key={k} x={lx} y={ly + 1} textAnchor="middle" className="viz-svg-axis" style={{ fontSize: "2.5px" }}>
                    {(VALUE_LABEL[k] ?? k).toUpperCase()}
                  </text>
                );
              })}
              <polygon points={pa.map((v, i) => at(i, v).join(",")).join(" ")} fill="var(--color-viz-focus)" fillOpacity="0.3" stroke="var(--color-viz-focus)" strokeWidth="0.6" />
              <polygon points={pb.map((v, i) => at(i, v).join(",")).join(" ")} fill={SECOND} fillOpacity="0.22" stroke={SECOND} strokeWidth="0.6" />
            </svg>
            <InsightPanel
              sentence={
                b.player.group === a.player.group ? (
                  <>
                    Percentiles within {(a.player.group ?? "").replace("_", " ")}; blue is {a.player.name}, amber {b.player.name}.
                  </>
                ) : (
                  <>Different position groups: the radar shows only {a.player.name}. Compare the per-90 values below.</>
                )
              }
              listTitle="Per 90"
              items={keys.map((k) => {
                const va = playerValue(a.player, k);
                const vb = playerValue(b.player, k);
                const d = k.endsWith("_pct") ? 0 : 2;
                return { label: VALUE_LABEL[k] ?? k, value: `${va === null ? "–" : va.toFixed(d)} · ${vb === null ? "–" : vb.toFixed(d)}` };
              })}
              note={b.player.low_sample || a.player.low_sample ? `One of them has under ${a.meta.min_minutes_for_percentiles} minutes, so their percentiles aren't shown.` : undefined}
            />
          </div>
        )}
      </VizCard>
      {b && (
        <VizCard eyebrow="Attributes" title="The scout's view" subtitle="Twelve attributes, 1–100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="ov-eyebrow text-left text-ink/40">
                  <th className="py-2 font-bold">Attribute</th>
                  <th className="py-2 text-right font-bold text-viz-focus">{a.player.name}</th>
                  <th className="py-2 text-right font-bold" style={{ color: SECOND }}>
                    {b.player.name}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {attrs.map((k) => (
                  <tr key={k}>
                    <td className="py-1.5 capitalize text-ink/70">{k}</td>
                    {[a.player.attr[k], b.player.attr[k]].map((v, i) => (
                      <td key={i} className="py-1.5 text-right">
                        {v === undefined ? (
                          "–"
                        ) : (
                          <span className="inline-block w-9 rounded-[5px] py-0.5 text-center font-mono font-black text-black/85" style={{ background: attributeTone(v) }}>
                            {v}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </VizCard>
      )}
    </main>
  );
}
