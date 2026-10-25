# director.py — Director
#
# Purpose: turn checked lines into the publication intent: one overlay identity per moment, one overlay body per
#          audience group (mode, language, club or player), visual and highlight per trigger; and detect player-tag
#          threshold crossings in match_state
# Inputs:  the translator's lines and status; the moment; the spotter's priority
# Outputs: {intent} for the outbox (sending is the publisher's job, M5)
# Spec:    agents/specs/agents.md §6; CONTRACTS.md §6, §10.3, §10.6; stats/agents-guide.md §4 (Director)
#
# Rules only, no model: destinations, timing, priority and chart names are never chosen by a model.

from __future__ import annotations

from fallbacks import mode_of, player_name, public, target_of
from runtime import RunState

DURATION_MS = 6000                               # maximum wall-clock display time (§10.3)
VISUAL = {"goal": "key_events", "big_chance": "key_events", "penalty": "key_events", "shot_cluster": "key_events",
          "momentum_swing": "momentum_tide", "press_change": "pressing_zones", "red_card": "key_events",
          "milestone": "key_events", "head_to_head": "head_to_head", "connection": "connections",
          "workhorse": "engine_room"}            # goal, big chance, penalty -> shot_map once the web app has it


def groups(match_id: str, line_id: str, lang: str) -> str:
    mode, target = mode_of(line_id), target_of(line_id)
    if mode in ("casual", "analyst"):
        return f"match-{match_id}-{mode}-{lang}"
    return f"match-{match_id}-{mode}-{target}-{lang}"           # club-<teamId> or player-<playerId>


def overlay_id(moment_id: str) -> str:
    return "OV-" + moment_id[3:]


def visual(e: dict) -> dict:
    """Component, window and highlight per trigger (§10.6): the triggering event, except for momentum swings and the
    insight moments (the leader or worker for a head-to-head or workhorse, the team for a connection)."""
    if e["trigger"] in ("momentum_swing", "connection") or not e["event_ids"]:
        highlight = {"team_id": e["team_id"]}
    elif e["trigger"] in ("head_to_head", "workhorse") and e["player_ids"]:
        highlight = {"team_id": e["team_id"], "player_id": e["player_ids"][0]}
    elif e["trigger"] == "milestone" and e["player_ids"]:
        highlight = {"team_id": e["team_id"], "player_id": e["player_ids"][0], "event_id": e["event_ids"][-1]}
    else:
        highlight = {"team_id": e["team_id"], "event_id": e["event_ids"][-1]}
    return {"component": VISUAL[e["trigger"]], "window_ms": [e["window"]["from_ms"], e["window"]["to_ms"]],
            "highlight": highlight}


async def run(run: RunState) -> dict:
    m, e = run.moment, run.moment["evidence"]
    if e["trigger"] == "recap":
        return {"intent": recap_intent(run)}
    translated = run.output("translator")
    priority = run.output("spotter")["priority"]
    oid = overlay_id(m["moment_id"])
    tags = [{"player_id": e["player_ids"][0], "label": player_name(m, e["player_ids"][0])}] \
        if e["trigger"] == "milestone" and e["player_ids"] and player_name(m, e["player_ids"][0]) else []
    vis = visual(e)
    audiences = []
    for line in translated["lines"]:
        st = translated["status"][f"{line['id']}|{line['lang']}"]
        mode, target, lang = mode_of(line["id"]), target_of(line["id"]), line["lang"]
        body = {"overlay_id": oid, "match_id": m["match_id"], "moment_id": m["moment_id"], "kind": "moment",
                "priority": priority, "period": e["period"], "clock": e["clock"], "show_at_ms": e["match_ms"],
                "duration_ms": DURATION_MS, "mode": mode, "lang": lang,
                **({mode: target} if target else {}),
                "modes": {mode: {lang: line["text"]}}, "visual": vis, "player_tags": tags,
                "verified": st["verified"], "fallback": st["fallback"],
                "facts_checked": sorted({c["key"] for c in line["claims"]})}
        audiences.append({"group": groups(m["match_id"], line["id"], lang), "mode": mode, "lang": lang,
                          **({mode: target} if target else {}), "line": public(line), "overlay": body})
    lines_ok = [a["overlay"] for a in audiences]
    return {"intent": {"overlay_id": oid, "match_id": m["match_id"], "moment_id": m["moment_id"], "kind": "moment",
                       "trigger": e["trigger"], "priority": priority, "period": e["period"],
                       "show_at_ms": e["match_ms"], "clock": e["clock"], "window": e["window"],
                       "duration_ms": DURATION_MS, "visual": vis,
                       "verified": bool(lines_ok) and all(o["verified"] for o in lines_ok),
                       "fallback": any(o["fallback"] for o in lines_ok),
                       "dropped": translated.get("dropped", []), "audiences": audiences}}


def recap_intent(run: RunState) -> dict:
    """At full time: one recap envelope per audience group; data is the group's checked §5.1 lines (§10.6)."""
    m, e = run.moment, run.moment["evidence"]
    translated = run.output("translator")
    audiences = []
    for line in translated["lines"]:
        st = translated["status"][f"{line['id']}|{line['lang']}"]
        mode, target, lang = mode_of(line["id"]), target_of(line["id"]), line["lang"]
        data = {"recap_id": m["moment_id"], "match_id": m["match_id"], "kind": "recap", "mode": mode, "lang": lang,
                **({mode: target} if target else {}), "lines": [public(line)], "verified": st["verified"],
                "fallback": st["fallback"], "facts_checked": sorted({c["key"] for c in line["claims"]})}
        audiences.append({"group": groups(m["match_id"], line["id"], lang), "mode": mode, "lang": lang,
                          **({mode: target} if target else {}), "line": public(line), "recap": data})
    return {"recap_id": m["moment_id"], "overlay_id": m["moment_id"], "match_id": m["match_id"], "kind": "recap",
            "period": e["period"], "show_at_ms": e["match_ms"], "clock": e["clock"],
            "verified": bool(audiences) and all(a["recap"]["verified"] for a in audiences),
            "fallback": any(a["recap"]["fallback"] for a in audiences),
            "dropped": translated.get("dropped", []), "audiences": audiences}


# --- player tags (§10.6): values come from match_state, never from a model -----------------------------------------

TAG_METRICS = (("top_speed_kmh", "km/h", "tag_top_speed_kmh"), ("distance_km", "km", "tag_distance_km"))


def player_tag_crossings(state: dict, already: set[tuple[str, str]], settings) -> list[dict]:
    """`player_tag` data for every player whose speed or distance first crosses its threshold. `already` holds
    (player_id, metric) pairs sent before; the caller records the new ones durably (publisher, M5)."""
    out = []
    for pid, p in sorted((state.get("players") or {}).items()):
        for metric, unit, setting in TAG_METRICS:
            value, threshold = p.get(metric), getattr(settings, setting)
            if isinstance(value, int | float) and not isinstance(value, bool) and value >= threshold \
                    and (pid, metric) not in already:
                out.append({"player_id": pid, "name": p.get("name"), "metric": metric, "value": value, "unit": unit,
                            "threshold": threshold})
    return out
