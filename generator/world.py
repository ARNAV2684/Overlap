# world.py — World builder
#
# Purpose: load and check the clubs, squads, attributes and team styles for a season; save the world; build match
#          setups from it
# Inputs:  reference_clubs.yaml, season id and seed
# Outputs: data/generated/world/<season_id>.json; match setups (CONTRACTS.md §2)
# Spec:    generator/specs/world.md
#
# The two reference clubs come first. Invented clubs generated from the seed come in a later milestone.

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

import kits
import names

REFERENCE_FILE = Path(__file__).with_name("reference_clubs.yaml")
WORLD_DIR = Path(__file__).resolve().parents[1] / "data" / "generated" / "world"

ATTRIBUTES = ("pace", "passing", "dribbling", "finishing", "tackling", "stamina",
              "acceleration", "vision", "positioning", "aerial", "composure", "goalkeeping")
SETUP_ATTRIBUTES = ATTRIBUTES[:6]  # the six the match setup sends (CONTRACTS.md §2)
STYLE_KEYS = ("press_intensity", "directness", "width", "tempo", "line_height", "build_up_short")
SETUP_STYLE_KEYS = STYLE_KEYS[:3]
POSITIONS = ("GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST")
FEET = ("left", "right", "both")

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

# Bench picks, in order: the best remaining player whose primary position is in each group (world.md §2).
BENCH_GROUPS = (("GK",), ("CB",), ("RB", "LB", "RWB", "LWB"), ("DM", "CM"), ("CM", "AM"),
                ("LW", "RW", "LM", "RM"), ("ST",))
BENCH_SIZE = 9
REFERENCE_SQUAD_SIZE = (22, 28)
MIN_GOALKEEPERS = 2
MOCK_TEAM_IDS = frozenset({"NBR", "HBA", "IVC", "SMW", "LKR", "GWA"})  # reserved while mock/ exists

TEAM_ID = re.compile(r"^[A-Z]{3}$")
MATCH_ID = re.compile(r"^SYN-\d{4}$")
SEASON_ID = re.compile(r"^S\d+$")

CLUB_FIELDS = {"team_id", "name", "short_name", "city", "venue", "colours", "formation", "style", "default_xi", "squad"}
PLAYER_FIELDS = {"shirt", "name", "pos", "other", "foot", "weak_foot", "attr"}
PLAYER_REQUIRED = {"shirt", "name", "pos", "attr"}


class WorldError(ValueError):
    """The world failed its checks. The message lists every problem, naming the club and player."""


@dataclass(frozen=True)
class Player:
    shirt: int
    name: str
    pos: str
    other: tuple[str, ...]
    foot: str
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
        other=tuple(raw.get("other", ())),
        foot=raw.get("foot", "right"),
        weak_foot=raw.get("weak_foot", 3),
        attr=dict(zip(ATTRIBUTES, attr)),
    )


def _club(raw: dict, problems: list[str]) -> Club | None:
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
        squad=tuple(squad),
        reference=True,
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
    if len(p.other) > 2 or any(o not in POSITIONS or o == p.pos for o in p.other):
        problems.append(f"{label}: other positions must be up to two valid positions, not the primary")
    if p.foot not in FEET:
        problems.append(f"{label}: foot must be one of {', '.join(FEET)}")
    if not isinstance(p.weak_foot, int) or not 1 <= p.weak_foot <= 5:
        problems.append(f"{label}: weak_foot must be 1–5")
    bad = [k for k, v in p.attr.items() if not _rating_ok(v)]
    if bad:
        problems.append(f"{label}: ratings must be whole numbers 1–99 ({', '.join(bad)})")
    return problems


def _club_problems(club: Club) -> list[str]:
    tid = club.team_id
    problems = []
    if not isinstance(tid, str) or not TEAM_ID.match(tid):
        problems.append(f"{tid}: team_id must be 3 capital letters")
    if tid in MOCK_TEAM_IDS:
        problems.append(f"{tid}: team_id is reserved for the mock")
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
    if all(set(c.colours) == {"home", "away"} for c in clubs) and not any("kit:" in m for m in problems):
        problems += kits.league_clash_problems({c.team_id: c.colours for c in clubs})
    if problems:
        raise WorldError("world check failed:\n  " + "\n  ".join(problems))


def clubs_from_data(data: dict) -> tuple[int, list[Club]]:
    """(world_version, clubs) from parsed reference data; raises WorldError when anything is wrong."""
    problems: list[str] = []
    clubs = [c for c in (_club(raw, problems) for raw in data.get("clubs", [])) if c is not None]
    if problems:
        raise WorldError("world check failed:\n  " + "\n  ".join(problems))
    validate_clubs(clubs)
    return data["world_version"], clubs


def load_reference_clubs(path: Path = REFERENCE_FILE) -> tuple[int, list[Club]]:
    return clubs_from_data(yaml.safe_load(path.read_text(encoding="utf-8")))


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
        "squad": [
            {
                "player_id": club.player_id(p),
                "shirt": p.shirt,
                "name": p.name,
                "pos": p.pos,
                "other": list(p.other),
                "foot": p.foot,
                "weak_foot": p.weak_foot,
                "overall": round(p.overall, 1),
                "attr": p.attr,
            }
            for p in sorted(club.squad, key=lambda p: p.shirt)
        ],
    }


def build_world(season_id: str = "S1", seed: int = 1, path: Path = REFERENCE_FILE) -> dict:
    if not SEASON_ID.match(season_id):
        raise WorldError(f"season_id must look like S1, got {season_id!r}")
    world_version, clubs = load_reference_clubs(path)
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
    player who plays the slot (world.md §2)."""
    used: set[int] = set()
    lineup = []
    for slot, shirt in zip(FORMATIONS[club.formation], club.default_xi):
        if shirt not in unavailable and shirt not in used:
            p = club.player(shirt)
        else:
            p = _best([q for q in club.squad if q.plays(slot) and q.shirt not in used | unavailable])
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
