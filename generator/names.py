# names.py — Name pools
#
# Purpose: keep player names invented and unique; check reference names are not recognisable
# Inputs:  every club's players; optionally the private reference mapping (never committed)
# Outputs: problems found
# Spec:    generator/specs/world.md §5
#
# Generated name pools for the rest of the league come in a later milestone.

from __future__ import annotations

import unicodedata
from collections import Counter
from pathlib import Path

import yaml

MIN_EDIT_DISTANCE = 4  # between a reference name and the real name it is modelled on
PRIVATE_MAP = Path(__file__).with_name("reference_map.private.yaml")


def fold(name: str) -> str:
    """Lower case, accents removed, so 'Šimunić' and 'simunic' compare equal."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def surname(name: str) -> str:
    return name.split()[-1]


def edit_distance(a: str, b: str) -> int:
    a, b = fold(a), fold(b)
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def duplicate_problems(players: list[tuple[str, str]]) -> list[str]:
    """`players` is (team_id, full name). Full names are unique in the world; surnames are unique in a club."""
    problems = []
    full = Counter(fold(name) for _, name in players)
    for name, n in sorted(full.items()):
        if n > 1:
            problems.append(f"name used {n} times in the world: {name}")
    by_club = Counter((team_id, fold(surname(name))) for team_id, name in players)
    for (team_id, last), n in sorted(by_club.items()):
        if n > 1:
            problems.append(f"{team_id}: surname used {n} times: {last}")
    return problems


def load_private_map(path: Path = PRIVATE_MAP) -> dict | None:
    """The real names behind the reference profiles, or None when the file isn't on this machine."""
    if not path.exists():
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def reference_name_problems(players: list[tuple[str, int, str]], private_map: dict) -> list[str]:
    """`players` is (team_id, shirt, invented name). Never prints the real name, only the invented one."""
    problems = []
    for team_id, shirt, invented in players:
        real = private_map.get(team_id, {}).get("players", {}).get(shirt)
        if real is None:
            continue
        if fold(surname(invented)) == fold(surname(real)):
            problems.append(f"{team_id}-{shirt:02d} {invented}: shares a surname with the real player")
        elif edit_distance(invented, real) < MIN_EDIT_DISTANCE:
            problems.append(f"{team_id}-{shirt:02d} {invented}: fewer than {MIN_EDIT_DISTANCE} edits from the real name")
    return problems
