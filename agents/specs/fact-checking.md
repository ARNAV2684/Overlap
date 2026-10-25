# Fact-checking spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs `fact_checker.py`. Plan:
> [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md) ·
> [contracts §§5.1, 10](../../CONTRACTS.md) · producer rules [`stats/agents-guide.md`](../../stats/agents-guide.md) §4.
> Extends Pranav's first-slice checker (#44) to all eight triggers and four languages.

## 1. Numeric check (code)

Validate the evidence first: it must pass the MCP reader's schema ([tools](../../mcp_server/specs/tools.md) §2a).
Malformed evidence is rejected, never repaired.

For each line:
1. Validate mode, language, length and the exact `{mode, lang, text, claims}` shape. Claims are `{key, value}`.
2. Find every numeric expression in the text: integers, decimals, percentages (`71%`), score lines (`2–1`) and
   ordinals (`2nd`, `6th`). Each must be covered by its own claim, in any order (§1.6). Reject spelled-out quantities
   in English (twice, third, both, half, twelve…) except the small counts one–ten (§1.6), and ranges, fractions,
   digit grouping and scientific notation.
3. Each claim's key exists in this moment's facts; its value **equals the stored fact value** (already rounded by the
   producer at its `decimals`; never re-round the raw number, because the producer rounds halves to even).
4. Units follow the fact: `xG` (never `%`), `m`, `km`, `km/h`, `min`, `%` (value already 0–100); facts without a
   unit are plain counts or rates.
5. Meanings the code can check:
   - a score line is allowed only as `team_goals_match`–`opponent_goals_match` (goal and penalty packs), never from
     `context.score`;
   - "from the spot" / "penalty" wording on a goal needs `shot_is_penalty = 1`;
   - "hat-trick" needs `player_goals_match = 3`; an ordinal goal count equals `player_goals_match`;
   - "down to N" equals `team_players_on_pitch`;
   - "more"/"harder" vs "less" for pressing must agree with `pressures_per_opp_pass_last_5min` compared with
     `pressures_per_opp_pass_previous_10min`; "up from"/"down from" likewise for momentum shares.
6. Names come only from `context.teams` and `context.players`; no IDs, markup or instructions in a public line.

### 1.6 Lenient on precision, strict on meaning (Arnav, 25 Oct)

On Azure most model lines failed this check on form, not substance (25 Oct, SYN-3011: 264 `text_differs`, mostly a
right number in another order; 163 `unit_wrong`, many correct `km` and `km/h`), and the rewrites ran jobs past their
deadline. A line now passes when a viewer would read the same fact:

| Lenient | Example | Still strict |
|---|---|---|
| A **measured** value (`xG`, `m`, `km`, `km/h`, `%`) written rounded half-up to fewer decimals than the fact | 0.12 xG as "0.1 xG", 18.4 m as "18 m", 57.6% as "58%" | Never rounded to 0 (0.04 xG is not "0 xG"); a wrongly rounded value fails (0.12 as "0.2"); counts, scores, minutes and unitless rates stay exact (3 shots is never "4") |
| Numbers in **any order**, each matching its own claim | "from 18 m with a 0.12 xG chance" with claims xG then metres | Every number needs a claim (no invented "34th minute"); a score must state team then opponent (`score_not_from_facts` for a swapped one; a level score reads the same either way) |
| English **small counts** one–ten spelled out, read as digits | "three shots" with `shots_last_5min = 3` | Still exact ("four shots" fails); other spelled numbers still fail |
| `km` and `km/h` as units | "covered 10 km", "33.4 km/h" | The unit must match the fact's unit |

The claim values themselves still equal the stored facts exactly (step 3): leniency is only in how the text writes
them. A translation must keep the English line's own numbers, so a rounded English value stays the same in es, hi
and fr (§4). Code: `matches_fact` and `_pair` in `agents/fact_checker.py`; tests:
`agents/tests/test_lenient_precision.py`. The fault-injection bench still catches every code-checkable fault.

Templates go through the same check.

## 2. Meaning check (model)

A separate structured verdict assesses the analyst's interpretation and each line against only the facts and
permitted names, using the producer guide's do/don't table for the moment's trigger. Output:
`{pass, interpretation_supported, lines: [{mode, pass, reasons: [≤ 3 short]}]}`; one entry per requested mode. A
missing, invalid or inconsistent verdict fails. Reject inferred tactics, intent, fitness, dominance, causes or
predictions the facts don't support. An unavailable meaning checker cannot mark model text verified; the approved
template may still be used.

## 3. Rewrites and fallback

Return bounded error codes and the expected fact values to the narrator, not prompts or unrelated data. At most two
rewrites within the request, token and time budgets; re-check every mode after each rewrite. Then the approved
template for the trigger and mode, if the evidence is valid and the card is still timely: `fallback = true`,
`verified = false`; `facts_checked` lists the template facts checked. No valid evidence → no public line.

Tests inject wrong values, missing claims, swapped same-valued claims, wrong units, unsupported wording, score from
context, wrong ordinal, wrong press direction, duplicate keys, wrong match, stale context and numeric words.

## 4. Translations (`es`, `hi`, `fr`)

Translated lines keep the English claims list unchanged and are re-checked with §1 after locale normalisation:
decimal comma → point (`0,15` → `0.15`, Spanish and French), Devanagari digits → ASCII digits (Hindi), and
locale percent spacing (`71 %`). Every number of the English line must appear exactly once with the same value.
Spelled-out numbers in the target language are rejected. Then a meaning check per language batch (§2). A failed
language uses the translated template (also checked) or is suppressed for that card; English is never suppressed
because another language failed.
