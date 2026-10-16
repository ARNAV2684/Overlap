# test_seed.py — Seed reproducibility
#
# Purpose: the same seed gives the same match, byte for byte; a different seed gives a different one
# Inputs:  two runs of one seed, one run of another
# Outputs: pass / fail
# Spec:    generator/specs/engine.md §7

from __future__ import annotations

import hashlib
import json

import engine
import world


def digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def test_same_seed_same_match():
    _, loaded = world.load_reference_clubs()
    clubs = {c.team_id: c for c in loaded}
    a = engine.play(clubs, "SKH", "AMH", match_id="SYN-0007", seed=7)
    b = engine.play(clubs, "SKH", "AMH", match_id="SYN-0007", seed=7)
    assert digest(a.setup) == digest(b.setup)
    assert digest(a.events) == digest(b.events)
    assert digest(a.frames) == digest(b.frames)


def test_different_seed_different_match():
    _, loaded = world.load_reference_clubs()
    clubs = {c.team_id: c for c in loaded}
    a = engine.play(clubs, "SKH", "AMH", match_id="SYN-0007", seed=7, keep_frames=False)
    b = engine.play(clubs, "SKH", "AMH", match_id="SYN-0007", seed=8, keep_frames=False)
    assert digest(a.events) != digest(b.events)
