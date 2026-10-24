# Local release fixes

Status: Implemented locally; local checks passed; team/cloud review pending — user authorized local implementation; publication for review now authorized; no merge or deployment.
Baseline: Azure branch dec477f, isolated branch fix/local-release-readiness. Main remains b18297f.
Author: Pranav. Registry reviewers: Arnav (agents/MCP/relay), Arnav and Azeem (web); other infra unassigned, Arnav decides.
No teammate approval claimed. Open PR #95 contains this Azure base; #96 overlaps three specification files listed below.
Our patch must be reviewed against #96 before future publication. No merging of either PR in this work. Publication is stacked against infra/azure-wave1 while #95 remains open.

## Intent
Remove per-job Python subprocess startup using a real in-memory MCP client/server session, scoped to a single
moment with the existing tool validation and read-only reader. Keep stdio selectable for compatibility. Split
narrator output into at most two parallel calls, preserving deadline/token/call gates and fact checks.

Make public starts serial across replicas with a Blob lease and a durable pending reservation before calling
Azure. Unknown start outcomes block further starts until execution reconciliation or operator investigation.
Persist rate limits and monotonically allocated IDs. Add a global admission cap so client identity rotation
cannot bypass the per-visitor limit. Do not claim IP-based limits authenticate users.

Availability GET drives button visibility before interaction; explicit paused setting rejects POST server-side.
Filter stale live archive entries using recent match-state timestamps without mutating stored data.

## File boundary
Agents: config.py, context.py, embedded_context.py (new), narrator.py, runtime.py, workflow.py, evals/latency.py,
README.md, specs/{workflow,agents,evaluation}.md, tests/{test_agents,test_config,test_release_latency,test_readiness_timing}.py.
MCP: specs/tools.md (document the optional in-memory transport, unchanged tools/identity).
Web: src/lib/server/{start-match,start-control,archive-store}.ts, src/app/api/start-match/route.ts,
src/app/api/matches/route.ts, src/lib/match-list.ts, src/components/home/{StartMatchButton,HomeLive}.tsx,
src/lib/__tests__/{azure-routes,release-start,release-routes,match-list,matches-route}.test.ts,
specs/{realtime,screens}.md, README.md, .env.example.
Infra: modules/{storage,container-apps}.bicep, specs/security.md, README.md.
Docs: docs/release-readiness.md; this plan.

## Acceptance
Bound MCP scope/denial and cleanup work; no subprocess in embedded mode; timing comparison uses real MCP
fixture calls and labels cold vs warm. Narration calls overlap, partial failures retain successful lines and
existing gates/checks still apply. Cross-instance concurrent starts cause at most one start; ambiguous outcomes
never automatically restart; shared limits survive new instances; stale/paused states do not advertise live work.
No archive deletes, cloud activation, paid model calls, merges, pushes or deployment.

## Validation and handover
Local validation completed; evidence is recorded below and in docs/release-readiness.md. Cloud latency and managed-identity/Blob deployment verification cannot be claimed from local tests.


## Implementation handover
See docs/release-readiness.md for exact local evidence and limitations. Implementation was local; the user subsequently authorized publishing this branch and opening a review PR.
Local MCP benchmark demonstrates subprocess overhead removal; cloud model deadlines are not yet proven.
Tests: agents 189 passed; MCP 135 passed/2 skipped; web 554 passed/2 skipped; real Azurite admission suite 8 passed;
TypeScript/lints, webpack build and Bicep compilation passed. Paused production API returned GET 200/false, POST 503 and cross-site POST 403. Temporary test services were stopped. Existing legacy fixtures required a fixed Date.now in matches-route.test
so their epoch timestamps represent fresh data; a separate stale-data test asserts filtering without mutation.

PR #96 exact-file overlap at review:
- agents/specs/agents.md
- mcp_server/specs/tools.md
- web/specs/screens.md
