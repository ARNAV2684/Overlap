# Agents

A Microsoft Agent Framework workflow on Microsoft Foundry. It runs only on flagged moments, never on every event.

## Run

```bash
uv sync                    # Python 3.12; Microsoft Agent Framework core 1.22.0 + OpenAI client 1.17.0
uv run pytest              # no model or network calls
uv run python smoke.py     # one call through the configured provider; settings in infra/local/env.example
uv run python ../functions/moment_trigger.py --match SYN-0508 --once   # run a played match's moments from Cosmos
```

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

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/workflow.md`](specs/workflow.md) | The order of agents, what each receives and returns, shared state on the moment document, time budgets and timeouts, failure recovery and fallbacks, how a moment starts the workflow | `workflow.py`, `state.py`, `fallbacks.py` |
| 2 | [`specs/agents.md`](specs/agents.md) | Each agent's job, tools, output and model; cost per match | every agent file, `config.py` |
| 3 | [`specs/fact-checking.md`](specs/fact-checking.md) | How numbers and claims are verified, rewrites, translation checks | `fact_checker.py` |
| 4 | [`specs/prompts.md`](specs/prompts.md) | Shared rules for every prompt: tone per mode, grounding, what must never be said | `prompts/*.md` |
| 5 | [`specs/evaluation.md`](specs/evaluation.md) | How recall, numeric accuracy, quality and latency are measured | `evals/*.py` |

## Files

| File | Job |
|---|---|
| `workflow.py` | Runs the seven stages for one moment as an Agent Framework workflow, saving each stage on the job |
| `state.py` | Job, budget and outbox documents in Cosmos `moments` (or in memory): claim, lease, resume |
| `validate.py` | Checks a moment with the MCP reader's schema (one source of truth) |
| `spotter.py` | Is this worth saying? Classify and prioritise |
| `analyst.py` | Explain *why*, using the MCP stats tools |
| `narrator.py` | One line per viewer mode, with a claim for every number |
| `fact_checker.py` | Verify every claim; send failures back for a rewrite |
| `translator.py` | Other languages, numbers intact |
| `director.py` | Chart, timing, priority and audience for each overlay |
| `recap_writer.py` | Half-time and full-time recaps |
| `fallbacks.py` | Labelled template lines for when an agent fails |
| `config.py` | Settings: provider, endpoints, timeouts, budgets, modes, languages |
| `models.py` | The chat client for the provider, and the gate every model call goes through |
| `translation.py` | Azure AI Translator, or a local fake |
| `smoke.py` | One call through the configured provider |
| `prompts/` | One prompt file per agent |
| `evals/` | Recall, numeric accuracy, fault injection, latency |
