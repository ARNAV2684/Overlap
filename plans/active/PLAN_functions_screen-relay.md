# PLAN_functions_screen-relay — screen flow: Event Hubs → screen relay → Web PubSub group `match` → browser

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Screen flow · build the screen relay the Web PubSub way, run it locally on emulators first and then on Azure, with the same code |
| Author / primary owner | Arnav (owns the Event Hubs structure incl. screen relay and archiver; registry update pending, D-07) |
| Collaborators and responsibilities | Pranav helps Arnav on the relay (his earlier drafts are reused where they fit); Pranav keeps his blue demo viewer working on the new protocol until Vedant's screen replaces it |
| Review coordinator | Arnav |
| Affected component owners | Azeem (producer: `generator/live.py`); Vedant (consumer: web app, `web/specs/realtime.md`); stats engine owner (unassigned, Arnav decides): sends stat panels through the relay (D-02) |
| Proposal version and date | v1.1 · 17 Oct 2026 (D-01 to D-08 decided) |
| Status | In progress: S1 (go from Arnav, 17 Oct). Contract PR #28 open; specs and registry in `functions/screen-relay-spec` |
| Plan tier and file | Full · `plans/active/PLAN_functions_screen-relay.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 6f2f459 |
| Architecture box / work area | Lucid page 2: box 2 (`match-events`, `match-tracking`, screen relay) → box 6 (group `match`) → box 7 (web app's socket and snapshot) |
| Relevant issue, spec PR, or discussion | Open PR #27 (Event Hubs transport, §1.4); Vedant's specs (#19); Pranav's review package (not on GitHub); Arnav's decisions of 17 Oct (below) |

**Decisions already made by Arnav (17 Oct):** use Vedant's way (Web PubSub JSON protocol + `/negotiate`) locally and on
Azure, not a plain socket; the relay is the **only sender** on `match-<id>`; the relay runs as an **Azure Function on
Flex Consumption**; local first (emulators) for everything, Azure after; update Pranav's blue viewer to the new
protocol now and retire it once Vedant's screen works; full scope, nothing thinned. Supersedes the uncommitted local
draft `PLAN_infra_event-hubs.md` for the screen path (its Event Hubs decisions are folded in here).

## 1. Purpose and intended outcome

- **Problem or need:** the generator streams real matches into Event Hubs, and Vedant's screen reads Web PubSub, but
  nothing connects them. Box 2's relay, box 6's group delivery and the catch-up snapshot don't exist.
- **Proposed outcome:** the screen relay reads both hubs, turns raw messages into `event`, `positions` and `status`
  envelopes, sends them to group `match-<id>` through Web PubSub's send API, and saves them so a browser that joins late
  or refreshes catches up. The same code runs against local emulators and a local Web PubSub stand-in, and against
  Azure Event Hubs, Azure Web PubSub and Cosmos DB.
- **Benefit:** the first complete flow (generator → screen); Vedant builds against the exact protocol production uses.
- **Success statement:** a full `generator/cli.py live` match at 20× reaches the browser through the relay with every
  event and frame accounted for, refresh catch-up works, and the same run passes on Azure by changing only settings.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Code | main · 6f2f459: `functions/screen_relay.py`, `function_app.py` are comment-only placeholders | Nothing built in boxes 2–6 |
| Governing specs | `functions/specs/screen-relay.md`: not started (empty template). `infra/specs/*`: not started | Spec gate: S1 writes them |
| Producer | `generator/live.py` (#21): setup first on `match-events`, events by `seq`, frames on `match-tracking`, key `match_id`, properties `kind`/`match_id` | Input is done and tested on the emulator |
| Transport contract | Open PR #27 (`CONTRACTS.md` §1.4) | Must merge first |
| Browser contract | `CONTRACTS.md` §7 (envelope, groups); `web/specs/realtime.md` (#19, "draft for review") | Protocol, negotiate, join, catch-up, dedupe by `seq` |
| Mock | `mock/` stand-in speaks the Web PubSub client protocol; its `status`/`positions`/snapshot shapes are "provisional" | The only definition of those shapes today |
| Blue viewer | `mock/single-match-demo/app.js` connects with a plain WebSocket | Must move to the protocol (D-08) |

**Differences between references:**
- Snapshot shape: Vedant's spec expects `{ matchId, setup, status, envelopes, rejected }`; the mock returns
  `{ match_id, setup, status, envelopes }`. Unresolved (D-03).
- `CONTRACTS.md` §7 says `match-<id>` carries stat panels, sent by the stats engine (diagram). Arnav's decision makes the
  relay the only sender, so stat panels reach the browser through the relay (D-02 defines how).
- `web/specs/realtime.md` was merged but still says "draft for review".

## 3. Scope and boundaries

| In scope | Outside this plan |
|---|---|
| `CONTRACTS.md` §7: `status`, `positions` and snapshot shapes; single sender and `seq` rules | Event and frame shapes (§3–§4, unchanged) |
| Relay spec, local-development spec, Azure resource and security specs for the screen path | Stats engine, agents, overlays, audience/player groups' content (their own flows) |
| Relay core, Event Hubs trigger (Azure Function) and a local runner using the same core | Archiver and replay (archive flow, next) |
| Envelope store (Cosmos container) for catch-up; local Cosmos emulator | Vedant's web app code (he builds against this contract) |
| Local Web PubSub stand-in (service send API + `/negotiate` + client protocol + snapshot route) | The web app's own `/api/negotiate` and snapshot routes (Vedant, using this contract) |
| Local stack: Event Hubs emulator, Azurite, Cosmos emulator, stand-in, in one compose file outside `mock/` | Deleting `mock/` (after this flow, separate quick plan) |
| Azure: Event Hubs, Web PubSub, Function (Flex Consumption), Cosmos container, identities, Bicep, deploy | Budget beyond the screen path |
| Blue viewer moved to the protocol (with Pranav) | Vedant's UI design |

- **Minimum complete result:** not applicable — full scope by Arnav's instruction; every row in the left column is delivered.
- **Boundary:** the relay starts at a message on either hub and ends when the envelope is sent to the group and saved.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| PR #27 transport | Arnav, Azeem, Vedant | Merged §1.4 | Open · S1 | Relay follows `live.py` today |
| `CONTRACTS.md` §7 shapes (hot file) | Vedant (consumer), Arnav (relay), stats owner | Agreement on `status`, `positions`, snapshot, `seq` | Pending · S1 | — |
| `web/specs/realtime.md` | Vedant | Snapshot shape, dedupe key if D-02 changes it | Pending · S1 | — |
| Registry rows for relay, archiver, Web PubSub, Functions, Cosmos | Arnav | Owner recorded | Pending · S1 (D-07) | — |
| Producer | Azeem | `generator/cli.py live` unchanged | Available | — |
| Blue viewer | Pranav | Connect via negotiate + protocol | Pending · S2 | Keeps working against the old mock until then |
| Azure subscription, budget, Web PubSub tier | Arnav | Subscription + Standard tier for tests | Pending · S4 | Local stack |
| Local emulators | Each developer | Docker; accept the Event Hubs and Cosmos emulator licences | Event Hubs: done on Arnav's laptop · Cosmos: S2 | — |

**My owned deliverables (Arnav):** everything in §8 except `mock/single-match-demo/app.js` (Pranav) and Vedant's files.

## 5. Proposed flow

```text
generator live ──▶ match-events (setup, events)  ──┐
                   match-tracking (frames)       ──┤  consumer group: relay
                                                   ▼
                          screen relay core (same code everywhere)
                          validate · drop duplicates · score/phase · bundle 5 frames · number envelopes
                             │                                   │
                  send to group match-<id>              save envelope + latest status/positions
                             │                                   │
          Azure: Web PubSub service API          Azure: Cosmos container (snapshot store)
          Local: stand-in (same API)             Local: Cosmos emulator
                             │                                   │
                  browser (negotiate → json.webpubsub.azure.v1)  ◀── snapshot route reads the store
                  Vedant's screen · blue viewer until retired
```

- **Input arrives through:** an Event Hubs trigger (Azure Function) or the local runner (Event Hubs SDK), both calling
  the same core with a batch of messages.
- **Processing:** strict validation against `CONTRACTS.md`; duplicates dropped; setup held first; score and phase
  derived from goal shots and period markers; frames bundled 5 per `positions` envelope; one `seq` counter per match.
- **Output:** each envelope sent to `match-<id>` and saved; snapshot built from the store.
- **State retained:** per match: counter, score/phase, open bundle, recent duplicate keys. Saved to the store after each
  batch, so a restarted or moved Function instance continues the same numbering.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Browser protocol | Web PubSub `json.webpubsub.azure.v1` + `/negotiate`, locally and on Azure | Same browser code everywhere; Vedant's spec | Plain socket locally (rejected by Arnav) | **Agreed** · Arnav, 17 Oct |
| How the relay sends | Web PubSub service SDK `send_to_group`; locally pointed at the stand-in, which serves the same REST endpoint | Relay code identical | Separate local transport class (second code path) | Proposed |
| Senders on `match-<id>` | Relay only; stat panels from the stats engine reach the relay (D-02) | Vedant's dedupe by `seq` stays correct | Per-sender counters | **Agreed** · Arnav, 17 Oct |
| Relay hosting | Azure Function, Flex Consumption, Event Hubs trigger, one always-ready instance, state saved per batch | Diagram; Azure-native scoring | Container App (simpler state) | **Agreed** · Arnav, 17 Oct |
| Local runner | Small Python runner using the Event Hubs SDK and the same core | Event Hubs emulator support in the Functions trigger is unverified | Functions Core Tools locally (tried in S3; used if it works) | Proposed |
| Snapshot store | Cosmos container `screen` (partition key `match_id`): envelopes + one state document per match | Survives restarts; diagram's Snapshot API reads Cosmos | Relay memory (lost on restart) | Proposed · Arnav |
| Local store | Cosmos DB emulator in Docker, behind one small store interface (file store if the emulator can't do it) | Same SDK and code as Azure | File store only (doesn't test Cosmos) | Proposed · checked in S2 |
| Local stack location | `infra/local/` (compose: Event Hubs emulator, Azurite, Cosmos emulator, stand-in) | Must outlive `mock/` | Keep in `mock/emulator` (deleted later) | Proposed |
| Validation | Strict (unknown fields rejected, per `CONTRACTS.md`); a bad message is logged and skipped, the match keeps going | Live screen mustn't die on one bad record | Stop the whole run (Pranav's draft) | Proposed · D-05 |
| Bundling, status order, score | Reuse Pranav's rules: 5 frames of one period, flush on idle/period change; event before its status; score only from `Shot` with `shot_outcome: goal` | Already reasoned through | — | Proposed |

**Assumptions:** A-01 the Linux Cosmos emulator supports create/upsert/query by partition key (checked in S2). A-02 Web PubSub
Standard is needed for Azure tests (Free: 20k messages/day; one 20× match ≈ 9k per watching browser). A-03 Flex
Consumption supports an always-ready instance in the chosen region (checked in S4).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Hub messages | Generator → relay | §1.4 (PR #27), §2–§4 | No (merge #27) | Azeem, Arnav · pending merge |
| `event` envelope | Relay → browser | §7 | No: `data` is the full §3 event | — |
| `positions` envelope | Relay → browser | §7 + mock | **Yes:** `data = { frames: [1–5 frames, one period] }`; envelope time = last frame | Vedant · pending |
| `status` envelope | Relay → browser | §7 + mock | **Yes:** `data = { phase, period, score: {home, away} }`; first one also carries `setup`; phases `pre_match`, `live`, `half_time`, `full_time` | Vedant · pending |
| Stat panels | Stats engine → relay → browser | §7 `stats` kind | **Yes:** sent through the relay (D-02); payload defined by the stats flow | Stats owner (unassigned) · pending |
| `seq` | Relay → browser | §7 | **Yes:** one counter per match, relay only; starts at 1; survives relay restarts (stored); not the event `seq` | Vedant · pending |
| Snapshot | Store → snapshot route → browser | Vedant's spec + mock | **Yes:** one shape (D-03) | Vedant · pending |
| Negotiate | Stand-in / web route → browser | Vedant's spec | No: `{ baseUrl, url, token }` | — |

**Shared contract edits required:** `CONTRACTS.md` §7 (new subsections for `status`, `positions`, snapshot, sender and
`seq` rules). **Source of truth:** `CONTRACTS.md`.

## 8. File and specification map

| File or small related group | Add / modify | Responsibility | Governing spec | Owner / shared reviewer |
|---|---|---|---|---|
| `CONTRACTS.md` | Modify (hot) | §7 shapes and rules | — | Arnav · Vedant, Azeem, Pranav |
| `functions/specs/screen-relay.md` | Modify | Full relay spec (Vedant's way) | This plan | Arnav · Pranav |
| `infra/specs/local-development.md` | Add | Local stack, emulators, licences, run order, checks | This plan | Arnav · Pranav |
| `infra/specs/resources.md`, `security.md`, `costs.md` | Modify (screen-path sections) | Event Hubs, Web PubSub, Function, Cosmos container, identities, tiers, shutdown | This plan | Arnav · Pranav |
| `plans/REGISTRY.md` | Modify (hot) | Owners for relay, archiver, Web PubSub, Functions, Cosmos (D-07) | — | Arnav |
| `infra/local/docker-compose.yml`, `infra/local/eventhubs-config.json` | Add | Local stack (Event Hubs config moved out of `mock/`) | `local-development.md` | Arnav |
| `infra/local/webpubsub_standin/` | Add | Stand-in: service send API, `/negotiate`, client protocol, snapshot route from the store | `local-development.md` | Arnav |
| `functions/screen_relay.py` | Modify | Relay core (pure logic) | `screen-relay.md` | Arnav |
| `functions/relay_store.py`, `functions/relay_runner.py` | Add | Cosmos store; local runner | `screen-relay.md` | Arnav |
| `functions/function_app.py`, `functions/host.json`, `functions/requirements.txt` | Modify / add | Event Hubs trigger on Flex Consumption | `screen-relay.md` | Arnav |
| `functions/tests/` | Add | Core, store and end-to-end tests | `screen-relay.md` | Arnav |
| `infra/modules/event-hubs.bicep`, `web-pubsub.bicep`, `functions.bicep`, `cosmos.bicep`, `identity.bicep`, `storage.bicep`, `main.bicep`, `azure.yaml` | Modify (hot: `main.bicep`, `azure.yaml`) | Azure resources for the screen path | `resources.md`, `security.md` | Arnav · Pranav |
| `functions/README.md` | Modify | How to run locally and on Azure | — | Arnav |
| `mock/single-match-demo/app.js` | Modify | Connect via negotiate + protocol, read the new snapshot | `CONTRACTS.md` §7 | Pranav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on viewers | How it will be checked |
|---|---|---|---|---|
| Duplicate message (redelivery) | Applied once | — | None | Test with injected duplicates |
| Same identity, different content | Logged as conflict, first kept | Investigated from logs | None | Test |
| Invalid message | Logged with hub/partition/offset and skipped; counted | — | That message missing | Test |
| Frames before setup | Held (bounded), released after setup | Fail loudly if the bound is hit | Short delay | Test |
| Relay restart / Function instance moved | State reloaded from the store; numbering continues | Event Hubs checkpoint resumes after the last saved batch | Brief pause, no duplicate rows | Restart test locally and on Azure |
| Web PubSub send fails | Retried with backoff; envelope already saved | Browser catches up from snapshot on reconnect | Brief gap, recovered | Test with stand-in stopped |
| Store write fails | Batch not checkpointed; retried | Event Hubs redelivers; duplicates dropped | Delay | Test with emulator stopped |
| Browser refresh / late join | Join, buffer, snapshot, merge by `seq` | — | Full history of events/status, latest positions | End-to-end check |

## 10. Requirements specific to this work

- **Performance and load:** 20× = ~100 frames/s → ~20 `positions` envelopes/s plus events per match. Target: event
  enqueue → browser under 1 s at 1×; measured, not assumed.
- **Observability:** per match: received, dropped duplicates, invalid, sent, saved, last `seq`, lag; Application
  Insights on Azure.
- **Azure resources and access:** Event Hubs (Standard, groups `stats`, `relay`, `archiver`), Web PubSub (Standard, hub
  `live`), Function app (Flex Consumption, managed identity: Event Hubs Data Receiver, Web PubSub Service Owner, Cosmos
  data contributor on its container), Cosmos container `screen`, Storage for Functions. No keys in code.
- **Cost:** Event Hubs Standard ~$0.73/day; Web PubSub Standard ~$1.6/day; Flex Consumption always-ready instance and
  Cosmos small. Estimates to confirm against the pricing page for the region in S4.
- **Security and data:** synthetic data only; negotiate tokens scoped to `match-<id>` join; no secrets in the repo.
- **AI behavior / calculations:** Not applicable — deterministic relay.
- **Frontend experience:** Vedant's spec (connection badge, catch-up, reconnect) works unchanged locally and on Azure.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence |
|---|---|---|---|---|
| AC-01 | `CONTRACTS.md` §7 defines `status`, `positions`, snapshot, sender and `seq` rules, approved by Vedant | PR review | — | PR link |
| AC-02 | `screen-relay.md` and `local-development.md` agreed (status agreed) | PR review | — | PR link |
| AC-03 | Local stack starts with one command; Cosmos emulator passes create/upsert/query by partition key | Script | Docker, licences | Log |
| AC-04 | Stand-in: negotiate, join group, receive messages sent through the service API, snapshot route | Test client | — | Test output |
| AC-05 | Full 20× generator match → relay → stand-in: every event and frame accounted for, `seq` 1..N without gaps in live delivery, score and phase correct | Comparison script against the recorded match | `generator/cli.py live` | Report |
| AC-06 | Duplicates, invalid messages, frames before setup, store down, stand-in down behave as §9 | Tests | — | Test output |
| AC-07 | Relay restart mid-match continues numbering; refreshed browser catches up with no duplicate rows | Restart test | — | Report |
| AC-08 | Blue viewer works through negotiate + protocol | Manual run | Pranav | Screenshot |
| AC-09 | Same match on Azure (Event Hubs, Function, Web PubSub, Cosmos) by changing settings only | Same comparison script | Azure subscription | Report + metrics |
| AC-10 | Vedant's screen connects locally and on Azure without code changes between them | Joint run | Vedant's M3 | Screenshot |

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | AC | Estimate |
|---|---|---|---|---|---|
| S1 — Agree | #27 merged; §7 contract PR; relay + local-dev specs; registry owners | Arnav (Pranav helps) | Vedant's review | AC-01, AC-02 | 17–18 Oct |
| S2 — Local stack | `infra/local/` compose with all emulators and the stand-in; blue viewer on the protocol | Arnav; Pranav (viewer) | S1 | AC-03, AC-04, AC-08 | 18 Oct |
| S3 — Relay working locally | Core, store, runner, Function app; full match and failure tests | Arnav (Pranav helps) | S2 | AC-05, AC-06, AC-07 | 19–20 Oct |
| S4 — On Azure | Specs for resources/security/costs; Bicep; deploy; same tests on Azure; Vedant's screen on both | Arnav (Pranav helps) | S3, subscription | AC-09, AC-10 | 21–22 Oct |

- **Calendar check:** local flow ready for the 20 Oct checkpoint; Azure by 22 Oct, before 24 Oct feature-complete.
- **First integration checkpoint:** AC-05 (real generator → relay → browser, locally).
- **Parallel work:** Vedant builds M2–M4 against the mock stand-in now (same protocol); the archive flow can start
  its spec during S3.
- **Dependency-bound work:** S4 needs the Azure subscription and Standard Web PubSub.
- **Scope reduction:** none, per Arnav. If a day slips, S4 moves, not features.

## 13. Integration and change management

- **Branches / PRs:** `contracts/screen-envelopes` (§7 only) · `functions/screen-relay-spec` (specs, registry) ·
  `infra/local-stack` (compose, stand-in) · `mock/demo-protocol` (Pranav) · `functions/screen-relay` (code, tests) ·
  `infra/screen-azure` (Bicep, deploy).
- **Shared-file coordination:** `CONTRACTS.md`, `REGISTRY.md`, `main.bicep`, `azure.yaml` in dedicated commits; Vedant
  told before the §7 PR, Azeem told about #27.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `CONTRACTS.md` | PR #27 (§1.4) | Arnav · Azeem | Merge #27 first; §7 PR after | Pending |
| `plans/REGISTRY.md` | PR #26 (adds `mock/`, `plans/` rows) | Arnav | Merge #26 first | Pending |
| §7 browser contract | `PLAN_web_live-match-viewer.md` (draft), `web/specs/realtime.md` | Vedant | §7 PR agreed by Vedant; he updates his spec if D-03 changes it | Pending |
| `mock/single-match-demo/app.js` | `PLAN_mock_single-match-demo.md` (merged) | Pranav | Pranav makes the change | Pending |
| `mock/emulator/` → `infra/local/` | `PLAN_mock_live-feed.md` | Arnav | Copy now, delete with `mock/` later | Agreed (same owner) |
| Event Hubs decisions | Local draft `PLAN_infra_event-hubs.md` (not committed) | Arnav | Folded in here; draft discarded | Agreed (same owner) |

Scanned at `6f2f459` on 2026-10-17. Sources checked: plans ✓ · PRs ✓ (#26, #27 open) · branches ✓ · hot files ✓.

- **Configuration:** `OVERLAP_EVENTHUBS_NAMESPACE`, `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_COSMOS_ENDPOINT`, hub names; values
  never committed.
- **Documentation updates:** `functions/README.md`, `infra/specs/*`, `CONTRACTS.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks |
|---|---|---|---|---|---|
| R-01 | Cosmos emulator lacks a needed feature | Local store doesn't match Azure | Arnav | File store behind the same interface; Azure test in S4 | S2 |
| R-02 | Functions trigger can't use the Event Hubs emulator | Can't test the Function locally | Arnav | Local runner (same core) | S3 |
| R-03 | Flex Consumption always-ready unavailable in region | Cold starts slow the fast lane | Arnav | Pick a supported region, or Premium plan | S4 |
| R-04 | Future audience groups (overlays from agents) get their own numbering | Browser dedupe collides when it joins several groups | Arnav, Vedant | Rule now: `seq` is per group; browser dedupes on group + `seq` | Insight flow |

**Decisions (Arnav, 17 Oct):**
1. **D-01 Snapshot store:** Cosmos container `screen` (envelopes + one state doc per match, partition key `match_id`). **Agreed.**
2. **D-02 Stats panels:** the stats engine puts them on `match-events` with `kind=stats`; the relay forwards them. **Agreed.**
3. **D-03 Snapshot shape:** `{ match_id, setup, status, envelopes, rejected: { count, samples } }`, `rejected` always
   present. Written into `CONTRACTS.md` §7; Vedant renames `matchId` to `match_id` in his spec. **Agreed** (Vedant to approve the §7 PR).
4. **D-04 Region:** chosen after the Foundry quota check. **Agreed** (pending the check).
5. **D-05 Bad messages:** skip, log and count. **Agreed.**
6. **D-06 Web PubSub tier:** Free while wiring, Standard for full tests and the demo. **Agreed.**
7. **D-07 Registry:** Arnav owns relay, archiver, Web PubSub, Functions and Cosmos rows, with Pranav helping. **Agreed.**
8. **D-08 Blue viewer:** updated to the protocol now, retired when Vedant's screen works. **Agreed** (Pranav to confirm he makes the change).

## 15. Review, agreement, and handover

### Author’s submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked.
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Arnav | v1.1 | D-01 to D-08 decided | Decisions recorded; waiting for go | 17 Oct · this session |
| Vedant (§7 contract) | v1 | — | Pending | — |

**Implementation readiness:** ready for go on S1; S2–S4 follow its agreements.
**Next action and owner:** go · Arnav; review the §7 PR · Vedant; confirm the viewer change · Pranav.

### Handover after implementation

Pending implementation.
