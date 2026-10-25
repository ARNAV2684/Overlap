# Foundry tracing, Azure AI Evaluation and an optional Content Safety screen

| Field | Complete this |
|---|---|
| Change | Agent Framework OpenTelemetry to Application Insights (job, stage, model-call and MCP tool-call spans); an Azure AI Evaluation script for published lines; an optional Content Safety screen of verified model lines |
| Why | Workstream W4 of the 25 Oct parallel workstreams brief: show the multi-agent flow in Foundry and Application Insights, and add an independent quality judge, for the submission |
| Author / owner | Arnav (layer 5 · Agents, from `plans/REGISTRY.md`) |
| Status | Built; PR open for review (#100). Code only: nothing deployed, nothing run on Azure |
| Reviewed commit | main · 924292e |
| Branch | `agents/foundry-observability` |
| Governing spec | [`agents/specs/observability.md`](../../agents/specs/observability.md) (new; status "built, not yet run on Azure", not yet agreed) |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `agents/telemetry.py` | Add | Exporter setup behind `OVERLAP_TRACING`, span helpers, traced MCP context |
| `agents/safety.py` | Add | Content Safety screen behind `OVERLAP_CONTENT_SAFETY` |
| `agents/evals/foundry_quality.py` | Add | Sample published lines with their evidence; groundedness, relevance and fluency; dry run unless `--run` |
| `agents/specs/observability.md` | Add | Settings, span catalogue, queries, evaluation output format, `docs/evaluation.md` placeholder |
| `agents/config.py` | Modify | Tracing and Content Safety settings, validated |
| `agents/runtime.py` | Modify | Model-call span; `Deps.safety`; tracing set up once in `agent_deps` |
| `agents/workflow.py` | Modify | Job and stage spans |
| `agents/analyst.py` | Modify | MCP calls through the traced context |
| `agents/fact_checker.py` | Modify | Screen verified lines when the screen is on |
| `agents/run_match.py` | Modify | Close the screen's client |
| `agents/README.md` | Modify | The new settings and files |
| `agents/pyproject.toml`, `agents/uv.lock` | Modify | OpenTelemetry SDK, Azure Monitor exporter, Content Safety; `foundry-evals` group |
| `agents/tests/test_telemetry.py`, `agents/tests/test_safety.py`, `agents/tests/test_foundry_quality.py` | Add | In-memory exporters, fake evaluators and fake Content Safety client |
| `functions/moment_trigger.py` | Modify | Close the screen's client |
| `functions/requirements.txt`, `functions/pyproject.toml`, `functions/uv.lock` | Modify | The same runtime packages |
| `functions/local.settings.example.json` | Modify | `OVERLAP_TRACING` and `OVERLAP_CONTENT_SAFETY` off |
| `plans/active/PLAN_agents_foundry-observability.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. No change to `CONTRACTS.md`, job or outbox shapes (the fact-checker's
  saved output gains an optional `safety` key only when the screen is on). Not touched: `agents/context.py`,
  `agents/embedded_context.py`, `infra/**`, the web start and replay files.
- **Conflict scan:** On 25 Oct the scope report listed overlaps with the agents build plans (S3–S6), the live insight
  moments plan and the screen relay and archive flow plans. All of them are file-level only, through shared files
  (`config.py`, `runtime.py`, `workflow.py`, `README.md`, the lock and requirements files). #99 (local release fixes)
  conflicted in `config.py`, `runtime.py` and `workflow.py`. It was merged in at 589c0d3, keeping its `duration_ms`
  timings beside the spans.
- **Done when:** agents and functions tests pass (244 and 20), ruff is clean, and `uv sync --locked` passes for both
  projects. With the defaults nothing is exported or screened. After block A sets `OVERLAP_TRACING=azure`, each card
  appears in Application Insights as one trace with the seven stages. Block A then runs `evals/foundry_quality.py
  --run` once and commits `agents/evals/results/foundry-1/`.
- **Risk:** extra latency or import cost on the Functions app once tracing is on. Mitigation: exporters batch off the
  request path; imports happen only when a setting asks; the Content Safety screen has a 1.5 s per-line limit and stays
  off.
- **Handover:** PR #100 into `main`, not merged. Block A: add `OVERLAP_TRACING=azure` to the insights Functions app on
  the next deploy, then run the evaluation once after the proving run.
