"use client";

// AnalysisPanel.tsx — Match analytics under the pitch
//
// Purpose: the match told in charts, one tab at a time: momentum, team stats, shot map, pass network, heatmap, pass
//          map and key events; a team switch for the per-team charts; the followed player for heatmap and pass map.
//          An AI card can open the chart it refers to
// Inputs:  the match experience (memory, tick) and preferences; `focus` from the feed (component + event)
// Outputs: UI
// Spec:    web/specs/charts.md; web/specs/screens.md §2.5

import { useMemo, useState } from "react";
import type { Side } from "@/lib/coordinates";
import { heatGrid, keyEvents, momentumSeries, passLines, teamShots } from "@/lib/live/charts";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { HeatMap } from "@/components/charts/HeatMap";
import { KeyEvents } from "@/components/charts/KeyEvents";
import { MomentumChart } from "@/components/charts/MomentumChart";
import { PassMap } from "@/components/charts/PassMap";
import { PassNetwork } from "@/components/charts/PassNetwork";
import { PressingZones } from "@/components/charts/PressingZones";
import { ShotMap } from "@/components/charts/ShotMap";
import { StatBars } from "@/components/charts/StatBars";

export const TABS = [
  { id: "momentum", label: "Momentum" },
  { id: "stats", label: "Team stats" },
  { id: "shots", label: "Shot map" },
  { id: "network", label: "Pass network" },
  { id: "pressing", label: "Pressing" },
  { id: "heat", label: "Heatmap" },
  { id: "passes", label: "Pass map" },
  { id: "events", label: "Key events" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

/** Which tab an AI card's visual.component opens. */
export const TAB_FOR_COMPONENT: Record<string, TabId> = {
  momentum_tide: "momentum",
  stat_bars: "stats",
  shot_map: "shots",
  pass_network: "network",
  heatmap_zones: "heat",
  pressing_zones: "pressing",
  key_events: "events",
};

export type Focus = { tab: TabId; eventId?: string; nonce: number } | null;

export function AnalysisPanel({ focus }: { focus: Focus }) {
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  const [prefs] = usePreferences();
  const [tab, setTab] = useState<TabId>("momentum");
  const [side, setSide] = useState<Side>("home");
  const [highlight, setHighlight] = useState<string | null>(null);

  // A card asked for its chart: switch to it once per request (state adjusted during render, not in an effect)
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

  // Recomputed when the memory moves on (about once a second), not every render
  const data = useMemo(() => {
    void tick;
    const events = memory.events();
    const panel = memory.latestPanel();
    const heavy = memory.heavyPanel();
    const lineupIds = team ? team.lineup.map((p) => p.player_id).concat(team.bench.map((p) => p.player_id)) : [];
    const heatFor = followed && followed.side === side ? [followed.id] : lineupIds;
    return {
      momentum: momentumSeries(memory),
      goals: [...memory.goals()],
      panel,
      shots: team ? teamShots(events, team.team_id) : [],
      network: heavy?.heavy.pass_network[side] ?? null,
      pressing: heavy?.heavy.pressing_grid[side] ?? null,
      heat: heatGrid(memory, heatFor, side),
      passes: team ? passLines(events, followed && followed.side === side ? { playerId: followed.id } : { teamId: team.team_id }) : [],
      keys: keyEvents(events, setup),
      shirts: new Map(team ? [...team.lineup, ...team.bench].map((p) => [p.player_id, p.shirt]) : []),
    };
  }, [tick, memory, team, side, followed, setup]);

  const perTeam = tab === "shots" || tab === "network" || tab === "pressing" || tab === "heat" || tab === "passes";
  const who = followed && followed.side === side && (tab === "heat" || tab === "passes") ? followed.name : team?.name ?? "";

  return (
    <section className="ov-card overflow-hidden" aria-label="Match analytics">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink/[0.06] px-4 pt-3">
        <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] font-bold transition-colors ${
                tab === t.id ? "border-accent text-ink" : "border-transparent text-ink/45 hover:text-ink/75"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {perTeam && setup && (
          <div className="mb-2 ml-auto flex rounded-full bg-ink/[0.05] p-0.5">
            {(["home", "away"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                aria-pressed={side === s}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${side === s ? "bg-surface text-ink shadow-sm" : "text-ink/50"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: setup.teams[s].colours.primary }} />
                {setup.teams[s].team_id}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-4 sm:p-5">
        {tab === "momentum" && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="ov-eyebrow">Match momentum · 5-minute tide</p>
              <div className="flex gap-3">
                {setup &&
                  (["home", "away"] as const).map((s) => (
                    <span key={s} className="flex items-center gap-1.5 text-[12px] font-semibold text-ink/60">
                      <span className="h-2 w-2 rounded-full" style={{ background: colours[s] }} />
                      {setup.teams[s].name}
                    </span>
                  ))}
              </div>
            </div>
            <MomentumChart
              points={data.momentum}
              goals={data.goals}
              home={{ name: setup?.teams.home.name ?? "Home", colour: colours.home }}
              away={{ name: setup?.teams.away.name ?? "Away", colour: colours.away }}
            />
          </>
        )}
        {tab === "stats" && (
          <div className="mx-auto max-w-[720px]">
            <StatBars panel={data.panel} homeColour={colours.home} awayColour={colours.away} />
          </div>
        )}
        {tab === "shots" && (
          <div className="mx-auto max-w-[460px]">
            <ShotMap shots={data.shots} highlight={highlight} team={team?.name ?? ""} />
          </div>
        )}
        {tab === "network" && (
          <div className="mx-auto max-w-[760px]">
            <PassNetwork network={data.network} shirts={data.shirts} colour={colours[side]} label={`${team?.name ?? ""} pass network`} />
          </div>
        )}
        {tab === "pressing" && (
          <div className="mx-auto max-w-[760px]">
            <PressingZones
              grid={data.pressing}
              colour={colours[side]}
              label={`${team?.name ?? ""} pressing zones`}
              ppda={data.panel?.teams[side].ppda_last_10min ?? null}
              heightM={data.panel?.teams[side].press_height_last_10min_m ?? null}
            />
          </div>
        )}
        {tab === "heat" && (
          <div className="mx-auto max-w-[760px]">
            <HeatMap grid={data.heat} colour={colours[side]} label={`${who} heatmap`} />
          </div>
        )}
        {tab === "passes" && (
          <div className="mx-auto max-w-[760px]">
            <PassMap passes={data.passes} colour={colours[side]} label={`${who} passes`} />
          </div>
        )}
        {tab === "events" && (
          <div className="mx-auto max-w-[620px]">
            <KeyEvents events={data.keys} highlight={highlight} />
          </div>
        )}
        {perTeam && (
          <p className="mx-auto mt-3 max-w-[760px] text-[12px] text-ink/40">
            {tab === "heat" || tab === "passes"
              ? followed && followed.side === side
                ? `Following ${followed.name}. Attacking left to right.`
                : "Whole team. Follow a player to see theirs. Attacking left to right."
              : "Attacking left to right."}
          </p>
        )}
      </div>
    </section>
  );
}
