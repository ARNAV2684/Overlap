# S1: first insight specifications

| Field | Value |
|---|---|
| Sprint | S1 — one shot-cluster insight, specifications and examples |
| Parent plan | [AI insights and MCP](PLAN_agents_ai-insights-mcp.md), roadmap v1.1 merged in [PR #41](https://github.com/ARNAV2684/Overlap/pull/41); v1.2 records progress |
| Milestone | M1; parent acceptance F1 |
| Author / owner | Pranav; Arnav coordinates shared review |
| Status | #44 merged; local MCP scope authorised in S2; remaining model/trigger/delivery gates are separate |
| Review PR | [#44 — Specify the first insight and MCP handoffs](https://github.com/ARNAV2684/Overlap/pull/44) |
| Reviewed baseline | `main` · `ba75f51412a9b019fdb689d9c604d03ab82533d2` · 17 October 2026 |
| Branch | `agents/insights-specs` |

At the initial 17 October review, Pranav authorised starting M1 and no new team decisions had been supplied.
Defaults below record that proposal. The dated handoff update at the end records the subsequent merge and
user-reported agreements supporting S2. This sprint itself contains documentation, not runtime code.

## 1. Outcome

A reviewer can follow one Azeem-generated shot cluster through evidence, an MCP context read, checked English
text and an audience overlay, including failures and restarts. M1 is complete only when the affected owners agree
the relevant specifications. A written draft alone does not pass parent F1.

No runtime code, service startup, dependencies, model calls, infrastructure, frontend implementation or paid
resources. No generator, relay or archive rewrites. Pranav has authorised committing, pushing and opening this
specification PR for team review. This does not authorise merge, runtime implementation or separate teammate messages.

## 2. Preconditions

| Needed | Source | Ready? |
|---|---|---|
| Roadmap and author go for specification work | #41; Pranav's instruction to start M1 | Yes |
| Existing source and shared formats | Generator #40; [contracts](../../CONTRACTS.md) §§1–7 | Yes, read at baseline |
| Stats/evidence owner and interface agreement | Arnav + stats owner, unassigned (Arnav decides) | Pending; blocks F1 and live integration, not drafting |
| Context storage and audience delivery agreement | Arnav + Pranav; Vedant for receiving | Pending; blocks relevant runtime work |
| Model access and approved budget | Arnav coordinates | Not required for this sprint; blocks M3 |

## 3. Files

This is the exact M1 write map, scoped from parent §8. New examples are review examples inside specifications,
not installed fixtures. Shared additions remain explicitly proposed until their owners agree.

| File | Action | Responsibility / governing reference |
|---|---|---|
| `plans/active/PLAN_agents_ai-insights-mcp_S1.md` | Add | This sprint and review/handover record |
| `plans/active/PLAN_agents_ai-insights-mcp.md` | Modify | Record M0 merge and link this M1; retain historical baseline |
| `CONTRACTS.md` | Modify | Proposed §10 for first-slice handoffs; existing §§1–9 unchanged |
| `mcp_server/specs/tools.md` | Modify | One read-only tool, schema, time boundary, access and limits |
| `agents/specs/workflow.md` | Modify | State, orchestration, budgets, persistence and recovery |
| `agents/specs/agents.md` | Modify | First-slice roles and deferred roles |
| `agents/specs/fact-checking.md` | Modify | Numeric coverage, semantic limits and fallback |
| `agents/specs/prompts.md` | Modify | Allowed wording, structured responses and input boundaries |
| `agents/specs/evaluation.md` | Modify | Future tests, evidence provenance and truthful completion |
| `agents/specs/examples/shot-cluster.md` | Add | Valid and invalid review examples derived from Azeem's recording |
| `functions/specs/moment-trigger.md` | Modify | At-least-once notification, durable claim and restart recovery |

## 4. Steps

1. Refresh main; inspect contracts, neighbours, open PRs and branches; record overlap/ownership below.
2. Propose shared handoffs in §10, then answer the seven component specifications against those handoffs.
3. Add a traceable example from the merged generator and negative cases. Check JSON, links, arithmetic and scope.
4. Record outstanding owner decisions and validation here; prepare for a specification PR. Runtime remains later.

## 5. Contracts and shared files

The only hot-file edit is an isolated **proposed** addition to `CONTRACTS.md` §10. It specifies shot-cluster evidence,
immutable moment context and audience delivery without altering the live screen stream. Stats produces the
moment (owner unassigned, Arnav decides); Pranav consumes it and produces overlays; Arnav coordinates storage and
transport; Vedant consumes the overlay. Azeem reviews the event interpretation and source example.

No owner notifications have been sent. Arnav and affected owners must review the addition before it is promoted
to an agreed contract or merged as an active interface. Keep this edit separate when preparing commits. No edits
to `stats/`, `web/`, `fixtures/`, `.github/`, infrastructure or `plans/REGISTRY.md` are included.

## 6. Conflict scan

| Overlap | Other work / owner | Resolution | Status |
|---|---|---|---|
| `CONTRACTS.md` | Archive §4.1, relay §7, setup transport §1.4; Arnav and consumers | Append proposed §10 only; do not rewrite their sections. Shared review before adoption | Pending review |
| Evidence and moment publication | Stats owner unassigned (Arnav decides) | Propose the handoff here; owner supplies implementation and agrees its specs separately | Pending |
| Audience cards/catch-up | Vedant's live-screen plan excludes these | Define a receiving proposal; no edits to his screen or claim that #42 renders cards | Pending |
| `functions/specs/moment-trigger.md` | Shared Functions application; Arnav | Define future adapter only; no changes to entrypoint, dependencies or relay | Pending deployment review |
| Broad `plans/active/` match | Housekeeping plan, Arnav | Enumerated historical moves do not include this sprint; retain both insight plans as active | No same-file change required |
| Automated `CONTRACTS.md` references | CI plan and web plan also reference the file | Working-copy scope report includes read references as potential overlaps; their runtime/CI files are untouched | Reported, no direct edit overlap |
| Generator outcome baseline | Azeem's engine/world plans; #40 merged | Pin current generator tree and recording; don't change generator or use unmerged branches | Read-only |
| Registry still says agents/MCP unassigned | Arnav maintains registry; user and #41 name Pranav | Record discrepancy; do not edit ownership | Pending registry confirmation |

Scanned at `ba75f51` on 17 October 2026. Sources checked: active plans, open PRs (none returned), all origin
branches and hot files. Only `generator/world-spec` and `mock/live-viewer` had changes outside main; neither
intersects this file map. Vedant's merged fork work is included through #42; unpublished laptop work is unknown.
The pre-publication recheck found [PR #43](https://github.com/ARNAV2684/Overlap/pull/43), a snapshot-key correction
in `web/specs/realtime.md` and `plans/active/PLAN_web_live-match-viewer.md`; neither file overlaps this sprint.
Shared-interface agreements remain merge/adoption blockers; they do not prevent preparing this review draft.

## 7. Acceptance criteria

| ID | Given / when / then | Check | Evidence |
|---|---|---|---|
| S1-01 | Given the draft, every change is Markdown in §3; no runtime or secrets are added | Diff and scope audit | Passed locally: 11 Markdown files in the exact map; no runtime/config changes; no credential literals added |
| S1-02 | Given the recorded source, selected shots, count, window and context agree with its prefix | Source hashes and arithmetic; JSON/link checks | Passed locally: 17 JSON blocks, 66 relative links; hashes, contiguous prefix, three selected shots, window, score and generator tree checked |
| S1-03 | Given duplicate, stale, future and bad-claim cases, every spec names an expected outcome | Cross-document review | Draft consistency reviewed; negative-case table and restart/time policies present; runtime behaviour untested |
| S1-04 / F1 | Given owner reviews, D1–D4/D6 have recorded decisions and relevant specs are agreed | PR reviews/decision links | Pending team agreement |

No runtime integration can pass in a documentation sprint. M2 requires real MCP discovery/call tests; M4 requires
the actual stats producer and frontend card. Author-written examples do not substitute for either.

## 8. Risks and decisions needed

| Decision | Proposal to review | Who decides | Gate |
|---|---|---|---|
| D1 | Same-period five-minute window, warm-up, all shot outcomes, five-minute cooldown and two evidence facts | Stats owner + Pranav; Arnav assigns owner | F1 / evidence implementation |
| D2 | Use generated KES–ORR, seed 1017; keep answer keys out of runtime context | Azeem + Pranav | Fixture acceptance |
| D3 | Immutable context alongside evidence; separate job documents; durable publication outbox | Arnav + stats owner + Pranav | F1 / MCP store integration |
| D4 | English casual/analyst cards, at most 6 wall seconds, proposed overlay period field, expiry and audience snapshot | Vedant + Arnav + Pranav | F1 / card integration |
| D5 | Existing model candidate, disabled until deployment/identity/quota/spend agreement | Arnav + Pranav | M3 only |
| D6 | Pranav's scope in #41; formal ownership registry update by Arnav | Arnav | F1 |

Timing and request/token limits are proposed ceilings, not measured performance or money authorisation. The
20 October connected-insight target remains at risk; re-estimate after these decisions. Cut other tools, triggers,
languages and cloud hosting first; keep factual checks and one actual stats-to-card test.

## 9. Handover

**Published for review in [PR #44](https://github.com/ARNAV2684/Overlap/pull/44), 17 October 2026.** M1 agreement /
parent F1 is still pending. All seven governing component specs
are marked draft, with unsupported roles explicitly deferred. Source examples come from Azeem's generated KES–ORR
recording; future MCP/model/browser results are not claimed.

Validation: exact 11-file Markdown scope; all 17 JSON blocks parsed; 66 relative links/anchors resolved;
existing contracts §§1–9 byte-for-byte unchanged; recorded source hashes and event arithmetic matched;
`git diff --check` passed. The repository scope checker was run against working-copy files via a read-only adapter
(the normal checker reads commits); it identified the hot/shared files and ownership discrepancy recorded in §6.
Open PRs were rechecked (none), main remained `ba75f51`, and branch overlap remained unchanged.
That was the initial scan; the subsequent #43 recheck is recorded in §6. The committed-file policy and scope
checks passed locally before publication. On initial published head `dbb6ea0`, GitHub reported success for the
PR checks, Python, Web and Infra workflows; documentation-only dispatch does not establish runtime coverage.
The automatic review service could not review the PR because its quota was exhausted; no review approval is implied.

No runtime/unit/model/integration tests were run: there is no runtime change. Structural validation does not satisfy
F1. Publication checks and their current results are recorded in the PR description and checks tab; private
blocklist/secrets checks require repository CI. No new dependencies, emulators, Azure resources or paid calls
were created. Publication is authorised; owner approvals and runtime implementation remain pending.

**Review order:** Arnav confirms scope/storage/ownership; stats owner agrees §10.1–§10.2; Azeem reviews the pinned
source; Vedant agrees §10.3–§10.4. Record accepted/revised decisions in this table and PR review before marking
specifications agreed. A proposed spec PR must disclose the new overlay period field and audience snapshot.
After agreement, prepare the separately scoped M2 implementation for a real local MCP client/tool test.


### 18 October handoff update

PR #44 is merged at `cb3b349`. Pranav reports Azeem owns stats and has agreed to frozen context/evidence and the
shot-cluster rule; he also confirms Arnav's storage/delivery agreement and Vedant's first card format/timing.
Pranav authorised creating the source-derived sample and implementing the local Cosmos/MCP milestone. These
statements support S2's consumer scope; they are not independent review records or proof that upstream code exists.
MCP tooling is the only governing runtime spec promoted for S2. Other model/trigger/delivery specs and ownership
registry updates remain for their owners/later milestones. See [S2](PLAN_agents_ai-insights-mcp_S2.md).
