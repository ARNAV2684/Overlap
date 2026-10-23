"use client";

// ClubScreen.tsx — The club page
//
// Purpose: a club's season in five visuals: Club DNA (each designed style dial beside the measured value that should
//          follow it, with both league ranks), where they press, their chances made and conceded, when goals come,
//          and the squad
// Inputs:  a TeamView (src/lib/season.ts); every number is from the season document
// Outputs: UI
// Spec:    web/specs/screens.md §9; web/specs/charts.md §14; stats/specs/season.md §5

import Link from "next/link";
import { useState } from "react";
import type { SeasonShot } from "@/lib/contracts";
import { busiestZones, thirds } from "@/lib/live/charts";
import type { TeamView } from "@/lib/season";
import { Em, InsightPanel, RampLegend, StatStrip, Toggle, VizCard, VizPitch, ZoneGrid } from "@/components/viz/Viz";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const READ_FROM_DATA = 0.6;
const DIAL: Record<string, string> = {
  press_intensity: "Press intensity",
  press_height: "Press height",
  width: "Width",
  directness: "Directness",
  tempo: "Tempo",
  counter_attack: "Counter-attacking",
  set_piece_focus: "Set-piece focus",
};
const OUTCOME_COLOUR: Record<SeasonShot["outcome"], string> = {
  goal: "var(--color-shot-goal)",
  saved: "var(--color-shot-saved)",
  missed: "var(--color-shot-missed)",
  blocked: "var(--color-shot-blocked)",
  woodwork: "var(--color-shot-woodwork)",
};

function Header({ view }: { view: TeamView }) {
  const t = view.team;
  return (
    <header className="viz-card flex flex-wrap items-center gap-5">
      <span className="h-14 w-14 shrink-0 rounded-full" style={{ background: t.colours.primary, boxShadow: `inset 0 0 0 5px ${t.colours.secondary}` }} />
      <div className="min-w-0 flex-1">
        <p className="ov-eyebrow text-ink/45">
          Season {view.meta.season_id} · {t.formation ?? ""}
        </p>
        <h1 className="mt-1 text-[28px] font-black tracking-tight">{t.name}</h1>
        <p className="mt-0.5 text-[13px] text-ink/55">
          {ordinal(t.table.position)} with {t.table.points} points · {t.table.won} won, {t.table.drawn} drawn, {t.table.lost} lost · goals {t.table.goals_for}–{t.table.goals_against}
        </p>
      </div>
      <dl className="flex gap-6">
        {[
          { v: t.xpts.toFixed(1), l: "xPts", f: true },
          { v: t.xg_for.toFixed(1), l: "xG for" },
          { v: t.xg_against.toFixed(1), l: "xG against" },
        ].map((k) => (
          <div key={k.l} className="text-right">
            <dd className={`font-mono text-[22px] font-bold tabular ${k.f ? "text-viz-focus" : ""}`}>{k.v}</dd>
            <dt className="mt-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink/45">{k.l}</dt>
          </div>
        ))}
      </dl>
    </header>
  );
}

function ordinal(n: number) {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}

function Dna({ view }: { view: TeamView }) {
  const t = view.team;
  const n = view.league.length;
  const strong = t.dna.filter((d) => (view.meta.dna_correlations[d.dial] ?? 0) >= READ_FROM_DATA);
  const match = strong.filter((d) => Math.abs(d.designed_rank - d.measured_rank) <= 2);
  return (
    <VizCard
      eyebrow="Club DNA · designed against measured"
      title={`How ${t.name} are built to play, and how they do`}
      subtitle={`Each style dial the club was designed with, beside the season value that should follow it; ranks among ${n} clubs`}
      aside={
        <InsightPanel
          sentence={
            <>
              On the dials the events can read, {t.name} play <Em>{match.length === strong.length ? "exactly as designed" : `as designed on ${match.length} of ${strong.length}`}</Em>.
            </>
          }
          note={`A dial is "read from the data" when its measure ranks the ${n} clubs like their designs (rank correlation ${READ_FROM_DATA} or more across the league). The others are shown, but the measure doesn't track them yet.`}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {t.dna.map((d) => {
          const rho = view.meta.dna_correlations[d.dial];
          const readable = (rho ?? 0) >= READ_FROM_DATA;
          return (
            <div key={d.dial} className={readable ? "" : "opacity-55"}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-bold">
                  {DIAL[d.dial] ?? d.dial}
                  <span className="ml-2 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/40">{readable ? "read from the data" : "not read yet"}</span>
                </p>
                <p className="font-mono text-[11px] text-ink/50">ρ {rho?.toFixed(2) ?? "–"}</p>
              </div>
              <div className="mt-1.5 grid grid-cols-[88px_1fr_44px] items-center gap-2 text-[12px]">
                <span className="text-ink/55">Designed</span>
                <span className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                  <span className="block h-full rounded-full bg-ink/40" style={{ width: `${((n - d.designed_rank + 1) / n) * 100}%` }} />
                </span>
                <span className="text-right font-mono tabular">{ordinal(d.designed_rank)}</span>
                <span className="text-ink/55">Measured</span>
                <span className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                  <span className="block h-full rounded-full bg-viz-focus" style={{ width: `${((n - d.measured_rank + 1) / n) * 100}%` }} />
                </span>
                <span className="text-right font-mono tabular">{ordinal(d.measured_rank)}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink/45">
                {d.measured_label}: <span className="font-mono">{d.measured}</span>
              </p>
            </div>
          );
        })}
      </div>
    </VizCard>
  );
}

function Pressing({ view }: { view: TeamView }) {
  const t = view.team;
  const th = thirds(t.pressing_grid);
  const height = t.season.press_height_m ?? null;
  return (
    <VizCard
      eyebrow="Pressing zones · season"
      title={`Where ${t.name} win it back`}
      subtitle="Every pressure of the season, attacking left to right"
      kpis={[
        { value: String(th.total), label: "Pressures" },
        { value: height !== null ? height.toFixed(0) : "–", label: "Press ht (m)", focus: true },
        { value: t.season.ppda !== null && t.season.ppda !== undefined ? t.season.ppda.toFixed(1) : "–", label: "PPDA" },
      ]}
      aside={
        <InsightPanel
          sentence={
            <>
              {t.name} make <Em>{pct(th.middle + th.final)}</Em> of their pressures outside their own third.
            </>
          }
          listTitle="Busiest zones"
          items={busiestZones(t.pressing_grid).map((z) => ({ label: z.label, value: String(z.count) }))}
        />
      }
      footer={<RampLegend />}
    >
      <StatStrip
        cells={[
          { value: pct(th.own), label: "Own third", share: th.own },
          { value: pct(th.middle), label: "Middle third", share: th.middle },
          { value: pct(th.final), label: "Final third", share: th.final },
        ]}
      />
      <VizPitch label={`${t.name} season pressing zones`}>
        <ZoneGrid grid={t.pressing_grid} showCounts />
      </VizPitch>
    </VizCard>
  );
}

function Chances({ view }: { view: TeamView }) {
  const t = view.team;
  const [which, setWhich] = useState<"for" | "against">("for");
  const shots = which === "for" ? t.shots_for : t.shots_against;
  const xg = shots.reduce((s, x) => s + x.xg, 0);
  const goals = shots.filter((s) => s.outcome === "goal").length;
  const big = shots.filter((s) => s.xg >= 0.2).length;
  return (
    <VizCard
      eyebrow="Chances · season"
      title={which === "for" ? `What ${t.name} create` : `What ${t.name} allow`}
      subtitle="Every shot of the season sized by its expected goals"
      kpis={[
        { value: String(shots.length), label: "Shots" },
        { value: xg.toFixed(1), label: "xG", focus: true },
        { value: String(goals), label: "Goals" },
      ]}
      controls={
        <Toggle
          label="Chances"
          value={which}
          onChange={setWhich}
          options={[
            { id: "for", label: "Created" },
            { id: "against", label: "Conceded" },
          ]}
        />
      }
      aside={
        <InsightPanel
          sentence={
            <>
              {shots.length} shots worth <Em>{xg.toFixed(1)} xG</Em>, {goals} goals; {big} big chances (0.20 xG or more).
            </>
          }
          note={which === "against" ? "Conceded shots are drawn in the opponent's frame: the goal they attacked is on the right." : undefined}
        />
      }
    >
      <VizPitch half label={`${t.name} chances ${which === "for" ? "created" : "conceded"}: ${shots.length} shots, ${xg.toFixed(1)} xG`}>
        {shots.map((s, i) => (
          <circle
            key={i}
            cx={s.x * 1.05}
            cy={s.y * 0.68}
            r={0.5 + Math.sqrt(s.xg) * 3}
            fill={OUTCOME_COLOUR[s.outcome]}
            fillOpacity={s.outcome === "goal" ? 0.9 : 0.4}
            stroke={s.outcome === "goal" ? "#fff" : "none"}
            strokeWidth="0.25"
          />
        ))}
      </VizPitch>
    </VizCard>
  );
}

const BUCKETS = ["0–15", "15–30", "30–45+", "45–60", "60–75", "75–90+"];

function GoalTiming({ view }: { view: TeamView }) {
  const g = view.team.goals_by_15min;
  const max = Math.max(1, ...g.for, ...g.against);
  const best = g.for.indexOf(Math.max(...g.for));
  return (
    <VizCard
      eyebrow="Goal timing · season"
      title={`When ${view.team.name} score`}
      subtitle="Goals for (up) and against (down) in 15-minute windows"
      kpis={[
        { value: String(g.for.reduce((a, b) => a + b, 0)), label: "Scored", focus: true },
        { value: String(g.against.reduce((a, b) => a + b, 0)), label: "Conceded" },
      ]}
      aside={
        <InsightPanel
          sentence={
            <>
              Their most productive window is <Em>{BUCKETS[best]}</Em> minutes, with {g.for[best]} goals.
            </>
          }
        />
      }
    >
      <div className="grid grid-cols-6 gap-2">
        {BUCKETS.map((b, i) => (
          <div key={b} className="flex flex-col items-center">
            <span className="font-mono text-[11px] tabular">{g.for[i]}</span>
            <div className="flex h-24 w-full items-end justify-center">
              <span className="w-8 rounded-t-[4px] bg-viz-focus" style={{ height: `${(g.for[i] / max) * 100}%` }} />
            </div>
            <div className="flex h-16 w-full items-start justify-center border-t border-ink/15">
              <span className="w-8 rounded-b-[4px] bg-viz-against" style={{ height: `${(g.against[i] / max) * 100}%` }} />
            </div>
            <span className="font-mono text-[11px] tabular text-ink/55">{g.against[i]}</span>
            <span className="mt-1 font-mono text-[10px] text-ink/45">{b}</span>
          </div>
        ))}
      </div>
    </VizCard>
  );
}

function Squad({ view }: { view: TeamView }) {
  return (
    <VizCard eyebrow="Squad · season" title="Who played, and what they did" subtitle="By minutes played; open a player for the scout card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="ov-eyebrow text-left text-ink/40">
              {["Player", "Pos", "Role", "Mins", "G", "A", "npxG"].map((h, i) => (
                <th key={h} className={`py-2 font-bold ${i > 2 ? "px-2 text-right" : "pr-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.06]">
            {view.squad.map((p) => (
              <tr key={p.player_id}>
                <td className="py-2 pr-2 font-semibold">
                  <Link href={`/player/${p.player_id}`} className="hover:text-viz-focus hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="py-2 pr-2 font-mono text-[11px] text-ink/55">{p.pos}</td>
                <td className="py-2 pr-2 text-[12px] text-ink/55">{p.role?.replaceAll("_", " ") ?? "–"}</td>
                {[p.minutes, p.goals, p.assists, p.npxg.toFixed(1)].map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right font-mono tabular">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VizCard>
  );
}

export function ClubScreen({ view }: { view: TeamView }) {
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6">
      <Link href="/league" className="ov-eyebrow text-ink/45 hover:text-ink">
        ← The league
      </Link>
      <Header view={view} />
      <Dna view={view} />
      <Pressing view={view} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Chances view={view} />
        <GoalTiming view={view} />
      </div>
      <Squad view={view} />
    </main>
  );
}
