"use client";

// PlayerFocus.tsx — The followed player
//
// Purpose: one player's match at a glance: distance, top speed, sprints (stats engine, from tracking), then the
//          numbers that matter for their role (a forward's shots and xG, a midfielder's passing, a defender's duels),
//          each set against their opposite number (the other side's leading player in the same role), and their last
//          few actions
// Inputs:  the followed player from preferences; the match memory
// Outputs: UI, or nothing when nobody is followed
// Spec:    web/specs/screens.md §3.2
//
// The link to the season scout card shows only once the season route confirms the player has a page: players of the
// reference clubs are left out of the season document (stats/specs/season.md §6), so their link would lead to a 404.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { playerNumbers } from "@/lib/live/charts";
import { describeEvent, playerNamer } from "@/lib/describe-event";
import { oppositeNumber, playerLines, ROLE_METRICS, roleOf } from "@/lib/live/live-insights";
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
  // The role's numbers, the opposite number's, and the player's last few actions
  const role = useMemo(() => {
    void tick;
    if (!prefs.player) return null;
    const events = memory.events();
    const lines = playerLines(events, memory.heavyPanel()?.heavy);
    const players = memory.players();
    const own = lines.get(prefs.player) ?? null;
    const opp = oppositeNumber(prefs.player, lines, players);
    const recent = events.filter((e) => e.player_id === prefs.player && e.type !== "Pressure" && e.type !== "Carry").slice(-4).reverse();
    return { own, opp, recent };
  }, [tick, memory, prefs.player]);
  const seasonId = setup?.season_id ?? null;
  const [paged, setPaged] = useState<{ key: string; ok: boolean } | null>(null);
  const pageKey = seasonId && prefs.player ? `${seasonId}/${prefs.player}` : null;
  useEffect(() => {
    if (!pageKey) return;
    const ctl = new AbortController();
    fetch(`/api/season/${pageKey.replace("/", "/player/")}`, { signal: ctl.signal })
      .then((r) => setPaged({ key: pageKey, ok: r.ok }))
      .catch(() => {});
    return () => ctl.abort();
  }, [pageKey]);
  const hasPage = paged !== null && paged.key === pageKey && paged.ok;
  if (!meta || !numbers || !setup) return null;
  const team = setup.teams[meta.side];

  const tiles: [string, string][] = [
    ["Distance", numbers.distanceKm === null ? "–" : `${numbers.distanceKm.toFixed(1)} km`],
    ["Top speed", numbers.topSpeedKmh === null ? "–" : `${numbers.topSpeedKmh.toFixed(1)}`],
    ["Sprints", numbers.sprints === null ? "–" : String(numbers.sprints)],
  ];
  const metrics = ROLE_METRICS[roleOf(meta.pos)];
  const nameOf = playerNamer(setup);
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
            {hasPage && (
              <>
                {" · "}
                <Link href={`/player/${prefs.player}`} className="text-viz-focus hover:underline">
                  Season scout card →
                </Link>
              </>
            )}
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
      {role?.own && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between font-mono text-[8.5px] font-bold uppercase tracking-[0.8px] text-ink/40">
            <span>{meta.name.split(" ").at(-1)}</span>
            <span>{roleOf(meta.pos) === "keeper" ? "Keeper" : `As a ${roleOf(meta.pos)}`}</span>
            <span>{role.opp ? `vs ${role.opp.meta.shirt} ${role.opp.meta.name.split(" ").at(-1)}` : "No opposite number yet"}</span>
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            {metrics.map((m) => {
              const mine = m.value(role.own!);
              const theirs = role.opp ? m.value(role.opp.line) : null;
              const ahead = mine !== null && theirs !== null && mine !== theirs ? mine > theirs : null;
              return (
                <div key={m.key} className="flex items-baseline justify-between rounded-[8px] bg-ink/[0.03] px-2.5 py-1.5 text-[12px]">
                  <span className={`font-mono font-black tabular ${ahead === true ? "text-ink" : "text-ink/60"}`}>{mine === null ? "–" : m.format(mine)}</span>
                  <span className="text-[11px] text-ink/50">{m.label}</span>
                  <span className={`font-mono font-bold tabular ${ahead === false ? "text-ink" : "text-ink/40"}`}>{theirs === null ? "–" : m.format(theirs)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {role && role.recent.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.8px] text-ink/40">Last actions</p>
          <ol className="mt-1 flex flex-col gap-0.5">
            {role.recent.map((e) => {
              const d = describeEvent(e, nameOf);
              return (
                <li key={e.event_id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="w-8 shrink-0 font-mono text-[10.5px] text-ink/40 tabular">{e.clock.split(":")[0]}′</span>
                  <span className={`font-semibold ${d.emphasis === "goal" ? "text-accent" : ""}`}>{d.title}</span>
                  <span className="truncate text-ink/50">{d.detail.replace(meta.name, "").replace(" · success", "").replace("fail", "missed").replace(/^ ?· ?/, "")}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
