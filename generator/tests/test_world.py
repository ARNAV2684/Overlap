# test_world.py — World tests
#
# Purpose: check squads, attribute ranges, unique names, readable kits, same seed same world, and the match setup
# Inputs:  the reference clubs; small broken copies of them
# Outputs: pass / fail
# Spec:    generator/specs/world.md

from __future__ import annotations

import copy
import random
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


def setup(clubs, home="CAL", away="DTN", **kw):
    return world.build_setup(clubs[home], clubs[away], match_id="SYN-0001", seed=1,
                             kickoff_utc="2026-10-24T19:00:00Z", **kw)


# --- The reference world -----------------------------------------------------------------------------------------


def test_reference_world_loads(clubs):
    assert set(clubs) == {"CAL", "DTN"}
    assert clubs["CAL"].formation == "4-2-3-1"
    assert clubs["DTN"].formation == "5-4-1"


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


def test_style_has_all_ten_traits(clubs):
    for club in clubs.values():
        assert set(club.style) == set(world.STYLE_KEYS) and len(world.STYLE_KEYS) == 10


def test_reference_clubs_contrast_on_new_traits(clubs):
    # world.md §4: the two clubs differ by 0.3 or more on each pressing, transition and set-piece trait
    for key in ("counter_press", "press_height", "counter_attack", "set_piece_focus"):
        assert abs(clubs["CAL"].style[key] - clubs["DTN"].style[key]) >= 0.3, key


def test_every_player_has_an_allowed_role(clubs):
    for club in clubs.values():
        for p in club.squad:
            assert p.pos in world.ROLES[p.role], f"{club.team_id} {p.name}: {p.role} for {p.pos}"


def test_set_piece_takers_saved_as_player_ids():
    saved = world.build_world()
    for club in saved["clubs"]:
        ids = {p["player_id"] for p in club["squad"]}
        assert set(club["set_pieces"]) == set(world.SET_PIECE_KINDS)
        for takers in club["set_pieces"].values():
            assert len(takers) >= world.MIN_TAKERS and set(takers) <= ids


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
    assert clubs["CAL"].strength > clubs["DTN"].strength + 8


def test_reference_names_not_recognisable(clubs):
    private_map = names.load_private_map()
    if private_map is None:
        pytest.skip("private reference mapping not on this machine")
    players = [(c.team_id, p.shirt, p.name) for c in clubs.values() for p in c.squad]
    assert names.reference_name_problems(players, private_map) == []


# --- Shirts, names and feet follow the same rules as generated clubs (world.md §2, §3, §5) -------------------------


def test_shirts_follow_the_usual_numbers():
    assert world.assign_shirts(["GK", "RB", "CB", "CB", "LB", "DM", "DM", "RW", "AM", "LW", "ST", "GK", "CB"]) == \
        [1, 2, 4, 5, 3, 6, 8, 7, 10, 11, 9, 12, 13]


def test_reference_shirts_follow_the_rule(clubs):
    for club in clubs.values():
        by_shirt = {p.shirt: p for p in club.squad}
        xi = [by_shirt[s].pos for s in club.default_xi]
        assert list(club.default_xi) == world.assign_shirts(xi)
        for p in club.squad:
            if p.shirt not in club.default_xi:
                assert p.shirt >= world.FIRST_SPARE_SHIRT or p.shirt in world.USUAL_SHIRTS[p.pos]


def test_reference_names_come_from_the_pools(clubs):
    for club in clubs.values():
        for p in club.squad:
            first, last = p.name.split(" ", 1)
            assert any(first in f and last in s for f, s in names.REGIONS.values()), p.name


def test_the_foot_split_matches_calibration():
    rng = random.Random(7)
    squad = [("GK", "shot_stopper")] * 3 + [("CB", "stopper")] * 5 + [("LB", "wing_back"), ("RB", "wing_back")] * 2 \
        + [("DM", "anchor"), ("CM", "box_to_box"), ("CM", "playmaker"), ("AM", "playmaker")] * 2 \
        + [("LM", "wide_midfielder"), ("RM", "wide_midfielder"), ("LW", "inverted_winger"),
           ("RW", "inverted_winger"), ("ST", "poacher"), ("ST", "target_man"), ("ST", "pressing_forward")]
    feet = [world.draw_feet(rng, pos, role)[0] for _ in range(400) for pos, role in squad]
    assert 0.20 <= feet.count("left") / len(feet) <= 0.27          # CALIBRATION.md, "Players"
    assert feet.count("both") / len(feet) < 0.05
    right_inverted = [world.draw_feet(rng, "RW", "inverted_winger")[0] for _ in range(2000)]
    assert right_inverted.count("left") / len(right_inverted) > 0.75


# --- League clubs: templates with generated players (world.md §1-§5) ---------------------------------------------

TEMPLATES = yaml.safe_load(world.LEAGUE_FILE.read_text(encoding="utf-8"))["clubs"]


@pytest.fixture(scope="module")
def league() -> dict[str, world.Club]:
    _, loaded = world.load_league(seed=1)
    return {c.team_id: c for c in loaded}


def test_the_league_has_ten_clubs(league):
    assert len(league) == 10
    assert [c.team_id for c in league.values() if c.reference] == ["CAL", "DTN"]
    assert world.build_world("S1", seed=1)["clubs"][0]["team_id"] in league


def test_league_clubs_follow_their_templates(league):
    for t in TEMPLATES:
        club = league[t["team_id"]]
        assert club.name == t["name"] and club.formation == t["formation"] and club.style == t["style"]
        counts = {pos: sum(p.pos == pos for p in club.squad) for pos in t["shape"]}
        assert counts == t["shape"] and len(club.squad) == world.LEAGUE_SQUAD_SIZE
        for p in club.squad:
            if p.pos in t.get("roles", {}):
                assert p.role in t["roles"][p.pos]


def test_league_strength_lands_on_the_level(league):
    for t in TEMPLATES:
        assert abs(league[t["team_id"]].strength - t["level"]) <= 1


def test_league_players_follow_the_shared_rules(league):
    generated = [c for c in league.values() if not c.reference]
    for club in generated:
        by_shirt = {p.shirt: p for p in club.squad}
        assert list(club.default_xi) == world.assign_shirts([by_shirt[s].pos for s in club.default_xi])
        for p in club.squad:
            first, last = p.name.split(" ", 1)
            assert any(first in f and last in s for f, s in names.REGIONS.values()), p.name
            assert p.pos == "GK" or 5 <= p.attr["goalkeeping"] <= 15
    feet = [p.preferred_foot for c in generated for p in c.squad]
    assert 0.20 <= feet.count("left") / len(feet) <= 0.27


def test_a_different_seed_gives_different_players_in_the_same_shape():
    _, a = world.load_league(seed=1)
    _, b = world.load_league(seed=2)
    a, b = {c.team_id: c for c in a}, {c.team_id: c for c in b}
    assert [p.name for p in a["KES"].squad] != [p.name for p in b["KES"].squad]
    assert a["CAL"] == b["CAL"]                                     # the reference clubs never change with the seed
    assert sorted(p.pos for p in a["KES"].squad) == sorted(p.pos for p in b["KES"].squad)


@pytest.mark.parametrize("change, expected", [
    (lambda t: t["shape"].update(GK=2, CB=5), "3 goalkeepers"),
    (lambda t: t["shape"].update(ST=6, CM=1), "at least 2 CM"),
    (lambda t: t.update(level=90), "level must be"),
    (lambda t: t["roles"].update(ST=["anchor"]), "not allowed for ST"),
])
def test_broken_templates_fail(change, expected):
    t = copy.deepcopy(TEMPLATES[0])
    change(t)
    with pytest.raises(world.WorldError, match=expected):
        world.generate_club(t, 1, set())


def test_league_setup_matches_contract_shape(league):
    s = setup(league, home="KES", away="WEX")
    assert s["teams"]["home"]["team_id"] == "KES" and len(s["teams"]["away"]["lineup"]) == 11


def test_league_clubs_not_recognisable():
    private_map = names.load_private_map()
    if private_map is None or "templates" not in private_map:
        pytest.skip("private reference mapping not on this machine")
    for t in TEMPLATES:
        real = private_map["templates"][t["team_id"]]
        assert t["team_id"] != real["code"]
        for invented in (t["name"], t["short_name"], t["city"]):
            assert names.edit_distance(invented, real["team"]) >= names.MIN_EDIT_DISTANCE


# --- Match setup (CONTRACTS.md §2) -------------------------------------------------------------------------------


def test_setup_matches_contract_shape(clubs):
    s = setup(clubs)
    assert set(s) == {"match_id", "seed", "competition", "season_id", "venue", "kickoff_utc", "storylines", "teams"}
    assert s["venue"] == clubs["CAL"].venue
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
    striker = clubs["CAL"].default_xi[-1]
    s = setup(clubs, unavailable={"CAL": frozenset({striker})})
    lineup = s["teams"]["home"]["lineup"]
    assert all(p["shirt"] != striker for p in lineup + s["teams"]["home"]["bench"])
    assert lineup[-1]["pos"] == "ST"


def test_a_missing_line_is_filled_out_of_position(league):
    club = league["HLW"]                                     # 5-3-2: three central midfield slots
    cms = frozenset(p.shirt for p in club.squad if p.plays("CM"))
    lineup = world.pick_lineup(club, unavailable=cms)
    assert len(lineup) == 11 and all(p.shirt not in cms for _, p in lineup)
    assert [slot for slot, _ in lineup] == list(world.FORMATIONS[club.formation])


def test_away_club_changes_kit_on_a_clash(clubs):
    lookalike = copy.deepcopy(DATA["clubs"][1])
    lookalike["colours"]["home"] = {"primary": "#127F7D", "secondary": "#F4F4F4"}  # close to CAL's teal
    _, (_, away) = world.clubs_from_data({"world_version": 1, "clubs": [DATA["clubs"][0], lookalike]})
    s = world.build_setup(clubs["CAL"], away, match_id="SYN-0002", seed=2, kickoff_utc="2026-10-24T19:00:00Z")
    assert s["teams"]["away"]["colours"] == lookalike["colours"]["away"]


def test_bad_match_id_rejected(clubs):
    with pytest.raises(world.WorldError):
        world.build_setup(clubs["CAL"], clubs["DTN"], match_id="MATCH-1", seed=1, kickoff_utc="2026-10-24T19:00:00Z")


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


def _unknown_field(d):
    d["clubs"][0]["squad"][0]["speed"] = 90


def _style_out_of_range(d):
    d["clubs"][0]["style"]["width"] = 1.4


def _outfield_goalkeeping(d):
    d["clubs"][0]["squad"][1]["attr"][-1] = 30  # a centre-back who can keep goal


def _no_striker_cover(d):
    for p in d["clubs"][0]["squad"]:
        p["other"] = [o for o in p.get("other", []) if o != "ST"]


def _bad_foot(d):
    d["clubs"][0]["squad"][0]["preferred_foot"] = "left-ish"


def _unknown_role(d):
    d["clubs"][0]["squad"][0]["role"] = "libero"


def _role_wrong_position(d):
    d["clubs"][0]["squad"][0]["role"] = "poacher"  # a goalkeeper as a poacher


def _missing_role(d):
    del d["clubs"][0]["squad"][0]["role"]


def _missing_style_trait(d):
    del d["clubs"][0]["style"]["counter_press"]


def _one_penalty_taker(d):
    d["clubs"][0]["set_pieces"]["penalties"] = [9]


def _taker_not_in_squad(d):
    d["clubs"][0]["set_pieces"]["free_kicks"] = [10, 99]


def _goalkeeper_takes_corners(d):
    d["clubs"][0]["set_pieces"]["corners"] = [1, 10]


def _missing_set_piece_kind(d):
    del d["clubs"][0]["set_pieces"]["corners"]


@pytest.mark.parametrize("change, expected", [
    (_set_rating, "ratings must be whole numbers 1–99"),
    (_duplicate_shirt, "used more than once"),
    (_unreadable_kit, "contrast"),
    (_xi_wrong_position, "can't play GK"),
    (_duplicate_name, "name used 2 times"),
    (_unknown_field, "unknown fields"),
    (_style_out_of_range, "style values must be 0–1"),
    (_outfield_goalkeeping, "goalkeeping must be 20 or less"),
    (_no_striker_cover, "can play ST"),
    (_bad_foot, "preferred_foot must be one of"),
    (_unknown_role, "unknown role"),
    (_role_wrong_position, "role poacher is not allowed for GK"),
    (_missing_role, "missing fields"),
    (_missing_style_trait, "style needs exactly"),
    (_one_penalty_taker, "penalties needs at least 2 different takers"),
    (_taker_not_in_squad, "free_kicks taker 99 is not in the squad"),
    (_goalkeeper_takes_corners, "can't take corners"),
    (_missing_set_piece_kind, "set_pieces needs exactly"),
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
