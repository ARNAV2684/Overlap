# AI insights workflow

Last verified: 2026-10-20 · main `a1cef33` plus open PRs #58–#62 (labelled) · source inspection; F2 live run recorded.

## Purpose

Turns a selected moment into a grounded explanation and eventually a verified card.

## Ownership

Registry: Arnav from 20 Oct (registry PR #60, open). See [registry](../../plans/REGISTRY.md). Pranav wrote the first-slice specs (#44) and the local MCP reader (#45).

## Inputs and outputs

Planned: stats moment in Cosmos → trigger → workflow asks MCP for context → evidence-grounded explanation/claim checks → delivery. Only evidence facts supply narrated numbers. Contract §§5–6, 10. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`agents/workflow.py`](../../agents/workflow.py), [`agents/narrator.py`](../../agents/narrator.py), [`agents/fact_checker.py`](../../agents/fact_checker.py), [`agents/director.py`](../../agents/director.py), [`functions/moment_trigger.py`](../../functions/moment_trigger.py).

Specifications: [`agents/specs/workflow.md`](../../agents/specs/workflow.md), [`agents/specs/fact-checking.md`](../../agents/specs/fact-checking.md), [`functions/specs/moment-trigger.md`](../../functions/specs/moment-trigger.md).

## Status and evidence

Build plan: [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md) (PR #61, open): seven agents (spotter, analyst, narrator, fact-checker, translator, director, recap writer), all eight triggers, modes casual/analyst/player/club, languages en/es/hi/fr, local first (Foundry Local) then Azure by settings. Specs updated in the same PR; contract extensions in `CONTRACTS.md` §10.6 (PR #62, needs Azeem and Vedant). M1 (model switch, branch `agents/model-switch`): `agents/` is a Python project; `config.py` settings, `models.py` (one Agent Framework `OpenAIChatCompletionClient` for Foundry Local or Azure, plus a budget and timeout gate), `translation.py` (Azure AI Translator or a local fake), `smoke.py`; 36 unit tests with no model calls. M2 (PR #65): six read-only MCP analyst tools. M3 (branch `agents/workflow`): one job per moment (`job:`, `budget:`, `outbox:` documents in `moments`, claimed once with a lease and resumed from the last saved stage), the seven stages as an Agent Framework workflow with labelled template stages, and the moment trigger (local poller; Azure change-feed Function `moment_trigger`). Live run on SYN-0508: 27 moments, 27 outboxes, a second run adds nothing. M4 (branch `agents/seven-agents`): the seven agents and their prompts — spotter (code rules, merge, thinning, model-job slots, optional small-model ranking), analyst (real MCP server through Agent Framework `MCPStdioTool`, no numbers in its interpretation), narrator (casual, analyst, a club line per team, a player line per followed player), fact-checker (full code check of numbers, units, score lines, ordinals, number words, trigger wording, then a model meaning check and at most two rewrites), translator (Azure AI Translator or fake, names kept, every language re-checked), director (one overlay body per audience group, player-tag crossings) and recap writer (full-time fact pack built by code). M5 (branch `agents/delivery`): the insights publisher (single sender per audience group, seq reserved with the delivery in one Cosmos transaction in `overlays`, save before send, expiry against the `match_state` playhead, recaps, player tags) and the stand-in's insights snapshot; checked live on SYN-0510 and SYN-0511 with two viewers. Azure hosting of the publisher is M7. Producer side is ready: moments are written live to Cosmos exactly as in replay (F2, SYN-0507, 24 moments identical, 20 Oct).

Evidence / checks to inspect: [`plans/active/PLAN_agents_ai-insights-mcp.md`](../../plans/active/PLAN_agents_ai-insights-mcp.md), [`plans/active/PLAN_agents_ai-insights-mcp_S2.md`](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [stats-engine](stats-engine.md), [storage](storage.md), [mcp](mcp.md), [environments](environments.md).

Downstream / consumers: [web-pubsub](web-pubsub.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Model access, bounded budget and stats producer integration are later gates. Graphify work does not resume this paused feature.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Pranav (team-reported; registry unassigned); see Ownership above | Local MCP context is available; workflow, model and live card execution remain future work. | [Specification](../../agents/specs/workflow.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### AI-01

| Field | Value |
|---|---|
| Review/input needed from | Vedant |
| Request | Review the agreed card contract against the actual UI: period, mode/language, expiry, delivery group and reconnect behaviour. |
| Connected component | [frontend](frontend.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | An explicit frontend compatibility response linked to the delivery spec; a real card round trip is a later test. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Upstream producer dependency: [MCP-01](mcp.md#mcp-01). This must be satisfied before claiming real stats-to-explanation integration.

[Project map](README.md) · [Rebuild and verification](setup.md)
