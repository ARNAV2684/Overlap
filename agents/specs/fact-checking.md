# Fact-checking spec

> **Status: draft for review.** First shot-cluster slice; governs `fact_checker.py`.
> [S1](../../plans/active/PLAN_agents_ai-insights-mcp_S1.md) · [contracts §§5.1, 10](../../CONTRACTS.md).

## 1. Numeric check

Validate evidence before text: identity, source/window/period, unique allowed fact keys, finite numeric types
(booleans are not numbers), count integer >=3, duration exactly 5, decimals 0 and the duration's unit `min`.
Reject missing/extra facts for this slice; do not let duplicate keys overwrite each other.

For each line:
1. Validate mode/language/length and the exact `{mode,lang,text,claims}` shape. Claims are `{key,value}`.
2. Require exactly two numeric occurrences, written as plain Arabic integers, in count-then-duration order.
   Count is immediately described as shots or attempts; duration as minutes/min. No percentages, ordinals,
   ranges, score lines, clock strings, fractions, digit grouping or scientific notation in this first profile.
3. Require exactly two corresponding ordered claims: `shots_last_5min`, then `window_duration_min`.
   Equal numeric values still require distinct keys/occurrences; matching a bag of values is insufficient.
4. Check each value against the evidence rounded to its `decimals` using decimal arithmetic, half-up rounding.
   These facts have decimals 0 and must already be integers; reject malformed evidence rather than repair it.
5. Reject spelled-out numeric/quantity claims (e.g. three, twice, third, both, half), extra numeric expressions,
   or unsupported unit/context wording. M1's narrow English profile is deliberate, not a general numeral parser.

Team names are resolved from the allowlisted immutable context; require the expected team when naming one. Do
not splice arbitrary labels, markup, event IDs or instructions into a public line. The count/duration template is
also checked. Context score, source time and player shirt numbers are not evidence facts and cannot be narrated.

## 2. Semantic check

A separate structured model verdict assesses the interpretation and each variant against only the two evidence
facts and permitted names. Output: `{pass:boolean,interpretation_supported:boolean,lines:[{mode,pass:boolean,reasons:[string]}]}`;
exactly the two modes, at most three short reasons per mode. Any missing, invalid or inconsistent verdict fails.
Overall pass requires supported interpretation and both line passes, as well as the independent deterministic check.

Allowed meaning: this team has made repeated shooting attempts during the stated window. Reject inferred
opponent tactics, increased pressure/possession, better shot quality, momentum growth versus an unobserved earlier
window, player ability, a likely goal, or a causal explanation unsupported by these facts. Even though the
underlying example includes a goal, this profile does not provide a citable goal fact.

Deterministic claim checks plus this review reduce risk; model agreement is not proof of truth. A blinded
human-reviewed evaluation set must assess unsupported claims, including zero-number claims.
An unavailable semantic checker cannot mark model text verified. The approved factual template may still be used.

## 3. Rewrites and fallback

Return bounded error codes and expected fact values to the candidate generator, not private prompts or unrelated
match data. At most two rewrites, further limited by the global request/token/time budgets. Re-check both variants
after every rewrite. Never keep the first variant if the paired result failed under this atomic two-mode profile.

After failure use the approved team/count/duration template for both modes if evidence and identity remain valid
and the card is still timely. Set `fallback=true,verified=false`; `facts_checked` still lists successfully checked
template facts. No valid evidence -> no public line, not a plausible fallback.

Future tests must inject wrong counts, missing duration claims, swapped same-valued claims, wrong units,
unsupported comparative wording, duplicate keys, wrong match, stale/future context and numeric words.
See [examples](examples/shot-cluster.md) and [evaluation](evaluation.md).

## 4. Translations

Deferred; English-only output. Other languages, local number formats and ordinal grammar cannot reuse this
checker without a separately agreed specification and native-language evaluation. Never label them supported now.
