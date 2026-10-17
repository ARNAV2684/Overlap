# Evaluation spec

> **Status: draft for review.** First shot-cluster slice; governs `evals/*.py`.
> [S1](../../plans/active/PLAN_agents_ai-insights-mcp_S1.md). All runtime results below are **required future checks**,
> not tests passed by this documentation draft.

## 1. Recall and provenance

Pin generator commit/tree, seed, clubs, match ID, kickoff, storyline inputs and hashes of source setup/events.
Use Azeem's generated clubs; [the worked example](examples/shot-cluster.md) is derived from one real generator
recording, not the legacy mock and not a running stats service.

Build an independent labelled set from the ordered event log using the agreed §10.1 rule, including period
warm-up, interval boundaries and cooldown. Report separately: eligible moments, detected moments, admitted model
jobs, verified cards, template cards, suppressed/expired cards and displayed cards. Detection recall is detected /
eligible; displayed coverage is displayed / eligible. A zero denominator is N/A, never 100%.

Generator storyline keys can help label later scenarios but must remain in the evaluator only. Do not feed answer
keys to tools/models or claim that detecting a configured storyline proves general tactical understanding.

## 2. Numeric accuracy and failure cases

Before M3 acceptance use at least 30 labelled inputs: ten valid clusters from at least three generated matches,
ten numeric/schema faults and ten unsupported-meaning/context faults. The single documentation example is not
this dataset. Include same-valued count/duration, interval boundary, wrong match, later-event same timestamp,
half-time, duplicate source conflicts and budget/time failures.

Hard requirement: no incorrect numeric or unsupported claims published in the agreed evaluation set. Record
false rejections and template/suppression rates, so suppressing everything cannot masquerade as useful accuracy.
Test real MCP initialise/list/call separately from direct tool functions. Fixture results say `fixture`; store
integration must point-read an actual agreed local store with the same bounded source.

Recovery tests: duplicate/concurrent notification, crash after claim, source retry, crash after outbox save,
partial audience sends, ambiguous send retry, restart beyond deadline. Exactly-once external calls are not an
acceptance claim. No fake browser/inspector success substitutes for an actual rendered insight.

## 3. Quality

Review both English variants blind to generator answer keys. Judge factual support, readable wording, whether
the line adds a useful observation, and whether the fallback label is visible. Proposed rubric 1–5; median >=4
for supported/readable output, with no unsupported published claim in the reviewed set. Owners agree examples
and thresholds before M3; a judge/model score is not a guarantee.

Foundry groundedness/fluency evaluation is an optional diagnostic, not a required paid dependency for M1/M2.
If used in M3, record evaluator version, deployment, cost and calibration against human judgments. It cannot
override deterministic rejection. No deployment/evaluator choice is approved by this spec draft.

## 4. Latency, speed and spending

Instrument source publication, first durable job observation, tool call, model calls, validation, outbox commit,
service send and actual card-render acknowledgement. Use wall clocks for elapsed durations; document clock skew
when endpoints are on different machines. Report queue delay separately. SDK send success is not display latency.

Measure p50/p95/max and sample size; report verified, fallback and suppressed outcomes separately.
Proposed ready-overlay p95 target <=8 wall seconds; absolute workflow deadline 15 seconds. Both are unmeasured.
At 1x and 20x replay the same recording: evidence identities/counts stay equal; visible coverage may differ because
latency/expiry is wall-time-sensitive. Report that difference instead of changing observation timestamps.

Log calls and all provider-metered token categories, including retries and reasoning where billed. Test budget
exhaustion without paid calls; then measure actual rates/usage only after D5 approval. Reserved unknown spend
after a failed request is not assumed free.

M4 passes only with the actual stats producer -> MCP/workflow -> delivery -> Vedant's real card, plus the failure
checks. Running old screen/archiver tests proves those components, not this new insight path.
