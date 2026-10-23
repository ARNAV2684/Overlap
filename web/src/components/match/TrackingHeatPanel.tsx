"use client";

// Prominent view of observed tracking; the existing heatGrid remains the only density calculation.
// Spec: web/specs/charts.md, local proposal. No full-match coverage is implied by a late join.
import { useMemo, useState } from "react";
import { useExperience } from "@/providers/MatchExperience";
import { useScoreboard } from "@/lib/store-hooks";
import type { Side } from "@/lib/coordinates";
import { heatGrid } from "@/lib/live/charts";
import { HeatMap } from "@/components/charts/HeatMap";

export function TrackingHeatPanel() {
  const { memory, tick } = useExperience();
  const { setup } = useScoreboard();
  const [side, setSide] = useState<Side>("home");
  const [player, setPlayer] = useState("");
  const [period, setPeriod] = useState(0);
  const team = setup?.teams[side];
  const roster = useMemo(() => team ? [...team.lineup, ...team.bench] : [], [team]);
  const selected = roster.find((p) => p.player_id === player);
  const { grid, samples, observed } = useMemo(() => {
    void tick;
    const ids = selected ? [selected.player_id] : roster.map((p) => p.player_id);
    let samples = 0;
    let observed = 0;
    const source = { heat(id: string) {
      const h = memory.heat(id);
      if (!h) return null;
      return { byPeriod: new Map([...h.byPeriod].filter(([p]) => period === 0 || p === period)) };
    }};
    for (const id of ids) {
      let count = 0;
      source.heat(id)?.byPeriod.forEach((cells) => { for (const n of cells) count += n; });
      samples += count;
      if (count) observed++;
    }
    return { grid: heatGrid(source, ids, side), samples, observed };
  }, [memory, tick, roster, selected, side, period]);
  const label = selected?.name ?? team?.name ?? "Team";
  return (
    <section className="ov-heat-panel" aria-label="Tracking heatmap">
      <header className="ov-heat-heading">
        <div><p className="ov-broadcast-kicker">THE MATCH, MAPPED</p><h2>Where the game happens.</h2><p className="text-sm text-ink/55">Explore the spaces a team or player occupies.</p></div>
        <span className="ov-observed-badge">TRACKING · OBSERVED</span>
      </header>
      <div className="ov-heat-controls">
        <div className="ov-mode-switch" role="group" aria-label="Heatmap team">
          {(["home", "away"] as const).map((s) => <button key={s} type="button" aria-pressed={side === s} onClick={() => { setSide(s); setPlayer(""); }}><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: setup?.teams[s].colours.primary }} />{setup?.teams[s].team_id ?? s}</button>)}
        </div>
        <label>Player<select aria-label="Heatmap player" value={selected?.player_id ?? ""} onChange={(e) => setPlayer(e.target.value)}><option value="">Whole team</option>{roster.map((p) => <option key={p.player_id} value={p.player_id}>{p.shirt} · {p.name}</option>)}</select></label>
        <label>Period<select aria-label="Heatmap period" value={period} onChange={(e) => setPeriod(Number(e.target.value))}><option value={0}>All observed</option><option value={1}>First half</option><option value={2}>Second half</option><option value={3}>Extra time · first</option><option value={4}>Extra time · second</option></select></label>
      </div>
      <div className="ov-heat-content">
        <HeatMap grid={grid} colour={team?.colours.primary ?? "#38bdf8"} label={label} />
        <div className="ov-heat-notes">
          <span className="ov-broadcast-kicker">READ THE PITCH</span>
          <h3>{selected ? "Every run leaves a trace." : "Find the areas of influence."}</h3>
          <p>Warmer areas show a greater concentration of observed player positions.</p>
          <dl><div><dt>Position samples</dt><dd>{samples.toLocaleString("en-US")}</dd></div><div><dt>Players observed</dt><dd>{observed}</dd></div></dl>
          <p className="ov-heat-direction">DEFEND <span>→</span> ATTACK</p>
          <p className="text-xs">Both halves face the same attacking direction. Colours scale to this selection’s peak.</p>
        </div>
      </div>
      <footer>Built from tracking received in this viewing session. Joining late may omit earlier movement; this is not a complete-match coverage guarantee.</footer>
    </section>
  );
}
