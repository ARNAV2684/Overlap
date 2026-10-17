# Agent workflow spec

> **Status: draft for review.** First shot-cluster slice. Governs `workflow.py`, `state.py`, `fallbacks.py`.
> Owner: Pranav; storage/delivery decisions require Arnav and upstream/downstream owners.
> [S1 plan](../../plans/active/PLAN_agents_ai-insights-mcp_S1.md) · [proposed contracts §10](../../CONTRACTS.md).

## 1. Chain and boundaries

`immutable moment -> validate/admit -> bounded MCP context -> draft two lines -> check -> durable outbox -> publish`.

| Stage | Input | Output / failure |
|---|---|---|
| Validate | §10.2 immutable moment | Identity/version/window/fact validation; invalid -> rejected, no model call |
| Spotter policy | Valid shot cluster + job/budget state | Admit, dedupe, suppress expired/over-cap; no model call |
| Context | Bound match/moment/version | Real `get_match_state` MCP response; transient/missing source -> template if evidence/name source is valid; identity/version/scope conflict -> reject |
| Analyst + narrator | Two facts, permitted team names and scoped context | One model call for bounded interpretation and casual/analyst §5.1 lines |
| Numeric check | Each line and evidence | Ordered claim coverage and value/unit equality, or rejection reasons |
| Semantic check | Interpretation, both lines, evidence and permitted context | Separate model verdict with per-line support; no pass on malformed verdict |
| Rewrite | Failed candidate + bounded reasons | At most two candidate rewrites; each repeats both checks |
| Director | Checked model pair or approved template pair | One §10.3 overlay and a durable publication intent |
| Publisher | Outbox + current base playhead | Persist audience deliveries, send/recover; terminal outcome per audience |

Roles are logical responsibilities, not seven separately hosted agents. This first slice combines analyst/narrator
in one structured candidate request to bound calls. See [agents](agents.md), [prompts](prompts.md) and
[fact-checking](fact-checking.md). Model output never directly executes a tool, changes an ID or publishes a card.

## 2. Shared state and storage

Keep the stats source `kind=moment` immutable. Agent state is a separate document in `moments`, same match partition,
`id=job:<moment_id>`, `kind=insight_job`. This avoids overwriting the evidence or retriggering on every agent output.

Required job fields: match/moment IDs; schema/evidence version; immutable source content hash; `state`;
`first_seen_utc`, `deadline_utc`; lease owner/expiry; attempt counts and reserved/actual token counts;
validated MCP projection/provenance; current candidate and verdicts; terminal reason; publication ID.
The hash covers the application source object using UTF-8 JSON with sorted keys, compact separators and no NaN;
exclude Cosmos system fields. A changed source under an existing ID is a terminal conflict.

States:
`pending -> running -> delivery_pending -> published | partially_expired | expired`.
Before delivery, terminal states also include `rejected`, `suppressed`, `failed`. Published means SDK/service
acceptance for both audiences, not browser display. Persist only bounded audit fields, not hidden reasoning.

A conditional create claims the job once; lease acquisition/updates use ETags and a monotonically increasing
lease generation. Lease lasts 6 wall seconds, renew every 2 seconds while active. Losing the lease prevents new
calls and commits; responses from an old lease generation are discarded. Recovery never resets the original
deadline or attempt budget. A completed
job ignores repeated notifications. An attempt may execute twice after a crash; external calls are not exactly once.

Before each model request, transactionally reserve its call/token allowance with the per-match budget document
in the same `moments` partition. On ambiguous failures retain the reservation: do not reclaim unknown consumption.
Record successful usage; release only known unused reservations. Retries consume allowances too.

After validation, atomically write `delivery_pending` and `id=outbox:<moment_id>`, `kind=insight_outbox` containing
the immutable overlay, source hash and both audience targets in the same `moments` partition. A dispatcher
idempotently transfers to `overlays` using §10.4; there is no cross-container atomicity assumption. Check existing
content before treating a repeated write as success. Only delivery outcomes advance the job's publication status.

This is a proposal for Arnav's review. A later implementation plan must name its adapters and containers explicitly;
the current archive/relay files are not edited or assumed to implement it.

## 3. Timing and limits

All values below are **proposed**, unmeasured defaults for owner review. A timeout never authorises fabricated text.

| Limit | Proposed value / behaviour |
|---|---|
| Moment workflow deadline | 15 wall seconds from first durable observation, including queue wait; persist once |
| MCP | 2 seconds/call, at most 2 calls including one transient retry |
| Model request | 4 seconds or remaining deadline minus 1 second for fallback, whichever is smaller |
| Total model requests | At most 6 per moment, covering initial candidate/check and two rewrite/check pairs; transient retries consume the same cap |
| Prompt/output cap | At most 3,000 input tokens and 800 generated tokens/request; no silent truncation of evidence |
| Match budget | At most 12 admitted model jobs, 50 model calls and 200,000 total metered/reserved tokens; a separately approved monetary cap is also mandatory |
| Concurrency | 1 running job per match, 2 globally; at most 2 queued per match; suppress oldest queued overflow durably |
| Freshness | Same period and <=300,000 match ms behind playhead, per §10; unknown playhead -> hold within deadline, then suppress |
| Display | Up to 6 wall seconds at 1x and 20x; remove early if live eligibility ends |
| Performance target | p95 checked-overlay-ready latency <=8 wall seconds; browser display latency measured separately |

Budgets are independent stop conditions, not promises that every moment gets model output. Actual model billing
may include reasoning/cached tokens; M3 must validate metering and include all billable categories in reservations.
No Azure request is enabled until deployment, identity, quota, rates and a monetary limit have written approval.
Model-disabled fixture work remains labelled as such.

Do not subtract wall timestamps from `match_ms`. A 15-second inference can age content by 300 match seconds at
20x, so end-to-end evaluation must record late suppressions and latency, not silently move `show_at_ms` forward.
Expiry wins over displaying a stale fallback.

## 4. Failure recovery

| Failure | Required result |
|---|---|
| Invalid evidence / identity / conflicting source | Reject, record code, no tool/model/publication |
| Missing/transient context or model disabled/outage/quota | Use validated immutable team name and the approved count/duration template; otherwise suppress |
| MCP denied scope, version mismatch or inconsistent context | Reject and record the integration error; do not hide it with a template |
| Bad candidate or semantic failure | Rewrite within both attempt and time budgets; then template |
| Budget exhausted / deadline too close | Stop model calls; template only while still eligible; record fallback reason |
| Storage unavailable before claim/outbox | Do not send; retry within durable deadline when state is available |
| Crash after outbox save | Dispatcher resumes the same publication identity |
| Crash after service send before acknowledgement save | Resend same group seq/overlay ID; receiver dedupes |
| One audience accepted, other expired | Retain individual outcomes; mark partially_expired; do not duplicate the accepted card |
| Restart beyond deadline / period boundary | Suppress or expire; never reset lifetime |

Fallback: `<team name> have taken <shots> shots in the last <duration> minutes.` Both values come from validated
facts; run the deterministic check even on templates. `verified=false,fallback=true` and a visible template label
are mandatory. Reason stays in audit state, not an invented public overlay field.

## 5. Triggering and approval

See [moment trigger](../../functions/specs/moment-trigger.md). Use at-least-once notifications plus idempotent state.
The workflow's own job/outbox writes never create a new job. Local polling and later change-feed adapters call the
same entry point; neither transport alone establishes completed processing.

D1–D4/D6 decisions and the dependency specs must be agreed before code. Azure access/budget gates only M3.
M2 can establish a real, fixture-backed MCP call after its tool/source specification is accepted.
