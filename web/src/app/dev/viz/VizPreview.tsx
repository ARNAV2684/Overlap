"use client";

// VizPreview.tsx — The analysis visuals on one panel (development only)
//
// Purpose: lay out every heavy-block visual for a recorded panel, with a team toggle
// Inputs:  a match setup and a stat panel with its heavy block
// Outputs: UI
// Spec:    web/specs/charts.md

import { useState } from "react";
import type { MatchSetup, StatPanel } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";
import { xgShots } from "@/lib/live/charts";
import { overlayColour } from "@/components/pitch3d/scene/stage";
import { FlankAttack } from "@/components/charts/FlankAttack";
import { PassNetwork } from "@/components/charts/PassNetwork";
import { PressingZones } from "@/components/charts/PressingZones";
import { ShotMap } from "@/components/charts/ShotMap";
import { XgRace } from "@/components/charts/XgRace";
import { ZoneDominance } from "@/components/charts/ZoneDominance";
import { Toggle } from "@/components/viz/Viz";
import { LiveRailView } from "@/components/match/LiveRail";

export function VizPreview({ setup, panel }: { setup: MatchSetup; panel: StatPanel }) {
  const [side, setSide] = useState<Side>("home");
  const heavy = panel.heavy!;
  const colours = { home: overlayColour(setup.teams.home.colours), away: overlayColour(setup.teams.away.colours) };
  const teams = { home: { name: setup.teams.home.name, colour: colours.home }, away: { name: setup.teams.away.name, colour: colours.away } };
  const team = setup.teams[side];
  const roster = [...setup.teams.home.lineup, ...setup.teams.home.bench, ...setup.teams.away.lineup, ...setup.teams.away.bench];
  const names = new Map(roster.map((p) => [p.player_id, p.name]));
  const shirts = new Map([...team.lineup, ...team.bench].map((p) => [p.player_id, p.shirt]));
  const toggle = (
    <Toggle label="Team" value={side} onChange={setSide} options={(["home", "away"] as const).map((s) => ({ id: s, label: setup.teams[s].team_id, dot: colours[s] }))} />
  );
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-6 sm:px-6">
      <p className="ov-eyebrow">Development preview · {setup.match_id} at {panel.clock}</p>
      <div className="max-w-[380px]">
        <LiveRailView setup={setup} panel={panel} heavyPanel={panel} />
      </div>
      <XgRace home={teams.home} away={teams.away} homeShots={xgShots(heavy, "home")} awayShots={xgShots(heavy, "away")} minute={panel.match_ms / 60_000} clock={panel.clock} />
      <ShotMap shots={xgShots(heavy, side)} names={names} team={team.name} controls={toggle} />
      <FlankAttack team={team.name} zones={heavy.zones[side]} shots={xgShots(heavy, side)} controls={toggle} />
      <PassNetwork network={heavy.pass_network[side]} shirts={shirts} names={names} team={team.name} controls={toggle} />
      <ZoneDominance home={teams.home} away={teams.away} zonesHome={heavy.zones.home} zonesAway={heavy.zones.away} />
      <PressingZones grid={heavy.pressing_grid[side]} team={team.name} ppda={panel.teams[side].ppda_last_10min} heightM={panel.teams[side].press_height_last_10min_m} controls={toggle} />
    </main>
  );
}
