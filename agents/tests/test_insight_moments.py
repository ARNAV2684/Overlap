"""Head-to-head, connection and workhorse moments through the agents' code paths.

Spec: CONTRACTS.md §5, §10.6; stats/specs/triggers.md §1; plans/done/PLAN_cross_live-insight-moments.md.
The moments are the stats engine's own, from its fixture match (mcp_server/tests/data/SYN-1017-insight-moments.json).
"""
import json
import re
from pathlib import Path

import pytest

import director
import spotter
from config import MODES
from fact_checker import _meanings, numbers, numeric_check
from fallbacks import line_ids, template, template_line
from validate import validate_moment

DATA = Path(__file__).resolve().parents[2] / "mcp_server" / "tests" / "data" / "SYN-1017-insight-moments.json"
INSIGHTS = json.loads(DATA.read_text(encoding="utf-8"))
IDS = [f"{m['id']}-{m['evidence']['trigger']}" for m in INSIGHTS]


def test_the_fixture_has_every_insight_trigger():
    assert {m["evidence"]["trigger"] for m in INSIGHTS} == {"head_to_head", "connection", "workhorse"}


@pytest.mark.parametrize("moment", INSIGHTS, ids=IDS)
def test_every_insight_moment_validates_and_ranks_normal(moment):
    assert validate_moment(moment) is moment
    trigger = moment["evidence"]["trigger"]
    assert spotter.priority(trigger) == "normal" and trigger in spotter.COMPARISON
    assert spotter.ORDER.index(trigger) > spotter.ORDER.index("milestone")


@pytest.mark.parametrize("moment", INSIGHTS, ids=IDS)
def test_every_line_template_passes_the_code_checks(moment):
    for line_id in line_ids(moment, MODES, max_players=2):
        line = template_line(moment, line_id)
        assert numeric_check(line, moment) == [], (line_id, line["text"])
        tokens, _ = numbers(line["text"])
        assert _meanings(line["text"], tokens, line["claims"], moment) == [], (line_id, line["text"])


@pytest.mark.parametrize("moment", INSIGHTS, ids=IDS)
def test_the_director_links_each_moment_to_its_insight_card(moment):
    e = moment["evidence"]
    vis = director.visual(e)
    assert vis["component"] == {"head_to_head": "head_to_head", "connection": "connections",
                                "workhorse": "engine_room"}[e["trigger"]]
    if e["trigger"] == "connection":
        assert vis["highlight"] == {"team_id": e["team_id"]}
    else:
        assert vis["highlight"] == {"team_id": e["team_id"], "player_id": e["player_ids"][0]}


def test_a_head_to_head_names_the_rival_and_compares_like_with_like():
    m = next(m for m in INSIGHTS if m["evidence"]["trigger"] == "head_to_head")
    names = {p["player_id"]: p["name"] for p in m["context"]["players"]}
    leader, rival = (names[p] for p in m["evidence"]["player_ids"])
    casual = template(m, "casual")
    assert casual["text"].startswith(f"{leader} is winning the battle with {rival}:")
    keys = [c["key"] for c in template(m, "analyst")["claims"]]
    assert len(keys) == 6 and keys[0::2] == [k.replace("rival_", "player_") for k in keys[1::2]]


def test_wording_the_facts_cannot_support_is_refused():
    by_trigger = {m["evidence"]["trigger"]: m for m in INSIGHTS}
    cases = {"head_to_head": "He is simply the better player tonight.",
             "connection": "Their chemistry is driving the possession.",
             "workhorse": "He must be tired after all that running."}
    for trigger, text in cases.items():
        assert _meanings(text, [], [], by_trigger[trigger]), trigger
    no_km = {**by_trigger["workhorse"]}
    assert "player_distance_km" not in {f["key"] for f in no_km["evidence"]["facts"]}
    assert "distance_without_tracking" in _meanings("He has covered more ground than anyone.", [], [], no_km)
    assert not re.search(r"\d+\s*minutes", template(by_trigger["connection"], "casual")["text"])


def test_the_casual_head_to_head_quotes_a_number_the_leader_leads_on():
    m = next(m for m in INSIGHTS if m["evidence"]["trigger"] == "head_to_head")
    tied = json.loads(json.dumps(m))
    facts = {f["key"]: f for f in tied["evidence"]["facts"]}
    player_keys = [k for k in facts if k.startswith("player_")]
    facts[player_keys[0]]["value"] = facts[player_keys[0].replace("player_", "rival_")]["value"]   # a tie first
    claims = {c["key"]: c["value"] for c in template(tied, "casual")["claims"]}
    mine = next(v for k, v in claims.items() if k.startswith("player_"))
    theirs = next(v for k, v in claims.items() if k.startswith("rival_"))
    assert mine > theirs
