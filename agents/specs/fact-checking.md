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
   ordinals (`2nd`, `6th`). Each must be covered by a claim in text order. Reject spelled-out quantities in English
   (three, twice, third, both, half), ranges, fractions, digit grouping and scientific notation.
3. Each claim's key exists in this moment's facts; its value **equals the stored fact value** (already rounded by the
   producer at its `decimals`; never re-round the raw number, because the producer rounds halves to even).
4. Units follow the fact: `xG` (never `%`), `m`, `min`, `%` (value already 0–100); facts without a unit are plain
   counts or rates.
5. Meanings the code can check:
   - a score line is allowed only as `team_goals_match`–`opponent_goals_match` (goal and penalty packs), never from
     `context.score`;
   - "from the spot" / "penalty" wording on a goal needs `shot_is_penalty = 1`;
   - "hat-trick" needs `player_goals_match = 3`; an ordinal goal count equals `player_goals_match`;
   - "down to N" equals `team_players_on_pitch`;
   - "more"/"harder" vs "less" for pressing must agree with `pressures_per_opp_pass_last_5min` compared with
     `pressures_per_opp_pass_previous_10min`; "up from"/"down from" likewise for momentum shares.
6. Names come only from `context.teams` and `context.players`; no IDs, markup or instructions in a public line.

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
Because the target word order can move numbers, the unit checks pair each number with an unused claim of the same value, preferring one whose unit fits it (5 high regains and a 5-minute window: "5 minutes" is the window). Spelled-out numbers in the target language are rejected. Then a meaning check per language batch (§2). A failed
language uses the translated template (also checked) or is suppressed for that card; English is never suppressed
because another language failed.
