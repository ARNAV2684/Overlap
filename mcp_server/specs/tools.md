# MCP tools spec

> **Status: agreed.** Scope: local M2 implementation only. #44 merged; on 18 October 2026 Pranav confirmed
> Azeem's source/trigger agreement, Arnav's storage agreement and authorised the local milestone. These are
> user-reported decisions, not newly obtained review comments. Owner: Pranav; registry update remains Arnav's task.
> Governs the files mapped in [S2](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md).
> Source contract: [§10.2](../../CONTRACTS.md#102-immutable-moment-and-context). Later cloud/model delivery gates remain.
> **20 Oct 2026 (D-02, stats S3 #54):** the reader accepts every moment the stats engine writes (§2a). Layer 5 is
> owned by Arnav from 20 Oct ([`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md)).


## 1. Tool list

| Tool | Reads | Purpose |
|---|---|---|
| `get_match_state` | the bound moment in `moments` | The teams and score captured at this exact moment (frozen context) |
| `get_live_state` | `match_state` (`state`) | Latest score, phase, panel team numbers and team totals; `after_moment` when newer than the moment |
| `get_player_context` | `match_state` (`state`) | One player's match numbers: minutes, goals, shots, xG, passes, distance, top speed, sprints |
| `get_team_pressing` | archived panel `stats-<minute>` at or before the moment | Pressing grid and pressing rates over the last 10 minutes |
| `get_pass_network` | the same archived minute panel | Most frequent passing links (up to 40) |
| `compare_periods` | archived panels at the moment's second and 10 minutes earlier | A team's panel numbers then and now, same half only |

None computes metrics or produces prose. `season` stays unadvertised until a `season` producer exists. Every tool
returns context for the analyst; narrated numbers still come only from the moment's `evidence.facts`.

## 2. Tool definition and examples

Description: "Read the immutable match context captured for this exact moment. It is not the latest state.
Numeric context is not additional evidence for narration. Unavailable context must not be guessed."

Input JSON Schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "match_id": {"type": "string", "pattern": "^SYN-[0-9]{4}$"},
    "moment_id": {"type": "string", "pattern": "^MO-[0-9]{4}-[0-9]{4}$"},
    "evidence_version": {"type": "integer", "const": 1}
  },
  "required": ["match_id", "moment_id", "evidence_version"]
}
```

IDs must have the same numeric match portion and equal the workflow's bound identity. Callers cannot supply a
different cutoff, SQL, container name or arbitrary file path. Example:

```json
{"match_id":"SYN-1017","moment_id":"MO-1017-0001","evidence_version":1}
```

Every result has `status`, `match_id`, `moment_id`, `evidence_version`. No unknown application fields.

| Result | Additional fields / meaning |
|---|---|
| `status=ok` | `as_of:{event_seq,period,match_ms}`; `state` is exactly the context in contracts §10.2 (with `players` when the moment has them); `provenance:{source,document_id}` where source is `fixture` or `cosmos` |
| `status=unavailable` | `reason`: `not_found`, `version_mismatch`, `source_not_ready`, `context_mismatch`, `source_timeout`, `response_too_large`, `source_error`; no state |
| `status=denied` | `reason=outside_scope`; no state or indication whether another match exists |

`as_of` must equal the immutable source cursor and the bound evidence's period/time. Source event seq is positive;
scores are nonnegative integers; team IDs are distinct and names are nonempty strings of at most 80 characters.
The client validates the output against its declared output schema and the expected evidence before model use.
Missing or inconsistent context is not a successful empty state. Complete result examples and negative cases:
[shot-cluster example](../../agents/specs/examples/shot-cluster.md).

Transport result uses MCP `structuredContent` plus an equivalent JSON text content block for compatibility.
Declare input/output schemas at discovery. A domain `unavailable` is an expected result, not a fabricated answer.
Malformed arguments / unknown tools are protocol errors; execution failures may use `isError`, which the client
must handle as failure regardless of text. A library returning normally must not turn a failed tool into success.

## 2a. Accepted moment documents (D-02)

The reader validates the whole stored moment before projecting its context. It accepts exactly what the stats
engine writes ([`stats/agents-guide.md`](../../stats/agents-guide.md) §2–§5,
[`stats/specs/evidence-packs.md`](../../stats/specs/evidence-packs.md)) and rejects everything else.

- **Triggers:** `goal`, `red_card`, `penalty`, `big_chance`, `shot_cluster`, `momentum_swing`, `press_change`,
  `milestone`. `sprint` is not accepted until the stats engine produces it (deferred, stats D-01).
- **Facts:** 2–7 per pack, unique keys, exactly the trigger's required keys plus its optional ones (only
  `press_height_last_5min_m` for `press_change`). Each key has a fixed unit (`xG`, `m`, `min`, `%`, or none — then
  the `unit` field is absent) and fixed `decimals` (0 or 2). Values are finite, non-negative and already at their
  decimals; whole-number facts are integers; `%` ≤ 100; `xG` ≤ 1; `shot_is_penalty` is 0 or 1;
  `shots_last_5min` ≥ 3; `window_duration_min` = 5.
- **Events:** 1–500 `event_ids` of the same match, strictly ascending by `seq`, ending with the triggering event
  (`source.event_seq`).
- **Players:** `player_ids` are distinct and of the moment's team; at least one for `goal`, `red_card`, `penalty`,
  `big_chance`, `shot_cluster` and `milestone` (comparison triggers may have none). `context.players` is optional
  (the constructed sample predates it); when present its entries are `{player_id, name, pos}`, distinct, each one of
  `player_ids`, `pos` one of the generator's positions.
- **Window:** `to_ms` equals the moment's `match_ms` and `from_ms ≤ to_ms`; exactly five minutes for
  `shot_cluster`, `momentum_swing` and `press_change`.
- **Shot cluster** keeps §10.1 exactly: the shot count equals the number of events, and shooters ≤ shots.
- **Ids:** the engine numbers moments in processing order across all triggers, so the fixture's KES cluster is
  `MO-1017-0013`. `samples/MO-1017-0001.json` is a constructed sample from before stats S3 and stays valid.

Evidence: `tests/test_real_moments.py` parses all 21 moments the engine writes for its fixture match
(`tests/data/SYN-1017-moments.json`) and rejects broken variants.

## 2b. Analyst tools (M2)

Every analyst tool takes the session's bound identity (`match_id`, `moment_id`, `evidence_version`), plus
`team_id` (`get_team_pressing`, `get_pass_network`, `compare_periods`) or `player_id` (`get_player_context`). A
request for another match or moment, or a team or player not in this match, is denied without a read.

Reply: `{match_id, moment_id, evidence_version, tool, status, as_of: {event_seq, match_ms}, after_moment,
provenance: {source, container, document_id}, data}` on success; `{…, status: unavailable|denied, reason}` on
failure, with no data. Rules:

- **Point reads only**, in database `live`: `match_state/state`, and `stats/stats-<match_ms 9 digits>` (archived
  panels, one per match second, a `heavy` block every whole minute). No queries, no writes.
- **Time:** history tools never read past the moment and stay in the moment's period; a missing panel is
  `not_found`, never interpolated. `get_live_state` and `get_player_context` read "now"; `after_moment` is `true`
  when `match_state.source.event_seq` is later than the moment's, and later numbers are never the moment's cause.
- **Fields are allowlisted**; a field the engine did not compute (for example speed and distance without tracking)
  is left out, never zero.
- **Limits:** the same per-call deadline and output limit as `get_match_state`; two attempts per tool per session.

## 3. Data access and time boundary

- Read a single `moments` document with partition key `match_id` and id `moment_id`, restricted to `kind=moment`.
  This store and publisher schema are **proposed** in contracts §10.2; they do not exist merely because this spec does.
- Verify source/evidence/context identity, schema/evidence version, period and time; return the allowlisted projection.
  Do not return job/outbox documents, raw labels/extra fields, storyline names/answer keys or complete match setup.
- No read of mutable `screen`/`match_state`, final match result, entire season, or event suffix beyond the moment.
  No cross-partition queries. No calculating missing metrics in MCP.
- A fixture adapter uses the exact proposed immutable-document shape, from a fixed configured fixture directory.
  Report `source=fixture`; never silently fall back from Cosmos to fixtures. Switching source is explicit.
- MCP credentials are read-only; workflow/publisher write credentials are a separate capability. Emulator keys do
  not enforce production RBAC, so emulator tests prove application restrictions, not Azure authorisation.
- No cache for M2. Later caching needs full identity/version keys and explicit invalidation rules.

## 4. Limits

Proposed limits: input <= 1 KiB; output <= 12 KiB UTF-8; one point read; no paging/truncating a success response;
2 seconds per call; one retry only for timeout/transient source errors, within the workflow deadline. At most two
calls per moment including retry. Never retry a validation error, denied scope or incompatible version.

The workflow binds `match_id/moment_id/evidence_version`; a model request cannot expand them. Cancellation closes
the pending operation. Logs contain IDs, duration, source and error code, never credentials or raw model prompts.

## 5. Connection and authentication

M2 uses the official Python MCP SDK over **stdio**, launched by an explicit, allowlisted local workflow command.
No network port or tunnel. The local MCP client must complete initialise, tools/list and tools/call; a direct Python
function call alone is not an MCP integration test. Pin SDK/dependency versions in the later M2 implementation PR.

The operating-system process boundary and configured scope are local access controls; the tool does not claim
public-client authentication. One bound session per job prevents one match's calls from reading another's context.
Future remote hosting needs a separate authenticated transport and deployment spec.

M3 keeps this MCP client and orchestration local while sending approved evidence/context to the Azure model.
The local client executes tool calls; Azure does not need inbound access to the laptop. Do not configure a
server-hosted MCP feature to reach localhost.

Technical references checked during S1: [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[Agent Framework MCP tools](https://learn.microsoft.com/en-us/agent-framework/agents/tools/local-mcp-tools).
Exact framework APIs/version compatibility are verified and pinned in M2/M3; this draft installs nothing.


## 6. Local seed and workflow smoke (S2)

- Keep source JSON unchanged under `mcp_server/samples/`, with generator hashes in a separate provenance file.
  These are constructed samples derived from Azeem's recording, not output from a working stats producer.
- The separate seed command accepts only a loopback emulator endpoint and database `live`, container `moments`,
  partition `/match_id`. It may create these resources if absent. It creates a document once, reads it back, and
  checks equality. An identical existing source succeeds; different content fails without replacement. It never
  clears a container or changes other documents. Only this command has application-level write operations.
- The reader has no create/upsert/query methods. Cosmos transport uses the async SDK with hidden retries disabled;
  the tool has at most two point-read attempts per bound session, each bounded by two seconds including initial
  SDK connection work. Only transient storage failures/timeouts retry. Wrong scope never reads. Additional calls
  after the allowance return `source_not_ready`. No silent fixture fallback.
- Local configuration restricts Cosmos to loopback, ignores the relay's `OVERLAP_COSMOS_CONTAINER=screen`, and
  always chooses `moments`. Model/cloud SDKs and tokens are not required or loaded. Emulator credentials cannot
  demonstrate production read-only RBAC.
- Reject duplicate JSON fields in fixture files, non-finite values, booleans in integer fields and unknown source
  fields. Strip only documented Cosmos system fields. Source documents have a 64 KiB bound; MCP application
  results retain the 12 KiB bound. The source's labels and team names are untrusted data, never instructions.
- Source validation checks IDs, versions, two facts, event count/order, shooter identities, window, source cursor
  and context consistency. It cannot reconstruct event timestamps/score from the moment alone; those are verified
  for the curated sample against the source recording and remain the stats producer's responsibility for live data.
- The smoke client first loads evidence from the selected store and compares the sample oracle. It launches a
  scoped real stdio server, initialises, discovers exactly one tool, calls it, validates schema/status/bound cursor
  and context, and checks text/structured parity. Failed protocol/tool/domain results produce a nonzero exit.
- A successful report is atomically written outside tracked source under `data/generated/insights/`. It records
  sample status, source hash, evidence and MCP projection, with `model_called=false` and `live_delivery=false`.
  This is an offline M2 handoff, not narrated output, an overlay, or a running Agent Framework workflow.
- SDK/dependency versions are locked in this project. MCP 1.30.0 uses the supported v1 maintenance API; no claim of
  compatibility with future Agent Framework versions is made. Evaluate/pin that adapter during M3.
