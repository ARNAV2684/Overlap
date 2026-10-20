# Agents spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs the role modules and `config.py`.
> Plan: [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md). Producer guide:
> [`stats/agents-guide.md`](../../stats/agents-guide.md). Replaces the first shot-cluster slice (#44), whose safety
> design (shared job state, leases, budgets, outbox, checks, templates) is kept in [workflow](workflow.md).

Seven agents with distinct roles share one job record per moment and hand off explicitly. Every moment type the
stats engine writes is in scope: `goal`, `red_card`, `penalty`, `big_chance`, `shot_cluster`, `momentum_swing`,
`press_change`, `milestone` (`sprint` is deferred by the stats engine). Numbers come only from the moment's
`evidence.facts`; names only from `context`.

Viewer modes: `casual`, `analyst`, `player` (lines centred on a followed player), `club` (the same facts told from a
favourite club's side). Languages: `en`, `es`, `hi`, `fr`.

## 1. Moment spotter

Decides which moments get a card. Two layers:
1. **Code rules** (always on), from the producer guide §4: validate the document; dedupe by `moment_id`; admit every
   high-priority moment (`goal`, `red_card`, `penalty`); when one event fires several moments, show the highest
   priority and pass the others to the same card's analyst as extra evidence; for `momentum_swing` and
   `press_change` keep at most one per team per 10 match minutes when the budget is tight; respect the per-match
   budget, freshness and expiry. Never re-detect or re-score a trigger (warm-ups and cooldowns are already applied).
2. **Small-model ranking** (behind a setting, on by default once a model is available): among the remaining normal
   moments, rank "worth a line" using the guide's football rules in the prompt; output admit or suppress with a
   short reason. Treat comparison triggers as "worth a line", never "the turning point".

Output: `admit` / `merge_into:<moment_id>` / `suppress` with reason. Priority comes from a fixed table, not the model.

## 2. Tactical analyst

Explains **why** the moment matters. Reads context through MCP tools ([tools spec](../../mcp_server/specs/tools.md)):
the moment's frozen context, the latest `match_state` (compared with the moment's `source.event_seq`; numbers after
the moment are never its cause), player context, pressing and pass network. Output: a bounded interpretation
(≤ 300 characters, no numbers, audited, not displayed) and the fact keys that matter. It may connect facts; it may
not infer intent, fitness, dominance or a prediction the facts don't support.

## 3. Narrator

Writes §5.1 lines `{mode, lang, text, claims}` in English for each requested mode from the facts, the analyst's
interpretation and the names. Limits: `casual` ≤ 140 characters, `analyst` ≤ 220, `player` ≤ 160, `club` ≤ 160.
Each number in a line is a claim of one fact, at its stored value. `player` mode is written only when the followed
player is in `player_ids`; `club` mode only for the two teams of the match. Wording rules per trigger come from the
producer guide §4 (do/don't table).

## 4. Fact-checker

Deterministic checks first, then a separate model meaning check; a meaning pass can never override a numeric
failure. Failures go back to the narrator (at most 2 rewrites), then a labelled template. Re-run on every
translated line. Rules: [fact-checking](fact-checking.md).

## 5. Translator

Translates checked English lines to `es`, `hi`, `fr` with Azure AI Translator (a local fake offline). Words only:
numbers, claims and names stay as in English. Every translated line goes back through the fact-checker; a failed
language gets the translated template or is suppressed for that card.

## 6. Director

Rules, not a model: priority and ordering (priority, then newer first); `show_at_ms = evidence.match_ms`,
`clock = evidence.clock`, `period = evidence.period`; highlight `team_id` and the last `event_id` (the team only for
`momentum_swing`); visual per trigger from the producer guide §4; one overlay identity per moment; one delivery per
audience group `match-<id>-<mode>-<lang>`; player tags to `match-<id>-player-<playerId>` when a followed player's
speed or distance in `match_state` crosses a threshold; expiry per [workflow](workflow.md) §3. No model-chosen
destinations, durations or chart names.

## 7. Recap writer

At full time (the final `match_state` after the last `PeriodEnd`): reads every `kind = "moment"` of the match in id
order and the final `match_state`, and writes a short recap per mode, checked and translated like any line. Facts
for the recap are the moments' facts and the final totals; storyline answer keys never reach it. Season-level recap
waits for a `season` container owner.

## 8. Model and resource decision

**Local first:** every model call goes through one client factory in `config.py`, selected by settings: Foundry Local
(OpenAI-compatible endpoint, small model) while building, Azure Foundry (GPT-5 mini, or the closest current mini
model) after Arnav's go. Same code; only endpoint, model or deployment name and authentication change (managed
identity on Azure; no keys in the repository). Azure spending is off until the switch, then capped at **$25** with a
budget alert; reasoning effort low. Unit tests never call a model. Local small-model output is for plumbing only;
prompt quality is judged on the Azure model.

Agent Framework runs the agents and attaches the MCP server as a tool. Pin its packages, and the provider SDK's,
when M1 is implemented (verify current names and versions on Microsoft Learn then).
