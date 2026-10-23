# season.py — Season aggregates
#
# Purpose: replay every match of a finished season run and build one season document: the table by matchweek,
#          expected points, team season stats and style (designed against measured), and player season stats with
#          per-90 values and percentiles inside their position group
# Inputs:  a season run folder (data/seasons/<run>/: run.json, fixtures.json, matches/*); optionally the saved world
#          (data/generated/world/<season>.json) for the full attributes, roles and style dials
# Outputs: the season document (CONTRACTS.md §11), JSON-ready
# Spec:    stats/specs/season.md
#
# Every number goes through the same pipeline as a live match (main.play), so a season total is the sum of the
# numbers a viewer saw during each match. Only finished matches count.

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import main
import whole_match
from state import SIDES, cell

SCHEMA_VERSION = 1
MIN_MINUTES_FOR_PERCENTILES = 450
GOAL_BUCKET_MIN = 15
TOUCH_COLS, TOUCH_CHANNELS = 6, 3
SET_PIECE_SITUATIONS = frozenset({"corner", "free_kick", "throw_in"})
PENALTY_XG = 0.78

# Position groups for percentiles (season.md §4)
GROUPS = {
    "GK": "goalkeepers",
    "CB": "centre_backs",
    "LB": "full_backs", "RB": "full_backs", "LWB": "full_backs", "RWB": "full_backs",
    "DM": "midfielders", "CM": "midfielders", "AM": "midfielders", "LM": "midfielders", "RM": "midfielders",
    "LW": "attackers", "RW": "attackers", "ST": "attackers",
}

# Per-90 values every outfield player gets (season.md §3). Key -> player counter (or a special source).
PER90 = ("goals", "npxg", "shots", "assists", "key_passes", "passes", "progressive_passes", "take_ons_completed",
         "tackles", "interceptions", "pressures", "fouls")
# Rates (not per 90) with their numerator, denominator and minimum denominator
RATES = {"pass_completion_pct": ("completed", "passes", 100),
         "take_on_success_pct": ("take_ons_completed", "take_ons", 10),
         "shot_accuracy_pct": ("on_target", "shots", 10)}

# The radar per group: the values that describe the role (season.md §4)
RADAR = {
    "goalkeepers": ("passes", "pass_completion_pct", "progressive_passes"),
    "centre_backs": ("tackles", "interceptions", "pressures", "passes", "pass_completion_pct", "progressive_passes"),
    "full_backs": ("tackles", "interceptions", "progressive_passes", "key_passes", "take_ons_completed", "pressures"),
    "midfielders": ("passes", "pass_completion_pct", "progressive_passes", "key_passes", "tackles", "pressures",
                    "npxg"),
    "attackers": ("goals", "npxg", "shots", "key_passes", "take_ons_completed", "pressures", "assists"),
}

# Designed style dial -> the measured season value that should follow it (season.md §5)
DNA = (
    ("press_intensity", "pressures_per_opp_pass", "Pressures per opponent pass"),
    ("press_height", "press_height_m", "Average height of defensive actions (m from own goal)"),
    ("width", "wide_touch_pct", "Touches in the wide channels (%)"),
    ("directness", "forward_pass_m", "Average forward distance of completed passes (m)"),
    ("tempo", "passes_per_possession_min", "Passes per minute of possession"),
    ("counter_attack", "counter_shot_pct", "Shots from counter-attacks (%)"),
    ("set_piece_focus", "set_piece_shot_pct", "Shots from set pieces (%)"),
)


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(value) if digits == 0 else round(value, digits)


def goal_distribution(xgs: list[float]) -> list[float]:
    """P(goals = k) for independent shots with these xG values (the exact Poisson-binomial distribution)."""
    dist = [1.0]
    for p in xgs:
        nxt = [0.0] * (len(dist) + 1)
        for k, q in enumerate(dist):
            nxt[k] += q * (1 - p)
            nxt[k + 1] += q * p
        dist = nxt
    return dist


def win_draw_loss(home_xg: list[float], away_xg: list[float]) -> tuple[float, float, float]:
    h, a = goal_distribution(home_xg), goal_distribution(away_xg)
    win = sum(ph * pa for i, ph in enumerate(h) for j, pa in enumerate(a) if i > j)
    draw = sum(ph * a[i] for i, ph in enumerate(h) if i < len(a))
    return win, draw, max(0.0, 1 - win - draw)


def spearman(xs: list[float], ys: list[float]) -> float | None:
    """Rank correlation (average ranks for ties); None with fewer than 3 pairs or no spread."""
    if len(xs) < 3:
        return None

    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx, vy = sum((a - mx) ** 2 for a in rx), sum((b - my) ** 2 for b in ry)
    return round(cov / math.sqrt(vx * vy), 2) if vx and vy else None


def rank_of(value: float, values: list[float], higher_first: bool = True) -> int:
    """1 = highest (or lowest when higher_first is False) among the clubs."""
    return 1 + sum(1 for v in values if (v > value if higher_first else v < value))


def percentile(value: float, values: list[float]) -> int:
    """Share of the group at or below this value, nearest rank, 0-100 (season.md §4)."""
    return round(100 * sum(1 for v in values if v <= value) / len(values))


class _Team:
    def __init__(self):
        self.counts: Counter = Counter()
        self.xg_for = self.xg_against = 0.0
        self.possession_ms = self.match_ms = 0
        self.press_x_sum = 0.0
        self.pressing_grid = [[0] * 6 for _ in range(9)]
        self.zones = [[0] * TOUCH_COLS for _ in range(TOUCH_CHANNELS)]
        self.goals_for = [0] * 6
        self.goals_against = [0] * 6
        self.shots_for: list[dict] = []
        self.shots_against: list[dict] = []
        self.forward_m_sum = 0.0
        self.forward_n = 0
        self.points_by_mw: dict[int, int] = {}
        self.results: list[tuple[int, str]] = []
        self.xpts = 0.0
        self.matches = 0


class _Player:
    def __init__(self, info: dict, team_id: str):
        self.info = info
        self.team_id = team_id
        self.counts: Counter = Counter()
        self.xg = self.npxg = 0.0
        self.minutes = 0
        self.apps = self.starts = 0
        self.shots: list[dict] = []
        self.touches = [[0] * TOUCH_COLS for _ in range(TOUCH_CHANNELS)]
        self.defensive = [[0] * TOUCH_COLS for _ in range(TOUCH_CHANNELS)]


def _goal_bucket(shot: dict) -> int:
    minute = shot["period_ms"] / 60_000 + (45 if shot["period"] >= 2 else 0)
    return min(int(minute // GOAL_BUCKET_MIN), 5)


def build(run: Path, world_file: Path | None = None, hide: set[str] | None = None) -> dict:
    run_info = json.loads((run / "run.json").read_text(encoding="utf-8")) if (run / "run.json").exists() else {}
    fixtures = {f["match_id"]: f for f in json.loads((run / "fixtures.json").read_text(encoding="utf-8"))} \
        if (run / "fixtures.json").exists() else {}
    world = json.loads(world_file.read_text(encoding="utf-8")) if world_file else None
    clubs = {c["team_id"]: c for c in world["clubs"]} if world else {}
    hide = set(hide or ()) | {t for t, c in clubs.items() if c.get("reference")}

    teams: dict[str, _Team] = defaultdict(_Team)
    meta: dict[str, dict] = {}
    players: dict[str, _Player] = {}
    matches = []

    for folder in main.match_folders(run):
        pipeline, mid = main.play(folder)
        state = pipeline.states[mid]
        if state.phase != "full_time" or mid in pipeline.stopped:
            continue
        setup = json.loads((folder / "setup.json").read_text(encoding="utf-8"))
        mw = fixtures.get(mid, {}).get("matchweek", len(matches) + 1)
        side_team = {s: setup["teams"][s]["team_id"] for s in SIDES}
        for s in SIDES:
            t = setup["teams"][s]
            meta.setdefault(t["team_id"], {"team_id": t["team_id"], "name": t["name"], "colours": t["colours"],
                                           "formation": t.get("formation"), "style": t.get("style", {})})
            for p in t["lineup"] + t.get("bench", []):
                if p["player_id"] not in players:
                    players[p["player_id"]] = _Player(p, t["team_id"])

        summary = whole_match.summary(state)
        shots = whole_match.shot_list(state)
        xg_lists = {s: [x["xg"] for x in shots[s]] for s in SIDES}
        win, draw, loss = win_draw_loss(xg_lists["home"], xg_lists["away"])
        xpts = {"home": 3 * win + draw, "away": 3 * loss + draw}
        score = dict(state.score)
        matches.append({"match_id": mid, "matchweek": mw, "home": side_team["home"], "away": side_team["away"],
                        "score": score, "xg": {s: round(sum(xg_lists[s]), 2) for s in SIDES},
                        "xpts": {s: round(xpts[s], 2) for s in SIDES},
                        "win_probability": {"home": round(win, 3), "draw": round(draw, 3), "away": round(loss, 3)}})

        shot_rows = {s: [] for s in SIDES}
        for s_event in state.shots:
            side = state.side_of.get(s_event.get("team_id"))
            if side is not None:
                shot_rows[side].append(s_event)

        for s in SIDES:
            o = state.other(s)
            team, st = teams[side_team[s]], state.teams[s]
            team.matches += 1
            team.counts.update(st.counts)
            team.xg_for += st.xg
            team.xg_against += state.teams[o].xg
            team.possession_ms += state.possession_ms(s)
            team.match_ms += state.possession_ms(s) + state.possession_ms(o)
            team.press_x_sum += st.press_x_sum
            for c in range(9):
                for r in range(6):
                    team.pressing_grid[c][r] += st.pressing_grid[c][r]
            for ch in range(TOUCH_CHANNELS):
                for col in range(TOUCH_COLS):
                    team.zones[ch][col] += st.zones[ch][col]
            for e in shot_rows[s]:
                row = {"match_id": mid, "player_id": e.get("player_id"), "x": e["x"], "y": e["y"],
                       "xg": round(e["xg"], 2), "outcome": e["shot_outcome"], "situation": e.get("situation")}
                team.shots_for.append(row)
                teams[side_team[o]].shots_against.append(row)
                if e["shot_outcome"] == "goal":
                    team.goals_for[_goal_bucket(e)] += 1
                    teams[side_team[o]].goals_against[_goal_bucket(e)] += 1
            team.xpts += xpts[s]
            mine, theirs = score[s], score[o]
            result = "W" if mine > theirs else "D" if mine == theirs else "L"
            team.results.append((mw, result))
            team.points_by_mw[mw] = {"W": 3, "D": 1, "L": 0}[result]

        for e in main.event_lines(folder):
            side = state.side_of.get(e.get("team_id"))
            if side is None:
                continue
            if e["type"] == "Pass" and e.get("outcome") == "success" and e.get("end_x") is not None:
                gain = (e["end_x"] - e["x"]) * 1.05
                if gain > 0:
                    teams[side_team[side]].forward_m_sum += gain
                    teams[side_team[side]].forward_n += 1
            p = players.get(e.get("player_id"))
            if p is not None and e.get("x") is not None and e.get("y") is not None:
                col, ch = cell(e["x"], e["y"], TOUCH_COLS, TOUCH_CHANNELS)
                p.touches[ch][col] += 1
                if e["type"] in ("Tackle", "Interception", "BallRecovery", "Pressure", "Clearance"):
                    p.defensive[ch][col] += 1

        for pid, row in summary["players"].items():
            p = players.get(pid)
            sp = state.players.get(pid)
            if p is None or sp is None:
                continue
            p.apps += 1
            p.starts += sp.on_ms == 0
            p.minutes += row["minutes"]
            p.counts.update(sp.counts)
            p.xg += sp.xg
            for e in shot_rows[sp.side]:
                if e.get("player_id") == pid:
                    pen = e.get("situation") == "penalty"
                    p.npxg += 0 if pen else e["xg"]
                    p.shots.append({"match_id": mid, "x": e["x"], "y": e["y"], "xg": round(e["xg"], 2),
                                    "outcome": e["shot_outcome"], "situation": e.get("situation")})

    return _document(run_info, run, matches, teams, meta, players, clubs, hide, world)


def _team_values(t: _Team) -> dict:
    c = t.counts
    poss_min = t.possession_ms / 60_000
    shots = len(t.shots_for)
    return {
        "possession_pct": _round(100 * t.possession_ms / t.match_ms, 0) if t.match_ms else None,
        "pressures_per_opp_pass": _round(c["pressures"] / c["opp_passes"], 2) if c["opp_passes"] else None,
        "ppda": _round(c["ppda_opp_passes"] / c["ppda_actions"], 1) if c["ppda_actions"] else None,
        "press_height_m": _round(t.press_x_sum / c["press_actions"], 0) if c["press_actions"] else None,
        "pass_completion_pct": _round(100 * c["completed"] / c["passes"], 0) if c["passes"] else None,
        "wide_touch_pct": _round(100 * (sum(t.zones[0]) + sum(t.zones[2])) / max(sum(map(sum, t.zones)), 1), 0),
        "forward_pass_m": _round(t.forward_m_sum / t.forward_n, 1) if t.forward_n else None,
        "passes_per_possession_min": _round(c["passes"] / poss_min, 1) if poss_min else None,
        "counter_shot_pct": _round(100 * sum(s["situation"] == "counter" for s in t.shots_for) / shots, 0)
        if shots else None,
        "set_piece_shot_pct": _round(100 * sum(s["situation"] in SET_PIECE_SITUATIONS for s in t.shots_for) / shots, 0)
        if shots else None,
    }


def _document(run_info, run, matches, teams, meta, players, clubs, hide, world) -> dict:
    # Table by matchweek: points, then goal difference, then goals for, then team id (season.md §2)
    weeks = sorted({m["matchweek"] for m in matches})
    gf, ga, pts = Counter(), Counter(), Counter()
    positions: dict[str, list[int]] = defaultdict(list)
    points_line: dict[str, list[int]] = defaultdict(list)
    for w in weeks:
        for m in (m for m in matches if m["matchweek"] == w):
            h, a = m["home"], m["away"]
            gf[h] += m["score"]["home"]
            ga[h] += m["score"]["away"]
            gf[a] += m["score"]["away"]
            ga[a] += m["score"]["home"]
            for tid in (h, a):
                pts[tid] += teams[tid].points_by_mw.get(w, 0)
        order = sorted(teams, key=lambda t: (-pts[t], -(gf[t] - ga[t]), -gf[t], t))
        for i, tid in enumerate(order, 1):
            positions[tid].append(i)
            points_line[tid].append(pts[tid])
    final = sorted(teams, key=lambda t: (-pts[t], -(gf[t] - ga[t]), -gf[t], t))
    xpts_order = sorted(teams, key=lambda t: (-teams[t].xpts, t))

    values = {tid: _team_values(t) for tid, t in teams.items()}
    team_docs = []
    dna_pairs: dict[str, tuple[list, list]] = {d: ([], []) for d, _, _ in DNA}
    for tid in final:
        t = teams[tid]
        c = t.counts
        designed = (clubs.get(tid) or {}).get("style") or meta[tid].get("style", {})
        dna = []
        for dial, key, label in DNA:
            v = values[tid][key]
            if dial in designed and v is not None:
                others_d = [(clubs.get(o) or {}).get("style", meta[o].get("style", {})).get(dial) for o in teams]
                others_m = [values[o][key] for o in teams]
                dna.append({"dial": dial, "designed": designed[dial],
                            "designed_rank": rank_of(designed[dial], [d for d in others_d if d is not None]),
                            "measured_key": key, "measured_label": label, "measured": v,
                            "measured_rank": rank_of(v, [m for m in others_m if m is not None])})
                dna_pairs[dial][0].append(designed[dial])
                dna_pairs[dial][1].append(v)
        won = sum(r == "W" for _, r in t.results)
        drawn = sum(r == "D" for _, r in t.results)
        team_docs.append({
            **meta[tid], "style": designed, "reference": tid in hide,
            "table": {"position": final.index(tid) + 1, "played": t.matches, "won": won, "drawn": drawn,
                      "lost": t.matches - won - drawn, "goals_for": gf[tid], "goals_against": ga[tid],
                      "goal_difference": gf[tid] - ga[tid], "points": pts[tid]},
            "xpts": round(t.xpts, 1), "xpts_position": xpts_order.index(tid) + 1,
            "xg_for": round(t.xg_for, 2), "xg_against": round(t.xg_against, 2),
            "form": [r for _, r in sorted(t.results)][-5:],
            "position_by_matchweek": positions[tid], "points_by_matchweek": points_line[tid],
            "per_match": {"shots": round(len(t.shots_for) / t.matches, 1),
                          "shots_against": round(len(t.shots_against) / t.matches, 1),
                          "xg": round(t.xg_for / t.matches, 2), "xg_against": round(t.xg_against / t.matches, 2),
                          "passes": round(c["passes"] / t.matches), "pressures": round(c["pressures"] / t.matches),
                          "high_regains": round(c["high_regains"] / t.matches, 1),
                          "fouls": round(c["fouls"] / t.matches, 1),
                          "yellow_cards": round(c["yellows"] / t.matches, 1)},
            "season": values[tid],
            "dna": dna,
            "pressing_grid": t.pressing_grid, "zones": t.zones,
            "goals_by_15min": {"for": t.goals_for, "against": t.goals_against},
            "shots_for": t.shots_for, "shots_against": t.shots_against,
        })

    # Players: totals, per 90, rates, then percentiles inside each position group (season.md §3-§4)
    player_docs = []
    for pid, p in sorted(players.items()):
        if p.minutes == 0 or p.team_id in hide:
            continue
        info = p.info
        full = next((q for q in (clubs.get(p.team_id) or {}).get("squad", []) if q["player_id"] == pid), None)
        c = p.counts
        totals = {k: c[k] for k in ("goals", "assists", "shots", "on_target", "key_passes", "passes", "completed",
                                    "progressive", "take_ons", "take_ons_completed", "tackles", "interceptions",
                                    "pressures", "fouls", "yellows", "reds")}
        totals["progressive_passes"] = totals.pop("progressive")
        totals["xg"], totals["npxg"] = round(p.xg, 2), round(p.npxg, 2)
        per90 = {k: round(90 * totals.get(k, 0) / p.minutes, 2) for k in PER90}
        rates = {k: (round(100 * c[n] / c[d]) if c[d] >= m else None) for k, (n, d, m) in RATES.items()}
        pos = info["pos"]
        player_docs.append({
            "player_id": pid, "team_id": p.team_id, "name": info["name"], "pos": pos, "group": GROUPS.get(pos),
            "shirt": info.get("shirt"), "role": (full or {}).get("role"),
            "preferred_foot": (full or {}).get("preferred_foot"), "weak_foot": (full or {}).get("weak_foot"),
            "overall": (full or {}).get("overall"), "attr": (full or info).get("attr", {}),
            "apps": p.apps, "starts": p.starts, "minutes": p.minutes,
            "totals": totals, "per90": per90, "rates": rates,
            "shots": p.shots, "touch_zones": p.touches, "defensive_zones": p.defensive,
        })
    by_group: dict[str, list[dict]] = defaultdict(list)
    for d in player_docs:
        if d["minutes"] >= MIN_MINUTES_FOR_PERCENTILES and d["group"]:
            by_group[d["group"]].append(d)
    for d in player_docs:
        peers = by_group.get(d["group"], [])
        d["percentiles"] = None
        d["low_sample"] = d["minutes"] < MIN_MINUTES_FOR_PERCENTILES
        if not d["low_sample"] and len(peers) >= 5:
            pct = {}
            for k in RADAR.get(d["group"], ()):
                source = "rates" if k in RATES else "per90"
                vals = [q[source][k] for q in peers if q[source][k] is not None]
                if d[source][k] is not None and vals:
                    pct[k] = percentile(d[source][k], vals)
            d["percentiles"] = pct
            d["peer_count"] = len(peers)

    return {
        "id": f"season-{run_info.get('season_id', run.name)}", "kind": "season", "schema_version": SCHEMA_VERSION,
        "season_id": run_info.get("season_id", run.name), "world_version": run_info.get("world_version"),
        "built_from": {"run": run_info.get("run", run.name), "seed": run_info.get("seed"), "matches": len(matches),
                       "world": bool(world)},
        "hidden_teams": sorted(hide),
        "rules": {"min_minutes_for_percentiles": MIN_MINUTES_FOR_PERCENTILES, "groups": GROUPS, "radar": RADAR},
        "dna_correlations": {d: spearman(*dna_pairs[d]) for d, _, _ in DNA},
        "matchweeks": weeks,
        "teams": team_docs,
        "matches": sorted(matches, key=lambda m: m["match_id"]),
        "players": player_docs,
    }


def write(doc: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
