# realism_report.py — Realism report
#
# Purpose: compare a generated season or repeat run with the CALIBRATION.md targets, and print the reference
#          clubs' answer key
# Inputs:  a run folder from batch.py; CALIBRATION.md
# Outputs: data/generated/reports/<run>/report.md with a chart per metric
# Spec:    generator/specs/live-and-batch.md §4
#
# Targets are read from CALIBRATION.md itself, so the report and the targets can't drift apart. Only rows marked
# `sourced` or `weak source` are measured.

from __future__ import annotations

import json
import re
import statistics as st
from pathlib import Path

import config
import outcomes
import pitch

CALIBRATION = Path(__file__).resolve().parents[1] / "CALIBRATION.md"
REPORTS_DIR = Path(__file__).resolve().parents[1] / "data" / "generated" / "reports"
NUM = re.compile(r"\d+(?:\.\d+)?")


def calibration_rows(path: Path = CALIBRATION) -> list[dict]:
    """Rows of the CALIBRATION.md tables whose status is `sourced` or `weak source`."""
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4 or cells[0] in ("Metric", "Effect") or set(cells[0]) <= {"-"}:
            continue
        status = cells[-1].lower()
        if status.startswith(("sourced", "weak source")):
            rows.append({"metric": cells[0], "target": cells[1], "status": cells[-1]})
    return rows


def _range(text: str, i: int = 0) -> tuple[float, float]:
    nums = [float(n) for n in NUM.findall(text)]
    if len(nums) >= 2 * i + 2:
        return nums[2 * i], nums[2 * i + 1]
    v = nums[i] if nums else 0.0
    return v * 0.85, v * 1.15


def load_run(d: Path) -> list[dict]:
    out = []
    for m in sorted((d / "matches").iterdir()):
        events = [json.loads(x) for x in (m / "events.ndjson").read_text(encoding="utf-8").splitlines() if x]
        out.append({"setup": json.loads((m / "setup.json").read_text(encoding="utf-8")), "events": events,
                    "summary": json.loads((m / "summary.json").read_text(encoding="utf-8"))})
    return out


def _count(ev, typ, **kw) -> int:
    return sum(1 for e in ev if e["type"] == typ and all(e.get(k) == v for k, v in kw.items()))


def per_match(matches: list[dict]) -> dict[str, list[float]]:
    """Each metric, one value per match."""
    m: dict[str, list[float]] = {k: [] for k in ("goals", "shots", "passes", "fouls_per_team", "yellows", "length_min",
                                                 "top_kmh", "dist_km", "weak_pass_share")}
    for x in matches:
        ev, sm = x["events"], x["summary"]
        passes = [e for e in ev if e["type"] == "Pass"]
        m["goals"].append(sum(sm["score"].values()))
        m["shots"].append(_count(ev, "Shot"))
        m["passes"].append(len(passes))
        m["fouls_per_team"].append(_count(ev, "Foul") / 2)
        m["yellows"].append(sum(1 for e in ev if e["type"] == "Card" and e["card"] in ("yellow", "second_yellow")))
        m["length_min"].append(ev[-1]["match_ms"] / 60000)
        players = sm.get("players", {})
        m["top_kmh"].append(max((p["top_kmh"] for p in players.values()), default=0.0))
        full = [p["dist_m"] / 1000 for p in players.values() if p["started"] and p["finished"]]
        m["dist_km"].append(st.median(full) if full else 0.0)
        m["weak_pass_share"].append(sum("weak_foot" in e.get("qualifiers", []) for e in passes) / max(len(passes), 1))
    return m


def _shot(d: float, **kw) -> float:
    args = {"header": False, "weak": False, "weak_foot": 3, "situation": "open_play", "assist": "none",
            "defenders_in_way": 0, "keeper_off_line_m": 0.0}
    args.update(kw)
    return outcomes.xg(pitch.LENGTH - d, pitch.GOAL_Y, **args)


def measure(rows: list[dict], matches: list[dict]) -> list[dict]:
    pm = per_match(matches)
    agg_goals, agg_shots = sum(pm["goals"]), sum(pm["shots"])
    passes = [e for x in matches for e in x["events"] if e["type"] == "Pass"]
    done = sum(1 for e in passes if e["outcome"] == "success")
    diffs =[x["summary"]["score"]["home"] - x["summary"]["score"]["away"] for x in matches]
    n = max(len(matches), 1)
    out = []
    for row in rows:
        name, target = row["metric"], row["target"]
        values, measured, ok = None, None, None
        if name.startswith("Goals per match"):
            values = pm["goals"]
        elif name.startswith("Shots per match"):
            values = pm["shots"]
        elif name.startswith("Shot conversion"):
            measured = 100 * agg_goals / max(agg_shots, 1)
        elif name.startswith("Passes per match"):
            values = pm["passes"]
        elif name.startswith("Pass completion"):
            measured = 100 * done / max(len(passes), 1)
        elif name.startswith("Fouls per team"):
            values = pm["fouls_per_team"]
        elif name.startswith("Yellow cards"):
            values = pm["yellows"]
        elif name.startswith("Home win") and len({(x["setup"]["teams"]["home"]["team_id"],
                                                    x["setup"]["teams"]["away"]["team_id"]) for x in matches}) < 2:
            out.append({**row, "measured": "not meaningful for a repeat run", "ok": None, "values": None})
            continue
        elif name.startswith("Home win"):
            shares = [100 * sum(d > 0 for d in diffs) / n, 100 * sum(d == 0 for d in diffs) / n,
                      100 * sum(d < 0 for d in diffs) / n]
            ranges = [_range(target, i) for i in range(3)]
            ok = all(lo <= s <= hi for s, (lo, hi) in zip(shares, ranges))
            measured = " / ".join(f"{s:.0f} %" for s in shares)
        elif name.startswith("Total match length"):
            values = pm["length_min"]
        elif name.startswith("Penalty xG"):
            measured = config.PENALTY_XG
            ok = abs(measured - 0.78) < 0.005
        elif name.startswith("Six-yard"):
            foot, head = _shot(4.5), _shot(4.5, header=True)
            measured = f"foot {foot:.2f}, header {head:.2f}"
            ok = 0.35 <= foot <= 0.50 and head < 0.25
        elif name.startswith("From 25 m"):
            measured = _shot(25)
            ok = 0.015 <= measured <= 0.04
        elif name.startswith("Weak-foot shots"):
            strong, weak = _shot(11), _shot(11, weak=True, weak_foot=2)
            measured = f"{weak:.3f} weak vs {strong:.3f} strong (weak foot 2)"
            ok = weak < strong
        elif name.startswith("Passes with the weaker foot"):
            measured = 100 * st.mean(pm["weak_pass_share"]) if matches else 0.0
            ok = 10 <= measured <= 18
        elif name.startswith("Sprint threshold"):
            measured = config.SPRINT_KMH
            ok = abs(measured - 25) <= 0.5
        elif name.startswith("Top sprint speed"):
            values = pm["top_kmh"]
        elif name.startswith("Distance covered"):
            values = pm["dist_km"]
        else:
            out.append({**row, "measured": "not measured", "ok": None, "values": None})
            continue
        if values is not None:
            measured = st.mean(values) if values else 0.0
        if ok is None and isinstance(measured, (int, float)):
            lo, hi = _range(target)
            ok = lo <= measured <= hi
        out.append({**row, "measured": measured, "ok": ok, "values": values})
    return out


DEF_ACTIONS = {"Tackle", "Interception", "Foul"}


def _regain(e: dict) -> bool:
    return e["type"] in ("BallRecovery", "Interception") or (e["type"] == "Tackle" and e["outcome"] == "success")


def answer_key(matches: list[dict]) -> dict[str, dict] | None:
    """Possession, pressing, high regains, counter and set-piece shares, top scorer per club."""
    teams = {x["setup"]["teams"][s]["team_id"] for x in matches for s in ("home", "away")}
    if teams != {"CAL", "DTN"}:
        return None
    names = {p["player_id"]: p["name"] for x in matches for s in ("home", "away")
             for p in x["setup"]["teams"][s]["lineup"] + x["setup"]["teams"][s]["bench"]}
    key = {}
    for tid in ("CAL", "DTN"):
        opp = "DTN" if tid == "CAL" else "CAL"
        poss, ppda, high, shots, counter, setp, scorers = [], [], [], 0, 0, 0, {}
        for x in matches:
            ev = x["events"]
            side = "home" if x["setup"]["teams"]["home"]["team_id"] == tid else "away"
            poss.append(x["summary"][side]["possession"])
            opp_passes = sum(1 for e in ev if e["type"] == "Pass" and e["team_id"] == opp and e["x"] <= 60)
            acts = sum(1 for e in ev if e["type"] in DEF_ACTIONS and e.get("team_id") == tid and e["x"] >= 40)
            ppda.append(opp_passes / max(acts, 1))
            high.append(sum(1 for e in ev if e.get("team_id") == tid and e["x"] >= 60 and _regain(e)))
            for e in ev:
                if e["type"] == "Shot" and e["team_id"] == tid:
                    shots += 1
                    counter += e["situation"] == "counter"
                    setp += e["situation"] in ("corner", "free_kick", "throw_in")
                    if e["shot_outcome"] == "goal":
                        scorers[e["player_id"]] = scorers.get(e["player_id"], 0) + 1
        top = max(scorers.items(), key=lambda kv: (kv[1], kv[0]), default=(None, 0))
        key[tid] = {"possession": st.mean(poss), "ppda": st.mean(ppda), "high_regains": st.mean(high),
                    "shots": shots / len(matches), "counter_share": counter / max(shots, 1),
                    "set_piece_share": setp / max(shots, 1),
                    "top_scorer": f"{names.get(top[0], top[0])} ({top[1]})" if top[0] else "none"}
    return key


def _fmt(v) -> str:
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v)


def write(run_dir: Path, out_root: Path = REPORTS_DIR) -> Path:
    matches = load_run(run_dir)
    rows = measure(calibration_rows(), matches)
    out = out_root / run_dir.name
    out.mkdir(parents=True, exist_ok=True)
    lines = [f"# Realism report · {run_dir.name}", "", f"{len(matches)} matches. Targets from `CALIBRATION.md`.", "",
             "| Metric | Target | Measured | Pass | Source |", "|---|---|---|---|---|"]
    charts = []
    for r in rows:
        mark = {True: "✅", False: "❌", None: "—"}[r["ok"]]
        chart = _chart(out, r) if r["values"] else None
        name = f"[{r['metric']}]({chart})" if chart else r["metric"]
        lines.append(f"| {name} | {r['target']} | {_fmt(r['measured'])} | {mark} | {r['status']} |")
        if chart:
            charts.append(chart)
    passed = sum(r["ok"] is True for r in rows)
    lines += ["", f"**{passed} of {sum(r['ok'] is not None for r in rows)} measured targets pass.**"]
    key = answer_key(matches)
    if key:
        lines += ["", "## Answer key: Calverholme vs Dunmarrow", "", "| | Calverholme | Dunmarrow |", "|---|---|---|"]
        for k in ("possession", "ppda", "high_regains", "shots", "counter_share", "set_piece_share", "top_scorer"):
            lines.append(f"| {k.replace('_', ' ')} | {_fmt(key['CAL'][k])} | {_fmt(key['DTN'][k])} |")
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out / "report.md"


def _chart(out: Path, row: dict) -> str | None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return None
    lo, hi = _range(row["target"])
    slug = re.sub(r"[^a-z0-9]+", "-", row["metric"].lower()).strip("-")[:40]
    fig, ax = plt.subplots(figsize=(5, 2.6))
    ax.hist(row["values"], bins=min(12, max(3, len(row["values"]) // 2)), color="#4C78A8")
    ax.axvspan(lo, hi, color="#54A24B", alpha=0.2, label="target")
    ax.set_title(row["metric"], fontsize=9)
    ax.legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(out / f"{slug}.png", dpi=110)
    plt.close(fig)
    return f"{slug}.png"
