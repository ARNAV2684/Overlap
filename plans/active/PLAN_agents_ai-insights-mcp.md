# Plan: evidence-grounded insights and MCP integration

## Proposal details

| Field | Value |
|---|---|
| Author / primary owner | Pranav |
| Review coordinator | Arnav |
| Affected owners | Azeem: generator and stats (Pranav reports agreement); Vedant: frontend; Arnav: storage, relay and delivery |
| Version and date | 1.3 · 18 October 2026 · local M2 evidence |
| Status | #41 and #44 merged; local M2 implemented and verified in S2. **From 20 Oct, M3–M5 are superseded by [`PLAN_agents_insights-build`](PLAN_agents_insights-build.md)** (Arnav owns layer 5: seven agents, all triggers, four modes, four languages, local first) |
| Tier | Full · Layer 5, with explicit upstream and downstream dependencies |
| Branch | `agents/insights-plan` |
| Reviewed baseline | [main at 103a5267e2846b7b1f5d0872816518b0a110d33f](https://github.com/ARNAV2684/Overlap/commit/103a5267e2846b7b1f5d0872816518b0a110d33f) |
| Plan file | `plans/active/PLAN_agents_ai-insights-mcp.md` |
| Governing workflow | [CONTRIBUTING](../../CONTRIBUTING.md), [planning skill](../../.claude/skills/overlap-plan/SKILL.md), [registry](../REGISTRY.md) |
| Change from discussion draft | Separates the one-file plan PR from future specification/code PRs; adds dependency gates, review questions, temporal grounding and a fresh conflict scan including PR #40 |

**M0 approval scope (merged in #41):** accept the scope and specification-first roadmap in this document. Merging it does not approve unfinished specifications, change an interface, authorise spending, or start implementation. Reviewers can approve the roadmap while recording decisions that must be resolved before a later milestone.

**Current progress:** the specifications in [S1](PLAN_agents_ai-insights-mcp_S1.md) merged in #44. Pranav supplied
the owner agreements described in [S2](PLAN_agents_ai-insights-mcp_S2.md) and explicitly authorised its local
Cosmos/MCP implementation. S2 passed the real stdio and local Cosmos checks; it makes no model or live delivery
claim. The baseline, original PR scope and conflict scan below record M0; S2 is the current implementation allowlist.
M3 model access/spending and M4 live integration remain pending.

## 1. Purpose and intended outcome

Explain important synthetic match moments using facts computed by the stats engine. MCP exposes permitted read-only context to the analyst; the workflow produces checked text and an overlay for the viewer.

The first useful result is a **shot-cluster insight**: the stats engine identifies three shots within five match minutes, and the viewer receives a concise explanation whose claims can be traced to that moment's evidence. A shot cluster alone does not establish chance quality, improved pressing, tactical intent or a likely goal.

The immediate deliverable is this reviewable plan. The first connected demonstration is a later milestone, not an existing capability.

## 2. Current state and reference material

| Reference at the reviewed baseline | What it establishes |
|---|---|
| [Agents README](../../agents/README.md) and [MCP README](../../mcp_server/README.md) | Intended roles and placeholder modules; no working insights/MCP service |
| [Workflow](../../agents/specs/workflow.md), [agents](../../agents/specs/agents.md), [fact-checking](../../agents/specs/fact-checking.md), [prompts](../../agents/specs/prompts.md), [evaluation](../../agents/specs/evaluation.md) | All marked **not started**; specification agreement is a prerequisite for code |
| [MCP tools](../../mcp_server/specs/tools.md), [moment trigger](../../functions/specs/moment-trigger.md) | Tool schemas, data access, triggering and recovery are unanswered |
| [Stats README](../../stats/README.md) and [stats specifications](../../stats/specs/) | Live stats/evidence producer remains a placeholder; generator calibration calculations are not this producer |
| [CONTRACTS](../../CONTRACTS.md) §§1, 5–7 | Starting time/identity, evidence, narration and overlay contracts; the document header remains v0 DRAFT, not blanket approval of unanswered details |
| [Archive storage](../../archiver/specs/storage.md), [screen relay plan](PLAN_functions_screen-relay.md), [local development](../../infra/specs/local-development.md) | Existing local archive/screen components to reuse; no runtime retest is claimed by this PR |
| [Frontend plan](PLAN_web_live-match-viewer.md), [realtime spec](../../web/specs/realtime.md) | The existing live-viewer scope excludes insight cards; an overlay integration agreement is still required |
| [Generator PR #40](https://github.com/ARNAV2684/Overlap/pull/40) | Open at the scan; changes calibration and generated outcomes, not a merged stats or insights implementation |

**Ownership difference:** Pranav has stated ownership of insights and MCP for this proposal. The registry still lists those areas as unassigned; Arnav confirms/records ownership there. This PR does not edit it or assign a stats owner.

## 3. Scope and boundaries

**This PR:** add this plan only, including a specification-writing milestone and a future delivery roadmap.

**Proposed first runtime scope after separate specification agreement:** one shot-cluster trigger; one read-only match-context MCP tool; English casual/analyst text variants; claim checking; a checked or explicitly labelled fallback overlay; delivery to the agreed frontend audience groups.

**Deferred:** other triggers, pressing/season tools, translations, voice, player-following tags, recaps and cloud hosting of the workflow/MCP server. These remain future product work, not silently cancelled requirements.

**Outside Pranav's implementation scope here:** generator changes, stats calculations/trigger detection, archive/relay rewrites, frontend implementation and infrastructure provisioning. Coordinate their interfaces without taking over those components.

## 4. Ownership and dependencies

| ID / dependency | Owner / coordinator | Required handoff and needed-by gate | Work possible meanwhile |
|---|---|---|---|
| D1: trigger and evidence | Azeem (Pranav reports agreement); consumer Pranav | Shot/window and frozen-context agreement reported for S2. At M4: actual producer and its integration evidence | Source-derived sample for M2; never call this live integration |
| D2: synthetic source | Azeem; consumer Pranav | At M1: agreed fixture provenance. At M4: reproducible recording with commit, seed, clubs and expected shot-cluster events | Use the merged generator; refresh expected output after tuning lands |
| D3: storage and delivery | Arnav and Pranav | At M1: readable sources, time/version semantics, moment/overlay persistence and audience delivery ownership; working endpoints before M4 | Isolated fixture-backed readers |
| D4: displayed insight | Vedant; producer Pranav; transport Arnav | At M1: overlay acceptance, modes, timing, late/duplicate behaviour and reconnect plan. At M4: real card renderer | Validate payloads; do not count an inspector or stub as a displayed insight |
| D5: hosted model | Arnav coordinates access; Pranav consumes it | Before M3: authorised Foundry project/deployment, identity, quota and approved spending limit | MCP tests and explicitly labelled model stubs; no model-quality claim |
| D6: ownership/spec agreement | Arnav and affected owners | Before M1/code respectively: confirm scope; merge the relevant answered specifications | Review this document |

Pranav supplies the MCP and workflow specifications, later their implementation/tests, evaluation results and handover. Shared messages require agreement from both producer and consumer owners.

## 5. Proposed flow

```text
Synthetic generator -> Event Hubs -> stats engine -> moment + evidence
                             |                           |
                             +-> archiver                v
                                  |              insights workflow
                                  +-> stored context <-> MCP tools
                                                         |
                                                 Azure model calls
                                                         |
                                             claim checks + director
                                                         |
                                       overlay storage + audience delivery
                                                         |
                                                 frontend insight card
```

Stats is the source of the moment and its numerical evidence. The archive provides additional stored context and later recap/replay data; live insights do not wait for an archive to finish a match. The normal screen relay operates independently of model success.

The proposed trigger is a newly published moment. The choice of change feed versus queue, how self-written moment updates avoid retriggering, and recovery state belong to M1. Record processing state, evidence/version references and overlay identity durably; do not confuse a transport checkpoint with completed processing.

## 6. Technical approach and decision rationale

**Author-selected direction, subject to team review:** first build MCP/workflow code locally and call a model hosted on Azure. This avoids requiring cloud hosting before the first tool can be tested. Moving the services to Azure is a separate deployment milestone, not a promise that changing a connection string is sufficient.

### MCP in practical steps

1. Agree the first `get_match_state` tool's description, inputs, response, source, limits and error behaviour in the tools spec. Input must identify the match and required moment/time boundary; exact field names are settled in M1.
2. Implement a read-only data-access adapter against the agreed source. Expose bounded operations, not arbitrary queries or database write access.
3. Register the tool with the official Python MCP SDK and expose Streamable HTTP. Bind local development to loopback; cloud authentication/ingress is separately specified. [SDK documentation](https://py.sdk.modelcontextprotocol.io/run/)
4. Verify discovery and calls with a real MCP client before adding a model. Include missing data, wrong-match and future-data cases.
5. Connect a local Microsoft Agent Framework client to both MCP and the Azure model. The local client executes permitted tool calls and returns results to the model; the model service need not reach into the laptop. [Microsoft MCP integration](https://learn.microsoft.com/en-us/agent-framework/agents/tools/local-mcp-tools)
6. Add comparison, player, pressing, pass-network and season tools only after their source data and individual specs exist.

The first tool must not silently return a latest snapshot as if it described an earlier moment. If an appropriately bounded state cannot be read, return unavailable. M1 must choose the snapshot/version or bounded archive mechanism; the existing `screen` state is not automatically equivalent to planned stats `match_state`.

### Model and explanation

**Proposed evaluation baseline:** GPT-5 mini through Microsoft Foundry, using tool calling and structured responses. One deployment may serve the analyst, narrator and semantic-check roles; the diagram does not require seven model deployments. Availability, model/version, quality, latency and cost are verified before accepting it for the demo. No automatic substitution or paid deployment is included here. [Microsoft model catalogue](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)

The first workflow validates a flagged moment, obtains permitted context, drafts its meaning, writes English variants with structured numeric claims, checks them, and prepares the overlay. Spotter/director policy is specified for this trigger without adding an unbounded model chain. Semantic review supplements deterministic checks; it is not a guarantee of truth.

Example intent, not an approved fixture: “Three attempts in this spell show repeated shooting opportunities.” Each number must be backed by evidence. An observed count cannot justify an unsupported explanation of the opponent's tactics.

## 7. Data contracts and compatibility

| Interface | Producer -> consumer / owners | Source and agreement needed |
|---|---|---|
| Synthetic setup/events | Azeem -> stats owner / Pranav's test fixtures | CONTRACTS §§1–4; retain IDs and event meaning |
| Evidence pack | Stats owner -> Pranav | CONTRACTS §5; shot-cluster facts, trigger/window rules and publication details agreed in M1 |
| MCP response | Pranav's reader -> analyst; source coordinated with Arnav/stats owner | Tools spec; source provenance, bounded time, missing data and read permissions |
| Narrated claims | Pranav's narrator -> checker | CONTRACTS §5.1; numeric coverage/rounding and semantic checks |
| Overlay and envelope | Pranav -> Arnav's delivery / Vedant's frontend | CONTRACTS §§6–7; audience sender, persistence, scheduling and reconnect agreed in M1 |

**No shared contract or API changes in this PR.** M1 must expose any needed extension in a dedicated shared-contract change before dependent code; no private alternate schema.

- `match_ms` is match time; `clock` is display-only; wall-clock model latency is measured separately. At 20x these are not interchangeable.
- The evidence pack remains the only numerical authority. Initially, MCP supplies bounded context, not extra numbers to cite outside the pack. Additional citable facts require an agreed evidence-admission/versioning design.
- Every numerical expression, including a stated window length, must be supported and checked. M1 must resolve how window-duration wording is represented rather than copy an example that bypasses numeric coverage.
- Missing facts remain unavailable, not zero. Identify duplicates by agreed moment/overlay identity; do not deduplicate unrelated moments by equal timestamps alone.
- The relay alone sends to `match-<id>`. Insights use the audience groups in §7, with their own group-scoped sequencing; they never reuse the relay's counter.
- Existing §7.3 catch-up describes the base screen stream. Overlay catch-up is not already provided by that endpoint.
- `verified` and `fallback` are mutually exclusive under §6. Template output must never masquerade as a verified model explanation.

## 8. File and specification map

### Original M0 PR: complete write allowlist

| File | Action | Responsibility / governing reference | Owner |
|---|---|---|---|
| `plans/active/PLAN_agents_ai-insights-mcp.md` | Add | This roadmap, review checklist and dependency gates; full planning template | Pranav |

### Subsequent areas: exact maps belong to their milestone plans

M1's current exact specification map is in [S1 §3](PLAN_agents_ai-insights-mcp_S1.md#3-files). The rows below
remain a roadmap; they do not authorise all files or runtime work in a directory.

| Milestone / area | Anticipated files | Required scope agreement |
|---|---|---|
| M1 specification proposal | `agents/specs/agents.md`, `workflow.md`, `fact-checking.md`, `prompts.md`, `evaluation.md`; `mcp_server/specs/tools.md`; `functions/specs/moment-trigger.md` | Separate specification PR(s) with exact file maps; mark deferred roles explicitly, not as implemented |
| Shared handoffs for M1 | `CONTRACTS.md` §§5–7; relevant `stats/specs/`, `web/specs/realtime.md`, `fixtures/`, storage/delivery specs | Affected owners agree; separate shared changes if needed; no changes assumed by this plan |
| M2 tool implementation | `mcp_server/server.py`, `data_access.py`, first tool module; scoped tests, packaging and README | New implementation sprint after tools spec agreement |
| M3 explanation implementation | `agents/` workflow/state, role modules/prompts, checks, config, evaluations, packaging and README | New sprint after governing specs and model-access gate |
| M4 integration | `functions/moment_trigger.py`; agreed storage/publishing adapters, integration tests and run instructions | Separate exact file map; coordinate shared Functions entrypoint/dependencies with Arnav and frontend with Vedant |
| M5 extensions/deployment | Later agent/tool modules and agreed infrastructure | Separate plans; no implied edits to `azure.yaml`, infrastructure, CI, registry or lockfiles now |

Future sprint plans must list any new tests/manifests/config examples explicitly. This document is not a blanket allowlist for those directories.

## 9. Failure handling and recovery

| Scenario | Proposed required behaviour | Check / specification gate |
|---|---|---|
| Invalid, missing or mismatched evidence | Reject and record reason; no invented values or wrong-match context | Negative fixtures in M2/M3 |
| Context newer than the moment | Reject it or use an agreed bounded version | Temporal-grounding fixtures; D3 |
| Unsupported numeric/semantic claim | Rewrite at most twice as §5.1 states; then labelled fallback, or suppress if evidence is insufficient | Inject bad claims and verify exact outcome |
| MCP/model timeout, quota or network failure | Bounded attempts within the moment deadline; no indefinite blocking of the match screen | M1 fixes per-call and total limits before code; fault injection |
| Duplicate notification, concurrent work or restart | Recover by durable moment/overlay identity and processing state; avoid duplicate visible cards | M1 specifies ownership/idempotency; restart tests |
| Save succeeds but delivery fails | Retain a recoverable publication state and retry under the agreed limit; do not claim delivery from a successful save | M1 agrees publication/recovery responsibility with Arnav |
| Late explanation | Apply agreed live expiry/recap policy; never present an old observation as current | M1 with Vedant; 1x/20x checks |

No exactly-once execution or loss-free delivery claim is made. Avoid model calls triggered repeatedly by the workflow's own writes to the moment document.

## 10. Requirements specific to this work

- **Resources:** Python and pinned dependencies for MCP/Agent Framework; existing local data services; an approved Foundry endpoint and model deployment; authorised identity and quota. MCP itself needs no language model to be tested. No GPU or model training is required for the proposed hosted approach.
- **Access:** read-only MCP source access; separately scoped workflow writes/publishing. Use approved identity-based access and managed identity in deployment; Key Vault for any required secrets. Never commit keys or expose them to the browser.
- **Cost:** Azure inference is not assumed free and credits are unconfirmed. Before M3, record current deployment rates, expected eligible moments/calls/tokens, bounded rewrites and a team-approved spend limit. Log actual usage, enforce application call/token limits and provide a stop control; a billing alert alone is not a hard spending cap.
- **Performance:** call models only for eligible moments. M1 must set the wall-clock deadline, per-step limits, concurrency/backpressure, stale-result policy and p95 target with the frontend owner. These are unmeasured until M3/M4; no inherited “under one second” claim for the AI path.
- **Observability:** correlate match/moment/overlay IDs, evidence version, source watermark, tool/model versions, attempts, verdict, fallback reason, token usage and moment-to-card latency. Avoid logging credentials.
- **Data rules:** synthetic project data only; no real football identities/branding or imported earlier-project material. Record fixture commit, seed and generation inputs. Storyline answer keys stay evaluation-only, outside prompts/tool results.
- **Frontend:** agree English casual/analyst variants, empty/stale/fallback states, timing and reconnect with Vedant. The backend tests do not establish accessibility or visual correctness.

## 11. Acceptance criteria and validation

### This documentation PR

| ID | Criterion | Verification |
|---|---|---|
| P1 | Exactly the §8 current-PR file is added; no runtime, contract, registry or infrastructure changes | Diff against the recorded base |
| P2 | All 15 sections, references, dependency gates, ownership and review questions are present and consistent | Full-template review; local Markdown target checks |
| P3 | Branch/commit/PR metadata comply with repository policy; no secrets or attribution trailers | Local policy/scope checks; GitHub policy/blocklist/secrets checks after opening |

### Required outcomes of future milestones (not passed tests)

| ID | Observable result | Milestone / evidence |
|---|---|---|
| F1 | Detailed first-slice specs and representative valid/invalid evidence/tool/overlay examples are reviewed; D1–D4/D6 decisions resolved for the affected scope | M1: merged specifications and decision links |
| F2 | A real MCP client discovers and calls the first tool; exact results, bounded reads and unavailable/error cases behave as agreed | M2: fixture and local-store integration results; source identified |
| F3 | Approved Azure model produces traceable English output; injected incorrect numbers/unsupported claims are blocked; no model access is claimed from stub tests | M3: model/version, evaluation set, verdicts, latency and usage |
| F4 | Actual stats evidence passes through MCP/workflow/delivery to an actual frontend card; IDs and facts match source events | M4: reproducible run and browser evidence |
| F5 | Duplicate/restart, future/stale data, failed publication and model/MCP outage cases follow the agreed recovery policy without duplicate cards | M4: fault-injection and recovery results |
| F6 | The same recorded input at 1x and 20x preserves evidence meaning; measured latency/expiry and spending stay within M1/M3 limits | M4: comparison report, including suppressed/late cards |

M5 will define its own criteria in separate plans. Local emulators/fixtures do not prove Azure deployment, model quality or production reliability.

## 12. Delivery milestones or short sprints

| Milestone | Outcome / acceptance | Owner and prerequisite | Scheduling status |
|---|---|---|---|
| M0: this plan PR | Reviewable scope and roadmap; P1–P3 | Pranav; team review | Merged in #41 |
| M1: first-slice specifications | MCP, evidence, workflow, limits, recovery and frontend handoffs agreed; F1 | Pranav coordinates D1–D4/D6 owners | S1 draft prepared; owner agreement pending; no runtime code |
| M2: local MCP | Read-only tool works through a real MCP client; F2 | Pranav; agreed tools spec and source | Estimate after M1; fixtures can unblock development |
| M3: hosted explanation | Local workflow calls approved Azure model and checks its output; F3 | Pranav; M1, M2 and D5 | No paid calls before access/budget gate |
| M4: connected insight | Real stats-to-card path plus failure/speed checks; F4–F6 | Pranav with stats owner, Arnav and Vedant | Depends on actual producer/renderer readiness |
| M5: expand and deploy | Remaining triggers/tools, translation/recaps and cloud operation | Owners confirmed in separate plans | Not authorised or scheduled here |

**Calendar:** the team's targets are an English end-to-end match by 20 October, required features by 24 October, freeze 25–26 October and internal submission on 27 October IST. The 20 October connected-insight target is **at risk**, not promised: stats ownership, specifications, model access and frontend integration remain dependencies. Arnav coordinates a revised commitment after M1; these are team targets, not a statement of the official event deadline.

**Parallel work:** after shared examples are agreed, MCP readers, claim validation and frontend fixture rendering can proceed independently. Real integration cannot pass until actual sources and consumers exist. The first real checkpoint is M2 against the agreed local store, followed by M4 against the actual stats producer and viewer.

**Cut first:** additional tools/triggers, languages, voice, recaps and cloud hosting of the development services. Never cut evidence checks, truthful fallback labels, identity/time boundaries or the real first-slice integration check.

## 13. Integration and change management

Scanned at `103a5267e2846b7b1f5d0872816518b0a110d33f` on 17 October 2026. Sources checked: every active plan, open PR #40 and its changed files, all fetched remote branch diffs, and registry hot files. No direct overlap with the one new plan file was found.

| Area / relationship | Other plan, PR or branch | Owner | Resolution / status |
|---|---|---|---|
| Generator outcome/fixture dependency; no current write overlap | [PR #40](https://github.com/ARNAV2684/Overlap/pull/40), `generator/engine-smoke` | Azeem | Keep unmerged results out of baseline claims; regenerate labelled fixtures after relevant changes merge |
| Older non-overlapping work | `generator/world-spec`, `mock/live-viewer` | Azeem / Arnav by area | Do not import branch-only implementations; no current file conflict |
| Storage, Functions and publication; future overlap | [Archive plan](PLAN_archiver_archive-flow.md), [screen relay plan](PLAN_functions_screen-relay.md) | Arnav, Pranav | M1 agrees interfaces; future shared edits isolated and ordered |
| Overlay consumption; dependency gap | [Frontend plan](PLAN_web_live-match-viewer.md) | Vedant | Existing scope ignores overlays; agree a separate renderer milestone before M4 |
| Shared messages/examples | CONTRACTS §§5–7 and `fixtures/` | Producer and consumer owners | Unchanged now; dedicated coordinated changes if M1 needs them |
| Ownership and plan lifecycle; automated directory-level overlap | [Registry](../REGISTRY.md), [housekeeping plan](PLAN_plans_housekeeping.md) | Arnav | The scope checker matches the housekeeping plan's broad `plans/active/` directory entry. Its enumerated moves do not include this new file, so no same-file edit is required. Keep this roadmap active; Arnav reviews lifecycle coordination. Registry unchanged |

**PR boundaries:** one documentation-only PR from `agents/insights-plan`; later specification PR(s); then separately scoped implementation PRs. Refresh main/conflicts at each boundary. Do not merge, rebase or resolve another person's branch as part of this work.

**Setup/migration:** none in this PR. No new service, dependency, deployment, database migration or secret is introduced. Runtime setup and rollback instructions accompany their later implementation PRs.

## 14. Risks and decisions needed from the team

| Risk / decision | Who resolves it | Recommended direction / blocking gate |
|---|---|---|
| D1: no assigned stats owner or agreed shot-cluster handoff | Arnav + stats owner + Pranav | Assign owner; agree window boundaries, repeated clusters, IDs, evidence keys and publication. Blocks relevant M1 agreement and M4, not this plan PR |
| D2: tuning changes expected match events | Azeem + Pranav | Pin generator revision/seed and regenerate evaluation expectations; never mix baselines |
| D3: no bounded-time source or agreed moment/overlay persistence | Arnav + Pranav + stats owner | Decide source/version semantics, trigger mechanism, idempotency and delivery recovery before related code; fail unavailable rather than read future state |
| D4: insight card/audience sequencing and catch-up unspecified | Vedant + Arnav + Pranav | Agree the minimal English card contract, scheduling, expiry and reconnect before integration code |
| D5: Azure access, latency, quota or budget unavailable | Arnav coordinates + Pranav | Confirm deployment and explicit limits before M3; labelled stub checks may continue but cannot pass F3 |
| D6: registry ownership/spec agreement pending | Arnav + affected owners | Confirm Pranav's scope and record agreements in PRs; do not infer approval from this draft |
| Numeric evidence coverage versus contextual prose | Pranav + stats owner | Settle window-duration numbers, rounding, semantic claims and MCP evidence admission in M1 |
| Reusing published state without durable send recovery | Pranav + Arnav | Specify bounded retry/recovery and idempotent card identities; a successful write is not proof of display |

No unresolved decision is hidden behind an implementation estimate. M1 is the place to resolve these details; unresolved items block their dependent runtime milestone.

## 15. Review, agreement, and handover

### Review this PR without relying on a private chat

Review the diff and this document at its recorded baseline, then read the linked specifications, contracts, registry, neighbouring plans and PR #40's current status. Report findings as **Blocking incompatibility**, **Question before implementation**, or **Optional improvement**, with a section/file reference. Check current code before treating a diagram or placeholder as implemented.

| Reviewer | Focus requested | Current agreement |
|---|---|---|
| Arnav | Component boundary, ownership, storage/delivery, Azure access and conflict coordination | Pending |
| Azeem | Synthetic inputs, reproducibility, event meaning and keeping answer keys out of model context | Pending |
| Vedant | English card variants, audience contract, timing, missing/late/fallback states and reconnect | Approved 20 Oct: D4 as written in `CONTRACTS.md` §10.3–§10.4 (`period` field, at most 6 wall seconds, 300,000 match ms eligibility, one card shown and two waiting, `casual-en` and `analyst-en` groups, insight snapshot, dedupe by group + `seq` and by `overlay_id`). The web app doesn't render cards yet; that is new frontend work with its own plan |
| Stats owner once confirmed | Trigger/window/evidence definitions, publication and bounded-time state | Pending |

Accepting M0 means the roadmap is suitable for specification work; it does not mark placeholders agreed. Approval records belong in PR reviews or linked written decisions, not inferred from another tool's response. A reviewer may request changes; no guaranteed approval is claimed.

### Submission validation

- P1–P3: validate the one-file diff, numbered sections, relative links, metadata and repository checks before presenting the PR as ready.
- No runtime test, Azure connection, completed MCP tool, model-quality result or teammate approval is claimed by this document.
- F1–F6 and the implementation handover below remain **Pending implementation**.

### Future handover

**Pending implementation:** provide specification and implementation PRs, tested commit, reproducible commands/configuration names, fixture provenance, model/dependency versions, acceptance results, browser evidence, measured cost/latency, recovery checks, known limitations and follow-up owners. Do not move this roadmap to `plans/done/` merely because the planning PR merges.

**Next action:** review the separately scoped [S2 implementation](PLAN_agents_ai-insights-mcp_S2.md). Then obtain
Foundry deployment access and an explicit test budget before M3 model calls. Confirm the remaining trigger/delivery
specifications and Azeem's real producer before M4. This roadmap remains active through those later milestones.


### 18 October local implementation update

#44 merged. [S2](PLAN_agents_ai-insights-mcp_S2.md) implements Pranav's explicit go: seed the agreed
source-derived document into local Cosmos and prove a real read-only MCP call. The 64-test suite passed with
Cosmos enabled; the offline handoff records the actual source and contains no narration. Pranav confirms Azeem owns stats
and the relevant source agreements; formal registry changes remain Arnav's responsibility. No Foundry access yet;
Pranav explicitly selected completing the local milestone first. M3/M4 and whole-roadmap completion remain pending.
