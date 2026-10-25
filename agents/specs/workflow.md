# Agent workflow spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs `workflow.py`, `state.py`,
> `fallbacks.py`. Plan: [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md).
> Extends Pranav's first slice (#44) from `shot_cluster` to all eight triggers and seven agents; its state, lease,
> budget, outbox and recovery design is unchanged. [Contracts §10](../../CONTRACTS.md).

## 1. Chain and boundaries

`immutable moment -> spotter -> analyst (MCP context) -> narrator -> fact-checker -> translator -> director -> durable outbox -> publish`;
`full time -> recap writer -> fact-checker -> translator -> director -> outbox -> publish`.

| Stage | Input | Output / failure |
|---|---|---|
| Validate | §10.2 immutable moment | Identity/version/window/fact validation; invalid -> rejected, no model call |
| Spotter | Valid moment + job/budget state + recent admitted moments | Code rules admit/merge/suppress; optional small-model rank of normal moments ([agents](agents.md) §1) |
| Context | Bound match/moment/version | Real `get_match_state` MCP response; transient/missing source -> template if evidence/name source is valid; identity/version/scope conflict -> reject |
| Analyst | Evidence facts, names, MCP context | One model call: bounded interpretation (no numbers) and the fact keys that matter |
| Narrator | Facts, interpretation, names, requested modes | One model call: English §5.1 lines for `casual`, `analyst`, `player`, `club` |
| Numeric check | Each line and evidence | Ordered claim coverage and value/unit equality, or rejection reasons |
| Semantic check | Interpretation, both lines, evidence and permitted context | Separate model verdict with per-line support; no pass on malformed verdict |
| Rewrite | Failed candidate + bounded reasons | At most two candidate rewrites; each repeats both checks |
| Translator | Checked English lines | `es`, `hi`, `fr` lines via Azure AI Translator; each re-checked; failed language -> translated template or suppressed |
| Director | Checked lines or approved templates per mode and language | One §10.3 overlay per moment, deliveries per audience group, player tags; a durable publication intent |
| Publisher | Outbox + current base playhead | Persist audience deliveries, send/recover; terminal outcome per audience |

The seven agents are separate roles with their own prompts and outputs, recorded in the shared job document, and
run in sequence inside one job. They need not be separately hosted services. See [agents](agents.md), [prompts](prompts.md) and
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
| Model request | 4 seconds (6 on Azure, where in-process MCP freed the time; `OVERLAP_MODEL_TIMEOUT_S`) or remaining deadline minus 1 second for fallback, whichever is smaller |
| Total model requests | At most 12 per moment: spotter rank 1, analyst 1, narrator at most 2 concurrent chunks, semantic check 1, two rewrite/check pairs 4, semantic checks of translations 3; transient retries consume the same cap. Translator service calls are counted separately |
| Prompt/output cap | At most 3,000 input tokens and 800 generated tokens/request; no silent truncation of evidence |
| Match budget | Defaults: at most 12 admitted model jobs plus the recap, 120 model calls and 400,000 total metered/reserved tokens. On Azure (25 Oct): 30 jobs, 300 calls, 900,000 tokens, because a 20× match makes about 40 moments and 12 jobs capped the model-written share near 30% (about $0.10–0.15 a match on gpt-5-mini). The $25 Azure cap (Arnav, 20 Oct) also applies across all matches |
| Concurrency | 2 running jobs per match (started in moment order), 2 matches at once; at most 2 queued per match; suppress oldest queued overflow durably. One running job per match left bursts waiting behind a 7 s job until they went stale at 20× (25 Oct). The budget, jobs and outbox are ETag-guarded, so concurrent jobs of a match never double-count or double-publish. The translator runs es, hi and fr side by side |
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

Fallback: one approved template per trigger and mode, filled only from validated facts and context names.
Casual and analyst templates differ for every trigger (rule §4.1(e), 25 Oct): casual says it in plain words with at
most one number (`shot_cluster`: `<team name> keep shooting: <shots> shots in quick succession.`); analyst adds
the numbers behind it (`<team name> have taken <shots> shots in the last <duration> minutes.`; `red_card`:
`<team name> are down to <players>, with <fouls> fouls and <cards> cards in the match so far.`). Templates live in
`fallbacks.py`; run the deterministic check even on
templates, and translate them like any line. `verified=false,fallback=true` and a visible template label
are mandatory. Reason stays in audit state, not an invented public overlay field.

## 5. Triggering and approval

See [moment trigger](../../functions/specs/moment-trigger.md). Use at-least-once notifications plus idempotent state.
The workflow's own job/outbox writes never create a new job. Local polling and later change-feed adapters call the
same entry point; neither transport alone establishes completed processing.

D1–D4/D6 decisions and the dependency specs must be agreed before code. Azure access/budget gates only M3.
M2 can establish a real, fixture-backed MCP call after its tool/source specification is accepted.

### Local release fix: transport and narration latency

The default `OVERLAP_MCP_TRANSPORT=embedded` runs the existing bound MCP server and client over SDK in-memory
streams. Each job has its own immutable identity, reader, retry counters and server lifetime; no session is reused
for a different moment. It removes repeated Python subprocess imports, not the MCP protocol, schema validation or
read-only checks. `stdio` remains explicit compatibility mode. This is not a network endpoint.

Narration partitions requested line IDs into at most two disjoint chunks. Both calls run concurrently through the
same durable budget gate and original deadline, then combine in requested order. A failed chunk uses templates
only for its own missing IDs. Fact-checking and rewrite limits are unchanged. The 12-call limit still includes
retries, so a later optional call may fall back if exhausted. Increased prompt duplication may increase token
usage; there is no claim of lower model cost or measured Azure speed until cloud validation.
