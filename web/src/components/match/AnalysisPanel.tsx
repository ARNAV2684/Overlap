"use client";

// AnalysisPanel.tsx — Match analytics under the pitch
//
// Purpose: the match told in five football questions, one tab each: Story (momentum and key events), Attack (xG
//          race, shot map, attack by flank), Possession (pass network, zone dominance, pass map), Defence (pressing
//          zones, team stats) and Players (the tracking heatmap and the match player table). Per-team visuals have
//          a team toggle; with a favourite club (my-club mode) they show that club only, under a "Your club" badge,
//          and the side-by-side cards keep both teams with the club picked out. An AI card can open the tab of the
//          visual it refers to
// Inputs:  the match experience (memory, tick) and preferences; `focus` from the feed (component + event)
// Outputs: UI
// Spec:    web/specs/charts.md; web/specs/screens.md §2.5

import { useMemo, useState, type ReactNode } from "react";
import type { Side } from "@/lib/coordinates";
import { keyEvents, momentumSeries, passLines, playerNumbers, teamShots, xgShots } from "@/lib/live/charts";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { FlankAttack } from "@/components/charts/FlankAttack";
import { KeyEvents } from "@/components/charts/KeyEvents";
import { MomentumChart } from "@/components/charts/MomentumChart";
import { PassMap } from "@/components/charts/PassMap";
import { PassNetwork } from "@/components/charts/PassNetwork";
import { PressingZones } from "@/components/charts/PressingZones";
import { ShotMap } from "@/components/charts/ShotMap";
import { StatBars } from "@/components/charts/StatBars";
import { XgRace } from "@/components/charts/XgRace";
import { ZoneDominance } from "@/components/charts/ZoneDominance";
import { Toggle, VizCard } from "@/components/viz/Viz";
import { TrackingHeatPanel } from "./TrackingHeatPanel";

export const TABS = [
  { id: "story", label: "Story", question: "What happened" },
  { id: "attack", label: "Attack", question: "Who created more" },
  { id: "possession", label: "Possession", question: "How they moved the ball" },
  { id: "defence", label: "Defence", question: "Where they pressed" },
  { id: "players", label: "Players", question: "Who did the work" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

/** Which tab an AI card's visual.component opens. */
export const TAB_FOR_COMPONENT: Record<string, TabId> = {
  momentum_tide: "story",
  key_events: "story",
  stat_bars: "defence",
  shot_map: "attack",
  pass_network: "possession",
  pressing_zones: "defence",
  heatmap_zones: "players",
};

export type Focus = { tab: TabId; eventId?: string; nonce: number } | null;

/** In place of the team toggle in my-club mode: whose numbers these are, and where to change it. */
export function YourClubBadge({ teamId, colour }: { teamId: string; colour: string }): ReactNode {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/10 bg-ink/[0.04] px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[1.2px] text-ink/70"
      title="Your favourite club. Change it with Club in the viewer bar"
    >
      <span className="h-2 w-2 rounded-full ring-1 ring-ink/25" style={{ background: colour }} />
      Your club · {teamId}
    </span>
  );
}

export function AnalysisPanel({ focus }: { focus: Focus }) {
  const { memory, tick, myClub } = useExperience();
  const { setup } = useScoreboard();
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<TabId>("story");
  const [picked, setSide] = useState<Side>("home");
  // My-club mode: the per-team visuals are the favourite club's, whatever was picked before
  const side = myClub ?? picked;
  const [highlight, setHighlight] = useState<string | null>(null);

  // A card asked for its visual: switch to it once per request (state adjusted during render, not in an effect)
  const [appliedFocus, setAppliedFocus] = useState<number | null>(null);
  if (focus && focus.nonce !== appliedFocus) {
    setAppliedFocus(focus.nonce);
    setTab(focus.tab);
    setHighlight(focus.eventId ?? null);
    const e = focus.eventId ? memory.events().find((x) => x.event_id === focus.eventId) : undefined;
    if (e?.team_id && setup) setSide(e.team_id === setup.teams.home.team_id ? "home" : "away");
  }

  const followed = prefs.player ? memory.players().get(prefs.player) ?? null : null;
  const colours = setup
    ? { home: overlayColour(setup.teams.home.colours), away: overlayColour(setup.teams.away.colours) }
    : { home: "#2bb3c0", away: "#ff4f38" };
  const team = setup?.teams[side] ?? null;
  const teams = {
    home: { name: setup?.teams.home.name ?? "Home", colour: colours.home },
    away: { name: setup?.teams.away.name ?? "Away", colour: colours.away },
  };

  // Recomputed when the memory moves on (about once a second), not every render
  const data = useMemo(() => {
    void tick;
    const events = memory.events();
    const panel = memory.latestPanel();
    const heavy = memory.heavyPanel()?.heavy ?? null;
    const roster = setup ? [...setup.teams.home.lineup, ...setup.teams.home.bench, ...setup.teams.away.lineup, ...setup.teams.away.bench] : [];
    const mine = team ? [...team.lineup, ...team.bench] : [];
    return {
      momentum: momentumSeries(memory),
      goals: [...memory.goals()],
      panel,
      minute: (panel?.match_ms ?? 0) / 60_000,
      xg: { home: xgShots(heavy, "home"), away: xgShots(heavy, "away") },
      fallbackShots: team ? teamShots(events, team.team_id) : [],
      network: heavy?.pass_network[side] ?? null,
      pressing: heavy?.pressing_grid[side] ?? null,
      zones: { home: heavy?.zones.home ?? null, away: heavy?.zones.away ?? null },
      passes: team ? passLines(events, followed && followed.side === side ? { playerId: followed.id } : { teamId: team.team_id }) : [],
      keys: keyEvents(events, setup),
      shirts: new Map(mine.map((p) => [p.player_id, p.shirt])),
      names: new Map(roster.map((p) => [p.player_id, p.name])),
      table: mine
        .map((p) => ({ player: p, n: playerNumbers(events, p.player_id, memory.heavyPanel()) }))
        .filter((r) => r.n.passes + r.n.shots + r.n.defensive + r.n.takeOns > 0)
        .sort((a, b) => b.n.passes + b.n.defensive - (a.n.passes + a.n.defensive)),
    };
  }, [tick, memory, team, side, followed, setup]);

  const teamToggle = !setup ? null : myClub ? (
    <YourClubBadge teamId={setup.teams[myClub].team_id} colour={colours[myClub]} />
  ) : (
    <Toggle
      label="Team"
      value={side}
      onChange={setSide}
      options={(["home", "away"] as const).map((s) => ({ id: s, label: setup.teams[s].team_id, dot: colours[s] }))}
    />
  );
  // Side by side in my-club mode: both teams stay, the opponent's bars fade so the club reads first
  const faded = (s: Side) => (myClub && s !== myClub ? `color-mix(in srgb, ${colours[s]} 35%, transparent)` : colours[s]);
  const teamName = team?.name ?? "";
  const who = followed && followed.side === side ? followed.name : teamName;

  return (
    <section aria-label="Match analytics" className="flex flex-col gap-4">
      <div className="flex gap-1 overflow-x-auto border-b border-ink/[0.08]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-left transition-colors ${
              tab === t.id ? "border-viz-focus text-ink" : "border-transparent text-ink/45 hover:text-ink/75"
            }`}
          >
            <span className="block text-[14px] font-bold">{t.label}</span>
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.12em] opacity-70">{t.question}</span>
          </button>
        ))}
      </div>

      {tab === "story" && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <VizCard eyebrow="Match momentum · 5-minute tide" title="Who had the upper hand" subtitle="Weighted attacking actions per 5 minutes; home above the line">
            <MomentumChart points={data.momentum} goals={data.goals} home={teams.home} away={teams.away} />
          </VizCard>
          <VizCard eyebrow="Key events" title="The match in moments">
            <KeyEvents events={data.keys} highlight={highlight} />
          </VizCard>
        </div>
      )}

      {tab === "attack" && (
        <>
          <XgRace home={teams.home} away={teams.away} homeShots={data.xg.home} awayShots={data.xg.away} minute={data.minute} clock={data.panel?.clock ?? "0:00"} totals={{ home: data.panel?.teams.home.xg ?? null, away: data.panel?.teams.away.xg ?? null }} />
          <ShotMap shots={data.xg[side]} fallback={data.fallbackShots} names={data.names} highlight={highlight} team={teamName} controls={teamToggle} total={data.panel?.teams[side].xg ?? null} />
          <FlankAttack team={teamName} zones={data.zones[side]} shots={data.xg[side]} controls={teamToggle} />
        </>
      )}

      {tab === "possession" && (
        <>
          <PassNetwork network={data.network} shirts={data.shirts} names={data.names} team={teamName} controls={teamToggle} />
          <ZoneDominance home={teams.home} away={teams.away} zonesHome={data.zones.home} zonesAway={data.zones.away} />
          <PassMap passes={data.passes} who={who} controls={teamToggle} />
        </>
      )}

      {tab === "defence" && (
        <>
          <PressingZones
            grid={data.pressing}
            team={teamName}
            ppda={data.panel?.teams[side].ppda_last_10min ?? null}
            heightM={data.panel?.teams[side].press_height_last_10min_m ?? null}
            controls={teamToggle}
          />
          <VizCard eyebrow="Team stats · this match" title="Side by side" subtitle="From the stats engine's panel; 10′ values cover the last 10 minutes">
            <div className="mx-auto max-w-[720px]">
              {setup && myClub && (
                <div className="mb-3 flex items-center justify-between font-mono text-[10px] font-black uppercase tracking-[1.2px]">
                  {(["home", "away"] as const).map((s) => (
                    <span key={s} className={`flex items-center gap-1.5 ${s === myClub ? "text-ink" : "text-ink/40"}`}>
                      <span className="h-2 w-2 rounded-full" style={{ background: faded(s) }} />
                      {setup.teams[s].team_id}
                      {s === myClub && <span className="text-viz-focus">· your club</span>}
                    </span>
                  ))}
                </div>
              )}
              <StatBars panel={data.panel} homeColour={faded("home")} awayColour={faded("away")} />
            </div>
          </VizCard>
        </>
      )}

      {tab === "players" && (
        <>
          <div id="heatmap" className="scroll-mt-20">
            <TrackingHeatPanel club={myClub} badge={teamToggle && myClub ? teamToggle : null} />
          </div>
          <VizCard eyebrow="Players · this match" title={`${teamName} player by player`} subtitle="Counted from this match's events; distance and speed from tracking" controls={teamToggle}>
            {data.table.length === 0 ? (
              <p className="text-[13px] text-ink/45">No player actions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[13px]">
                  <thead>
                    <tr className="ov-eyebrow text-left text-ink/40">
                      <th className="py-2 pr-2 font-bold">Player</th>
                      {["Passes", "Pass %", "Shots", "Goals", "Take-ons", "Def. actions", "km", "Top km/h"].map((h) => (
                        <th key={h} className="px-2 py-2 text-right font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/[0.06]">
                    {data.table.map(({ player, n }) => (
                      <tr key={player.player_id}>
                        <td className="py-2 pr-2 font-semibold">
                          <span className="mr-2 font-mono text-[11px] text-ink/40">{player.shirt}</span>
                          {player.name}
                          <span className="ml-2 font-mono text-[10px] text-ink/40">{player.pos}</span>
                        </td>
                        {[n.passes, n.passPct === null ? "–" : `${n.passPct}%`, n.shots, n.goals, `${n.takeOnsWon}/${n.takeOns}`, n.defensive, n.distanceKm?.toFixed(1) ?? "–", n.topSpeedKmh?.toFixed(1) ?? "–"].map((v, i) => (
                          <td key={i} className="px-2 py-2 text-right font-mono tabular">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </VizCard>
        </>
      )}
    </section>
  );
}
