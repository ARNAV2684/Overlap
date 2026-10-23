"use client";

// PlayerScreen.tsx — The player scout card
//
// Purpose: a player in four visuals: the scout card (role, foot, overall and the twelve attributes on a five-step
//          colour scale), the radar of their group's values as percentiles with the group median, the per-90 bars
//          against the group median, and the season maps (shots by xG, touch zones, defensive zones)
// Inputs:  a PlayerView (src/lib/season.ts); every number is from the season document
// Outputs: UI
// Spec:    web/specs/screens.md §10; web/specs/charts.md §14

import Link from "next/link";
import { useState } from "react";
import type { SeasonPlayer } from "@/lib/contracts";
import { zonesByColumn } from "@/lib/live/charts";
import { playerValue, type PlayerView } from "@/lib/season";
import { Em, EmptyViz, InsightPanel, RampLegend, Toggle, VizCard, VizPitch, ZoneGrid } from "@/components/viz/Viz";

const ATTRIBUTE_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Physical", keys: ["pace", "acceleration", "stamina"] },
  { label: "Technical", keys: ["passing", "dribbling", "finishing", "tackling", "aerial"] },
  { label: "Mental", keys: ["vision", "positioning", "composure"] },
  { label: "Goalkeeping", keys: ["goalkeeping"] },
];

/** Five-step attribute scale (charts.md §14): ≤ 40, 41–55, 56–70, 71–85, 86+. */
export function attributeTone(v: number): string {
  if (v >= 86) return "#3b8ef0";
  if (v >= 71) return "#4ade80";
  if (v >= 56) return "#e8d038";
  if (v >= 41) return "#e8a838";
  return "#e5484d";
}

export const VALUE_LABEL: Record<string, string> = {
  goals: "Goals",
  npxg: "npxG",
  shots: "Shots",
  assists: "Assists",
  key_passes: "Key passes",
  passes: "Passes",
  progressive_passes: "Progressive passes",
  take_ons_completed: "Take-ons won",
  tackles: "Tackles",
  interceptions: "Interceptions",
  pressures: "Pressures",
  fouls: "Fouls",
  pass_completion_pct: "Pass completion %",
  take_on_success_pct: "Take-on success %",
  shot_accuracy_pct: "Shot accuracy %",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ScoutCard({ view }: { view: PlayerView }) {
  const p = view.player;
  return (
    <section className="viz-card">
      <div className="flex flex-wrap items-start gap-5">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-mono text-[20px] font-black"
          style={{ background: view.team.colours.primary, color: view.team.colours.secondary, boxShadow: `inset 0 0 0 4px ${view.team.colours.secondary}` }}
        >
          {p.shirt ?? ""}
        </span>
        <div className="min-w-0 flex-1">
          <p className="ov-eyebrow text-ink/45">
            Scout card · season {view.meta.season_id}
          </p>
          <h1 className="mt-1 text-[28px] font-black tracking-tight">{p.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink/55">
            <Link href={`/club/${p.team_id}`} className="hover:text-viz-focus hover:underline">
              {view.team.name}
            </Link>{" "}
            · {p.pos}
            {p.role ? ` · ${p.role.replaceAll("_", " ")}` : ""}
            {p.preferred_foot ? ` · ${p.preferred_foot === "both" ? "two-footed" : `${p.preferred_foot} foot`}` : ""}
            {p.weak_foot ? ` (weak foot ${p.weak_foot}/5)` : ""}
          </p>
        </div>
        <dl className="flex gap-6">
          {[
            { v: p.overall !== null ? p.overall.toFixed(0) : "–", l: "Overall", f: true },
            { v: String(p.minutes), l: "Minutes" },
            { v: `${p.starts}/${p.apps}`, l: "Starts" },
          ].map((k) => (
            <div key={k.l} className="text-right">
              <dd className={`font-mono text-[22px] font-bold tabular ${k.f ? "text-viz-focus" : ""}`}>{k.v}</dd>
              <dt className="mt-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink/45">{k.l}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ATTRIBUTE_GROUPS.map((g) => {
          const keys = g.keys.filter((k) => k in p.attr);
          if (!keys.length) return null;
          return (
            <div key={g.label} className="viz-cell">
              <p className="ov-eyebrow text-ink/40">{g.label}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {keys.map((k) => (
                  <li key={k} className="flex items-center justify-between text-[13px]">
                    <span className="text-ink/70">{cap(k)}</span>
                    <span className="w-9 rounded-[5px] py-0.5 text-center font-mono text-[13px] font-black text-black/85" style={{ background: attributeTone(p.attr[k]) }}>
                      {p.attr[k]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Radar({ view }: { view: PlayerView }) {
  const p = view.player;
  const keys = view.radar;
  if (p.low_sample || !p.percentiles || keys.length < 3) {
    return (
      <VizCard eyebrow="Radar · against their position group" title="How they compare">
        <EmptyViz text={`Not enough minutes yet: percentiles need ${view.meta.min_minutes_for_percentiles} minutes (${p.minutes} so far).`} />
      </VizCard>
    );
  }
  const C = 50;
  const R = 36;
  const angle = (i: number) => -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
  const at = (i: number, v: number) => [C + Math.cos(angle(i)) * R * (v / 100), C + Math.sin(angle(i)) * R * (v / 100)] as const;
  const poly = keys.map((k, i) => at(i, p.percentiles![k] ?? 0).join(",")).join(" ");
  const best = [...keys].sort((a, b) => (p.percentiles![b] ?? 0) - (p.percentiles![a] ?? 0))[0];
  return (
    <VizCard
      eyebrow={`Radar · against ${view.peers.length} ${(p.group ?? "").replace("_", " ")}`}
      title="How they compare"
      subtitle="Each spoke is a percentile in their position group (450+ minutes); the ring is the group median"
      aside={
        <InsightPanel
          sentence={
            <>
              Best in the group at <Em>{(VALUE_LABEL[best] ?? best).toLowerCase()}</Em>: better than {p.percentiles[best]}% of {(p.group ?? "").replace("_", " ")}.
            </>
          }
          listTitle="Percentiles"
          items={keys.map((k) => ({ label: VALUE_LABEL[k] ?? k, value: String(p.percentiles![k] ?? "–") }))}
        />
      }
    >
      <svg viewBox="0 0 100 100" className="viz-pitch mx-auto block w-full max-w-[420px]" role="img" aria-label={`Percentile radar: ${keys.map((k) => `${VALUE_LABEL[k] ?? k} ${p.percentiles![k]}`).join(", ")}`}>
        <rect width="100" height="100" fill="var(--color-viz-bg)" />
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} points={keys.map((_, i) => at(i, v).join(",")).join(" ")} fill="none" stroke={v === 50 ? "rgba(255,255,255,0.35)" : "var(--color-viz-line)"} strokeWidth={v === 50 ? 0.35 : 0.2} strokeDasharray={v === 50 ? "1 0.8" : undefined} />
        ))}
        {keys.map((k, i) => {
          const [x, y] = at(i, 100);
          const [lx, ly] = at(i, 118);
          return (
            <g key={k}>
              <line x1={C} y1={C} x2={x} y2={y} stroke="var(--color-viz-line)" strokeWidth="0.2" />
              <text x={lx} y={ly + 1} textAnchor="middle" className="viz-svg-axis" style={{ fontSize: "2.6px" }}>
                {(VALUE_LABEL[k] ?? k).toUpperCase()}
              </text>
            </g>
          );
        })}
        <polygon points={poly} fill="var(--color-viz-focus)" fillOpacity="0.35" stroke="var(--color-viz-focus)" strokeWidth="0.6" />
        {keys.map((k, i) => {
          const [x, y] = at(i, p.percentiles![k] ?? 0);
          return <circle key={k} cx={x} cy={y} r="1" fill="#fff" />;
        })}
      </svg>
    </VizCard>
  );
}

function Per90({ view }: { view: PlayerView }) {
  const p = view.player;
  const keys = view.radar;
  return (
    <VizCard eyebrow="Output · per 90 minutes" title="What they produce" subtitle="Per-90 values (rates where marked %) against the median of their position group">
      <div className="flex flex-col gap-3">
        {keys.map((k) => {
          const v = playerValue(p, k);
          const med = view.group_median[k] ?? 0;
          const top = Math.max(v ?? 0, med, 1e-9) * 1.25;
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-semibold">{VALUE_LABEL[k] ?? k}</span>
                <span className="font-mono tabular">
                  {v === null ? "–" : v.toFixed(k.endsWith("_pct") ? 0 : 2)}
                  <span className="ml-2 text-[11px] text-ink/40">median {med.toFixed(k.endsWith("_pct") ? 0 : 2)}</span>
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-ink/[0.06]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-viz-focus" style={{ width: `${((v ?? 0) / top) * 100}%` }} />
                <span className="absolute -top-0.5 h-3 w-0.5 bg-ink/60" style={{ left: `${(med / top) * 100}%` }} title="Group median" />
              </div>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}

function Maps({ player }: { player: SeasonPlayer }) {
  const [map, setMap] = useState<"shots" | "touches" | "defence">(player.shots.length ? "shots" : "touches");
  const xg = player.shots.reduce((s, x) => s + x.xg, 0);
  return (
    <VizCard
      eyebrow="Season maps"
      title={map === "shots" ? "Where they shoot from" : map === "touches" ? "Where they play" : "Where they defend"}
      subtitle="Attacking left to right"
      kpis={map === "shots" ? [{ value: String(player.shots.length), label: "Shots" }, { value: xg.toFixed(1), label: "xG", focus: true }] : []}
      controls={
        <Toggle
          label="Map"
          value={map}
          onChange={setMap}
          options={[
            { id: "shots", label: "Shots" },
            { id: "touches", label: "Touches" },
            { id: "defence", label: "Defensive actions" },
          ]}
        />
      }
      footer={map !== "shots" ? <RampLegend /> : undefined}
    >
      {map === "shots" ? (
        player.shots.length ? (
          <VizPitch half label={`${player.name} shots: ${player.shots.length}, ${xg.toFixed(1)} xG`}>
            {player.shots.map((s, i) => (
              <circle key={i} cx={s.x * 1.05} cy={s.y * 0.68} r={0.6 + Math.sqrt(s.xg) * 3.2} fill={s.outcome === "goal" ? "var(--color-shot-goal)" : "var(--color-viz-focus)"} fillOpacity={s.outcome === "goal" ? 0.95 : 0.45} stroke={s.outcome === "goal" ? "#fff" : "none"} strokeWidth="0.25" />
            ))}
          </VizPitch>
        ) : (
          <EmptyViz text="No shots this season." />
        )
      ) : (
        <VizPitch label={`${player.name} ${map === "touches" ? "touch" : "defensive"} zones`}>
          <ZoneGrid grid={zonesByColumn(map === "touches" ? player.touch_zones : player.defensive_zones)} showCounts />
        </VizPitch>
      )}
    </VizCard>
  );
}

export function PlayerScreen({ view }: { view: PlayerView }) {
  const p = view.player;
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/club/${p.team_id}`} className="ov-eyebrow text-ink/45 hover:text-ink">
          ← {view.team.name}
        </Link>
        <Link href={`/compare?a=${p.player_id}`} className="viz-chip">
          Compare with…
        </Link>
      </div>
      <ScoutCard view={view} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Radar view={view} />
        <Per90 view={view} />
      </div>
      <Maps player={p} />
    </main>
  );
}
