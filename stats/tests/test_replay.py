# test_replay.py — Replay tests
#
# Purpose: a recorded match replays to the same numbers every time, and they agree with the match itself
# Inputs:  tests/fixtures/SYN-1017 (a generated KES v ORR match, seed 1017, the same as the shot-cluster example)
# Outputs: pass / fail
# Spec:    stats/specs/metrics.md; stats/specs/publishing.md

from __future__ import annotations

import gzip
import json
from pathlib import Path

import main

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"


def events() -> list[dict]:
    with gzip.open(FIXTURE / "events.ndjson.gz", "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_replaying_twice_gives_identical_numbers():
    a = main.numbers_json(main.replay(FIXTURE))
    b = main.numbers_json(main.replay(FIXTURE))
    assert a == b


def test_numbers_agree_with_the_events():
    ev = events()
    s = main.replay_match(FIXTURE)
    assert s["phase"] == "full_time" and s["source_seq"] == ev[-1]["seq"]
    for side in ("home", "away"):
        tid = s["teams"][side]["team_id"]
        shots = [e for e in ev if e["type"] == "Shot" and e["team_id"] == tid]
        assert s["teams"][side]["shots"] == len(shots)
        assert s["teams"][side]["goals"] == s["score"][side] == sum(e["shot_outcome"] == "goal" for e in shots)
        assert s["teams"][side]["passes"] == sum(e["type"] == "Pass" and e["team_id"] == tid for e in ev)
    assert s["score"] == {"home": 3, "away": 0}
    assert s["teams"]["home"]["possession_pct"] + s["teams"]["away"]["possession_pct"] == 100
    assert s["input"] == {"duplicates": 0, "waiting_after_gap": 0, "gap_at_seq": None, "stopped": None}


def test_shuffled_and_repeated_delivery_gives_the_same_numbers():
    ev = events()
    setup = json.loads((FIXTURE / "setup.json").read_text(encoding="utf-8"))
    p = main.Pipeline()
    p.handle("event", ev[0])                       # before its setup: held until the setup arrives
    p.handle("setup", setup)
    swapped = ev[1:]
    for i in range(0, len(swapped) - 1, 7):        # swap neighbours every 7 events, and send some twice
        swapped[i], swapped[i + 1] = swapped[i + 1], swapped[i]
    for i, e in enumerate(swapped):
        p.handle("event", e)
        if i % 50 == 0:
            p.handle("event", e)
    p.handle("stats", {"match_id": setup["match_id"]})   # our own panel read back: ignored
    shuffled = p.summary(setup["match_id"])
    straight = main.replay_match(FIXTURE)
    assert shuffled["input"]["duplicates"] > 0
    shuffled.pop("input")
    straight.pop("input")
    assert shuffled == straight


def test_a_missing_event_holds_everything_after_it():
    ev = events()
    setup = json.loads((FIXTURE / "setup.json").read_text(encoding="utf-8"))
    p = main.Pipeline()
    p.handle("setup", setup)
    for e in ev:
        if e["seq"] != 100:
            p.handle("event", e)
    s = p.summary(setup["match_id"])
    assert s["source_seq"] == 99 and s["input"]["gap_at_seq"] == 100
    assert s["input"]["waiting_after_gap"] == len(ev) - 100
