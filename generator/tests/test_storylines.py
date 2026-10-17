# test_storylines.py — Storylines and answer keys
#
# Purpose: storyline files stay within the spec's limits; storylines start when they should, tilt the odds without
#          writing events, and record answer keys
# Inputs:  the storyline files; small bad files in a temporary folder; seeded matches with and without storylines
# Outputs: pass / fail
# Spec:    generator/specs/storylines.md

from __future__ import annotations

import pytest

import engine
import storylines
import world

SEEDS = (1, 2, 3)


@pytest.fixture(scope="module")
def clubs():
    _, loaded = world.load_reference_clubs()
    return {c.team_id: c for c in loaded}


_MATCHES: dict = {}


def play(clubs, seed, names=(), home="SKH", away="AMH"):
    """One seeded match without tracking; each one is played once and shared between tests."""
    key = (seed, tuple(names), home, away)
    if key not in _MATCHES:
        _MATCHES[key] = engine.play(clubs, home, away, match_id=f"SYN-{seed:04d}", seed=seed, keep_frames=False,
                                    storylines=key[1])
    return _MATCHES[key]


# --- files and limits (§1-§2) ------------------------------------------------------------------------------------


def test_the_catalogue_loads_within_limits():
    names = storylines.available()
    assert set(names) >= {"late_pressure_surge", "red_card", "comeback", "star_night", "low_block_resistance",
                          "fading_legs"}
    for n in names:
        s = storylines.load(n)
        for delta in s.effects.get("style", {}).values():
            assert abs(delta) <= storylines.STYLE_LIMIT


@pytest.mark.parametrize("effects, expected", [
    ("{style: {press_intensity: 0.4}}", "beyond"),
    ("{shot_appetite: 2.0}", "outside"),
    ("{goals: 3}", "not allowed"),
    ("{style: {aggression: 0.1}}", "unknown style trait"),
])
def test_out_of_limit_files_are_rejected(tmp_path, effects, expected):
    (tmp_path / "bad.yaml").write_text(
        f"name: bad\nsummary: x\nteam: home\nstarts: {{minute: 10}}\nends: {{minute: full_time}}\n"
        f"effects: {effects}\n", encoding="utf-8")
    with pytest.raises(storylines.StorylineError, match=expected):
        storylines.load("bad", tmp_path)


def test_at_most_two_storylines(clubs):
    with pytest.raises(storylines.StorylineError, match="at most"):
        play(clubs, 1, ("late_pressure_surge", "red_card", "comeback"))


# --- effects without forced events (§2) ----------------------------------------------------------------------------


def _press_rate(r, tid, opp, onset):
    """`tid`'s pressures per 100 `opp` passes after onset: the press itself, whoever has more of the ball."""
    after = [e for e in r.events if e["match_ms"] >= onset]
    pressures = sum(1 for e in after if e["type"] == "Pressure" and e.get("team_id") == tid)
    passes = sum(1 for e in after if e["type"] == "Pass" and e.get("team_id") == opp)
    return 100 * pressures / max(passes, 1)


def test_late_pressure_surge_tilts_the_home_style_within_limits(clubs):
    m = engine.Match(clubs["SKH"], clubs["AMH"], match_id="SYN-0072", seed=72, kickoff_utc="2026-10-24T19:00:00Z",
                     storylines=("late_pressure_surge",))
    m.period, m.period_ms, m.offset_ms = 2, 15 * 60_000, 46 * 60_000      # about 61': past the latest onset
    m.director.update(m)
    m.period_ms += 10 * 60_000                                            # and past the five-minute ramp
    m.director.update(m)
    m._update_style()
    base, now = clubs["SKH"].style, m.style("home")
    assert now["press_intensity"] == pytest.approx(min(base["press_intensity"] + 0.20, 1.0))
    assert now["press_height"] == pytest.approx(min(base["press_height"] + 0.15, 1.0))
    assert m.style("away") == pytest.approx(m.club["away"].style)       # never the other side's traits
    assert m.director.multiplier(m, "home", "shot_appetite") == pytest.approx(1.3)
    assert m.director.multiplier(m, "away", "shot_appetite") == 1.0


def test_late_pressure_surge_raises_the_home_press_after_onset(clubs):
    # Amberholt at home: Skyhaven already presses near the 1.0 ceiling, so its surge is too small to see in three
    # matches; Amberholt's 0.45 press has room for the full +0.20
    with_, without = 0.0, 0.0
    for s in SEEDS:
        r = play(clubs, s, ("late_pressure_surge",), home="AMH", away="SKH")
        key = r.summary["storylines"][0]
        assert key["triggered"] and key["team_id"] == "AMH"
        assert 52 * 60_000 <= key["onset_ms"] <= 58 * 60_000 + 60_000      # 55' with up to 3' of jitter
        with_ += _press_rate(r, "AMH", "SKH", key["onset_ms"])
        without += _press_rate(play(clubs, s, home="AMH", away="SKH"), "AMH", "SKH", key["onset_ms"])
    assert with_ > without


def test_red_card_storyline_raises_away_fouls_in_its_window(clubs):
    with_, without = 0, 0
    for s in SEEDS:
        for names, bucket in ((("red_card",), "with"), ((), "without")):
            r = play(clubs, s, names)
            n = sum(1 for e in r.events if e["type"] == "Foul" and e["team_id"] == "AMH"
                    and 28 * 60_000 <= e["match_ms"] < 42 * 60_000)
            if bucket == "with":
                with_ += n
            else:
                without += n
    assert with_ > without


def test_storylines_never_write_events_of_their_own(clubs):
    base = {e["type"] for e in play(clubs, 2).events}
    tilted = {e["type"] for e in play(clubs, 2, ("late_pressure_surge", "red_card")).events}
    allowed = {"Pass", "Carry", "TakeOn", "Shot", "Save", "Tackle", "Interception", "Clearance", "Aerial", "Pressure",
               "BallRecovery", "Foul", "Card", "Substitution", "Offside", "Corner", "PeriodStart", "PeriodEnd"}
    assert tilted <= allowed and base <= allowed


def test_star_night_lifts_one_players_form_only(clubs):
    m = engine.Match(clubs["SKH"], clubs["AMH"], match_id="SYN-0070", seed=70, kickoff_utc="2026-10-24T19:00:00Z",
                     storylines=("star_night",))
    m.director.update(m)
    nine = next(b for b in m.on_pitch("home") if b.player.shirt == 9)
    others = [b for b in m.on_pitch("home") if b is not nine]
    assert nine.bonus.get("finishing") == 5
    assert all(b.bonus.get("finishing", 0) == 0 for b in others)


def test_comeback_waits_for_a_side_to_trail(clubs):
    m = engine.Match(clubs["SKH"], clubs["AMH"], match_id="SYN-0071", seed=71, kickoff_utc="2026-10-24T19:00:00Z",
                     storylines=("comeback",))
    m.period, m.period_ms, m.offset_ms = 2, 20 * 60_000, 46 * 60_000      # about 66'
    m.director.update(m)
    assert m.director.running[0].onset_ms is None                          # level: nobody is trailing
    m.score["home"] = 1
    m.director.update(m)
    assert m.director.running[0].side == "away"


# --- answer keys (§4) ---------------------------------------------------------------------------------------------


def test_answer_keys_are_in_the_summary(clubs):
    r = play(clubs, 3, ("late_pressure_surge",))
    key = r.summary["storylines"][0]
    assert set(key) >= {"name", "team_id", "onset_ms", "full_ms", "end_ms", "signals", "measured",
                        "detect_within_min"}
    assert key["full_ms"] == key["onset_ms"] + 5 * 60_000
    assert set(key["measured"]) == set(key["signals"])
    assert {"before", "after"} <= set(key["measured"]["pressures_per_5min_up"])
    assert r.setup["storylines"] == ["late_pressure_surge"]
