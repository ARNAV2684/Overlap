"""Invented clubs, squads and the three mock match setups (CONTRACTS.md §2).

Every club, player, venue and city here is invented. Squads are generated from the match seed, so the same seed
always gives the same players.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

# Formation shapes in the team frame, metres: x 0 = own goal line → 105, y 0 = left touchline → 68.
# These are mid-block anchors; the engine shifts them with the ball. Goalkeeper first.
FORMATIONS: dict[str, list[tuple[str, float, float]]] = {
    "4-3-3": [("GK", 5, 34), ("RB", 32, 58), ("CB", 26, 42), ("CB", 26, 26), ("LB", 32, 10), ("DM", 44, 34),
              ("CM", 54, 46), ("CM", 54, 22), ("RW", 72, 58), ("ST", 80, 34), ("LW", 72, 10)],
    "5-3-2": [("GK", 5, 34), ("RWB", 38, 62), ("CB", 24, 46), ("CB", 22, 34), ("CB", 24, 22), ("LWB", 38, 6),
              ("CM", 50, 46), ("CM", 47, 34), ("CM", 50, 22), ("ST", 76, 41), ("ST", 76, 27)],
    "4-2-3-1": [("GK", 5, 34), ("RB", 32, 58), ("CB", 26, 42), ("CB", 26, 26), ("LB", 32, 10), ("DM", 44, 42),
                ("DM", 44, 26), ("RW", 64, 58), ("AM", 64, 34), ("LW", 64, 10), ("ST", 80, 34)],
    "4-4-2": [("GK", 5, 34), ("RB", 32, 58), ("CB", 26, 42), ("CB", 26, 26), ("LB", 32, 10), ("RM", 58, 60),
              ("CM", 50, 42), ("CM", 50, 26), ("LM", 58, 8), ("ST", 76, 41), ("ST", 76, 27)],
    "3-4-3": [("GK", 5, 34), ("CB", 26, 50), ("CB", 24, 34), ("CB", 26, 18), ("RWB", 48, 62), ("CM", 50, 42),
              ("CM", 50, 26), ("LWB", 48, 6), ("RW", 72, 56), ("ST", 80, 34), ("LW", 72, 12)],
    "4-1-4-1": [("GK", 5, 34), ("RB", 32, 58), ("CB", 26, 42), ("CB", 26, 26), ("LB", 32, 10), ("DM", 40, 34),
                ("RM", 58, 60), ("CM", 54, 44), ("CM", 54, 24), ("LM", 58, 8), ("ST", 78, 34)],
}

# Usual shirt numbers per position, tried in order.
SHIRTS = {
    "GK": [1, 13, 31], "RB": [2, 22], "RWB": [2, 22, 12], "LB": [3, 23], "LWB": [3, 23, 15],
    "CB": [4, 5, 6, 15, 16, 24, 26], "DM": [6, 16, 18, 21], "CM": [8, 14, 16, 18, 20, 25],
    "AM": [10, 20], "RM": [7, 17, 19], "LM": [11, 17, 27], "RW": [7, 17, 19], "LW": [11, 17, 27],
    "ST": [9, 10, 19, 29, 39],
}

# Rating archetypes: (pace, passing, dribbling, finishing, tackling, stamina)
ARCHETYPES = {
    "GK": (50, 62, 35, 20, 30, 60), "CB": (66, 68, 55, 40, 82, 76), "RB": (78, 72, 68, 48, 74, 82),
    "LB": (78, 72, 68, 48, 74, 82), "RWB": (80, 72, 72, 52, 70, 85), "LWB": (80, 72, 72, 52, 70, 85),
    "DM": (66, 80, 66, 52, 80, 84), "CM": (70, 82, 74, 62, 68, 84), "AM": (74, 84, 82, 74, 52, 78),
    "RM": (82, 76, 78, 64, 56, 80), "LM": (82, 76, 78, 64, 56, 80), "RW": (88, 74, 84, 72, 45, 76),
    "LW": (88, 74, 84, 72, 45, 76), "ST": (80, 68, 76, 84, 40, 76),
}

BENCH_POSITIONS = ["GK", "CB", "RB", "CM", "DM", "RW", "ST"]

FIRST_NAMES = [
    "Tomasz", "Kofi", "Jonah", "Mateo", "Ilan", "Rasmus", "Arjun", "Theo", "Yusuf", "Callum", "Bastian", "Nikolai",
    "Emeka", "Joaquin", "Dmitri", "Oskar", "Rafael", "Kenji", "Amadou", "Felix", "Hamza", "Lorenzo", "Silas",
    "Tariq", "Ewan", "Benedikt", "Aurelio", "Kwame", "Sander", "Idris", "Mikael", "Rohan", "Cyrus", "Dario",
    "Florin", "Gideon", "Hugo", "Ivo", "Jasper", "Leandro", "Malik", "Nils", "Orrin", "Pavel", "Quentin", "Reza",
    "Soren", "Teodor", "Ulises", "Vito", "Wendel", "Xander", "Yaw", "Zoran", "Aksel", "Bruno", "Cormac", "Davi",
]
LAST_NAMES = [
    "Wilk", "Mensah", "Okafor", "Varga", "Haddad", "Lindqvist", "Moreau", "Achterberg", "Brennan", "Castellano",
    "Dahl", "Eriksen-Vale", "Falkner", "Gallardo", "Holmgren", "Iwu", "Jovanic", "Kaczmar", "Lowther", "Marchetti",
    "Nwosu", "Ostrowski", "Pellegrin", "Quaresma", "Rademaker", "Salvesen", "Tanaka-Reid", "Uzoma", "Vasquez",
    "Whitlock", "Yilmazer", "Zandvoort", "Abernethy", "Balogun", "Carrow", "Delacroix", "Esterhuis", "Fennimore",
    "Grünwald", "Hartigan", "Ibarra", "Jessop", "Kowalczuk", "Lachance", "Mbatha-Ross", "Norland", "Oyelaran",
    "Penhallow", "Rossetti", "Strand", "Thornbury", "Underhill", "Vercoe", "Wainright", "Asante", "Bexley",
]


@dataclass(frozen=True)
class Club:
    team_id: str
    name: str
    city: str
    venue: str
    primary: str
    secondary: str
    formation: str
    press_intensity: float
    directness: float
    width: float
    strength: int  # shifts every rating up or down


CLUBS = {
    "NBR": Club("NBR", "Northbridge FC", "Northbridge", "Riverside Ground", "#B3202A", "#1C2340", "4-3-3",
                0.78, 0.35, 0.70, 3),
    "HBA": Club("HBA", "Harbour Athletic", "Port Harrow", "Quayside Park", "#E0A526", "#121212", "5-3-2",
                0.40, 0.72, 0.45, 0),
    "IVC": Club("IVC", "Ironvale City", "Ironvale", "The Foundry Bowl", "#2F6FD6", "#F2F2F2", "4-2-3-1",
                0.60, 0.50, 0.60, 2),
    "SMW": Club("SMW", "Saltmarsh Wanderers", "Saltmarsh", "Marshgate Lane", "#1E8C5A", "#F4E9C8", "4-4-2",
                0.50, 0.65, 0.55, -1),
    "LKR": Club("LKR", "Larkspur Rangers", "Larkspur", "Meadowbank", "#7B3FB8", "#F5C542", "3-4-3",
                0.70, 0.40, 0.80, 1),
    "GWA": Club("GWA", "Greywater Albion", "Greywater", "Old Mill Stadium", "#C2462B", "#F0E6D2", "4-1-4-1",
                0.45, 0.55, 0.50, 0),
}

# match_id, seed, home, away, matchweek, kickoff, storylines
MATCHES = [
    ("SYN-9001", 9001, "NBR", "HBA", 9, "2026-10-24T19:00:00Z", ["late_pressure_surge"]),
    ("SYN-9002", 9002, "IVC", "SMW", 9, "2026-10-24T16:30:00Z", ["red_card"]),
    ("SYN-9003", 9005, "LKR", "GWA", 9, "2026-10-25T14:00:00Z", ["comeback"]),
]


def _rating(rng: random.Random, base: int, strength: int) -> int:
    return max(1, min(99, round(rng.gauss(base + strength, 5))))


def _player(rng: random.Random, club: Club, pos: str, used_shirts: set[int], used_names: set[str]) -> dict:
    shirt = next((s for s in SHIRTS[pos] if s not in used_shirts), None)
    while shirt is None or shirt in used_shirts:
        shirt = rng.randint(2, 45)
    used_shirts.add(shirt)
    while True:
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        if name not in used_names:
            used_names.add(name)
            break
    keys = ("pace", "passing", "dribbling", "finishing", "tackling", "stamina")
    attr = {k: _rating(rng, b, club.strength) for k, b in zip(keys, ARCHETYPES[pos])}
    return {"player_id": f"{club.team_id}-{shirt:02d}", "name": name, "pos": pos, "shirt": shirt, "attr": attr}


def _team(rng: random.Random, club: Club, used_names: set[str]) -> dict:
    used_shirts: set[int] = set()
    lineup = [_player(rng, club, pos, used_shirts, used_names) for pos, _, _ in FORMATIONS[club.formation]]
    bench = [_player(rng, club, pos, used_shirts, used_names) for pos in BENCH_POSITIONS]
    return {
        "team_id": club.team_id,
        "name": club.name,
        "colours": {"primary": club.primary, "secondary": club.secondary},
        "formation": club.formation,
        "style": {"press_intensity": club.press_intensity, "directness": club.directness, "width": club.width},
        "lineup": lineup,
        "bench": bench,
    }


def build_setup(match_index: int, run: int = 0) -> dict:
    """The match setup message for one of the mock matches (0-based index into MATCHES).

    `run` > 0 is used when looping: a new match ID (+100 per run) and seed, so consumers never see a repeated seq.
    """
    match_id, seed, home_id, away_id, week, kickoff, storylines = MATCHES[match_index]
    if run:
        match_id = f"SYN-{int(match_id[4:]) + 100 * run:04d}"
        seed += 1000 * run
    rng = random.Random(seed)
    home, away = CLUBS[home_id], CLUBS[away_id]
    used_names: set[str] = set()
    return {
        "match_id": match_id,
        "seed": seed,
        "competition": f"Synthetic League · Season 1 · Matchweek {week}",
        "season_id": "S1",
        "venue": {"name": home.venue, "city": home.city},
        "kickoff_utc": kickoff,
        "storylines": list(storylines),
        "teams": {"home": _team(rng, home, used_names), "away": _team(rng, away, used_names)},
    }


def match_ids() -> list[str]:
    return [m[0] for m in MATCHES]


def match_index(match_id: str) -> int:
    for i, m in enumerate(MATCHES):
        if m[0] == match_id:
            return i
    raise KeyError(f"unknown mock match {match_id!r}; choose from {', '.join(match_ids())}")
