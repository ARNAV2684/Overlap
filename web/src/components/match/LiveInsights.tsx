"use client";

// LiveInsights.tsx — What the live match is about, beyond the score
//
// Purpose: four cards under the pitch that update about once a second: the head-to-head of two players in the same
//          role (the numbers that matter for that role), each side's most influential passing connections on a small
//          pitch, the engine room (who is doing the running and winning the duels, with the formula shown), and the
//          tempo (control vs chaos, and rhythm)
// Inputs:  the match memory (events, heavy block, players, playhead) and the setup; the viewer's club
// Outputs: UI
// Spec:    web/specs/screens.md §2.8; plans/done/PLAN_web_football-revamp_S8.md
//
// Every number is worked out in the browser from the event stream and the stats engine's heavy block; no model writes
// any of them, and each card says so.

import { useEffect, useMemo, useState } from "react";
import type { MatchSetup } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";
import {
  battle,
  roleOf,
  playerLines,
  ROLE_LABEL,
  tempo,
  topConnections,
  WORK_WEIGHTS,
  workhorses,
  type Battle,
  type Connection,
  type Role,
  type Tempo,
  type Workhorse,
} from "@/lib/live/live-insights";
import type { PlayerMeta } from "@/lib/live/match-memory";
import { useScoreboard } from "@/lib/store-hooks";
import { readableInk } from "@/lib/team-colours";
import { useExperience } from "@/providers/MatchExperience";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { battleHeadline, connectionHeadline, tempoHeadline, workHeadline } from "@/lib/live/mode-layout";
import { Toggle } from "@/components/viz/Viz";

const BATTLE_ROLES: Role[] = ["forward", "midfielder", "defender"];
/** The head-to-head moves to the next role this often (wall ms) until the viewer picks one. */
const ROTATE_MS = 45_000;

type Colours = Record<Side, string>;

/** Which insight card a moment's chart link opened, and on whom (MatchScreen's showChart). */
export type InsightFocus = { component: string; playerId?: string; teamId?: string; nonce: number };

/** The focus when it is for this card, so the card can ring and turn to it (a newer manual pick wins). */
function focusFor(focus: InsightFocus | null, component: string): InsightFocus | null {
  return focus?.component === component ? focus : null;
}

function useInsightData() {
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  return useMemo(() => {
    void tick;
    const events = memory.events();
    const heavy = memory.heavyPanel()?.heavy ?? null;
    return { events, lines: playerLines(events, heavy), players: memory.players(), nowMs: memory.nowMs(), setup };
  }, [memory, tick, setup]);
}

function CardShell({
  id,
  flash = null,
  eyebrow,
  title,
  controls,
  children,
  note,
  headline,
  compact = false,
}: {
  id?: string;
  /** A chart link landed here: the nonce restarts the ring's fade. */
  flash?: number | null;
  eyebrow: string;
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  note: string;
  /** Casual: the card as one plain sentence, without its numbers, controls or method note. */
  headline?: string;
  compact?: boolean;
}) {
  return (
    <section
      id={id}
      className="ov-card relative flex min-w-0 scroll-mt-24 flex-col p-4"
      aria-label={title}
    >
      {flash !== null && <span key={flash} className="ov-flash pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-[3px] ring-inset ring-accent" aria-hidden="true" />}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="ov-eyebrow">{eyebrow}</p>
          <h3 className="mt-0.5 text-[15px] font-black tracking-tight">{title}</h3>
        </div>
        {!compact && controls}
      </div>
      {compact ? (
        <p className="mt-2 flex-1 text-[16px] font-semibold leading-snug text-ink/85">{headline}</p>
      ) : (
        <>
          <div className="mt-3 flex-1">{children}</div>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[1px] text-ink/35">{note}</p>
        </>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[12.5px] text-ink/45">{children}</p>;
}

function PlayerHead({ p, colour, align }: { p: Battle["home"]; colour: string; align: "left" | "right" }) {
  if (!p) return <div className={`min-w-0 flex-1 text-[12px] text-ink/40 ${align === "right" ? "text-right" : ""}`}>Nobody yet</div>;
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-black"
        style={{ background: colour, color: readableInk(colour) === "dark" ? "#0e0e10" : "#ffffff" }}
      >
        {p.meta.shirt}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-tight">{p.meta.name}</p>
        <p className="font-mono text-[9.5px] text-ink/45">{p.meta.pos}</p>
      </div>
    </div>
  );
}

export function BattleCard({ b, colours, setup }: { b: Battle; colours: Colours; setup: MatchSetup }) {
  const leader = b.edge ? b[b.edge] : null;
  const won = (s: Side) => b.rows.filter((r) => r.leader === s).length;
  return (
    <div>
      <div className="flex items-center gap-3">
        <PlayerHead p={b.home} colour={colours.home} align="left" />
        <span className="font-mono text-[10px] font-black text-ink/30">VS</span>
        <PlayerHead p={b.away} colour={colours.away} align="right" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {b.rows.map((r) => {
          const h = r.homeValue ?? 0;
          const a = r.awayValue ?? 0;
          const total = h + a || 1;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className={`font-mono font-bold tabular ${r.leader === "home" ? "text-ink" : "text-ink/45"}`}>{r.home}</span>
                <span className="text-[11px] text-ink/50">{r.label}</span>
                <span className={`font-mono font-bold tabular ${r.leader === "away" ? "text-ink" : "text-ink/45"}`}>{r.away}</span>
              </div>
              <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-ink/[0.05]">
                <span className="rounded-l-full" style={{ width: `${(h / total) * 100}%`, background: colours.home, opacity: r.leader === "away" ? 0.4 : 1 }} />
                <span className="rounded-r-full" style={{ width: `${(a / total) * 100}%`, background: colours.away, opacity: r.leader === "home" ? 0.4 : 1 }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-ink/70">
        {leader && b.edge
          ? `${leader.meta.name} (${setup.teams[b.edge].name}) is ahead on ${won(b.edge)} of ${b.rows.length}.`
          : b.home && b.away
            ? "Level so far."
            : "Waiting for both sides to get involved."}
      </p>
    </div>
  );
}

function HeadToHead({ data, colours, focus, compact }: { data: ReturnType<typeof useInsightData>; colours: Colours; focus: InsightFocus | null; compact: boolean }) {
  const [manual, setManual] = useState<{ role: Role; at: number } | null>(null);
  const [auto, setAuto] = useState(0);
  const mine = focusFor(focus, "head_to_head");
  // A head-to-head moment's link shows the leader's role, unless the viewer picked one after it
  const linked = mine?.playerId ? data.players.get(mine.playerId) : undefined;
  const linkedRole = linked && BATTLE_ROLES.includes(roleOf(linked.pos)) ? roleOf(linked.pos) : null;
  const picked = linkedRole && mine && (!manual || mine.nonce > manual.at) ? linkedRole : (manual?.role ?? null);
  const setPicked = (role: Role) => setManual({ role, at: Date.now() });
  useEffect(() => {
    if (picked) return;
    const id = setInterval(() => setAuto((i) => (i + 1) % BATTLE_ROLES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [picked]);
  const role = picked ?? BATTLE_ROLES[auto];
  const b = useMemo(() => battle(role, data.lines, data.players), [role, data.lines, data.players]);
  if (!data.setup) return null;
  return (
    <CardShell
      id="insight-head_to_head"
      flash={mine?.nonce ?? null}
      eyebrow={picked ? "Head-to-head" : "Head-to-head · rotating"}
      title={`${ROLE_LABEL[role]}: who is winning their battle`}
      compact={compact}
      headline={battleHeadline(b, ROLE_LABEL[role])}
      note="From the event data and the stats engine · best player in the role on each side"
      controls={
        <Toggle
          label="Role"
          value={role}
          onChange={(r) => setPicked(r)}
          options={BATTLE_ROLES.map((r) => ({ id: r, label: r === "forward" ? "FWD" : r === "midfielder" ? "MID" : "DEF" }))}
        />
      }
    >
      <BattleCard b={b} colours={colours} setup={data.setup} />
    </CardShell>
  );
}

/** A team's connections on a small pitch at each player's mean pass-start spot, attacking to the right. */
function ConnectionPitch({ links, players, colour }: { links: Connection[]; players: ReadonlyMap<string, PlayerMeta>; colour: string }) {
  const sx = (x: number) => x * 1.05;
  const sy = (y: number) => y * 0.68;
  const max = Math.max(1, ...links.map((l) => l.score));
  const nodes = new Map<string, { x: number; y: number }>();
  for (const l of links) {
    nodes.set(l.a, l.at.a);
    nodes.set(l.b, l.at.b);
  }
  return (
    <svg viewBox="0 0 105 68" className="viz-pitch block w-full rounded-[10px]" role="img" aria-label="Top passing connections on the pitch">
      <rect width="105" height="68" fill="var(--color-viz-bg)" />
      <g fill="none" stroke="var(--color-viz-line)" strokeWidth="0.3">
        <rect x="0.15" y="0.15" width="104.7" height="67.7" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
      </g>
      <text x="103" y="3.4" textAnchor="end" className="viz-svg-label">
        ATTACK →
      </text>
      {links.map((l, i) => (
        <line
          key={`${l.a}-${l.b}`}
          x1={sx(l.at.a.x)}
          y1={sy(l.at.a.y)}
          x2={sx(l.at.b.x)}
          y2={sy(l.at.b.y)}
          stroke={colour}
          strokeLinecap="round"
          strokeWidth={0.8 + (l.score / max) * 2.2}
          opacity={i === 0 ? 0.95 : 0.6}
        />
      ))}
      {[...nodes].map(([id, at]) => (
        <g key={id}>
          <circle cx={sx(at.x)} cy={sy(at.y)} r="3.2" fill="var(--color-viz-bg)" stroke={colour} strokeWidth="0.7" />
          <text x={sx(at.x)} y={sy(at.y) + 1.1} textAnchor="middle" className="viz-svg-label" style={{ fontSize: "3px", fontWeight: 800 }}>
            {players.get(id)?.shirt ?? "?"}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Connections({ data, colours, focus, compact }: { data: ReturnType<typeof useInsightData>; colours: Colours; focus: InsightFocus | null; compact: boolean }) {
  const { myClub } = useExperience();
  const [manual, setManual] = useState<{ side: Side; at: number } | null>(null);
  const mine = focusFor(focus, "connections");
  // A connection moment's link shows its team, unless the viewer switched after it
  const linkedSide: Side | null = mine?.teamId && data.setup ? (mine.teamId === data.setup.teams.away.team_id ? "away" : "home") : null;
  const side: Side = linkedSide && mine && (!manual || mine.nonce > manual.at) ? linkedSide : (manual?.side ?? myClub ?? "home");
  const setSide = (s: Side) => setManual({ side: s, at: Date.now() });
  const teamId = data.setup?.teams[side].team_id;
  // `data` is rebuilt every tick; the events array itself is the same object as it grows
  const links = useMemo(() => (teamId ? topConnections(data.events, teamId) : []), [data, teamId]);
  if (!data.setup) return null;
  const name = (id: string) => {
    const p = data.players.get(id);
    return p ? `${p.shirt} ${p.name.split(" ").at(-1)}` : id;
  };
  return (
    <CardShell
      id="insight-connections"
      flash={mine?.nonce ?? null}
      eyebrow="Connections"
      title="The partnerships shaping the game"
      compact={compact}
      headline={connectionHeadline(links, (id) => data.players.get(id)?.name.split(" ").at(-1) ?? id)}
      note="Ranked by passes + 2 × progressive + 1 × into the final third + 3 × in moves that ended in a shot"
      controls={
        <Toggle
          label="Team"
          value={side}
          onChange={setSide}
          options={(["home", "away"] as const).map((s) => ({ id: s, label: data.setup!.teams[s].team_id, dot: colours[s] }))}
        />
      }
    >
      {links.length === 0 ? (
        <Empty>No pair has combined twice yet.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <ConnectionPitch links={links} players={data.players} colour={colours[side]} />
          <ol className="flex flex-col gap-1.5">
            {links.map((l, i) => (
              <li key={`${l.a}-${l.b}`} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="font-mono text-[11px] font-black text-ink/35">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {name(l.a)} <span className="text-ink/35">⇄</span> {name(l.b)}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular text-ink/60">
                  {l.passes} passes · {l.progressive} prog{l.inShotMoves ? ` · ${l.inShotMoves} → shot` : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </CardShell>
  );
}

const PART_COLOUR: Record<keyof typeof WORK_WEIGHTS, string> = {
  distanceKm: "var(--color-viz-focus)",
  sprints: "#a78bfa",
  duelsWon: "var(--color-accent)",
  recoveries: "#22c55e",
  interceptions: "#eab308",
  pressures: "#94a3b8",
};

function EngineRoom({ data, colours, focus, compact }: { data: ReturnType<typeof useInsightData>; colours: Colours; focus: InsightFocus | null; compact: boolean }) {
  const mine = focusFor(focus, "engine_room");
  const top: Workhorse[] = useMemo(() => workhorses(data.lines, data.players, 4), [data.lines, data.players]);
  const hasTracking = top.some((w) => w.parts.find((p) => p.key === "distanceKm")!.value > 0);
  const max = Math.max(1, ...top.map((w) => w.score));
  const w = WORK_WEIGHTS;
  return (
    <CardShell
      id="insight-engine_room"
      flash={mine?.nonce ?? null}
      eyebrow="Engine room"
      title="Who is putting the work in"
      compact={compact}
      headline={workHeadline(top, (id) => data.players.get(id)?.name.split(" ").at(-1) ?? id)}
      note={`Score = ${w.distanceKm} × km + ${w.sprints} × sprints + ${w.duelsWon} × duels won + ${w.recoveries} × recoveries + ${w.interceptions} × interceptions + ${w.pressures} × pressures`}
    >
      {top.length === 0 ? (
        <Empty>Nobody has broken sweat yet.</Empty>
      ) : (
        <ol className="flex flex-col gap-3">
          {top.map((wh, i) => {
            const meta = data.players.get(wh.playerId);
            const won = wh.parts.find((p) => p.key === "duelsWon")!.value;
            const km = wh.parts.find((p) => p.key === "distanceKm")!.value;
            return (
              <li key={wh.playerId} className={mine?.playerId === wh.playerId ? "-mx-2 rounded-[10px] bg-accent/[0.07] px-2 py-1" : undefined}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-black text-ink/35">{i + 1}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta ? colours[meta.side] : "gray" }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                    {meta ? `${meta.shirt} ${meta.name}` : wh.playerId}
                    <span className="ml-1.5 font-mono text-[9.5px] font-normal text-ink/45">{meta?.pos}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular text-ink/60">
                    {km > 0 ? `${km.toFixed(1)} km · ` : ""}
                    {won} duels won
                  </span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-ink/[0.05]" style={{ width: `${(wh.score / max) * 100}%` }}>
                  {wh.parts
                    .filter((p) => p.points > 0)
                    .map((p) => (
                      <span key={p.key} title={`${p.value % 1 ? p.value.toFixed(1) : p.value} ${p.label}`} style={{ flex: p.points, background: PART_COLOUR[p.key] }} />
                    ))}
                </div>
              </li>
            );
          })}
          <li className="flex flex-wrap gap-x-3 gap-y-1">
            {(Object.keys(PART_COLOUR) as (keyof typeof WORK_WEIGHTS)[])
              .filter((k) => hasTracking || (k !== "distanceKm" && k !== "sprints"))
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1 font-mono text-[9px] text-ink/50">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: PART_COLOUR[k] }} />
                  {top[0].parts.find((p) => p.key === k)!.label}
                </span>
              ))}
          </li>
        </ol>
      )}
    </CardShell>
  );
}

const TEMPO_WORD: Record<Tempo["state"], string> = { control: "Control", balanced: "Balanced", chaos: "Chaos" };
const RHYTHM_WORD: Record<Tempo["rhythm"], string> = { faster: "Speeding up", steady: "Steady rhythm", slower: "Slowing down" };

function TempoCard({ data, colours, compact }: { data: ReturnType<typeof useInsightData>; colours: Colours; compact: boolean }) {
  const t = useMemo(
    () => (data.setup ? tempo(data.events, data.nowMs, { home: data.setup.teams.home.team_id, away: data.setup.teams.away.team_id }) : null),
    [data],
  );
  return (
    <CardShell
      eyebrow="Tempo · last 5 minutes"
      title="Control or chaos, and the rhythm"
      compact={compact}
      headline={tempoHeadline(t, (side) => data.setup?.teams[side].name ?? "")}
      note="Control: 6+ completed passes per possession · chaos: 3.8 or fewer · rhythm: passes a minute against the match so far"
    >
      {!t || !data.setup ? (
        <Empty>Reading the rhythm: a few minutes of play first.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <p className={`text-[28px] font-black leading-none tracking-tight ${t.state === "chaos" ? "text-accent" : t.state === "control" ? "text-viz-focus" : ""}`}>
              {TEMPO_WORD[t.state]}
            </p>
            <p className="text-right font-mono text-[12px] font-bold">{RHYTHM_WORD[t.rhythm]}</p>
          </div>
          <div aria-hidden="true">
            <div className="relative h-2 rounded-full bg-gradient-to-r from-accent/70 via-ink/15 to-viz-focus/80">
              <span
                className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                style={{ left: `${Math.min(100, (t.passesPerPossession / 10) * 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[1px] text-ink/40">
              <span>Chaos</span>
              <span>Control</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            {[
              [t.passesPerPossession.toFixed(1), "passes a possession"],
              [t.turnoversPerMinute.toFixed(1), "turnovers a minute"],
              [`${t.passesPerMinute.toFixed(1)}`, `passes a minute (match ${t.matchPassesPerMinute.toFixed(1)})`],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[10px] bg-ink/[0.035] p-2">
                <dd className="font-mono text-[15px] font-black leading-none tabular">{v}</dd>
                <dt className="mt-1 text-[10px] leading-tight text-ink/50">{l}</dt>
              </div>
            ))}
          </dl>
          <p className="text-[12.5px] text-ink/70">
            {t.inControl ? (
              <>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colours[t.inControl] }} />
                {data.setup.teams[t.inControl].name} are keeping the ball longer: {t.bySide[t.inControl].passesPerPossession.toFixed(1)} passes a possession against{" "}
                {t.bySide[t.inControl === "home" ? "away" : "home"].passesPerPossession.toFixed(1)}.
              </>
            ) : (
              "Neither side is keeping the ball noticeably longer."
            )}
          </p>
        </div>
      )}
    </CardShell>
  );
}

export function LiveInsights({ focus = null, detail = "full" }: { focus?: InsightFocus | null; detail?: "headline" | "full" }) {
  const compact = detail === "headline";
  const data = useInsightData();
  if (!data.setup) return null;
  const colours = { home: overlayColour(data.setup.teams.home.colours), away: overlayColour(data.setup.teams.away.colours) };
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Live insights">
      <HeadToHead data={data} colours={colours} focus={focus} compact={compact} />
      <Connections data={data} colours={colours} focus={focus} compact={compact} />
      <EngineRoom data={data} colours={colours} focus={focus} compact={compact} />
      <TempoCard data={data} colours={colours} compact={compact} />
    </div>
  );
}
