"use client";

// LeagueScreen.tsx — The league page
//
// Purpose: the season told in four visuals: the table with points against expected points (the deserved table),
//          the title race by matchweek, the style map (how high and how hard every club presses) and the leaders
// Inputs:  a LeagueView (src/lib/season.ts); every number is from the season document
// Outputs: UI
// Spec:    web/specs/screens.md §8; web/specs/charts.md §13–§14

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LeagueTeam, LeagueView, PlayerRow } from "@/lib/season";
import { Chips, Em, InsightPanel, VizCard } from "@/components/viz/Viz";

const RESULT: Record<"W" | "D" | "L", string> = { W: "var(--color-win)", D: "var(--color-draw)", L: "var(--color-loss)" };

function teamLink(t: Pick<LeagueTeam, "team_id" | "name">, hidden: string[]) {
  return hidden.includes(t.team_id) ? (
    <span>{t.name}</span>
  ) : (
    <Link href={`/club/${t.team_id}`} className="hover:text-viz-focus hover:underline">
      {t.name}
    </Link>
  );
}

function Table({ view }: { view: LeagueView }) {
  const lucky = [...view.teams].sort((a, b) => b.table.points - b.xpts - (a.table.points - a.xpts))[0];
  return (
    <VizCard
      eyebrow={`League table · season ${view.meta.season_id}`}
      title="The table, and the table they deserved"
      subtitle="Expected points come from every shot's xG: what each club's chances were worth"
      kpis={[
        { value: String(view.meta.matches), label: "Matches" },
        { value: String(view.meta.matchweeks.length), label: "Matchweeks", focus: true },
      ]}
      footer={
        <InsightPanel
          sentence={
            <>
              <Em>{lucky.name}</Em> have {Math.round(lucky.table.points - lucky.xpts)} more points than their chances deserved: the league&apos;s
              biggest overperformers.
            </>
          }
          listTitle="Points against expected"
          items={[...view.teams]
            .sort((a, b) => b.table.points - b.xpts - (a.table.points - a.xpts))
            .slice(0, 5)
            .map((t) => ({ label: t.name, value: `${t.table.points - t.xpts >= 0 ? "+" : ""}${(t.table.points - t.xpts).toFixed(1)}`, dot: t.colours.primary }))}
          note="Clubs without a link are internal test fixtures: they play in the league but have no club page."
        />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="ov-eyebrow text-left text-ink/40">
              {["#", "Club", "P", "W", "D", "L", "GD", "Pts", "xPts", "Form"].map((h, i) => (
                <th key={h} className={`py-2 font-bold ${i > 1 ? "px-2 text-right" : "pr-2"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.06]">
            {view.teams.map((t) => (
              <tr key={t.team_id}>
                <td className="py-2 pr-2 font-mono text-ink/50">{t.table.position}</td>
                <td className="py-2 pr-2 font-semibold">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.colours.primary, boxShadow: `inset 0 0 0 1.5px ${t.colours.secondary}` }} />
                  {teamLink(t, view.meta.hidden_teams)}
                </td>
                {[t.table.played, t.table.won, t.table.drawn, t.table.lost, t.table.goal_difference > 0 ? `+${t.table.goal_difference}` : t.table.goal_difference].map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right font-mono tabular">
                    {v}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono font-bold tabular">{t.table.points}</td>
                <td className="px-2 py-2 text-right font-mono tabular text-viz-focus">{t.xpts.toFixed(1)}</td>
                <td className="px-2 py-2">
                  <span className="flex justify-end gap-1">
                    {t.form.map((r, i) => (
                      <span key={i} title={r} className="flex h-4 w-4 items-center justify-center rounded-[4px] font-mono text-[9px] font-black text-black/80" style={{ background: RESULT[r] }}>
                        {r}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VizCard>
  );
}

function TitleRace({ view }: { view: LeagueView }) {
  const [focus, setFocus] = useState(view.teams[0].team_id);
  const weeks = view.meta.matchweeks.length;
  const n = view.teams.length;
  const W = 160;
  const H = 74;
  const pad = { l: 8, r: 30, t: 4, b: 8 };
  const sx = (w: number) => pad.l + (w / Math.max(1, weeks - 1)) * (W - pad.l - pad.r);
  const sy = (pos: number) => pad.t + ((pos - 1) / (n - 1)) * (H - pad.t - pad.b);
  const f = view.teams.find((t) => t.team_id === focus)!;
  const best = Math.min(...f.position_by_matchweek);
  const order = [...view.teams].sort((a, b) => (a.team_id === focus ? 1 : b.team_id === focus ? -1 : 0));
  return (
    <VizCard
      eyebrow="Title race · position by matchweek"
      title={`${f.name}'s season story`}
      subtitle="Every club's league position after each matchweek; pick a club to follow its line"
      kpis={[
        { value: `${f.table.position}`, label: "Now", focus: true },
        { value: String(f.table.points), label: "Points" },
        { value: String(best), label: "Best place" },
      ]}
      controls={
        <Chips
          label="Follow a club"
          value={focus}
          onChange={setFocus}
          options={view.teams.map((t) => ({ id: t.team_id, label: t.team_id }))}
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-pitch block w-full" role="img" aria-label={`${f.name} position by matchweek: ${f.position_by_matchweek.join(", ")}`}>
        <rect width={W} height={H} fill="var(--color-viz-bg)" />
        {view.teams.map((_, i) => (
          <text key={i} x={pad.l - 2} y={sy(i + 1) + 0.8} textAnchor="end" className="viz-svg-axis">
            {i + 1}
          </text>
        ))}
        {order.map((t) => {
          const on = t.team_id === focus;
          const d = t.position_by_matchweek.map((p, w) => `${w ? "L" : "M"}${sx(w)} ${sy(p)}`).join(" ");
          return (
            <g key={t.team_id} onClick={() => setFocus(t.team_id)} className="cursor-pointer">
              <path d={d} fill="none" stroke={on ? "var(--color-viz-focus)" : "rgba(255,255,255,0.22)"} strokeWidth={on ? 0.9 : 0.35} />
              {on &&
                t.position_by_matchweek.map((p, w) => {
                  const pts = t.points_by_matchweek[w] - (w ? t.points_by_matchweek[w - 1] : 0);
                  return <circle key={w} cx={sx(w)} cy={sy(p)} r="0.9" fill={pts === 3 ? "var(--color-win)" : pts === 1 ? "#e8a838" : "var(--color-loss)"} />;
                })}
              <text x={sx(weeks - 1) + 2} y={sy(t.position_by_matchweek[weeks - 1]) + 0.8} className="viz-svg-axis" style={on ? { fill: "var(--color-viz-focus)", fontWeight: 700 } : undefined}>
                {t.team_id} {t.points_by_matchweek[weeks - 1]}
              </text>
            </g>
          );
        })}
        {[1, Math.ceil(weeks / 2), weeks].map((w) => (
          <text key={w} x={sx(w - 1)} y={H - 2} textAnchor="middle" className="viz-svg-axis">
            MW{w}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-[11.5px] text-ink/45">Dots on the followed line: green a win, amber a draw, red a defeat.</p>
    </VizCard>
  );
}

function StyleMap({ view }: { view: LeagueView }) {
  const pts = view.teams
    .map((t) => ({ t, x: t.season.press_height_m, y: t.season.pressures_per_opp_pass }))
    .filter((p): p is { t: LeagueTeam; x: number; y: number } => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined);
  const [sel, setSel] = useState(pts[0]?.t.team_id ?? "");
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs) - 1.5, Math.max(...xs) + 1.5];
  const [y0, y1] = [Math.min(...ys) - 0.05, Math.max(...ys) + 0.05];
  const W = 160;
  const H = 90;
  const pad = 9;
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - y0) / (y1 - y0)) * (H - 2 * pad);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const s = pts.find((p) => p.t.team_id === sel) ?? pts[0];
  const kind = (p: { x: number; y: number }) =>
    p.x >= mx ? (p.y >= my ? "High, hard press" : "High line, light press") : p.y >= my ? "Deep but busy" : "Deep, patient block";
  const r = view.meta.dna_correlations;
  return (
    <VizCard
      eyebrow="Style map · season"
      title="How every club defends"
      subtitle="How high each club wins the ball back, against how hard it presses"
      aside={
        <InsightPanel
          sentence={
            <>
              <Em>{s.t.name}</Em>: {kind(s).toLowerCase()}. They defend {s.x.toFixed(0)} m from their own goal and make {s.y.toFixed(2)} pressures per opponent pass.
            </>
          }
          listTitle="Designed style, read from the events"
          items={[
            { label: "Press intensity", value: r.press_intensity !== null && r.press_intensity !== undefined ? `ρ ${r.press_intensity.toFixed(2)}` : "–" },
            { label: "Press height", value: r.press_height !== null && r.press_height !== undefined ? `ρ ${r.press_height.toFixed(2)}` : "–" },
          ]}
          note="ρ is how closely the measured value ranks the clubs the same way as their designed style (1 = exactly). Dashed lines mark the league average."
        />
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-pitch block w-full" role="img" aria-label="Style map: press height against pressing rate for every club">
        <rect width={W} height={H} fill="var(--color-viz-bg)" />
        <line x1={sx(mx)} x2={sx(mx)} y1={pad} y2={H - pad} stroke="var(--color-viz-line)" strokeDasharray="1 1" strokeWidth="0.3" />
        <line x1={pad} x2={W - pad} y1={sy(my)} y2={sy(my)} stroke="var(--color-viz-line)" strokeDasharray="1 1" strokeWidth="0.3" />
        <text x={W - pad} y={pad + 3} textAnchor="end" className="viz-svg-axis">HIGH, HARD PRESS</text>
        <text x={pad + 1} y={pad + 3} className="viz-svg-axis">DEEP BUT BUSY</text>
        <text x={pad + 1} y={H - pad - 1.5} className="viz-svg-axis">DEEP, PATIENT BLOCK</text>
        <text x={W - pad} y={H - pad - 1.5} textAnchor="end" className="viz-svg-axis">HIGH LINE, LIGHT PRESS</text>
        <text x={W / 2} y={H - 2} textAnchor="middle" className="viz-svg-axis">PRESS HEIGHT (M) →</text>
        {pts.map((p) => {
          const on = p.t.team_id === s.t.team_id;
          return (
            <g key={p.t.team_id} onClick={() => setSel(p.t.team_id)} className="cursor-pointer">
              <circle cx={sx(p.x)} cy={sy(p.y)} r={on ? 2.4 : 1.6} fill={on ? "var(--color-viz-focus)" : "rgba(255,255,255,0.55)"} stroke={on ? "#fff" : "none"} strokeWidth="0.4" />
              <text x={sx(p.x) + 2.6} y={sy(p.y) + 0.9} className="viz-svg-axis" style={on ? { fill: "#fff", fontWeight: 700 } : undefined}>
                {p.t.team_id}
              </text>
            </g>
          );
        })}
      </svg>
    </VizCard>
  );
}

const LEADERS: { id: keyof Pick<PlayerRow, "goals" | "npxg" | "assists" | "key_passes">; label: string; digits: number }[] = [
  { id: "goals", label: "Goals", digits: 0 },
  { id: "npxg", label: "npxG", digits: 1 },
  { id: "assists", label: "Assists", digits: 0 },
  { id: "key_passes", label: "Key passes", digits: 0 },
];

function Leaders({ view }: { view: LeagueView }) {
  const [stat, setStat] = useState<(typeof LEADERS)[number]["id"]>("goals");
  const def = LEADERS.find((l) => l.id === stat)!;
  const names = useMemo(() => new Map(view.teams.map((t) => [t.team_id, t.name])), [view.teams]);
  const top = [...view.players].sort((a, b) => b[stat] - a[stat] || a.minutes - b.minutes).slice(0, 10);
  const max = Math.max(1e-9, top[0]?.[stat] ?? 1);
  return (
    <VizCard
      eyebrow="Leaders · season"
      title="Who stood out"
      subtitle="Players of the eight generated clubs"
      controls={<Chips label="Statistic" value={stat} onChange={setStat} options={LEADERS.map((l) => ({ id: l.id, label: l.label }))} />}
    >
      <ol className="divide-y divide-ink/[0.06]">
        {top.map((p, i) => (
          <li key={p.player_id} className="flex items-center gap-3 py-2 text-[13px]">
            <span className="w-5 font-mono text-[11px] text-ink/40">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              <Link href={`/player/${p.player_id}`} className="font-semibold hover:text-viz-focus hover:underline">
                {p.name}
              </Link>
              <span className="ml-2 text-[11.5px] text-ink/45">
                {names.get(p.team_id)} · {p.pos}
              </span>
            </span>
            <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-ink/[0.06] sm:block">
              <span className="block h-full rounded-full bg-viz-focus" style={{ width: `${(p[stat] / max) * 100}%` }} />
            </span>
            <span className="w-12 text-right font-mono font-bold tabular">{p[stat].toFixed(def.digits)}</span>
          </li>
        ))}
      </ol>
    </VizCard>
  );
}

export function LeagueScreen({ view }: { view: LeagueView }) {
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6">
      <header>
        <p className="ov-eyebrow text-ink/45">Season {view.meta.season_id} · generated league</p>
        <h1 className="mt-1 text-[30px] font-black tracking-tight">The league</h1>
        <p className="mt-1 max-w-[640px] text-[14px] text-ink/55">
          Ten clubs, {view.meta.matches} matches. Every number here was measured by the stats engine from the matches themselves.
        </p>
      </header>
      <Table view={view} />
      <TitleRace view={view} />
      <div className="grid gap-4 xl:grid-cols-2">
        <StyleMap view={view} />
        <Leaders view={view} />
      </div>
    </main>
  );
}
