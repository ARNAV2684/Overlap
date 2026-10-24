# Local release fixes — 24 October 2026

Branch: `fix/local-release-readiness`. Base: `dec477f` (Azure Wave 2 / open PR #95), isolated checkout
`work/overlap-release-fixes`. No merge, deployment, paid model calls or archive modification performed. Publication as a review PR was subsequently authorized.
Previous local timing work remains in the original checkout. These changes need team review before deployment.

## Implemented
- Real per-moment MCP protocol sessions in memory (`embedded`, now default), avoiding fresh Python subprocess
  imports. Existing stdio remains configurable. No cross-moment state sharing or new network endpoint.
- At most two parallel narrator batches. Successful lines survive a sibling failure; existing per-call deadlines,
  durable budgets, evidence validation and fact checking remain mandatory.
- Monotonic model/stage timing and offline summary from the earlier local milestone.
- Shared Blob lease admission, durable ID allocation and pending execution records BEFORE ARM starts. Unknown
  outcomes remain blocked for operator reconciliation. Named executions must be terminal before another start.
- Persistent 3-per-network-visitor/hour and 6-global/hour admission caps. Visitor hashes are not authentication;
  the global cap limits identity rotation. Cross-site requests are rejected.
- Explicit paused/live flag; read-only availability probe before showing the start button.
- Read-only stale-live filtering (180-second heartbeat/setup grace) and home-page recovery when a quiet clock moves.
  No matches are deleted or marked finished artificially.

## Local evidence
- Agents: 189 passed. MCP server: 135 passed, 2 opt-in checks skipped.
- Web regression suite: 554 passed, 2 existing opt-in checks skipped before adding the separately run lease check.
- Real isolated Azurite: 20 independent clients -> one start; restart sees the same reservation; next terminal
  execution gets the next ID. 8 admission tests passed including that integration test.
- TypeScript, web lint, Python lint, diff whitespace, local webpack production build and Bicep compilation passed.
- Built app with live disabled: availability GET returned 200/false; start POST returned 503; cross-site POST returned 403.
- Disposable Azurite and local production test server were stopped after validation.
- Real MCP fixture benchmark (open + get_match_state + close, milliseconds):

| Transport | First sample (includes client imports) | Later samples |
|---|---|---|
| stdio | 983.07 | 571.68, 570.55, 556.99 |
| embedded | 108.24 | 24.45, 22.72, 21.55 |

These are local fixture measurements from one short run, not Cosmos latency or Foundry model performance.
Parallel narrator tests prove overlap and partial-failure recovery using controlled replies, not model quality.

## Deployment prerequisites (not executed)
Review Bicep's new `match-control` container and container-scoped web Blob Data Contributor role. Provision those
before the patched web image. No write permission is added to tracking archives. Enable OVERLAP_LIVE_ENABLED only
when the pipeline is actually resumed. Rebuild/deploy Functions for embedded MCP and narration changes, and web
for admission/UI changes, after review. Publication for review is authorized; merging and deployment remain excluded.

## Recovery and remaining validation
Unknown start outcomes intentionally stop further public starts. An operator must inspect ARM and the pending
record under a lease, correlate or prove no execution remains possible, and preserve counter/quota history.
Do not delete the control blob, reset IDs, or clear pending solely because it is old.

Managed-identity authorization, real Azure ARM response/consistency, actual Foundry narration latency, translation
quality and full-match/reconnect browser acceptance remain unverified by this local work. Run those in an approved
cloud test window. The availability probe checks job/container existence, not complete downstream health.
Legitimate long pauses can disappear from the live list until a fresh heartbeat arrives.
Embedded MCP removes OS process separation; it is for trusted bundled code, not public clients. Narrator prompt
duplication may increase tokens; hard budgets still apply and later calls may fall back.

PR #95 is the base, not merged here. PR #96 exact-file overlap is agents/specs/agents.md, mcp_server/specs/tools.md and web/specs/screens.md;
combine only after team review and rerun acceptance tests. Registry ownership is unchanged.

## Publication review
Fresh remote check: main remains `b18297f`; PR #95 remains open at `dec477f` on `infra/azure-wave1`.
This PR targets that branch to isolate the fixes; retarget to main after #95 lands and recheck the diff.
Current main is already an ancestor, so no integration merge is needed. #96 is still open; its exact-file
overlap is the three specifications listed above. No teammate approval or cloud readiness is claimed.
