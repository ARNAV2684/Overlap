# test_world.py — World tests
#
# Purpose: check squads, attribute ranges, unique names, readable kits, same seed same world, and the match setup
# Inputs:  the reference clubs; small broken copies of them
# Outputs: pass / fail
# Spec:    generator/specs/world.md

from __future__ import annotations

import copy
import re

import pytest
import yaml

import kits
import names
import world

DATA = yaml.safe_load(world.REFERENCE_FILE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def clubs() -> dict[str, world.Club]:
    _, loaded = world.load_reference_clubs()
    return {c.team_id: c for c in loaded}


def broken(change) -> dict:
    """A copy of the reference data with one thing changed by `change(data)`."""
    data = copy.deepcopy(DATA)
    change(data)
    return data


def setup(clubs, home="SKH", away="AMH", **kw):
    return world.build_setup(clubs[home], clubs[away], match_id="SYN-0001", seed=1,
                             kickoff_utc="2026-10-24T19:00:00Z", **kw)


# --- The reference world -----------------------------------------------------------------------------------------


def test_reference_world_loads(clubs):
    assert set(clubs) == {"SKH", "AMH"}
    assert clubs["SKH"].formation == "4-2-3-1"
    assert clubs["AMH"].formation == "5-4-1"


def test_same_seed_gives_byte_identical_world(tmp_path):
    a = world.save_world(world.build_world("S1", seed=1), tmp_path / "a")
    b = world.save_world(world.build_world("S1", seed=1), tmp_path / "b")
    assert a.read_bytes() == b.read_bytes()


def test_ratings_style_and_ids(clubs):
    for club in clubs.values():
        assert re.fullmatch(r"[A-Z]{3}", club.team_id)
        assert all(0 <= v <= 1 for v in club.style.values())
        for p in club.squad:
            assert re.fullmatch(r"[A-Z]{3}-\d{2}", club.player_id(p))
            assert set(p.attr) == set(world.ATTRIBUTES)
            assert all(isinstance(v, int) and 1 <= v <= 99 for v in p.attr.values())


def test_squad_shape(clubs):
    for club in clubs.values():
        assert 22 <= len(club.squad) <= 28
        assert sum(p.pos == "GK" for p in club.squad) >= 2
        assert len({p.shirt for p in club.squad}) == len(club.squad)
        lineup = world.pick_lineup(club)
        assert [slot for slot, _ in lineup] == list(world.FORMATIONS[club.formation])
        assert lineup[0][1].pos == "GK"


def test_every_slot_has_cover(clubs):
    # Losing any one starter still leaves someone who can play that slot
    for club in clubs.values():
        for slot in set(world.FORMATIONS[club.formation]):
            able = [p.name for p in club.squad if p.plays(slot)]
            assert len(able) >= 2, f"{club.team_id}: only {able} can play {slot}"


def test_names_unique(clubs):
    everyone = [(c.team_id, p.name) for c in clubs.values() for p in c.squad]
    assert names.duplicate_problems(everyone) == []


def test_kits_readable_and_distinct(clubs):
    for club in clubs.values():
        for kit in ("home", "away"):
            assert kits.pair_problems(club.team_id, kit, club.colours[kit]) == []
    assert kits.league_clash_problems({c.team_id: c.colours for c in clubs.values()}) == []


def test_strength_gap(clubs):
    # A is an elite side and B a newly promoted one (world.md §1, §4)
    assert clubs["SKH"].strength > clubs["AMH"].strength + 8


def test_reference_names_not_recognisable(clubs):
    private_map = names.load_private_map()
    if private_map is None:
        pytest.skip("private reference mapping not on this machine")
    players = [(c.team_id, p.shirt, p.name) for c in clubs.values() for p in c.squad]
    assert names.reference_name_problems(players, private_map) == []


# --- Match setup (CONTRACTS.md §2) -------------------------------------------------------------------------------


def test_setup_matches_contract_shape(clubs):
    s = setup(clubs)
    assert set(s) == {"match_id", "seed", "competition", "season_id", "venue", "kickoff_utc", "storylines", "teams"}
    assert s["venue"] == clubs["SKH"].venue
    ids = set()
    for side in ("home", "away"):
        t = s["teams"][side]
        assert set(t) == {"team_id", "name", "colours", "formation", "style", "lineup", "bench"}
        assert set(t["style"]) == {"press_intensity", "directness", "width"}
        assert len(t["lineup"]) == 11 and t["lineup"][0]["pos"] == "GK"
        assert len(t["bench"]) == world.BENCH_SIZE
        assert sum(p["pos"] == "GK" for p in t["bench"]) == 1
        for p in t["lineup"] + t["bench"]:
            assert set(p) == {"player_id", "name", "pos", "shirt", "attr"}
            assert set(p["attr"]) == set(world.SETUP_ATTRIBUTES)
            assert p["player_id"] == f"{t['team_id']}-{p['shirt']:02d}"
            assert p["player_id"] not in ids
            ids.add(p["player_id"])


def test_unavailable_player_is_replaced(clubs):
    striker = clubs["SKH"].default_xi[-1]
    s = setup(clubs, unavailable={"SKH": frozenset({striker})})
    lineup = s["teams"]["home"]["lineup"]
    assert all(p["shirt"] != striker for p in lineup + s["teams"]["home"]["bench"])
    assert lineup[-1]["pos"] == "ST"


def test_away_club_changes_kit_on_a_clash(clubs):
    lookalike = copy.deepcopy(DATA["clubs"][1])
    lookalike["colours"]["home"] = {"primary": "#78B6E0", "secondary": "#14234B"}  # close to SKH's light blue
    _, (_, away) = world.clubs_from_data({"world_version": 1, "clubs": [DATA["clubs"][0], lookalike]})
    s = world.build_setup(clubs["SKH"], away, match_id="SYN-0002", seed=2, kickoff_utc="2026-10-24T19:00:00Z")
    assert s["teams"]["away"]["colours"] == lookalike["colours"]["away"]


def test_bad_match_id_rejected(clubs):
    with pytest.raises(world.WorldError):
        world.build_setup(clubs["SKH"], clubs["AMH"], match_id="MATCH-1", seed=1, kickoff_utc="2026-10-24T19:00:00Z")


# --- Broken reference data fails loudly ---------------------------------------------------------------------------


def _set_rating(d):
    d["clubs"][0]["squad"][0]["attr"][0] = 120


def _duplicate_shirt(d):
    d["clubs"][0]["squad"][1]["shirt"] = d["clubs"][0]["squad"][0]["shirt"]


def _unreadable_kit(d):
    d["clubs"][0]["colours"]["home"] = {"primary": "#74B4E3", "secondary": "#FFFFFF"}


def _xi_wrong_position(d):
    xi = d["clubs"][0]["default_xi"]
    xi[0], xi[-1] = xi[-1], xi[0]  # the striker in goal


def _duplicate_name(d):
    d["clubs"][1]["squad"][0]["name"] = d["clubs"][0]["squad"][0]["name"]


def _mock_team_id(d):
    d["clubs"][0]["team_id"] = "NBR"


def _unknown_field(d):
    d["clubs"][0]["squad"][0]["speed"] = 90


def _style_out_of_range(d):
    d["clubs"][0]["style"]["width"] = 1.4


@pytest.mark.parametrize("change, expected", [
    (_set_rating, "ratings must be whole numbers 1–99"),
    (_duplicate_shirt, "used more than once"),
    (_unreadable_kit, "contrast"),
    (_xi_wrong_position, "can't play GK"),
    (_duplicate_name, "name used 2 times"),
    (_mock_team_id, "reserved for the mock"),
    (_unknown_field, "unknown fields"),
    (_style_out_of_range, "style values must be 0–1"),
])
def test_broken_reference_data_fails(change, expected):
    with pytest.raises(world.WorldError, match=expected):
        world.clubs_from_data(broken(change))


# --- Colour maths ------------------------------------------------------------------------------------------------


def test_delta_e2000_reference_value():
    # First test pair from Sharma, Wu and Dalal (2005)
    assert kits.delta_e2000((50, 2.6772, -79.7751), (50, 0, -82.7485)) == pytest.approx(2.0425, abs=1e-4)


def test_contrast_ratio_extremes():
    assert kits.contrast_ratio("#000000", "#FFFFFF") == pytest.approx(21.0)
    assert kits.contrast_ratio("#74B4E3", "#FFFFFF") < kits.MIN_PAIR_CONTRAST
