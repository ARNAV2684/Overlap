# Moment trigger spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs `moment_trigger.py`. Plan:
> [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md) ·
> [workflow](../../agents/specs/workflow.md). Extends the first slice (#44) to every trigger.

## 1. Trigger and local/Azure adapters

Proposed source is the immutable `kind=moment` document in `live/moments`, contracts §10.2, not a raw Event Hub
event, finished archive or model-generated record. Only the supported schema/evidence version and the eight
triggers the stats engine writes (`stats/agents-guide.md` §3) proceed; `sprint` is ignored until it exists. All `insight_job`, `insight_outbox`, budget and counter records are ignored as new-moment triggers.

Local M2 fixture tests invoke the same validated handler explicitly. Later local integration uses an explicit
runner polling `kind=moment` for the configured match every 1 wall second, with bounded pages (100) and full
continuation handling. Proposed maximum 200 source moments/match in this slice; exceeding it fails admission
visibly instead of silently skipping a page. No polling of unrelated matches.

Later Azure integration uses a Cosmos change-feed trigger with a separate lease store and managed identity.
Arnav agrees the host/bindings, container creation and package boundary in its implementation PR. The adapter
durably creates/locates a job, then returns; it does not keep the change-feed callback waiting on model generation.
No Functions registration, host settings or existing relay/archiver code is changed in S1.

## 2. Duplicate safety (not exactly once)

Notifications are at least once. Conditional create of `job:<moment_id>` in the same match partition claims a
stable identity. Verify the source hash/version when that job already exists. Jobs/outboxes are separate from
the immutable source, so updates do not recursively create moments. Duplicate source payloads reuse the job;
conflicting payloads are quarantined/reported, never overwritten.

The runner scans pending/recoverable jobs at least every 1 second with pagination and ETag leases. Delivery recovery
scans pending outboxes/deliveries every 2 seconds. A worker crash after notification acknowledgement must still
leave a durable recoverable job. Event notification checkpointing alone does not mean the insight was completed.

## 3. Retries and recovery

Follow workflow §2–§4: persistent first-seen deadline, bounded attempts, ETag leases, budget reservation before
external calls, durable outbox before sending. Infrastructure failure before durable job creation must be retried
by the source adapter; do not acknowledge and lose the moment. Invalid source documents get a durable rejection
record/counter and no model call; failure to save that result is a retryable infrastructure failure.

No new job on replay of the same source. No paid model-call retry without reservation. After deadline or live
expiry, persist the terminal reason and suppress rather than retry forever. Recovery after an ambiguous send
reuses the same audience seq/overlay ID. Source retention must cover retries and judging; Arnav decides resource
retention in the deployment plan (this spec does not add TTL or delete data).

Tests required later: repeated notifications, agent-write notification, simultaneous workers, lease expiry,
restart before/after outbox persistence, malformed source, failed checkpoint/claim, pagination and Azure host
binding validation. Fixture polling does not prove Azure change-feed/managed-identity behaviour.
