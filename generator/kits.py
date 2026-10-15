# kits.py — Kit colours
#
# Purpose: check kit colours are readable on dark and light backgrounds and that two clubs never look alike
# Inputs:  each club's home and away colour pairs
# Outputs: problems found; the pair each club wears in a match
# Spec:    generator/specs/world.md §6

from __future__ import annotations

import math
import re

HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

MIN_PAIR_CONTRAST = 3.0  # WCAG contrast between a pair's primary and secondary
MIN_CLASH_DELTA_E = 20.0  # CIEDE2000 between two clubs' primaries before the away club changes


def _rgb(hex_colour: str) -> tuple[float, float, float]:
    return tuple(int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_colour: str) -> float:
    r, g, b = (_linear(c) for c in _rgb(hex_colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
    hi, lo = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def hex_to_lab(hex_colour: str) -> tuple[float, float, float]:
    """sRGB hex → CIELAB (D65)."""
    r, g, b = (_linear(c) for c in _rgb(hex_colour))
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e2000(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
    """CIEDE2000 colour difference (Sharma, Wu and Dalal, 2005)."""
    l1, a1, b1 = lab1
    l2, a2, b2 = lab2
    c_bar = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    g = 0.5 * (1 - math.sqrt(c_bar ** 7 / (c_bar ** 7 + 25 ** 7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if c1p else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if c2p else 0.0

    d_lp = l2 - l1
    d_cp = c2p - c1p
    if c1p * c2p == 0:
        d_hp = 0.0
    else:
        d_hp = h2p - h1p
        if d_hp > 180:
            d_hp -= 360
        elif d_hp < -180:
            d_hp += 360
    d_big_hp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(d_hp / 2))

    l_bar = (l1 + l2) / 2
    c_bar_p = (c1p + c2p) / 2
    if c1p * c2p == 0:
        h_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        h_bar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        h_bar = (h1p + h2p + 360) / 2
    else:
        h_bar = (h1p + h2p - 360) / 2

    t = (1 - 0.17 * math.cos(math.radians(h_bar - 30)) + 0.24 * math.cos(math.radians(2 * h_bar))
         + 0.32 * math.cos(math.radians(3 * h_bar + 6)) - 0.20 * math.cos(math.radians(4 * h_bar - 63)))
    d_theta = 30 * math.exp(-(((h_bar - 275) / 25) ** 2))
    r_c = 2 * math.sqrt(c_bar_p ** 7 / (c_bar_p ** 7 + 25 ** 7))
    s_l = 1 + 0.015 * (l_bar - 50) ** 2 / math.sqrt(20 + (l_bar - 50) ** 2)
    s_c = 1 + 0.045 * c_bar_p
    s_h = 1 + 0.015 * c_bar_p * t
    r_t = -math.sin(math.radians(2 * d_theta)) * r_c
    return math.sqrt((d_lp / s_l) ** 2 + (d_cp / s_c) ** 2 + (d_big_hp / s_h) ** 2
                     + r_t * (d_cp / s_c) * (d_big_hp / s_h))


def colour_difference(a: str, b: str) -> float:
    return delta_e2000(hex_to_lab(a), hex_to_lab(b))


def clashes(primary_a: str, primary_b: str) -> bool:
    return colour_difference(primary_a, primary_b) < MIN_CLASH_DELTA_E


def pair_problems(team_id: str, kit: str, pair: dict) -> list[str]:
    """Problems with one colour pair: format and primary/secondary contrast."""
    if set(pair) != {"primary", "secondary"}:
        return [f"{team_id} {kit} kit: needs exactly primary and secondary, got {sorted(pair)}"]
    bad = [k for k in ("primary", "secondary") if not isinstance(pair[k], str) or not HEX.match(pair[k])]
    if bad:
        return [f"{team_id} {kit} kit: {', '.join(bad)} is not a 6-digit hex colour"]
    ratio = contrast_ratio(pair["primary"], pair["secondary"])
    if ratio < MIN_PAIR_CONTRAST:
        return [f"{team_id} {kit} kit: primary/secondary contrast {ratio:.2f}:1 is below {MIN_PAIR_CONTRAST}:1"]
    return []


def league_clash_problems(colours_by_team: dict[str, dict]) -> list[str]:
    """A club fails if both its home and away primaries clash with another club's home primary."""
    problems = []
    for team_id, colours in colours_by_team.items():
        for other_id, other in colours_by_team.items():
            if other_id == team_id:
                continue
            home_primary = other["home"]["primary"]
            if clashes(colours["home"]["primary"], home_primary) and clashes(colours["away"]["primary"], home_primary):
                problems.append(f"{team_id}: home and away kits both clash with {other_id}'s home kit")
    return problems


def choose_colours(home: dict, away: dict) -> tuple[dict, dict]:
    """The pairs worn in a match: home wears home; away wears home unless the primaries clash, then away."""
    away_pair = away["home"]
    if clashes(home["home"]["primary"], away_pair["primary"]):
        away_pair = away["away"]
    return dict(home["home"]), dict(away_pair)
