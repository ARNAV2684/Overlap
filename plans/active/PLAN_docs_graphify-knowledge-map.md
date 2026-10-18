# Overlap — Shared architecture notes and Graphify

Author: Pranav Anand · Coordinator: Arnav · Tier: Full · Version: 1.0 · 2026-10-18

Status: M1 specification prepared for review; M2/M3 pending agreement and implementation.

Reviewed main: `cb3b3492abaf5acadb084b20cb30faba8b2d2828` (fresh fetch, 18 October).
Branch: `docs/graphify-knowledge-map`.

## 1. Purpose and intended outcome

Give every teammate readable notes for each architecture box and an explorable Graphify graph connecting documentation to source. Success means a teammate can identify a component's purpose, ownership, dependencies, evidence and next work without treating proposals as implemented functionality.

## 2. Current state and references

[Architecture](../../docs/architecture.md) is a placeholder at the reviewed revision. No existing Graphify configuration was found. [Contracts](../../CONTRACTS.md), folder specifications and [registry](../REGISTRY.md) remain authoritative. [PR #45](https://github.com/ARNAV2684/Overlap/pull/45) is open and describes local MCP work; its branch is not incorporated here. The registry still has unassigned stats/agents/MCP entries despite user-reported assignments; notes must retain that discrepancy until Arnav records decisions.

## 3. Scope and boundaries

M1 delivers only this plan and [the knowledge-map specification](../../docs/specs/knowledge-map.md). M2/M3 deliver eleven component notes, overview, manual Graphify setup and reproducibility evidence after specification agreement. No runtime source, protocol, deployment, model subscription, global hook or existing MCP change. AI/MCP development remains paused independently of this branch.

## 4. Ownership and dependencies

Pranav prepares this proposal. Documentation/tooling ownership remains unassigned (Arnav decides). Arnav coordinates registry and shared documentation review; existing component owners review their note content. User-reported assignments are labelled separately from registry ownership. Tool installation requires existing assistant access; Windows verification requires an actual Windows machine. Neither dependency blocks M1.

## 5. Proposed flow

Reviewed source + specs/contracts + component notes → manual Graphify generation → local HTML/JSON/report → team navigation and change-impact review. This flow is outside match processing and does not depend on running emulators or Azure.

## 6. Technical approach

Use Graphify-Labs, an isolated tool environment and a validated pinned release. Existing Codex/Claude access supplies document analysis; subscription limits still apply. No new keys or paid service. Notes in Git are reviewed truth; generated graphs are local, ignored derivatives. Preserve extracted versus inferred relationships. Native Graphify capabilities must be verified before claiming support; do not introduce custom executable helpers in this scope.

## 7. Contracts and compatibility

No application message shapes change. Note metadata, input exclusions, artifact provenance and failure handling are defined in the governing specification. Contract links name both producers and consumers. Graphify is separate from the product MCP server and cannot approve an interface or infer a test pass.

## 8. File map

| Milestone | Files | Action |
|---|---|---|
| M1 | `plans/active/PLAN_docs_graphify-knowledge-map.md` | Add plan and later record evidence |
| M1 | `docs/specs/knowledge-map.md` | Add proposed governing spec |
| M2 | `docs/knowledge/README.md`, `docs/knowledge/setup.md` | Add overview and verified setup |
| M2 | `docs/knowledge/{generator,event-hubs,screen-relay,archiver,stats-engine,storage,ai-insights,mcp,web-pubsub,frontend,environments}.md` | Add eleven notes |
| M2 | Reviewed configuration under `docs/knowledge/` | Name exact files in M2 sprint before creation, after tool validation |
| M2 | `docs/architecture.md`, `docs/README.md`, `.gitignore` | Link reviewed map; ignore generated output |

Only the two M1 files are changed by this PR. No ownership registry edits.

## 9. Failure handling and recovery

A stale or failed graph is not current evidence. Record source identity and coverage; unsupported parsing stays visible. Assistant quota exhaustion must not trigger paid API fallback. Exclude confidential/runtime inputs before processing. Local setup is removed by deleting its isolated environment/artifacts; application behaviour remains unchanged.

## 10. Work-specific requirements

Cover all eleven areas specified in the governing spec. Every note uses the same fields and links upstream/downstream. Separate merged, open-PR, proposed and historical state. Show the live screen, archive/replay and stats-to-insights paths independently. Notes refer to exact source revisions and test evidence rather than screenshots or architecture arrows as proof.

## 11. Acceptance criteria

- AC1 (M1): specification covers authority, fields, scope, input filtering, provenance, sharing and failures; document links resolve.
- AC2 (M2): eleven complete, linked notes; owners and status are evidence-backed or explicitly unresolved.
- AC3 (M2): interactive graph/report generated with pinned version, source metadata and exclusions; no automatic cloud fallback.
- AC4 (M3): actual macOS and Windows reproduction, staleness, exclusions, failure and cleanup checks recorded.
- AC5 (M3): teammate walkthrough traces all three flows and distinguishes PR #45 local MCP from future hosted insights.

No acceptance criterion proves runtime integration. M2/M3 tests remain pending.

## 12. Milestones and calendar

M1: specification-only review. M2: notes and validated manual generation after agreement. M3: cross-platform handover. Use separate implementation review for M2 and record the pinned release/exact configuration file map there. This plan does not promise completion dates. Protect the team's 20 October end-to-end target, 24 October feature target and 25–27 October freeze/submission period; cut custom visual enrichment first, never factual notes or source labels. Component implementation can continue independently.

## 13. Integration and conflict scan

Freshly fetched all origin branch references and compared their changed files against main. Open PR search returned #45 only. Scanned active-plan references and hot-file registry on 18 October at `cb3b349`.

| Area | Overlap | Resolution |
|---|---|---|
| New M1 files | No exact file overlap in fetched branches or open PR #45 | Keep isolated documentation branch |
| `plans/` | Housekeeping plan has broad shared-directory scope | Keep this plan active until implementation done; no moves/renames |
| `docs/` | Unassigned area in registry | Arnav agreement requested through this spec PR; no assumed approval |
| Future `.gitignore` | Frontend plan lists this shared path | Re-scan and coordinate before M2; no edit in M1 |
| #45 MCP branch | Existing plan changes, no exact M1 overlap | Link PR; do not import branch |
| `origin/web/live-api` | Frontend plan changed, no exact M1 overlap | Verify latest frontend status when writing notes |
| `origin/mock/live-viewer` | Separate historical viewer plan | Exclude from current-state inference |

No current M1 exact-file collision found. M2 requires a fresh scan; later branches and reviews may change this result. Documentation-owner approval remains pending.

## 14. Risks and decisions

Agreed with user: Graphify-Labs; notes plus graph; existing assistant access; no new paid service. Pending team review: governing spec and documentation ownership. Version/configuration feasibility is deliberately deferred to M2, not claimed validated. Windows availability may leave M3 incomplete; label it pending rather than claiming simulated cross-platform success. Inferred relationships and stale notes can mislead, so links and evidence labels are mandatory.

## 15. Review and handover

M1 author checks: scope mapped; no runtime/interface changes; current main recorded; conflict scan performed; exclusions and evidence boundaries specified. Arnav/component review and specification agreement are pending. No team approval is inferred from the user's execution request.

M1 validation: relative-link existence check passed for both documents; `git diff --check` passed. Runtime tests not applicable to this documentation-only change. M2/M3 setup, graph artifacts, release pin, screenshots and platform results: pending implementation.

The next implementation milestone starts after the governing spec is agreed. This is the explicit sequence in the user-approved plan, not a request to repeat execution permission.
