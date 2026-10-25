# fact_checker.py — Fact-checker
#
# Purpose: verify every line before it can be shown: a deterministic numeric check in code, then a separate model
#          meaning check; failed lines go back to the narrator (at most two rewrites), then to their template
# Inputs:  lines {id, mode, lang, text, claims}; the moment (facts and names); the analyst's interpretation
# Outputs: problem codes per line (code check); a verdict per line (model check); the checked line set
# Spec:    agents/specs/fact-checking.md; CONTRACTS.md §5.1; stats/agents-guide.md §4 (do/don't per trigger)
#
# A meaning pass can never override a numeric failure. Templates go through the same code check. Translated lines
# (es, hi, fr) are checked after locale normalisation against the English claims (fact-checking.md §4).

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from fallbacks import fact_map, mode_of, player_name

LIMITS = {"casual": 140, "analyst": 220, "player": 160, "club": 160}
TRANSLATED_SLACK = 1.6                      # translations run longer than English; limits apply with this margin
SCORE_PAIRS = (("team_goals_match", "opponent_goals_match"), ("home_goals", "away_goals"))

# Numeric expressions, in text order. A score line or a range is two numbers joined by a dash.
TOKEN = re.compile(r"""
    (?P<sci>\d(?:\.\d+)?[eE][+-]?\d+)
  | (?P<group>\d{1,3}(?:,\d{3})+(?!\d))
  | (?P<frac>\d+/\d+)
  | (?P<range>\d+(?:\.\d+)?\s+(?:to|-|–)\s+\d+(?:\.\d+)?)
  | (?P<score>\d+[–-]\d+)
  | (?P<num>\d+(?:\.\d+)?)
""", re.VERBOSE)
SUFFIX = re.compile(r"(?P<ord>st|nd|rd|th)\b|\s?(?P<pct>%)|\s?(?P<unit>xG|km/h|km|metres|meters|m|minutes|minute|"
                    r"mins|min|seconds|secs|yards|yds|hours)\b")
UNITS_OK = {"xG": {"xG"}, "m": {"m", "metres", "meters"}, "min": {"min", "mins", "minute", "minutes"}}

NUMBER_WORDS = {
    "en": r"zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|"
          r"thirty|forty|fifty|hundred|once|twice|thrice|first|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|"
          r"both|half|double|treble|dozen|pair",
    "es": r"dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cien|ambos|ambas|doble|mitad|"
          r"segundo|segunda|tercer|tercero|tercera|cuarto|quinto",
    "fr": r"deux|trois|quatre|cinq|sept|huit|neuf|dix|vingt|trente|cent|deuxième|troisième|quatrième|moitié|double",
    "hi": r"दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|बीस|दूसरा|दूसरी|दूसरे|तीसरा|तीसरी|तीसरे|आधा|आधे",
}
# "first half" / "second half" name a period, not a count
PERIOD_PHRASE = re.compile(r"\b(first|second) half\b", re.IGNORECASE)
FORBIDDEN = [(re.compile(r"https?://|www\.", re.IGNORECASE), "url"),
             (re.compile(r"[<>{}`@\[\]]"), "markup"),
             (re.compile(r"\b(?:SYN|MO|OV|RC)-\d{4}"), "internal_id"),
             (re.compile(r"\b[A-Z]{3}-\d{2}\b"), "internal_id")]

# Wording the facts can't support, per trigger (stats/agents-guide.md §4 "Don't" column). Each entry is
# (pattern, condition on the facts that makes it allowed or None, code).
DONT: dict[str, list[tuple[re.Pattern, Any, str]]] = {
    "goal": [(re.compile(r"\btap[- ]in\b", re.IGNORECASE), lambda f: f.get("shot_xg", {}).get("value", 0) >= 0.5,
              "tap_in_on_low_xg"),
             (re.compile(r"\bwonder ?goal|worldie|screamer\b", re.IGNORECASE), lambda f: f.get("shot_xg", {}).get("value", 1) < 0.3,
              "wonder_goal_on_high_xg")],
    "red_card": [(re.compile(r"\bbecause\b|\bfor (?:a|his|her|the) |handball|dissent|second yellow|violent|"
                             r"professional foul|denying", re.IGNORECASE), None, "red_card_reason")],
    "penalty": [(re.compile(r"\b(?:scores?|scored|converts?|converted|nets?|netted)\b", re.IGNORECASE), None, "penalty_scored")],
    "big_chance": [(re.compile(r"should have scored|must score|has to score|should score", re.IGNORECASE), None, "xg_verdict")],
    "shot_cluster": [(re.compile(r"pressure|dominat|dominan|on top|bound to|likely|goal is coming|siege|"
                                 r"camped", re.IGNORECASE), None, "cluster_inference")],
    "momentum_swing": [(re.compile(r"possession", re.IGNORECASE), None, "momentum_possession")],
    "press_change": [(re.compile(r"\btired|fatigue|parking the bus|park the bus|sitting back|giving up", re.IGNORECASE), None,
                      "press_intent"),
                     (re.compile(r"\bhigh press|pressing high|press high", re.IGNORECASE),
                      lambda f: "press_height_last_5min_m" in f, "high_press_without_height")],
    "milestone": [],
    "head_to_head": [(re.compile(r"\bbetter (?:player|than)|outclass|class apart|superior|\bbully|"
                                 r"\btired|fatigue|injur", re.IGNORECASE), None, "battle_verdict")],
    "connection": [(re.compile(r"chemistry|telepath|friendship|best friends|instinct", re.IGNORECASE), None,
                    "connection_feelings"),
                   (re.compile(r"possession", re.IGNORECASE), None, "connection_possession")],
    "workhorse": [(re.compile(r"\btired|fatigue|exhaust|fitness|stamina|lungs", re.IGNORECASE), None,
                   "work_fitness"),
                  (re.compile(r"\bkm\b|kilomet|\bran\b|running|covered|sprint", re.IGNORECASE),
                   lambda f: "player_distance_km" in f, "distance_without_tracking")],
}
ALL_TRIGGERS_DONT = [(re.compile(r"should have scored", re.IGNORECASE), None, "xg_verdict"),
                     (re.compile(r"\bhat[- ]trick\b", re.IGNORECASE),
                      lambda f: f.get("player_goals_match", {}).get("value") == 3, "hat_trick_wrong"),
                     (re.compile(r"\bbrace\b", re.IGNORECASE),
                      lambda f: f.get("player_goals_match", {}).get("value") == 2, "brace_wrong"),
                     (re.compile(r"\bbet|odds\b|betting", re.IGNORECASE), None, "betting")]
PENALTY_WORDS = re.compile(r"penalty|from the spot|spot[- ]kick|\bpen\b", re.IGNORECASE)
UP_WORDS = re.compile(r"\b(?:harder|more|up from|increas|intensif|rais|ramp)", re.IGNORECASE)
DOWN_WORDS = re.compile(r"\b(?:less|fewer|down from|decreas|eas(?:ed|ing)|drop|dropp|reduc|ease off)", re.IGNORECASE)
DOWN_TO = re.compile(r"down to\s+(\d+)", re.IGNORECASE)

# Names: in an English line every capitalised word must belong to this moment's team or player names (or the recap's
# story); a sentence may also open with one of these ordinary words. Anything else (another club, a real person, a
# name copied from a prompt example) fails the line.
STARTERS = frozenset(["a", "an", "the", "and", "but", "after", "again", "another", "as", "at", "big", "both", "by", "early", "even", "for", "from", "full", "goal", "goals", "he", "her", "his", "in", "it", "its", "late", "now", "off", "on", "penalty", "plenty", "red", "shots", "so", "still", "that", "their", "them", "then", "there", "they", "this", "time", "what", "when", "where", "while", "with", "yet"])
CAPITAL = re.compile(r"(?<![\w'’-])[A-Z][\w'’-]*")
SENTENCE_START = re.compile(r"(?:^|[.!?:]\s+)$")


# --- tokens -------------------------------------------------------------------------------------------------------

def normalise(text: str, lang: str) -> str:
    """Locale forms back to the English digits (fact-checking.md §4)."""
    if lang == "hi":
        text = text.translate(str.maketrans("०१२३४५६७८९", "0123456789"))
    if lang in ("es", "fr"):
        text = re.sub(r"(?<=\d),(?=\d)", ".", text)
    text = text.replace(" ", " ").replace(" ", " ")
    return re.sub(r"(?<=\d)\s+%", "%", text)


def numbers(text: str) -> tuple[list[dict], list[str]]:
    """Numeric expressions in text order: {value text, kind, suffix kind, unit}; plus problems for forms never
    allowed (scientific notation, digit grouping, fractions, ranges)."""
    out, problems = [], []
    for m in TOKEN.finditer(text):
        kind = m.lastgroup
        if kind in ("sci", "group", "frac", "range"):
            problems.append(f"number_form:{kind}")
            continue
        after = SUFFIX.match(text, m.end())
        suffix = {"ord": None, "pct": None, "unit": None} if after is None else after.groupdict()
        parts = re.split(r"[–-]", m.group()) if kind == "score" else [m.group()]
        for i, part in enumerate(parts):
            last = i == len(parts) - 1
            out.append({"text": part, "kind": kind, "ordinal": bool(suffix["ord"]) and last,
                        "pct": bool(suffix["pct"]) and last, "unit": suffix["unit"] if last else None})
    return out, problems


def _decimals(token: str) -> int:
    return len(token.split(".", 1)[1]) if "." in token else 0


# --- the code check -----------------------------------------------------------------------------------------------

def shape_problems(line: dict) -> list[str]:
    if set(line) - {"id"} != {"mode", "lang", "text", "claims"}:
        return ["shape"]
    if line["mode"] not in LIMITS or not isinstance(line["text"], str) or not line["text"].strip():
        return ["shape"]
    claims = line["claims"]
    if not isinstance(claims, list) or any(
            not isinstance(c, dict) or set(c) != {"key", "value"} or not isinstance(c["key"], str)
            or isinstance(c["value"], bool) or not isinstance(c["value"], int | float) for c in claims):
        return ["claims_shape"]
    return []


def numeric_check(line: dict, moment: dict, *, english: dict | None = None, names: list[str] | None = None) -> list[str]:
    """Problem codes for one line; empty means it passes (fact-checking.md §1, §4). For a translated line pass the
    checked English line as `english`: its claims must be unchanged and each of its numbers must appear once."""
    problems = shape_problems(line)
    if problems:
        return problems
    facts, lang, text = fact_map(moment), line["lang"], line["text"]
    norm = normalise(text, lang)
    limit = LIMITS[mode_of(line.get("id", line["mode"]))]
    if len(text) > (limit if lang == "en" else int(limit * TRANSLATED_SLACK)):
        problems.append("too_long")
    for pattern, code in FORBIDDEN:
        if pattern.search(text):
            problems.append(code)
    team_ids = [moment["context"]["teams"][s]["team_id"] for s in ("home", "away")]
    if any(re.search(rf"\b{t}\b", text) for t in team_ids):
        problems.append("internal_id")
    if lang == "en":
        problems += unknown_names(text, moment)
    words = NUMBER_WORDS.get(lang)
    if words:
        bare = PERIOD_PHRASE.sub("", norm) if lang == "en" else norm
        hit = re.search(rf"(?<!\w)(?:{words})(?!\w)", bare, re.IGNORECASE)
        if hit:
            problems.append(f"spelled_number:{hit.group().lower()}")
    tokens, form_problems = numbers(norm)
    problems += form_problems
    claims = line["claims"]
    keys = [c["key"] for c in claims]
    if len(set(keys)) != len(keys):
        problems.append("duplicate_claim")
    for c in claims:
        f = facts.get(c["key"])
        if f is None:
            problems.append(f"unknown_fact:{c['key']}")
        elif c["value"] != f["value"] or type(c["value"]) is not type(f["value"]):
            problems.append(f"wrong_value:{c['key']}")
    if english is not None:
        if claims != english["claims"]:
            problems.append("claims_changed")
        got = sorted(float(t["text"]) for t in tokens)
        want = sorted(float(c["value"]) for c in english["claims"])
        if got != want:
            problems.append("numbers_changed")
        for name in names or []:
            if name in english["text"] and name not in text:
                problems.append("name_changed")
        problems += _units(tokens, claims, facts, ordered=False)
        return problems
    if len(tokens) != len(claims):
        problems.append("numbers_without_claims" if len(tokens) > len(claims) else "claims_without_numbers")
    problems += _units(tokens, claims, facts, ordered=True)
    problems += _meanings(norm, tokens, claims, moment)
    return problems


def _unit_fits(tok: dict, fact: dict | None) -> bool:
    unit = (fact or {}).get("unit")
    return tok["pct"] == (unit == "%") and (not tok["unit"] or tok["unit"] in UNITS_OK.get(unit, set()))


def _pair_by_value(tokens: list[dict], claims: list[dict], facts: dict) -> list[tuple[dict, dict | None]]:
    """A translated line's numbers can come in any order, so each token takes an unused claim of the same value,
    preferring one whose unit fits it (5 regains and a 5-minute window: "5 minutes" is the window)."""
    free, pairs = list(claims), []
    for t in tokens:
        same = [c for c in free if float(c["value"]) == float(t["text"])]
        claim = next((c for c in same if _unit_fits(t, facts.get(c["key"]))), same[0] if same else None)
        if claim is not None:
            free.remove(claim)
        pairs.append((t, claim))
    return pairs


def _units(tokens: list[dict], claims: list[dict], facts: dict, *, ordered: bool) -> list[str]:
    problems = []
    pairs = list(zip(tokens, claims, strict=False)) if ordered else _pair_by_value(tokens, claims, facts)
    for i, (tok, claim) in enumerate(pairs):
        if claim is None:
            continue
        f = facts.get(claim["key"])
        if f is None:
            continue
        if ordered and float(tok["text"]) != float(f["value"]):
            problems.append(f"text_differs:{claim['key']}")
        if _decimals(tok["text"]) > f["decimals"]:
            problems.append(f"too_precise:{claim['key']}")
        unit = f.get("unit")
        if unit == "%" and not tok["pct"]:
            problems.append(f"unit_missing:{claim['key']}")
        if unit != "%" and tok["pct"]:
            problems.append(f"unit_wrong:{claim['key']}")
        if tok["unit"] and tok["unit"] not in UNITS_OK.get(unit, set()):
            problems.append(f"unit_wrong:{claim['key']}")
        if tok["ordinal"] and (unit is not None or f["decimals"] != 0):
            problems.append(f"ordinal_wrong:{claim['key']}")
        if ordered and tok["kind"] == "score" and tok is tokens[i]:
            nxt = claims[i + 1]["key"] if i + 1 < len(claims) else None
            prev = claims[i - 1]["key"] if i > 0 else None
            if (claim["key"], nxt) not in SCORE_PAIRS and (prev, claim["key"]) not in SCORE_PAIRS:
                problems.append("score_not_from_facts")
    return problems


def _meanings(text: str, tokens: list[dict], claims: list[dict], moment: dict) -> list[str]:
    """Wording the code can check (fact-checking.md §1.5 and the producer guide's do/don't table)."""
    facts, trigger, problems = fact_map(moment), moment["evidence"]["trigger"], []
    for pattern, allowed, code in DONT.get(trigger, []) + ALL_TRIGGERS_DONT:
        if pattern.search(text) and not (allowed and allowed(facts)):
            problems.append(code)
    penalty_ok = trigger in ("penalty", "recap") or (
        trigger == "goal" and facts.get("shot_is_penalty", {}).get("value") == 1)
    if PENALTY_WORDS.search(text) and not penalty_ok:
        problems.append("penalty_wording")
    for m in DOWN_TO.finditer(text):
        n = facts.get("team_players_on_pitch")
        if n is None or int(m.group(1)) != n["value"]:
            problems.append("down_to_wrong")
    if trigger == "press_change":
        now, before = facts["pressures_per_opp_pass_last_5min"]["value"], facts[
            "pressures_per_opp_pass_previous_10min"]["value"]
        wrong = DOWN_WORDS if now > before else UP_WORDS
        if wrong.search(text):
            problems.append("press_direction")
    if trigger == "momentum_swing" and DOWN_WORDS.search(text):
        problems.append("momentum_direction")
    return problems


# --- the model meaning check (fact-checking.md §2) ----------------------------------------------------------------

class LineVerdict(BaseModel):
    id: str
    passed: bool = Field(alias="pass")
    reasons: list[str] = Field(default_factory=list, max_length=3)


class Verdict(BaseModel):
    passed: bool = Field(alias="pass")
    interpretation_supported: bool
    lines: list[LineVerdict]


def verdict_for(verdict: Verdict, ids: list[str]) -> dict[str, LineVerdict] | None:
    """One verdict per requested line, nothing else; otherwise the verdict is inconsistent and fails."""
    got = {v.id: v for v in verdict.lines}
    if set(got) != set(ids) or len(got) != len(verdict.lines):
        return None
    if verdict.passed and not all(v.passed for v in got.values()):
        return None
    return got


def evidence_view(moment: dict) -> dict:
    """What the meaning check and the narrator may see: facts, names and the trigger's wording rules."""
    e, ctx = moment["evidence"], moment["context"]
    return {"trigger": e["trigger"], "period": e["period"],
            "team": next(ctx["teams"][s]["name"] for s in ("home", "away") if ctx["teams"][s]["team_id"] == e["team_id"]),
            "teams": {ctx["teams"][s]["team_id"]: ctx["teams"][s]["name"] for s in ("home", "away")},
            "players": {p["player_id"]: {"name": p["name"], "pos": p["pos"]} for p in ctx.get("players") or []},
            "actor": player_name(moment, e["player_ids"][0]) if e["player_ids"] else None,
            "facts": [{k: f[k] for k in ("key", "value", "unit", "decimals", "label") if k in f} for f in e["facts"]]}


def names_of(moment: dict) -> list[str]:
    ctx = moment["context"]
    story = [n for s in moment.get("story") or [] for n in (s.get("team"), s.get("player")) if n]
    return [ctx["teams"][s]["name"] for s in ("home", "away")] + [
        player_name(moment, p["player_id"]) for p in ctx.get("players") or []] + story


def unknown_names(text: str, moment: dict) -> list[str]:
    """The first capitalised word that is neither part of a permitted name nor an ordinary sentence opener."""
    allowed = {w for name in names_of(moment) if name for w in re.findall(r"[\w'’-]+", name)}
    for m in CAPITAL.finditer(text):
        word = re.sub(r"['’]s$", "", m.group())
        if word in allowed or word == "xG":
            continue
        if SENTENCE_START.search(text[:m.start()]) and word.lower() in STARTERS:
            continue
        return [f"unknown_name:{word}"]
    return []


def core(line: dict) -> dict:
    """The line as the checks see it: id plus the §5.1 fields, nothing else."""
    return {k: line[k] for k in ("id", "mode", "lang", "text", "claims")}


async def meaning(run: Any, interpretation: str | None, lines: list[dict]) -> tuple[dict | None, bool | None]:
    """The model's verdict per line id, or None when it's unavailable or inconsistent (then nothing is verified)."""
    from models import ModelFailed
    payload = {"moment": evidence_view(run.moment), "interpretation": interpretation,
               "lines": [{"id": ln["id"], "mode": ln["mode"], "text": ln["text"], "claims": ln["claims"]}
                         for ln in lines]}
    try:
        verdict = await run.ask("fact_checker", payload, Verdict)
    except ModelFailed:
        return None, None
    got = verdict_for(verdict, [ln["id"] for ln in lines])
    return (got, verdict.interpretation_supported) if got is not None else (None, None)


async def run(run: Any) -> dict:
    """Check the narrator's (or recap writer's) lines: code check, model meaning check, at most `max_rewrites`
    rewrites of the failed lines, then each remaining line's template. Status per line id."""
    import narrator
    import safety
    from fallbacks import template_line
    m, settings = run.moment, run.deps.settings
    writer = "recap_writer" if "recap_writer" in run.job.stage_outputs else "narrator"
    drafted = run.output(writer)
    ids = [ln["id"] for ln in drafted["lines"]]
    interpretation = (run.job.stage_outputs.get("analyst") or {}).get("interpretation")
    candidates = {ln["id"]: core(ln) for ln in drafted["lines"] if ln["id"] in drafted.get("model_ids", [])}
    verified: dict[str, dict] = {}
    rounds: list[dict] = []
    supported = None
    for attempt in range(settings.max_rewrites + 1):
        problems = {i: numeric_check(ln, m) for i, ln in candidates.items()}
        to_judge = [ln for i, ln in candidates.items() if not problems[i]] + list(verified.values())
        verdicts, supported_now = (await meaning(run, interpretation, to_judge)) if to_judge else ({}, None)
        supported = supported_now if supported_now is not None else supported
        failed = [{"line": ln, "reasons": problems[i]} for i, ln in candidates.items() if problems[i]]
        if verdicts is None:                              # no usable verdict: nothing can be verified
            rounds.append({"attempt": attempt, "numeric": problems, "meaning": "unavailable"})
            verified = {}
            break
        for ln in to_judge:
            v = verdicts[ln["id"]]
            if v.passed:
                verified[ln["id"]] = ln
            else:
                verified.pop(ln["id"], None)
                if ln["id"] in candidates:
                    failed.append({"line": ln, "reasons": [f"meaning:{r}" for r in v.reasons] or ["meaning"]})
        rounds.append({"attempt": attempt, "numeric": problems,
                       "meaning": {i: {"pass": v.passed, "reasons": v.reasons} for i, v in verdicts.items()}})
        if not failed or attempt == settings.max_rewrites:
            break
        candidates = {i: core(ln) for i, ln in (await narrator.rewrite(run, failed, agent=writer)).items()}
        if not candidates:
            break
    verified, screened = await safety.screen(run, verified)   # Content Safety, when on (off: unchanged)
    lines, status = [], {}
    for i in ids:
        if i in verified:
            lines.append(verified[i])
            status[i] = {"verified": True, "fallback": False}
            continue
        tmpl = core(_template(m, i, template_line))
        bad = numeric_check(tmpl, m)
        if bad:                                          # never publish an unchecked number, even from a template
            status[i] = {"verified": False, "fallback": True, "dropped": bad}
            continue
        lines.append(tmpl)
        status[i] = {"verified": False, "fallback": True}
    return {"lines": lines, "status": status, "interpretation_supported": supported, "rounds": rounds,
            "verified": bool(lines) and all(status[ln["id"]]["verified"] for ln in lines),
            **({"safety": screened} if screened else {})}


def _template(moment: dict, line_id: str, template_line: Any) -> dict:
    if moment["evidence"]["trigger"] == "recap":
        from recap_writer import recap_template
        return recap_template(moment, line_id)
    return template_line(moment, line_id)
