"use client";

// PlayerFocus.tsx — The followed player
//
// Purpose: one player's match at a glance: distance, top speed, sprints (stats engine, from tracking), passes, shots,
//          take-ons and defensive actions (events)
// Inputs:  the followed player from preferences; the match memory
// Outputs: UI, or nothing when nobody is followed
// Spec:    web/specs/screens.md §3.2

import { useMemo } from "react";
import { playerNumbers } from "@/lib/live/charts";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { Crest } from "./ScoreHeader";

export function PlayerFocus() {
  const [prefs, update] = usePreferences();
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  const meta = prefs.player ? memory.players().get(prefs.player) : undefined;
  const numbers = useMemo(() => {
    void tick;
    return prefs.player ? playerNumbers(memory.events(), prefs.player, memory.heavyPanel()) : null;
  }, [tick, memory, prefs.player]);
  if (!meta || !numbers || !setup) return null;
  const team = setup.teams[meta.side];

  const tiles: [string, string][] = [
    ["Distance", numbers.distanceKm === null ? "–" : `${numbers.distanceKm.toFixed(1)} km`],
    ["Top speed", numbers.topSpeedKmh === null ? "–" : `${numbers.topSpeedKmh.toFixed(1)}`],
    ["Sprints", numbers.sprints === null ? "–" : String(numbers.sprints)],
    ["Passes", numbers.passes ? `${numbers.passes} · ${numbers.passPct}%` : "0"],
    ["Shots · goals", `${numbers.shots} · ${numbers.goals}`],
    ["Take-ons won", `${numbers.takeOnsWon}/${numbers.takeOns}`],
  ];
  return (
    <div className="ov-card relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: team.colours.primary }} />
      <div className="flex items-center gap-3">
        <Crest team={team} size={42} />
        <div className="min-w-0 flex-1">
          <p className="ov-eyebrow">Player focus</p>
          <p className="truncate text-[17px] font-black tracking-tight">
            <span className="mr-1.5 font-mono text-accent">{meta.shirt}</span>
            {meta.name}
          </p>
          <p className="ov-sub">
            {meta.pos} · {team.name}
          </p>
        </div>
        <button type="button" onClick={() => update({ player: null, mode: "casual" })} className="text-[12px] font-semibold text-ink/40 hover:text-ink/80">
          Stop
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[10px] bg-ink/[0.035] p-2.5">
            <p className="font-mono text-[16px] font-black leading-none tabular text-ink/90">{value}</p>
            <p className="mt-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.8px] text-ink/35">
              {label}
              {label === "Top speed" ? " km/h" : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
