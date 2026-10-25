# Observability spec: tracing, Azure AI Evaluation, Content Safety

> **Status: built, not yet run on Azure** (25 Oct 2026). Governs `telemetry.py`, `safety.py` and
> `evals/foundry_quality.py`. Everything here is off by default; nothing is deployed by this change. The Azure numbers
> in §3.4 are placeholders until the run on Azure.

## 1. Settings

| Setting | Default | What it does |
|---|---|---|
| `OVERLAP_TRACING` | `off` | `azure`: spans and Agent Framework's `gen_ai` metrics to Application Insights; `console`: printed locally; `off`: nothing set up |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | (unset) | Where `azure` tracing sends. Already set on both Functions apps by `infra/modules/functions.bicep` |
| `OVERLAP_CONTENT_SAFETY` | `off` | `azure`: screen verified model lines with Azure AI Content Safety (§4) |
| `OVERLAP_CONTENT_SAFETY_ENDPOINT` | (unset) | The Content Safety (or multi-service AI) resource, `https://…`; managed identity, no key |
| `OVERLAP_CONTENT_SAFETY_REJECT_AT` | `4` | A line with any category at this severity (2, 4 or 6) or above uses its template |
| `OVERLAP_CONTENT_SAFETY_TIMEOUT_S` | `1.5` | Per-line screen time limit |

**To turn tracing on in Azure (the next deploy):** add one app setting to the insights Functions app,
`OVERLAP_TRACING=azure`. The connection string is already there. The packages are in `functions/requirements.txt`.
Application Insights has a daily cap (`infra/modules/monitoring.bicep`, 0.5 GB), and a full match is a few thousand
spans, well inside it.

Setup runs once per process (`runtime.agent_deps`). Any setup failure (missing connection string, exporter error)
is logged and tracing stays off; it never stops a card.

## 2. Spans

Agent Framework's own instrumentation (`agent_framework.observability`) is turned on with its providers
(`configure_otel_providers`) and the Azure Monitor exporters. Sensitive capture is forced off whatever
`ENABLE_SENSITIVE_DATA` says, so its `invoke_agent` and `chat` spans carry the model, token counts and durations but
never messages, instructions or replies. Our spans add the football context around them.

One trace per card: the job span is the root and every other span is in the same trace.

| Span | When | Attributes (besides `overlap.match_id`, `overlap.moment_id`, `overlap.trigger`) |
|---|---|---|
| `overlap.job {moment_id}` | every job (moment or recap) | `overlap.stages`, `overlap.workflow`, `overlap.status`, `overlap.reason`, `overlap.verified`, `overlap.fallback`, `overlap.audiences` |
| `workflow.run`, `executor.process {stage}` | Agent Framework's workflow spans | its own |
| `overlap.stage {agent}` | each of the seven agents' stages | `overlap.agent`, `overlap.stage.reused` (a resumed job's saved output), `overlap.terminal`, `overlap.reason`, `overlap.decision`, `overlap.model`, `overlap.context`, `overlap.verified`, `overlap.model_calls`, `overlap.model_calls_ok`, `overlap.lines`, `overlap.lines_fallback`, `overlap.rewrite_rounds`, `overlap.dropped`, `overlap.tools` |
| `overlap.model_call {agent}` | each structured model call (`RunState.ask`) | `overlap.agent`, `overlap.prompt_version`, `gen_ai.request.model`, `overlap.ok`, `overlap.reason` (`timeout`, `budget`, `breaker_open`, `invalid_output`…); error status when not ok |
| `invoke_agent {agent}`, `chat {model}` | Agent Framework, inside the model call | `gen_ai.*`: model, max tokens, token usage, response model |
| `overlap.tool_call {tool}` | each MCP tool call by the analyst | `overlap.agent=analyst`, `gen_ai.tool.name`, `overlap.tool.args` (ids only, e.g. `team_id=KES`), `overlap.tool.status` (`ok`, `after_moment`, or the error type) |
| `overlap.content_safety` | each line screened (§4) | `overlap.line_id`, `overlap.ok`, `overlap.max_severity`, `overlap.reason` |

Never on a span: prompts, payloads, model replies, line text, tool reply data, keys or tokens. Reasons are short codes,
capped at 200 characters. `tests/test_telemetry.py` checks this with in-memory exporters, including Agent Framework's
own spans with `ENABLE_SENSITIVE_DATA=true`.

### 2.1 Queries (Application Insights, Logs)

Our spans are internal spans, so they land in `dependencies`.

```kusto
// time per agent stage over a match
dependencies
| where name startswith "overlap.stage" and customDimensions["overlap.match_id"] == "SYN-3001"
| summarize n = count(), p50 = percentile(duration, 50), p95 = percentile(duration, 95)
    by agent = tostring(customDimensions["overlap.agent"])

// model calls by agent and outcome
dependencies
| where name startswith "overlap.model_call"
| summarize n = count() by agent = tostring(customDimensions["overlap.agent"]),
    ok = tostring(customDimensions["overlap.ok"]), reason = tostring(customDimensions["overlap.reason"])

// one card end to end
dependencies
| where customDimensions["overlap.moment_id"] == "MO-3001-0012"
| project timestamp, name, duration, success, operation_Id
| order by timestamp asc
```

The end-to-end transaction view (open any `overlap.job` span) shows the seven stages, the MCP calls and the model
calls as one timeline.

## 3. Azure AI Evaluation of published lines

`evals/foundry_quality.py` takes a sample of published English lines with the evidence they were written from and
scores them with the Azure AI Evaluation evaluators (`azure-ai-evaluation`): `GroundednessEvaluator` (the line against
the evidence), `RelevanceEvaluator` (the line against the task) and `FluencyEvaluator`. The judge is the Foundry
deployment (`OVERLAP_AZURE_OPENAI_*`, Entra ID, no key), run as a reasoning model. It is independent of our own
fact-checker: a second opinion on lines that already passed it.

It runs only when asked: without `--run` it writes the sample and stops. Each line costs three model calls.

```text
uv sync --group foundry-evals
# after a live run on Azure (block A), from the Cosmos outboxes of the matches played:
uv run python -m evals.foundry_quality --cosmos --match SYN-3001 SYN-3002 --out evals/results/foundry-1 --sample 60 --run
# or from bench results on disk:
uv run python -m evals.foundry_quality --results evals/results/round-1/matches --out evals/results/foundry-bench --run
```

### 3.1 The sample

Lines published in English that the fact-checker verified and that are not fallbacks (model lines). With
`--include-templates`, template lines are added as a baseline and reported apart (`kind`). Up to `--sample` lines
(default 60), spread across triggers in turn, then modes. The recap is left out (its evidence is the whole match).

For each line the evaluators receive:

- `response`: the line as published.
- `context`: the moment's evidence as the agents saw it: teams, players, trigger, period, clock and every fact as
  `label: value unit`.
- `query`: the task, e.g. "Write one short live-commentary line for an analytics-minded fan about this shot cluster
  moment for Kestlebury United at 65:34 (period 2), using only the facts given."

### 3.2 Output format (in `--out`)

| File | Content |
|---|---|
| `input.jsonl` | The exact sample, one line each: `sample_id` (`<moment_id>\|<audience group>`), `match_id`, `moment_id`, `trigger`, `mode`, `kind` (`model` or `template`), `response`, `query`, `context` |
| `rows.jsonl` | Per line: the ids above, `response`, and for each metric `{score (1–5 or null), result (pass, fail, not_applicable, error), threshold (3), reason, seconds}` |
| `summary.json` | `created_utc`, `source`, `judge_model`, `evaluators`, `lines`; `by_metric.{groundedness,relevance,fluency}` = `{n, mean, pass_rate, errors, not_applicable, threshold}`; `by_kind`, `by_trigger`, `by_mode` = mean per metric and `n` |
| `report.md` | The same as tables |

A line passes a metric at 3 or above (the evaluators' default threshold). An evaluator that fails is an `error` for
that line and is not retried; errors are counted, never dropped.

### 3.3 Placeholder for `docs/evaluation.md`

The section below is for `docs/evaluation.md`; the numbers are filled in from `summary.json` after the run on Azure.

```markdown
## Independent judge: Azure AI Evaluation

On top of our own fact-checker, a sample of published lines was scored by the Azure AI Evaluation evaluators on our
Foundry gpt-5-mini deployment: groundedness (is every statement supported by the moment's evidence?), relevance (does
it answer the task?) and fluency. Scores are 1–5; a line passes at 3 or above.

| Metric | Lines | Mean | Pass rate |
|---|---|---|---|
| Groundedness | _n_ | _x.x_ | _xx%_ |
| Relevance | _n_ | _x.x_ | _xx%_ |
| Fluency | _n_ | _x.x_ | _xx%_ |

Sample: _n_ English model lines from matches _SYN-…_, spread across triggers and modes (`evals/foundry_quality.py`,
results in `agents/evals/results/foundry-1/`). The judge sees only the facts the agents saw. Lines are synthetic
commentary on synthetic matches.
```

### 3.4 Results

Not run yet. Block A runs it once on Azure after the proving run and commits `agents/evals/results/foundry-1/`.

## 4. Content Safety screen (optional)

With `OVERLAP_CONTENT_SAFETY=azure`, after the fact-checker has verified the model lines (`fact_checker.run`, after the
rewrites), each verified line is sent to Azure AI Content Safety (`analyze_text`, categories hate, self-harm, sexual,
violence). A line with any category at `OVERLAP_CONTENT_SAFETY_REJECT_AT` or above is replaced by its template, like a
line that failed the check. A screen that errors or takes longer than its time limit also sends the line to its
template, so no unscreened model line is shown while the screen is on. Templates are not screened (our own wording);
translations are made from screened English lines.

The fact-checker's saved output gets `safety: {line_id: {ok, max_severity, categories?} | {ok: false, reason}}`.

Turning it on needs a Content Safety (or multi-service AI) resource and the `Cognitive Services User` role for the
Functions identity; neither is in `infra/` today, so it stays off unless block A adds them. Lines are short football
commentary on synthetic matches, so the expected effect is none; the screen is a guard, not a filter we rely on.
