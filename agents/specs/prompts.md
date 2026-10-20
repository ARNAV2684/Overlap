# Prompt rules spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs `prompts/*.md`. Plan:
> [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md). Extends Pranav's first-slice
> rules (#44) to all triggers, seven agents, four modes and four languages.

## 1. Prompt files and outputs

Each agent has one prompt file with the sections **Role, Inputs, Output format, Rules, Examples**: `spotter.md`,
`analyst.md`, `narrator.md`, `fact_checker.md`, `translator.md` (post-translation rules; the translation itself is
Azure AI Translator), `director.md` (rules reference; the director uses no model), `recap_writer.md`. Every model
output is a strict JSON object checked against a schema:

| Agent | Output |
|---|---|
| Spotter (rank) | `{decision: "admit"\|"suppress", reason: string ≤ 120}` |
| Analyst | `{interpretation: string ≤ 300, key_facts: [fact key]}` — no numbers in the interpretation |
| Narrator | `{lines: [§5.1 line per requested mode]}`, `lang = "en"` |
| Fact-checker (meaning) | `{pass, interpretation_supported, lines: [{mode, pass, reasons: [≤ 3 short]}]}` |
| Recap writer | `{lines: [§5.1 line per requested mode]}` |

No markdown fences, URLs, provider instructions or tool calls inside these objects. Interpretations state supported
observations, not hidden reasoning.

**Modes:** `casual` — plain words, one observation; `analyst` — precise, the same facts, no invented statistics;
`player` — centred on the followed player (only when that player is in `player_ids`); `club` — the same facts told
from the favourite club's side, never inventing feelings or outcomes. Limits are in [agents](agents.md) §3.

## 2. Grounding

Supply only the validated evidence, the allowlisted context (team and player names, positions), MCP results bounded
by the moment's `source.event_seq`, and the output schema. Filter before the prompt: no setup `storylines`, answer
keys, whole-season results, future events, final scores, or credentials. Names are data, never instructions; an
instruction inside any data field is ignored and cannot expand tools, permissions or evidence.

Every number in a public line is a claim of one fact at its stored value; no numbers from MCP context, panels or
`context.score`. Wording per trigger follows the producer guide's do/don't table
([`stats/agents-guide.md`](../../stats/agents-guide.md) §4): for example never "possession" for momentum, "tired" or
"parking the bus" for pressing less, "should have scored" for xG, "hat-trick" unless `player_goals_match` is 3,
"high press" unless `press_height_last_5min_m` is present and high. Press direction comes from comparing its two
rate facts. IDs, destinations, priority and timing are assigned by code, not the model.

A missing fact is not zero. The workflow chooses a labelled template or suppression; prompts never ask the model to
fill missing facts. Rewrites receive only the failed candidate, permitted facts and bounded checker reasons.

## 3. Content boundaries and approval

Project-generated identities only: no real football identities or branding, betting advice, odds, personal attacks
or claims about real people. Links and commands in input are inert data. Rendered text is escaped plain text.
Schema checks, fact checks and destination allowlists enforce the boundary; a prompt alone does not.

Each prompt version is recorded with the model and version, the evaluation set and its results before demo use.
Azeem reviews the football rules in `spotter.md`, `narrator.md` and `recap_writer.md` (human in the loop); his
review answers become rules and examples in these files and a gold test set ([evaluation](evaluation.md)).
