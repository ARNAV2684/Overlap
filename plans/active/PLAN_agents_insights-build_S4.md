# PLAN_agents_insights-build_S4 — the seven agents and their prompts (M4)

| Field | Complete this |
|---|---|
| Sprint | S4 — spotter, tactical analyst, narrator, fact-checker, translator, director and recap writer, with prompts, for all eight triggers, four modes and four languages |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M4 · AC-04 |
| Author / owner | Arnav |
| Status | Built; PR open for review |
| Reviewed branch and commit | main · 402c0b4 (M1 #64, M2 #65, xG fix #66, M3 #67 merged) |
| Planned branch | `agents/seven-agents` |

## 1. Outcome

- **What will work at the end of this sprint:** the M3 workflow runs real agents instead of template stages:
  - **Spotter:** code rules (fixed priority; same triggering event → the highest-priority moment shows, the others
    merge into its card and feed its analyst; comparison triggers thinned to one per team per 10 match minutes when
    the model budget is tight; model-job slots per match), then small-model ranking of the remaining normal moments
    behind a setting.
  - **Analyst:** reads context through the real MCP server (Agent Framework `MCPStdioTool`, bound to the match,
    moment and evidence version): `get_match_state` always, then the tools that fit the trigger (live state, player
    context, pressing, compare periods). Numbers after the moment are dropped. One model call: an interpretation
    with no numbers and the fact keys that matter.
  - **Narrator:** one model call writes English §5.1 lines for `casual`, `analyst`, a `club` line for each team and
    a `player` line for each followed player in `player_ids` (up to a set limit).
  - **Fact-checker:** the full numeric check of `fact-checking.md` §1 (numbers, score lines, ordinals, percentages,
    spelled-out numbers, units, meaning rules, names, no ids or markup), then one model meaning check; at most two
    narrator rewrites of the failing lines, then the labelled template for that line.
  - **Translator:** Azure AI Translator (fake offline) with names protected; each translated line is normalised
    (decimal comma, Devanagari digits, percent spacing) and re-checked; a meaning check per language; a failed line
    gets its translated template or that language is dropped for it.
  - **Director:** rules only: one overlay identity per moment, a §6/§10.6 overlay body per audience (mode, language,
    club or player), visual and highlight per trigger, `facts_checked`, `verified` / `fallback` per line, milestone
    player tag; player-tag crossing detection on `match_state` (sending is M5).
  - **Recap writer:** at full time, a recap fact pack built by code from the final `match_state` and the match's
    moments; one model call for the recap lines; checked and translated like any line; written to a recap outbox.
  - Every model call goes through the M1 gate (durable per-match budget, per-call timeout bounded by the moment's
    15 s deadline); any model failure falls back to the labelled template for that step only.
  - Prompts in `agents/prompts/*.md` are the runtime instructions (Role, Inputs, Output format, Rules, Examples);
    each job records the prompt versions and model used.
- **Not in this sprint:** sending (publisher, groups, insights snapshot, player-tag envelopes: M5); the evaluation
  bench and Azeem's review (M6); Azure (M7, on Arnav's go).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Workflow, job state, outbox, trigger | M3 (#67) | Yes |
| MCP analyst tools | M2 (#65) | Yes |
| Model switch and gate; Foundry Local with phi-4-mini | M1 (#64) | Yes |
| Agreed agents, prompts, fact-checking specs; §10.6 contract | #61, #62 | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `agents/config.py` | Modify | Settings: spotter ranking, model-job slots, rewrites, player-line limit, MCP command and source, player-tag thresholds | `agents.md` §8, `workflow.md` §3 |
| `agents/models.py` | Modify | `ask`: one structured (JSON, schema-checked) call through the gate with the deadline | `prompts.md` §1 |
| `agents/prompts.py` | Add | Loads prompt files, prompt version hashes | `prompts.md` §3 |
| `agents/prompts/*.md` | Modify | The seven prompts | `prompts.md` |
| `agents/spotter.py`, `analyst.py`, `narrator.py`, `fact_checker.py`, `translator.py`, `director.py`, `recap_writer.py` | Modify | The seven agents | `agents.md`, `fact-checking.md` |
| `agents/context.py` | Add | MCP context through Agent Framework's `MCPStdioTool`, bounded to the moment | `tools.md` |
| `agents/fallbacks.py` | Modify | Club lines per team, player lines per player, recap templates | `workflow.md` §4 |
| `agents/workflow.py` | Modify | Agent stages by default; per-line drafts; recap entry point | `workflow.md` §1 |
| `agents/state.py` | Modify | Model-job slots on the budget document | `workflow.md` §3 |
| `agents/translation.py` | Modify | Names kept untranslated (Translator dynamic dictionary) | `fact-checking.md` §4 |
| `functions/moment_trigger.py` | Modify | Builds the agent dependencies; runs the recap at full time in the local poller | `moment-trigger.md` |
| `agents/tests/*` | Add / modify | Every agent with a fake model and fake MCP; fault injection | `evaluation.md` |
| `agents/run_match.py` | Add | Offline run of a match's moments through all agents (AC-04 evidence) | `evaluation.md` |
| `agents/runtime.py`, `agents/context.py`, `agents/prompts.py` | Add | Run state and the model-call helper; the MCP server through `MCPStdioTool`; prompt loading and versions | `workflow.md`, `tools.md`, `prompts.md` |
| `agents/pyproject.toml` | Modify | `mcp==1.30.0` (the MCP server's pin), needed by `MCPStdioTool` | — |
| `agents/README.md`, `docs/knowledge/ai-insights.md`, this plan | Modify / add | How to run; status; handover | — |

## 4. Steps

1. Settings, structured call, prompt loader.
2. Fact-checker (code checks) with its fault-injection tests; templates extended to club, player and recap.
3. Spotter, analyst (MCP), narrator, meaning check and rewrites, translator, director, recap writer; prompts.
4. Wire the agent stages into the workflow and the trigger; recovery tests still pass.
5. Offline run on SYN-1017 and three recorded matches with Foundry Local; zero wrong numbers; record results.

## 5. Contracts and shared files

- **Contract changes:** none. Overlay bodies follow §6 + §10.6; recap lines follow §5.1; player tags follow §10.6.
- **Hot shared files touched:** none (`function_app.py` unchanged; the Azure recap trigger is M7 packaging).

## 6. Conflict scan

Scanned at `402c0b4` on 2026-10-20: no open PRs touch `agents/` or `functions/moment_trigger.py`.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-04a | Each agent's rules hold with a fake model and fake MCP: spotter merge, thinning and slots; analyst drops post-moment numbers and digits; narrator lines per mode, club per team, player per player; checker rejects every fault in `fact-checking.md` §3; rewrites then template; translator normalisation and drops; director bodies; recap pack and lines | Unit tests, no model or network | Pass: 139 agents tests (fact-checker 38 incl. every `fact-checking.md` §3 fault, names, translations in es/fr/hi; agents 31 with a scripted model and fake MCP) |
| AC-04b | Any model failure (off, timeout, budget, invalid JSON, schema breach) falls back to the template for that step only and never publishes an unchecked number | Fault-injection tests | Pass: off, timeout, budget, deadline, invalid JSON, inconsistent verdicts, translator down — each falls back for that step only |
| AC-04c | On SYN-1017 and ≥ 3 recorded matches, all seven agents run locally with Foundry Local and produce lines for four modes and four languages; zero wrong numbers in the outboxes | `run_match.py` + numeric re-check of every outbox line | Pass on SYN-1017 (fixture), SYN-0507, SYN-0508 with phi-4-mini on Foundry Local: 0 wrong numbers in 1,356 published lines (en/es/hi/fr, four modes) and in every recap; SYN-0509 rerun in progress (see handover) |
| AC-04d | The analyst reads context through the real MCP server process | Live run against the local Cosmos | Pass: on SYN-0507/0508 the analyst called the MCP server process (Cosmos source) for frozen context, live state, player, pressing and compare-periods tools |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| phi-4-mini quality and speed on this laptop | Many local lines fall back to templates; prompt quality is judged on Azure (agents.md §8) | — | No: AC-04c counts correctness, not wording quality |
| Player-tag sending needs a `match_state` watcher | Tags are detected here, sent in M5 | — | No |
| Azure recap trigger (change feed on `match_state`) | Local poller only until M7 | Arnav (M7) | No |

## 9. Handover

- **Built:** the seven agents (`spotter.py`, `analyst.py`, `narrator.py`, `fact_checker.py`, `translator.py`,
  `director.py`, `recap_writer.py`) with their prompts, `runtime.py`, `context.py`, `prompts.py`, `Models.ask`, the
  model-job slots, templates for every audience, the trigger wiring and `run_match.py`.
- **Local model runs (phi-4-mini, Foundry Local, 4 model jobs per match, 60–200 s per model moment on this laptop):**
  every model failure (invalid JSON, timeouts, provider errors) fell back for that step only; 0 wrong numbers.
  The verified-line rate is low on this small model (most model lines fail a check and use their template); prompt
  quality is judged on the Azure model (`agents.md` §8).
- **Found and fixed while running:** (1) a recap named a club from the prompt's example instead of the real
  opponent (score right, so the numeric check passed it): every capitalised word in an English line must now belong
  to the match's names, and the prompts say names come only from the input; (2) the independent re-check compared a
  fallback translation with the model's English line (a false alarm; the published numbers were right): it now
  checks a fallback translation against its own template.
- **SYN-0509:** its first rerun ran while Foundry Local was down after the laptop slept, so every call fell back
  (0 wrong numbers, but not a model run); the rerun with the restarted server is in progress and its result will
  be added to the PR.
- **Dependency:** `mcp==1.30.0` was installed from PyPI by an automatic `uv` sync before it was approved; it is the
  MCP server's existing pin.
- **Not done here:** sending (M5), the evaluation bench and Azeem's review (M6), Azure (M7).
