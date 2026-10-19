# Shared knowledge coordination and automatic publishing

| Field | Value |
|---|---|
| Author | Pranav |
| Review coordinator | Arnav |
| Tier / mode | Full · specification preparation; implementation deferred until agreement |
| Version / date | 1 · 19 October 2026 |
| Status | Ready for specification review; automation not implemented |
| Reviewed main | a61166b1628d3d87624e28489fc2bdc351181946 |
| Branch | docs/knowledge-sharing-spec |
| Governing spec | [Proposed knowledge-sharing spec](../../docs/specs/knowledge-sharing.md) |
| Related work | [#46](https://github.com/ARNAV2684/Overlap/pull/46) merged; [#47](https://github.com/ARNAV2684/Overlap/pull/47) open draft; [#48](https://github.com/ARNAV2684/Overlap/pull/48) open |

## 1. Purpose

Make component notes the team's shared coordination reference and automatically rebuild a browsable graph after main changes. Each person can find responsibility, current evidenced work, required inputs, reviewers and downstream impact. Success means one shared graph identifies its source commit and leads to concrete, attributable handoffs in the repo.

## 2. Current state

The agreed [knowledge-map spec](../../docs/specs/knowledge-map.md) defers CI/hosting. #47 contains eleven notes and a local deterministic Graphify recipe; it is not merged. The user requested automatic refresh and richer coordination records on 19 October. Those records are being added to #47 within its existing note scope. This proposal governs the new tooling/hosting extension.

Repository is Public (observed signed-in GitHub UI). Pages settings returned 404, so existing Pages availability/site/permissions are not verified. Main remains a61166b; #48's web API work is not merged. No graph currently proves latest-team-work completeness.

## 3. Scope

M1: this plan and its proposed specification only. Later: reusable build helper, validation, automatic main builds, downloadable artifact, maintainer-enabled Pages, evidence-aware note links. No application source/messages, Azure deployment, paid providers, live-service scanning, private chats, automatic assignments, assistant settings or background laptop sync.

Minimum complete target: reviewed notes plus successful automatic main build and shared hosted graph. Artifact-only is an explicit intermediate fallback, not hosted completion.

## 4. Ownership and dependencies

Pranav prepares this proposal and documentation/tooling work. Docs/scripts ownership remains unassigned (Arnav decides). Arnav coordinates .github/ and Pages settings. Azeem owns generator; stats ownership is user-reported. Vedant owns web. Pranav's insights/MCP ownership is user-reported, with prior agreements recorded in the merged S2 plan. Registry remains unchanged. #47 and this specification must be agreed before automation implementation; factual note review remains with affected component owners.

## 5. Flow

Component change + updated note/review evidence → reviewed main merge → bounded local extraction in CI → validated staged exports → artifact + Pages → teammates read shared URL. Teammates pull notes into their own clones. Human decisions stay human-authored and linked; automation reflects them without inventing acceptance.

## 6. Approach

Use Graphify 0.9.92 and existing exclusions/explicit-citation approach. Extract the manual recipe into one tested helper, pin resolved dependencies, generate only from trusted main, keep output out of Git. Use Pages rather than a new hosted service; artifact fallback when unavailable. No automatic model inference. Separate coordination links from runtime edges. Preserve last successful deployment on failure. See spec §§3–5 for detailed behaviour.

## 7. Interfaces

No CONTRACTS.md or runtime message changes. New documentation interface: canonical request ID, requesting component, provider/reviewer, deliverable, state, decision evidence, optional deadline; source is requesting note. Other notes backlink. The builder consumes checked-in facts and emits typed graph links/provenance for readers. Arnav and component owners review this policy before adoption; no new approval claimed.

## 8. File map

Only the first two files change in this specification PR. The later file map becomes active only after specification agreement and refresh against merged #47.

| Stage | File(s) | Change |
|---|---|---|
| M1 | plans/active/PLAN_docs_knowledge-sharing.md | Add proposal, scan and review record |
| M1 | docs/specs/knowledge-sharing.md | Add collaboration and automation specification |
| M2 | scripts/knowledge_map.py | Add governed build/validate/staging helper from reviewed recipe |
| M2 | scripts/tests/test_knowledge_map.py | Add exclusion, rendering safety, handoff/stale/failure tests |
| M2 | scripts/README.md | Document command and governing spec |
| M2 | docs/knowledge/graphify-config.json | Explicit note/folder map and output policy |
| M2 | docs/knowledge/requirements.txt, docs/knowledge/requirements.lock | Pin tool and resolved build dependencies; regenerate lock |
| M2 | docs/knowledge/setup.md, docs/knowledge/README.md, docs/knowledge/validation.md | Document shared/local paths and actual validation |
| M2 | docs/specs/knowledge-map.md | Link adopted extension without erasing previous milestone scope |
| M2 | docs/knowledge/{generator,event-hubs,screen-relay,archiver,stats-engine,storage,ai-insights,mcp,web-pubsub,frontend,environments}.md | Preserve/reconcile reviewed coordination records from #47; refresh factual evidence |
| M3 | .github/workflows/knowledge-map.yml | Separate shared-file commit: main/manual build, validate, artifact and guarded deploy |
| M2/M3 | This plan | Record evidence and unresolved checks |

No registry, global hooks, application or existing CI-policy file edits. Additional paths require file-map revision before work.

## 9. Failure and recovery

Excluded/invalid paths or unsafe labels fail validation. Failed builds never publish partial outputs. Stale SHA cannot deploy over newer main. Missing Pages settings produce a clear artifact-only result. No retries to alternate paid providers. Record run link and prior deployed SHA; maintainer can disable/revert workflow without affecting application services.

## 10. Specific requirements

Public reviewed checkout inputs only; deny symlinks/outside-root paths and package only output allowlist. Read-only build token; deploy permissions limited to Pages with protected main environment. No model/API keys. Standard runners, bounded jobs, seven-day artifact retention; no billing changes. Hosting configuration and current plan entitlement must be checked by maintainer. UI includes explicit commit/time, extraction limits and links to note evidence; tests verify project-subpath loading and escaped labels. No runtime latency claims or match-data calculations.

## 11. Acceptance

| ID | Outcome | Check / evidence |
|---|---|---|
| AC1 | Specification/file map/coordination policy reviewable | Relative links, consistent scope, owner review |
| AC2 | Eleven complete notes; MCP handoffs to producer/storage/downstream UI findable | Note validation and teammate walkthrough, no invented agreement |
| AC3 | Real trusted-main build reaches artifact and Pages with exact source SHA | Workflow run, URL and browser search/link check; no fixture substitutes for hosting |
| AC4 | Secrets/symlinks/script-like labels excluded or handled safely | Focused negative tests and output inspection |
| AC5 | Stale/failed build cannot replace successful site | Failure/concurrency demonstration; old SHA visible |
| AC6 | Local clone build and hosted access reproducible | Actual Linux and browser evidence; other OS gaps labelled |

Runtime integrations, unpublished personal work, automatic task completion inference and Windows validation without an actual run remain unproven.

## 12. Milestones

M1 now: plan/spec PR (AC1); Pranav. M2 after agreement and #47: helper and note validation/local build (AC2/4/6); Pranav, review by component owners. M3 after workflow approval/Pages access: actual main-to-site integration (AC3/5/6), Pranav with Arnav coordinating settings. Effort/date estimates not established; do not promise completion before the 20 October match target. Team feature target 24 October, freeze 25–26, submission 27 (IST) takes priority. If time runs short defer hosting, keep readable notes/manual graph, and leave this plan incomplete. Runtime teams can continue independently.

## 13. Conflict scan and coordination

Fresh main a61166b on 19 October. Sources checked: active plan references/file maps, open PRs #47/#48, all fetched remote branch name diffs, registry hot files. Unpublished laptop work unknown.

| Area | Other work / owner | Resolution | Status |
|---|---|---|---|
| docs/knowledge + knowledge-map spec | #47 docs/graphify-notes; Pranav, docs owner unassigned | This PR adds distinct files only; #47 first, refresh later implementation | Ordered, #47 merge pending |
| .github/ (later only) | CI plan and frontend plan; Arnav | New workflow in its own commit; no edits to existing web/CI workflows | Maintainer review pending |
| web/ | #48 / origin/web/live-api 0ef55ee; Vedant | No web source edits; notes label open PR separately | No exact file collision |
| plans/ | Housekeeping plan's broad scope | Only own new plan; no historical moves | No exact collision |
| docs/scripts | Registry unassigned | Arnav coordinates factual/tooling review | Pending review |

Other unmerged branch mock/live-viewer changes unrelated mock paths/its own plan. Original Graphify parent and S1 broad shared-document references are not permission to modify them. No separate teammate messages sent. Settings/visibility/site replacement are never changed silently.

## 14. Risks and decisions

1. Arnav: review automation scope and .github permissions; enable Pages from Actions only after checking existing site. Public graph output is intended for this already-public repo; private/internal visibility must block publication.
2. Arnav/component owners: confirm note responsibility and review records without overwriting registry discrepancies. Private meetings are not discoverable by tooling.
3. #47 unresolved browser/Windows/owner review: not resolved by this specification; finish or explicitly carry evidence gaps.
4. False freshness: distinguish graph build SHA from each note's verification date; warn on changed code with unchanged note. A new graph does not certify old prose.
5. Time/cost: no new paid account; cap job duration/retention and defer hosting if access unavailable.

## 15. Review and handover

Author checks: intended scope, file map, dependencies, exclusions, permission boundary, failure checks and actual hosting checkpoint defined. Shared contracts unchanged. Review requests remain pending; no owner approvals fabricated.

Arnav's review: confirm maintenance/Pages responsibility and shared CI scope. Azeem/Vedant/Pranav review component handoff facts through #47. This proposal addresses workflow policy, not acceptance of their runtime interfaces.

Specification agreement: pending this PR. Implementation readiness: blocked on agreement, #47 dependency and publishing settings for hosted milestone. User authorised preparation; no need to repeat that permission. Relevant project rule: governing specifications must be agreed before code implementation.

Handover: Pending implementation. Documentation link/scope checks are the only tests appropriate to M1; actual runs/site/screenshots remain pending. No published automatic graph or laptop background sync is claimed.
