# Agents

A Microsoft Agent Framework workflow on Microsoft Foundry. It runs only on flagged moments, never on every event.

## Run

```bash
uv sync                    # Python 3.12; Microsoft Agent Framework core 1.22.0 + OpenAI client 1.17.0
uv run pytest              # no model or network calls
uv run python smoke.py     # one call through the configured provider; settings in infra/local/env.example
uv run python ../functions/moment_trigger.py --match SYN-0508 --once   # run a played match's moments from Cosmos
uv run python run_match.py --match SYN-0508 --report out.json        # one match through the agents, re-checked
uv run python run_match.py --fixture                                 # the same on the stats fixture SYN-1017
uv run python check_delivery.py --match <id> --club <teamId> --player <playerId>   # two viewers during a live match
uv run python -m evals.bench --matches ../data/generated/bench --out <dir>/matches  # the evaluation bench
uv run python -m evals.report --bench <dir>/matches --out evals/results/round-1     # recall, accuracy, faults, latency
uv run python -m evals.review_sheet --results <dir>/matches --out evals/review/round-1   # Azeem's sheets
uv run python -m evals.gold import --sheets evals/review/round-1 --out evals/gold/round-1.json   # his answers
uv run python -m evals.live_run --match <id> --out evals/results/live-<id>   # after a local live run
```

**Evaluation (`evals/`):** generated matches (each storyline and a control) go through the stats replay and the
agents; the report covers detection recall from independent labels, storyline hits against controls, numeric
accuracy, fault injection and latency. Round 1: [`evals/results/round-1/report.md`](evals/results/round-1/report.md);
Azeem's sheets: [`evals/review/round-1/`](evals/review/round-1/).

**Delivery:** `publisher.py` is the single sender on every audience group. For each outbox it checks the card
against the playhead (`match_state`), reserves the group's next `seq` together with the delivery document in one
Cosmos transaction (`overlays`), then sends it through Web PubSub (the stand-in locally) and marks it sent; late
cards expire without a number. Recaps go out at full time, player tags when a player first crosses a speed or
distance threshold. The stand-in serves the insights snapshot for late joiners. The local poller runs it after the
agents.

**The seven agents:** the **spotter** applies code rules (fixed priority; moments of the same event merge into the
highest-priority one; comparison moments thinned when the model budget is tight; model-job slots per match) and,
behind `OVERLAP_SPOTTER_RANK`, a small-model ranking of normal moments. The **analyst** reads context through the
real MCP server (Agent Framework `MCPStdioTool`, bound to the moment) and writes an interpretation without numbers.
The **narrator** writes English lines for casual, analyst, each club and each followed player. The
**fact-checker** checks every number in code, then the meaning with a separate model call, sends failures back
for at most two rewrites, then uses the line's template. The **translator** translates with Azure AI Translator
(names kept), re-checks every language and asks a model to confirm the meaning. The **director** (rules only)
builds one overlay body per audience group. At full time the **recap writer** writes the recap from a fact pack
built by code. Any model failure falls back to the template for that step only. Prompts: `prompts/*.md` (sent as
the agents' instructions; each job records the prompt version and model).

**Jobs (one per moment):** the moment trigger (`functions/moment_trigger.py`; locally a poller on Cosmos `moments`,
on Azure the `moment_trigger` change-feed Function) validates each moment and claims `job:<moment_id>` once, with a
lease, so a duplicate notification or a second worker never runs it twice and a crashed run resumes from its last
saved stage. The seven stages run as an Agent Framework workflow and save their output on the job; the director's
result goes to `outbox:<moment_id>` before anything is sent. Model calls are reserved on `budget:<match_id>`. With
provider `off` every stage uses labelled templates (`fallbacks.py`), so the chain already produces checked lines.

**Model switch (settings only):** `OVERLAP_MODEL_PROVIDER=off` (default: every call refused, templates only),
`local` (Foundry Local on this machine: `OVERLAP_LOCAL_MODEL_URL`, `OVERLAP_LOCAL_MODEL`) or `azure` (Azure OpenAI in
Foundry: `OVERLAP_AZURE_OPENAI_ENDPOINT`, `OVERLAP_AZURE_OPENAI_DEPLOYMENT`, managed identity, no key). Every call
goes through `models.ModelGate`: per-moment and per-match budgets and a timeout. Plan:
[`PLAN_agents_insights-build`](../plans/active/PLAN_agents_insights-build.md).

**Tracing and screening (off by default):** `OVERLAP_TRACING=azure` sends Agent Framework's OpenTelemetry spans to
Application Insights (`APPLICATIONINSIGHTS_CONNECTION_STRING`): one trace per card, with a span per stage, model call
and MCP tool call, and no prompt or line text. `OVERLAP_CONTENT_SAFETY=azure` screens verified model lines with Azure
AI Content Safety. `evals/foundry_quality.py` scores a sample of published lines with Azure AI Evaluation
(groundedness, relevance, fluency), only when run with `--run`. See [`specs/observability.md`](specs/observability.md).

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/workflow.md`](specs/workflow.md) | The order of agents, what each receives and returns, shared state on the moment document, time budgets and timeouts, failure recovery and fallbacks, how a moment starts the workflow | `workflow.py`, `state.py`, `fallbacks.py` |
| 2 | [`specs/agents.md`](specs/agents.md) | Each agent's job, tools, output and model; cost per match | every agent file, `config.py` |
| 3 | [`specs/fact-checking.md`](specs/fact-checking.md) | How numbers and claims are verified, rewrites, translation checks | `fact_checker.py` |
| 4 | [`specs/prompts.md`](specs/prompts.md) | Shared rules for every prompt: tone per mode, grounding, what must never be said | `prompts/*.md` |
| 5 | [`specs/evaluation.md`](specs/evaluation.md) | How recall, numeric accuracy, quality and latency are measured | `evals/*.py` |
| 6 | [`specs/observability.md`](specs/observability.md) | Spans to Application Insights, the Azure AI Evaluation run, the Content Safety screen | `telemetry.py`, `safety.py`, `evals/foundry_quality.py` |

## Files

| File | Job |
|---|---|
| `workflow.py` | Runs the agents for one moment (and the recap) as an Agent Framework workflow, saving each stage on the job |
| `runtime.py` | Run state, dependencies and the model-call helper every agent uses |
| `context.py` | The MCP server as the analyst's tool (Agent Framework `MCPStdioTool`) |
| `prompts.py` | Loads `prompts/*.md` and their versions |
| `run_match.py` | One match through the agents with a report and an independent re-check |
| `publisher.py` | Sends cards, recaps and player tags to audience groups; seq per group, save before send, expiry |
| `check_delivery.py` | Two viewers on the local stack: live cards and late catch-up |
| `state.py` | Job, budget and outbox documents in Cosmos `moments` (or in memory): claim, lease, resume |
| `validate.py` | Checks a moment with the MCP reader's schema (one source of truth) |
| `spotter.py` | Is this worth saying? Code rules, then optional small-model ranking |
| `analyst.py` | Explain *why*, using the MCP stats tools |
| `narrator.py` | One line per viewer mode, with a claim for every number |
| `fact_checker.py` | Verify every claim; send failures back for a rewrite |
| `translator.py` | Other languages, numbers intact |
| `director.py` | Chart, timing, priority and audience for each overlay |
| `recap_writer.py` | The full-time recap |
| `fallbacks.py` | Labelled template lines for when an agent fails |
| `config.py` | Settings: provider, endpoints, timeouts, budgets, modes, languages |
| `models.py` | The chat client for the provider, and the gate every model call goes through |
| `telemetry.py` | Agent Framework OpenTelemetry to Application Insights: job, stage, model-call and tool-call spans |
| `safety.py` | Optional Azure AI Content Safety screen of verified model lines |
| `translation.py` | Azure AI Translator, or a local fake |
| `smoke.py` | One call through the configured provider |
| `prompts/` | One prompt file per agent |
| `evals/` | The bench, recall, numeric accuracy, fault injection, latency, Azeem's review sheet, the gold set, the report |
