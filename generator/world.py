# world.py — World builder
#
# Purpose: load and check the clubs, squads, attributes and team styles for a season; save the world; build match
#          setups from it
# Inputs:  reference_clubs.yaml, league_clubs.yaml, season id and seed
# Outputs: data/generated/world/<season_id>.json; match setups (CONTRACTS.md §2)
# Spec:    generator/specs/world.md
#
# The two reference clubs are hand-authored. The 8 league clubs are templates whose players are generated from the
# seed. Shirt numbers and feet follow the same rules for every club (world.md §2, §3).

from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

import kits
import names

REFERENCE_FILE = Path(__file__).with_name("reference_clubs.yaml")
LEAGUE_FILE = Path(__file__).with_name("league_clubs.yaml")
WORLD_DIR = Path(__file__).resolve().parents[1] / "data" / "generated" / "world"

ATTRIBUTES = ("pace", "passing", "dribbling", "finishing", "tackling", "stamina",
              "acceleration", "vision", "positioning", "aerial", "composure", "goalkeeping")
SETUP_ATTRIBUTES = ATTRIBUTES[:6]  # the six the match setup sends (CONTRACTS.md §2)
STYLE_KEYS = ("press_intensity", "directness", "width", "tempo", "line_height", "build_up_short",
              "counter_press", "press_height", "counter_attack", "set_piece_focus")
SETUP_STYLE_KEYS = STYLE_KEYS[:3]
POSITIONS = ("GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST")
FEET = ("left", "right", "both")
# Preferred foot and weak-foot quality (world.md §3). Across a squad about a quarter are left-footed and very few are
# truly two-footed (CALIBRATION.md, "Players"). The chance of a left foot follows the side a player plays on; the
# per-position chances and the weak-foot spread are judgement calls. Two-footed players get weak foot 5.
BOTH_FEET = 0.03
LEFT_SIDE = frozenset({"LB", "LWB", "LM", "LW"})
RIGHT_SIDE = frozenset({"RB", "RWB", "RM", "RW"})
WEAK_FOOT_SHARE = ((1, 0.05), (2, 0.25), (3, 0.45), (4, 0.20), (5, 0.05))

# Usual shirt numbers per position, tried in order (world.md §2); after them, the next free number from 12 up.
USUAL_SHIRTS: dict[str, tuple[int, ...]] = {
    "GK": (1,), "RB": (2,), "RWB": (2,), "LB": (3,), "LWB": (3,), "CB": (4, 5, 6), "DM": (6, 4, 8),
    "CM": (8, 6, 10), "AM": (10, 8), "RM": (7,), "RW": (7,), "LM": (11,), "LW": (11,), "ST": (9, 10),
}
FIRST_SPARE_SHIRT = 12

# What each player does, and the primary positions it is allowed for (world.md §3). The engine spec decides effects.
ROLES: dict[str, tuple[str, ...]] = {
    "sweeper_keeper": ("GK",),
    "shot_stopper": ("GK",),
    "ball_playing_cb": ("CB",),
    "stopper": ("CB",),
    "overlapping_fullback": ("LB", "RB"),
    "inverted_fullback": ("LB", "RB"),
    "wing_back": ("LWB", "RWB", "LB", "RB"),
    "anchor": ("DM",),
    "deep_playmaker": ("DM", "CM"),
    "ball_winner": ("DM", "CM"),
    "box_to_box": ("CM", "DM"),
    "playmaker": ("CM", "AM"),
    "inverted_winger": ("LW", "RW", "LM", "RM"),
    "wide_winger": ("LW", "RW", "LM", "RM"),
    "wide_midfielder": ("LM", "RM"),
    "poacher": ("ST",),
    "target_man": ("ST",),
    "pressing_forward": ("ST",),
}
SET_PIECE_KINDS = ("penalties", "corners", "free_kicks")
MIN_TAKERS = 2

# Slot order per formation, goalkeeper first (world.md §4). Anchor positions belong to movement.md.
FORMATIONS: dict[str, tuple[str, ...]] = {
    "4-3-3": ("GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "RW", "ST", "LW"),
    "4-2-3-1": ("GK", "RB", "CB", "CB", "LB", "DM", "DM", "RW", "AM", "LW", "ST"),
    "4-4-2": ("GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"),
    "4-1-4-1": ("GK", "RB", "CB", "CB", "LB", "DM", "RM", "CM", "CM", "LM", "ST"),
    "3-4-3": ("GK", "CB", "CB", "CB", "RWB", "CM", "CM", "LWB", "RW", "ST", "LW"),
    "5-3-2": ("GK", "RWB", "CB", "CB", "CB", "LWB", "CM", "CM", "CM", "ST", "ST"),
    "5-4-1": ("GK", "RWB", "CB", "CB", "CB", "LWB", "RM", "CM", "CM", "LM", "ST"),
}

# The attributes a player's `overall` averages, by primary position (world.md §3).
_FULL_BACK = ("pace", "stamina", "tackling", "passing")
_WIDE = ("pace", "acceleration", "dribbling", "passing")
MAIN_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "GK": ("goalkeeping", "positioning", "composure", "passing"),
    "CB": ("tackling", "aerial", "positioning", "composure"),
    "LB": _FULL_BACK, "RB": _FULL_BACK, "LWB": _FULL_BACK, "RWB": _FULL_BACK,
    "DM": ("tackling", "positioning", "passing", "stamina"),
    "CM": ("passing", "vision", "stamina", "composure"),
    "AM": ("vision", "passing", "dribbling", "finishing"),
    "LM": _WIDE, "RM": _WIDE, "LW": _WIDE, "RW": _WIDE,
    "ST": ("finishing", "positioning", "composure", "pace"),
}

def _weighted(rng: random.Random, share: tuple) -> object:
    x, total = rng.random(), 0.0
    for value, p in share:
        total += p
        if x < total:
            return value
    return share[-1][0]


def left_foot_chance(pos: str, role: str) -> float:
    """An inverted winger plays on the side of his weaker foot; other wide players on the side of their stronger."""
    if role == "inverted_winger":
        return 0.85 if pos in RIGHT_SIDE else 0.10
    if pos in LEFT_SIDE:
        return 0.70
    if pos in RIGHT_SIDE:
        return 0.05
    return 0.25 if pos == "CB" else 0.15


def draw_feet(rng: random.Random, pos: str, role: str) -> tuple[str, int]:
    """(preferred_foot, weak_foot) for a player in this position and role (world.md §3)."""
    if rng.random() < BOTH_FEET:
        return "both", 5
    foot = "left" if rng.random() < left_foot_chance(pos, role) else "right"
    return foot, _weighted(rng, WEAK_FOOT_SHARE)


def assign_shirts(positions: list[str]) -> list[int]:
    """Shirt numbers for players in priority order (the default XI in slot order first, then the rest of the squad),
    given each player's primary position: the first free usual number, else the next free number from 12 up."""
    taken: set[int] = set()
    out = []
    for pos in positions:
        shirt = next((n for n in USUAL_SHIRTS[pos] if n not in taken), None)
        if shirt is None:
            shirt = FIRST_SPARE_SHIRT
            while shirt in taken:
                shirt += 1
        taken.add(shirt)
        out.append(shirt)
    return out


# Bench picks, in order: the best remaining player whose primary position is in each group (world.md §2).
BENCH_GROUPS = (("GK",), ("CB",), ("RB", "LB", "RWB", "LWB"), ("DM", "CM"), ("CM", "AM"),
                ("LW", "RW", "LM", "RM"), ("ST",))
BENCH_SIZE = 9
REFERENCE_SQUAD_SIZE = (22, 28)
MIN_GOALKEEPERS = 2
MIN_SLOT_COVER = 2  # players able to play each slot of the club's formation
MAX_OUTFIELD_GOALKEEPING = 20

TEAM_ID = re.compile(r"^[A-Z]{3}$")
MATCH_ID = re.compile(r"^SYN-\d{4}$")
SEASON_ID = re.compile(r"^S\d+$")

CLUB_FIELDS = {"team_id", "name", "short_name", "city", "venue", "colours", "formation", "style", "default_xi",
               "set_pieces", "squad"}
PLAYER_FIELDS = {"shirt", "name", "pos", "role", "other", "preferred_foot", "weak_foot", "attr"}
PLAYER_REQUIRED = {"shirt", "name", "pos", "role", "attr"}


class WorldError(ValueError):
    """The world failed its checks. The message lists every problem, naming the club and player."""


@dataclass(frozen=True)
class Player:
    shirt: int
    name: str
    pos: str
    role: str
    other: tuple[str, ...]
    preferred_foot: str
    weak_foot: int
    attr: dict[str, int]

    def plays(self, position: str) -> bool:
        return position == self.pos or position in self.other

    @property
    def overall(self) -> float:
        keys = MAIN_ATTRIBUTES[self.pos]
        return sum(self.attr[k] for k in keys) / len(keys)


@dataclass(frozen=True)
class Club:
    team_id: str
    name: str
    short_name: str
    city: str
    venue: dict
    colours: dict
    formation: str
    style: dict
    default_xi: tuple[int, ...]
    set_pieces: dict[str, tuple[int, ...]]
    squad: tuple[Player, ...]
    reference: bool

    def player(self, shirt: int) -> Player:
        return next(p for p in self.squad if p.shirt == shirt)

    def player_id(self, player: Player) -> str:
        return f"{self.team_id}-{player.shirt:02d}"

    @property
    def strength(self) -> float:
        """Mean overall of the default XI (world.md §4)."""
        return sum(self.player(s).overall for s in self.default_xi) / len(self.default_xi)


# --- Loading and checking ---------------------------------------------------------------------------------------


def _player(team_id: str, raw: dict, problems: list[str]) -> Player | None:
    label = f"{team_id} player {raw.get('shirt', '?')} {raw.get('name', '?')}"
    if unknown := set(raw) - PLAYER_FIELDS:
        problems.append(f"{label}: unknown fields {sorted(unknown)}")
    if missing := PLAYER_REQUIRED - set(raw):
        problems.append(f"{label}: missing fields {sorted(missing)}")
        return None
    attr = raw["attr"]
    if not isinstance(attr, list) or len(attr) != len(ATTRIBUTES):
        problems.append(f"{label}: attr needs {len(ATTRIBUTES)} values in the order {', '.join(ATTRIBUTES)}")
        return None
    return Player(
        shirt=raw["shirt"],
        name=raw["name"],
        pos=raw["pos"],
        role=raw["role"],
        other=tuple(raw.get("other", ())),
        preferred_foot=raw.get("preferred_foot", "right"),
        weak_foot=raw.get("weak_foot", 3),
        attr=dict(zip(ATTRIBUTES, attr)),
    )


def _club(raw: dict, problems: list[str], reference: bool = True) -> Club | None:
    team_id = raw.get("team_id", "?")
    if unknown := set(raw) - CLUB_FIELDS:
        problems.append(f"{team_id}: unknown fields {sorted(unknown)}")
    if missing := CLUB_FIELDS - set(raw):
        problems.append(f"{team_id}: missing fields {sorted(missing)}")
        return None
    squad = [p for p in (_player(team_id, r, problems) for r in raw["squad"]) if p is not None]
    return Club(
        team_id=team_id,
        name=raw["name"],
        short_name=raw["short_name"],
        city=raw["city"],
        venue=dict(raw["venue"]),
        colours={kit: dict(pair) for kit, pair in raw["colours"].items()},
        formation=raw["formation"],
        style=dict(raw["style"]),
        default_xi=tuple(raw["default_xi"]),
        set_pieces={kind: tuple(shirts) for kind, shirts in raw["set_pieces"].items()},
        squad=tuple(squad),
        reference=reference,
    )


def _rating_ok(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 99


def _player_problems(club: Club, p: Player) -> list[str]:
    label = f"{club.team_id} {p.shirt} {p.name}"
    problems = []
    if not isinstance(p.shirt, int) or not 1 <= p.shirt <= 99:
        problems.append(f"{label}: shirt must be 1–99")
    if p.pos not in POSITIONS:
        problems.append(f"{label}: unknown position {p.pos!r}")
    if p.role not in ROLES:
        problems.append(f"{label}: unknown role {p.role!r}")
    elif p.pos not in ROLES[p.role]:
        problems.append(f"{label}: role {p.role} is not allowed for {p.pos}")
    if len(p.other) > 2 or any(o not in POSITIONS or o == p.pos for o in p.other):
        problems.append(f"{label}: other positions must be up to two valid positions, not the primary")
    if p.preferred_foot not in FEET:
        problems.append(f"{label}: preferred_foot must be one of {', '.join(FEET)}")
    if not isinstance(p.weak_foot, int) or not 1 <= p.weak_foot <= 5:
        problems.append(f"{label}: weak_foot must be 1–5")
    bad = [k for k, v in p.attr.items() if not _rating_ok(v)]
    if bad:
        problems.append(f"{label}: ratings must be whole numbers 1–99 ({', '.join(bad)})")
    elif p.pos != "GK" and p.attr["goalkeeping"] > MAX_OUTFIELD_GOALKEEPING:
        problems.append(f"{label}: an outfield player's goalkeeping must be {MAX_OUTFIELD_GOALKEEPING} or less")
    return problems


def _club_problems(club: Club) -> list[str]:
    tid = club.team_id
    problems = []
    if not isinstance(tid, str) or not TEAM_ID.match(tid):
        problems.append(f"{tid}: team_id must be 3 capital letters")
    if set(club.venue) != {"name", "city"}:
        problems.append(f"{tid}: venue needs exactly name and city")
    if club.formation not in FORMATIONS:
        problems.append(f"{tid}: unknown formation {club.formation!r}")
    if set(club.style) != set(STYLE_KEYS):
        problems.append(f"{tid}: style needs exactly {', '.join(STYLE_KEYS)}")
    elif any(not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in club.style.values()):
        problems.append(f"{tid}: style values must be 0–1")
    if set(club.colours) != {"home", "away"}:
        problems.append(f"{tid}: colours need exactly home and away")
    else:
        for kit in ("home", "away"):
            problems += kits.pair_problems(tid, kit, club.colours[kit])

    low, high = REFERENCE_SQUAD_SIZE
    if not low <= len(club.squad) <= high:
        problems.append(f"{tid}: squad has {len(club.squad)} players, needs {low}–{high}")
    if sum(p.pos == "GK" for p in club.squad) < MIN_GOALKEEPERS:
        problems.append(f"{tid}: squad needs at least {MIN_GOALKEEPERS} goalkeepers")
    shirts = [p.shirt for p in club.squad]
    for s in sorted({s for s in shirts if shirts.count(s) > 1}):
        problems.append(f"{tid}: shirt {s} used more than once")
    for p in club.squad:
        problems += _player_problems(club, p)

    problems += _set_piece_problems(club)

    slots = FORMATIONS.get(club.formation)
    xi = club.default_xi
    by_shirt = {p.shirt: p for p in club.squad}
    if len(xi) != 11 or len(set(xi)) != 11:
        problems.append(f"{tid}: default_xi needs 11 different shirts")
    elif slots:
        for slot, shirt in zip(slots, xi):
            p = by_shirt.get(shirt)
            if p is None:
                problems.append(f"{tid}: default_xi shirt {shirt} is not in the squad")
            elif not p.plays(slot):
                problems.append(f"{tid}: default_xi shirt {shirt} {p.name} can't play {slot}")
        for slot in sorted(set(slots)):
            able = sum(p.plays(slot) for p in club.squad)
            if able < MIN_SLOT_COVER:
                problems.append(f"{tid}: only {able} player(s) can play {slot}; needs {MIN_SLOT_COVER}")
    return problems


def _set_piece_problems(club: Club) -> list[str]:
    tid = club.team_id
    if set(club.set_pieces) != set(SET_PIECE_KINDS):
        return [f"{tid}: set_pieces needs exactly {', '.join(SET_PIECE_KINDS)}"]
    by_shirt = {p.shirt: p for p in club.squad}
    problems = []
    for kind in SET_PIECE_KINDS:
        takers = club.set_pieces[kind]
        if len(set(takers)) < MIN_TAKERS or len(set(takers)) != len(takers):
            problems.append(f"{tid}: {kind} needs at least {MIN_TAKERS} different takers")
        for shirt in takers:
            p = by_shirt.get(shirt)
            if p is None:
                problems.append(f"{tid}: {kind} taker {shirt} is not in the squad")
            elif kind == "corners" and p.pos == "GK":
                problems.append(f"{tid}: goalkeeper {shirt} {p.name} can't take corners")
    return problems


def validate_clubs(clubs: list[Club]) -> None:
    """Raise WorldError listing every problem; return quietly when the world is valid."""
    problems = []
    ids = [c.team_id for c in clubs]
    for tid in sorted({t for t in ids if ids.count(t) > 1}):
        problems.append(f"team_id {tid} used more than once")
    for club in clubs:
        problems += _club_problems(club)
    problems += names.duplicate_problems([(c.team_id, p.name) for c in clubs for p in c.squad])
    if (denylist := names.load_denylist()) is not None:
        problems += names.denylist_problems([(c.team_id, p.name) for c in clubs for p in c.squad], denylist)
    if all(set(c.colours) == {"home", "away"} for c in clubs) and not any("kit:" in m for m in problems):
        problems += kits.league_clash_problems({c.team_id: c.colours for c in clubs})
    if problems:
        raise WorldError("world check failed:\n  " + "\n  ".join(problems))


def _checked(raws: list[tuple[dict, bool]]) -> list[Club]:
    """Clubs from (raw club, is reference) pairs; raises WorldError when anything is wrong."""
    problems: list[str] = []
    clubs = [c for c in (_club(raw, problems, ref) for raw, ref in raws) if c is not None]
    if problems:
        raise WorldError("world check failed:\n  " + "\n  ".join(problems))
    validate_clubs(clubs)
    return clubs


def clubs_from_data(data: dict) -> tuple[int, list[Club]]:
    """(world_version, clubs) from parsed reference data; raises WorldError when anything is wrong."""
    return data["world_version"], _checked([(raw, True) for raw in data.get("clubs", [])])


def load_reference_clubs(path: Path = REFERENCE_FILE) -> tuple[int, list[Club]]:
    return clubs_from_data(yaml.safe_load(path.read_text(encoding="utf-8")))


# --- League clubs: templates with generated players (world.md §1-§5) ----------------------------------------------

TEMPLATE_FIELDS = (CLUB_FIELDS - {"default_xi", "set_pieces", "squad"}) | {"level", "shape", "roles"}
LEAGUE_SQUAD_SIZE = 25
LEAGUE_GOALKEEPERS = 3
LEVEL_RANGE = (68, 80)
ARCHETYPE_LEVEL = 70      # the level the archetype means below are set for
FIRST_CHOICE_EDGE = 2     # first-choice players are drawn this much above the level, the rest this much below
ATTRIBUTE_SD = 6
OUTFIELD_GOALKEEPING = (5, 15)
SECONDARY_COUNT = ((0, 0.3), (1, 0.5), (2, 0.2))

# Archetype means per primary position for a level-70 club, in ATTRIBUTES order: pace, passing, dribbling,
# finishing, tackling, stamina, acceleration, vision, positioning, aerial, composure, goalkeeping. Each position's
# four main attributes (MAIN_ATTRIBUTES) average 70.
_FULL_BACK_MEANS = (72, 68, 64, 45, 68, 72, 72, 60, 64, 58, 62, 10)
_WINGER_MEANS = (74, 62, 70, 62, 45, 70, 74, 62, 62, 50, 62, 10)
_WIDE_MID_MEANS = (73, 66, 68, 55, 55, 74, 73, 62, 62, 52, 62, 10)
ARCHETYPES: dict[str, tuple[int, ...]] = {
    "GK": (45, 64, 35, 12, 18, 55, 48, 55, 72, 66, 68, 76),
    "CB": (64, 62, 52, 35, 72, 70, 62, 52, 70, 72, 66, 10),
    "RB": _FULL_BACK_MEANS, "LB": _FULL_BACK_MEANS, "RWB": _FULL_BACK_MEANS, "LWB": _FULL_BACK_MEANS,
    "DM": (62, 70, 62, 50, 70, 70, 62, 66, 70, 64, 66, 10),
    "CM": (64, 72, 66, 58, 62, 70, 64, 70, 64, 58, 68, 10),
    "AM": (68, 70, 72, 66, 45, 66, 70, 72, 66, 50, 68, 10),
    "RM": _WIDE_MID_MEANS, "LM": _WIDE_MID_MEANS,
    "RW": _WINGER_MEANS, "LW": _WINGER_MEANS,
    "ST": (70, 60, 66, 72, 38, 68, 70, 58, 72, 68, 66, 10),
}

# Small shifts that give each role its shape (world.md §3).
ROLE_BONUS: dict[str, dict[str, int]] = {
    "sweeper_keeper": {"passing": 6, "pace": 5},
    "shot_stopper": {"goalkeeping": 2, "passing": -4},
    "ball_playing_cb": {"passing": 6, "composure": 3},
    "stopper": {"tackling": 3, "aerial": 3, "passing": -3},
    "overlapping_fullback": {"pace": 3, "stamina": 2},
    "inverted_fullback": {"passing": 4, "vision": 2},
    "wing_back": {"stamina": 4, "pace": 2},
    "anchor": {"positioning": 5, "tackling": 3, "pace": -3},
    "deep_playmaker": {"passing": 5, "vision": 3, "pace": -3},
    "ball_winner": {"tackling": 6, "stamina": 3, "vision": -3},
    "box_to_box": {"stamina": 6},
    "playmaker": {"vision": 5, "passing": 3, "tackling": -3},
    "inverted_winger": {"dribbling": 3, "finishing": 3},
    "wide_winger": {"pace": 3, "dribbling": 3, "finishing": -2},
    "wide_midfielder": {"stamina": 4},
    "poacher": {"finishing": 4, "positioning": 4, "passing": -3},
    "target_man": {"aerial": 8, "finishing": 2, "pace": -6},
    "pressing_forward": {"stamina": 5, "pace": 3, "tackling": 5},
}

# Secondary positions a player may also play, next to his primary (world.md §3).
NEAR_POSITIONS: dict[str, tuple[str, ...]] = {
    "GK": (), "CB": ("DM", "RB", "LB"), "RB": ("RWB", "RM", "CB"), "LB": ("LWB", "LM", "CB"), "RWB": ("RB", "RM"),
    "LWB": ("LB", "LM"), "DM": ("CM", "CB"), "CM": ("DM", "AM"), "AM": ("CM", "RW", "LW", "ST"), "RM": ("RW", "RB"),
    "LM": ("LW", "LB"), "RW": ("RM", "LW", "AM"), "LW": ("LM", "RW", "AM"), "ST": ("AM", "RW", "LW"),
}

# Squad order after the default XI: goalkeepers, defenders, midfielders, forwards (world.md §2).
POSITION_GROUP = {p: i for i, group in enumerate((("GK",), ("CB", "RB", "LB", "RWB", "LWB"),
                                                   ("DM", "CM", "AM", "RM", "LM"), ("RW", "LW", "ST")))
                  for p in group}

# Set-piece takers for league clubs: the two best default-XI outfield players by these attributes (world.md §2).
TAKER_ATTRIBUTES = {"penalties": ("finishing", "composure"), "corners": ("passing", "vision"),
                    "free_kicks": ("passing", "finishing")}


def _template_problems(t: dict) -> list[str]:
    tid = t.get("team_id", "?")
    problems = []
    if unknown := set(t) - TEMPLATE_FIELDS:
        problems.append(f"{tid}: unknown template fields {sorted(unknown)}")
    if missing := TEMPLATE_FIELDS - {"roles"} - set(t):
        problems.append(f"{tid}: missing template fields {sorted(missing)}")
        return problems
    low, high = LEVEL_RANGE
    if not low <= t["level"] <= high:
        problems.append(f"{tid}: level must be {low}–{high}")
    shape = t["shape"]
    if any(pos not in POSITIONS or not isinstance(n, int) or n < 1 for pos, n in shape.items()):
        problems.append(f"{tid}: shape needs known positions with a count of 1 or more")
        return problems
    if sum(shape.values()) != LEAGUE_SQUAD_SIZE or shape.get("GK") != LEAGUE_GOALKEEPERS:
        problems.append(f"{tid}: shape needs {LEAGUE_SQUAD_SIZE} players with {LEAGUE_GOALKEEPERS} goalkeepers")
    slots = FORMATIONS.get(t["formation"], ())
    for slot in sorted(set(slots)):
        need = max(MIN_SLOT_COVER, slots.count(slot))
        if shape.get(slot, 0) < need:
            problems.append(f"{tid}: shape needs at least {need} {slot}")
    for pos, roles in t.get("roles", {}).items():
        for role in roles:
            if role not in ROLES or pos not in ROLES[role]:
                problems.append(f"{tid}: role {role} is not allowed for {pos}")
    return problems


def _clip(v: float) -> int:
    return max(1, min(99, round(v)))


def _draw_player(rng: random.Random, pos: str, role: str, level: float) -> dict:
    bonus = ROLE_BONUS[role]
    attr = [_clip(rng.gauss(mean + bonus.get(a, 0) + level - ARCHETYPE_LEVEL, ATTRIBUTE_SD))
            for a, mean in zip(ATTRIBUTES, ARCHETYPES[pos])]
    if pos != "GK":
        attr[-1] = rng.randint(*OUTFIELD_GOALKEEPING)
    near = NEAR_POSITIONS[pos]
    other = rng.sample(near, min(_weighted(rng, SECONDARY_COUNT), len(near)))
    foot, weak = draw_feet(rng, pos, role)
    return {"pos": pos, "role": role, "other": other, "preferred_foot": foot, "weak_foot": weak, "attr": attr}


def _overall(p: dict) -> float:
    keys = MAIN_ATTRIBUTES[p["pos"]]
    return sum(p["attr"][ATTRIBUTES.index(k)] for k in keys) / len(keys)


def _pick_xi(players: list[dict], formation: str) -> list[int]:
    """Indexes into `players` for each slot: the best with that primary position, else that secondary position."""
    used: set[int] = set()
    xi = []
    for slot in FORMATIONS[formation]:
        free = [i for i in range(len(players)) if i not in used]
        for pool in ([i for i in free if players[i]["pos"] == slot], [i for i in free if slot in players[i]["other"]]):
            if pool:
                best = max(pool, key=lambda i: (_overall(players[i]), -i))
                used.add(best)
                xi.append(best)
                break
    return xi


def generate_club(t: dict, seed: int, taken_names: set[str]) -> dict:
    """A league club as raw club data (the same shape as reference_clubs.yaml) from its template and the seed.
    `taken_names` holds every folded full name already in the world and gains this club's."""
    if problems := _template_problems(t):
        raise WorldError("world check failed:\n  " + "\n  ".join(problems))
    rng = random.Random(f"{seed}:league:{t['team_id']}")
    slots = FORMATIONS[t["formation"]]
    players = []
    for pos in POSITIONS:
        roles = t.get("roles", {}).get(pos) or sorted(r for r, allowed in ROLES.items() if pos in allowed)
        for i in range(t["shape"].get(pos, 0)):
            edge = FIRST_CHOICE_EDGE if i < slots.count(pos) else -FIRST_CHOICE_EDGE
            players.append(_draw_player(rng, pos, roles[i % len(roles)], t["level"] + edge))

    xi = _pick_xi(players, t["formation"])
    shift = round(t["level"] - sum(_overall(players[i]) for i in xi) / len(xi))
    for p in players:            # the whole squad moves together, so the XI's strength lands on the level
        outfield = p["pos"] != "GK"
        p["attr"] = [v if outfield and a == "goalkeeping" else _clip(v + shift) for a, v in zip(ATTRIBUTES, p["attr"])]

    rest = sorted((i for i in range(len(players)) if i not in xi),
                  key=lambda i: (POSITION_GROUP[players[i]["pos"]], -_overall(players[i]), i))
    order = xi + rest
    shirts = assign_shirts([players[i]["pos"] for i in order])
    regions = names.squad_regions(rng, names.club_regions(rng), len(order))
    surnames: set[str] = set()
    squad = []
    for i, shirt, region in zip(order, shirts, regions):
        p = players[i]
        p["shirt"] = shirt
        p["name"] = names.draw_name(rng, region, taken_names, surnames)
        squad.append({k: p[k] for k in ("shirt", "name", "pos", "role", "other", "preferred_foot", "weak_foot",
                                        "attr")})

    shirt_of = dict(zip(order, shirts))
    outfield_xi = [i for i in xi if players[i]["pos"] != "GK"]
    takers = {}
    for kind, keys in TAKER_ATTRIBUTES.items():
        ranked = sorted(outfield_xi, key=lambda i: (-sum(players[i]["attr"][ATTRIBUTES.index(k)] for k in keys),
                                                    shirt_of[i]))
        takers[kind] = [shirt_of[i] for i in ranked[:MIN_TAKERS]]

    club = {k: t[k] for k in CLUB_FIELDS - {"default_xi", "set_pieces", "squad"}}
    club.update(default_xi=[shirt_of[i] for i in xi], set_pieces=takers, squad=squad)
    return club


def load_league(seed: int = 1, reference_path: Path = REFERENCE_FILE,
                league_path: Path = LEAGUE_FILE) -> tuple[int, list[Club]]:
    """(world_version, clubs): the reference clubs, then the league clubs generated from `seed`."""
    ref = yaml.safe_load(reference_path.read_text(encoding="utf-8"))
    league = yaml.safe_load(league_path.read_text(encoding="utf-8"))
    taken = {names.fold(p["name"]) for c in ref["clubs"] for p in c["squad"]}
    generated = [generate_club(t, seed, taken) for t in league["clubs"]]
    raws = [(raw, True) for raw in ref["clubs"]] + [(raw, False) for raw in generated]
    return ref["world_version"], _checked(raws)


# --- The saved world --------------------------------------------------------------------------------------------


def _club_record(club: Club) -> dict:
    return {
        "team_id": club.team_id,
        "name": club.name,
        "short_name": club.short_name,
        "city": club.city,
        "venue": club.venue,
        "colours": club.colours,
        "formation": club.formation,
        "style": club.style,
        "strength": round(club.strength, 1),
        "reference": club.reference,
        "default_xi": [club.player_id(club.player(s)) for s in club.default_xi],
        "set_pieces": {kind: [f"{club.team_id}-{s:02d}" for s in club.set_pieces[kind]] for kind in SET_PIECE_KINDS},
        "squad": [
            {
                "player_id": club.player_id(p),
                "shirt": p.shirt,
                "name": p.name,
                "pos": p.pos,
                "role": p.role,
                "other": list(p.other),
                "preferred_foot": p.preferred_foot,
                "weak_foot": p.weak_foot,
                "overall": round(p.overall, 1),
                "attr": p.attr,
            }
            for p in sorted(club.squad, key=lambda p: p.shirt)
        ],
    }


def build_world(season_id: str = "S1", seed: int = 1, path: Path = REFERENCE_FILE,
                league_path: Path = LEAGUE_FILE) -> dict:
    if not SEASON_ID.match(season_id):
        raise WorldError(f"season_id must look like S1, got {season_id!r}")
    world_version, clubs = load_league(seed, path, league_path)
    return {
        "world_version": world_version,
        "season_id": season_id,
        "seed": seed,
        "clubs": [_club_record(c) for c in sorted(clubs, key=lambda c: c.team_id)],
    }


def world_json(world: dict) -> str:
    """The exact text saved; the same world always gives the same bytes."""
    return json.dumps(world, ensure_ascii=False, indent=2) + "\n"


def save_world(world: dict, out_dir: Path = WORLD_DIR) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{world['season_id']}.json"
    out.write_bytes(world_json(world).encode("utf-8"))
    return out


# --- Lineups and match setups -----------------------------------------------------------------------------------


def _best(candidates: list[Player]) -> Player | None:
    return min(candidates, key=lambda p: (-p.overall, p.shirt), default=None)


def pick_lineup(club: Club, unavailable: frozenset[int] = frozenset()) -> list[tuple[str, Player]]:
    """(slot, player) × 11 in slot order, goalkeeper first. Unavailable players are replaced by the best available
    player who plays the slot; failing that, by the best available outfield player from the same line, then any
    outfield player, out of position (world.md §2)."""
    used: set[int] = set()
    lineup = []
    for slot, shirt in zip(FORMATIONS[club.formation], club.default_xi):
        if shirt not in unavailable and shirt not in used:
            p = club.player(shirt)
        else:
            free = [q for q in club.squad if q.shirt not in used | unavailable]
            p = (_best([q for q in free if q.plays(slot)])
                 or _best([q for q in free if q.pos != "GK" and POSITION_GROUP[q.pos] == POSITION_GROUP[slot]])
                 or (_best([q for q in free if q.pos != "GK"]) if slot != "GK" else None))
            if p is None:
                raise WorldError(f"{club.team_id}: no available player for {slot}")
        used.add(p.shirt)
        lineup.append((slot, p))
    return lineup


def pick_bench(club: Club, used: set[int], unavailable: frozenset[int] = frozenset()) -> list[Player]:
    """Nine players with exactly one goalkeeper: the best for each bench group, then the best remaining."""
    taken = set(used) | set(unavailable)
    bench: list[Player] = []
    for group in BENCH_GROUPS:
        p = _best([q for q in club.squad if q.pos in group and q.shirt not in taken])
        if p is not None:
            bench.append(p)
            taken.add(p.shirt)
    while len(bench) < BENCH_SIZE:
        p = _best([q for q in club.squad if q.pos != "GK" and q.shirt not in taken])
        if p is None:
            break
        bench.append(p)
        taken.add(p.shirt)
    return bench


def _setup_player(club: Club, p: Player, pos: str) -> dict:
    return {
        "player_id": club.player_id(p),
        "name": p.name,
        "pos": pos,
        "shirt": p.shirt,
        "attr": {k: p.attr[k] for k in SETUP_ATTRIBUTES},
    }


def _setup_team(club: Club, colours: dict, unavailable: frozenset[int]) -> dict:
    lineup = pick_lineup(club, unavailable)
    bench = pick_bench(club, {p.shirt for _, p in lineup}, unavailable)
    return {
        "team_id": club.team_id,
        "name": club.name,
        "colours": colours,
        "formation": club.formation,
        "style": {k: club.style[k] for k in SETUP_STYLE_KEYS},
        "lineup": [_setup_player(club, p, slot) for slot, p in lineup],
        "bench": [_setup_player(club, p, p.pos) for p in bench],
    }


def build_setup(home: Club, away: Club, *, match_id: str, seed: int, kickoff_utc: str, season_id: str = "S1",
                matchweek: int = 1, storylines: tuple[str, ...] = (),
                unavailable: dict[str, frozenset[int]] | None = None) -> dict:
    """The match setup message (CONTRACTS.md §2) for `home` against `away`."""
    if not MATCH_ID.match(match_id):
        raise WorldError(f"match_id must look like SYN-0042, got {match_id!r}")
    if home.team_id == away.team_id:
        raise WorldError("a club can't play itself")
    unavailable = unavailable or {}
    home_colours, away_colours = kits.choose_colours(home.colours, away.colours)
    return {
        "match_id": match_id,
        "seed": seed,
        "competition": f"Synthetic League · Season {season_id[1:]} · Matchweek {matchweek}",
        "season_id": season_id,
        "venue": dict(home.venue),
        "kickoff_utc": kickoff_utc,
        "storylines": list(storylines),
        "teams": {
            "home": _setup_team(home, home_colours, unavailable.get(home.team_id, frozenset())),
            "away": _setup_team(away, away_colours, unavailable.get(away.team_id, frozenset())),
        },
    }


if __name__ == "__main__":
    world = build_world()
    out = save_world(world)
    for c in world["clubs"]:
        print(f"{c['team_id']} {c['name']}: {len(c['squad'])} players, {c['formation']}, strength {c['strength']}")
    print(f"saved {out}")
