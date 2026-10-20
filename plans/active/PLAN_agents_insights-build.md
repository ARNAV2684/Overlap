# PLAN_agents_insights-build — the insight flow: seven agents on real moments, local first

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Agents + MCP · build the insight flow: real stats moments → seven agents → checked cards on screen, locally first, then Azure by settings only |
| Author / primary owner | Arnav (layer 5 owner from 20 Oct; registry update is fix F6) |
| Collaborators and responsibilities | Azeem: football review of agent behaviour (human in the loop), producer of moments. Vedant: renders cards and modes. Pranav: author of the existing layer-5 specs and MCP reader this plan builds on |
| Review coordinator | Arnav |
| Affected component owners | Azeem (stats engine: `moments`, `match_state`, stat panels), Vedant (web app: cards, modes, `web/src/lib/contracts.ts`), Pranav (existing `agents/` and `mcp_server/` specs and code) |
| Proposal version and date | v0.1 · 2026-10-20 |
| Status | Ready for review |
| Plan tier and file | Full · `plans/active/PLAN_agents_insights-build.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · a1cef33 |
| Architecture box / work area | Layer 5 (agents, MCP server, moment trigger); touches layer 6 (Web PubSub stand-in) and the §10 handoffs to layer 7 |
| Relevant issue, spec PR, or discussion | Roadmap #41; specs #44; local MCP #45; stats S3 + agents guide #54; audit of 20 Oct (layer 5 drives two judging criteria and the Multi-Agent category) |

## 1. Purpose and intended outcome

- **Problem or need:** the stats engine now writes real moments (19.7 a match, #54), but nothing explains them.
  `agents/*.py` are placeholders, every prompt file is empty, and the MCP reader rejects real moments (D-02). Stage
  (c) "Explain", stage (e) "Personalise", recaps and multi-language storytelling are all missing, and they decide two
  judging criteria and our target category (Best Multi-Agent System).
- **Proposed outcome:** each real moment flows through seven agents with distinct roles — spotter, tactical analyst,
  narrator, fact-checker, translator, director, recap writer — sharing state and handing off explicitly, recovering
  from failures, and producing checked cards for four viewer modes (casual, analyst, player focus, favourite club) in
  four languages (English, Spanish, Hindi, French), delivered live to the screen. Everything runs locally first
  (Foundry Local + emulators); Azure Foundry is a settings switch at the end.
- **Benefit to viewers or teammates:** viewers get explanations, not just numbers, in their mode and language; Vedant
  gets cards to render; judges see real multi-agent collaboration with Microsoft Foundry and Agent Framework.
- **Success statement:** a 20× match on the local stack produces, for every admitted moment, a fact-checked card per
  mode and language on the browser, with zero wrong numbers published in the evaluation set, and the same run passes
  on Azure with only settings changed.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Stats producer | main · `stats/` (#51, #53, #54); `stats/agents-guide.md` | Moments in Cosmos `live/moments` (`kind="moment"`, create-once, stable `MO-<match>-<ordinal>`), `match_state` (`id="state"`), stat panels. Eight triggers (`sprint` deferred). Per-role guidance for every agent. 63 tests pass; fixture `SYN-1017` gives 21 moments |
| MCP server | main · `mcp_server/` (#45) | One read-only tool, `get_match_state`, reading a stored moment's frozen context. Strict schema accepts only `shot_cluster` and rejects `context.players` (D-02) |
| Agent specs | `agents/specs/agents.md`, `workflow.md`, `prompts.md`, `fact-checking.md`, `evaluation.md`; `functions/specs/moment-trigger.md`; `mcp_server/specs/tools.md` | "Draft for review", shot-cluster first slice. Job/lease/budget/outbox design, limits, failure table, evaluation discipline — kept by this plan. Spotter as code gate, merged analyst+narrator, deferred translator/recap, "no player-focus mode" — changed by this plan (§6) |
| Shared contracts | `CONTRACTS.md` §1.3, §4.2, §5, §5.1, §6, §7, §7.4, §8, §10 | §10 is "proposed, not agreed" and covers `shot_cluster` only |
| Agent code | `agents/*.py`, `agents/prompts/*.md`, `agents/evals/*.py`, `functions/moment_trigger.py` | Placeholders |
| Local stack | `infra/specs/local-development.md`, `infra/local/` | Emulators + Web PubSub stand-in (match groups only; no audience groups, no insights snapshot) |
| Decisions in conversation | Arnav, 20 Oct | Layer 5 owner Arnav; seven separate agents; local first, Azure later with a $25 cap; hybrid spotter; languages en/es/hi/fr; modes casual/analyst/player/club; player tags from `match_state`; #57 R-01/R-02/R-04 approved |

**Differences between references:**
- Pranav's specs vs Arnav's decisions (seven agents, full scope): resolved by fix F3 (spec update) before code.
- `stats/agents-guide.md` §4 says the spotter "decides" and should admit all high-priority moments and thin the rest;
  `agents/specs/agents.md` §1 says the spotter "does not invent importance scores". Resolved by the hybrid spotter.
- `CONTRACTS.md` §10.3 lets the insights expiry check read the relay's `screen` documents; those are the relay's
  private storage, not a contract. Resolved in F4 with a contracted playhead.
- `mcp_server/samples/MO-1017-0001.json` is the KES shot cluster; a real engine run numbers it `MO-1017-0013`.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Fixes F1–F7 (MCP reader, live moments check, specs, §10 contract, storage spec status, registry, knowledge notes) | Changes to the stats engine's triggers or packs (Azeem); the `sprint` trigger (deferred by Azeem) |
| Model switch: Foundry Local now, Azure Foundry later by settings; budget guard; translator adapter | Card rendering, viewer-mode UI and replay page (Vedant) |
| MCP tools for the analyst; player speed/distance for player tags | Season-level aggregates (`season` container has no owner — Arnav decides) |
| Shared job state, leases, budgets, outbox, recovery; moment trigger (local poller + Azure change-feed adapter) | Voice (Azure Speech) — optional extension |
| Seven agents and their prompts | Azure Bicep for all services (team Azure pass, Arnav; this plan only lists what layer 5 needs) |
| Delivery: insights publisher, audience and player groups, insights snapshot in the stand-in | Auto-eventing from video |
| Evaluation bench on real generated matches; Azeem's review sheet and gold set | |
| Local live end-to-end; Azure switch on Arnav's go | |

- **Minimum complete result:** F1–F7, M1–M6: a local 20× match produces checked cards in all four modes and four
  languages on the browser, with recovery tests passing and zero wrong numbers in the evaluation set.
- **Optional extension:** voice read-out of cards (Azure Speech); Foundry evaluations (groundedness, fluency) as a
  diagnostic.
- **Boundary with neighbouring components:** starts at a `kind="moment"` document in Cosmos `moments` and at
  `match_state`; ends at §7 envelopes on audience/player Web PubSub groups, overlays persisted in Cosmos `overlays`,
  and the insights snapshot. The web app renders; the stats engine computes every number.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Moments + `match_state` in Cosmos | Azeem | Producer, as built in #54 | Built; live Cosmos write unproven (D-03) · F2 | Replay `--moments` output and the fixture |
| `CONTRACTS.md` §10 promoted and extended | Azeem (producer), Vedant (consumer) | Agreement on F4 | Pending · F4, before M5 | Code against the F4 draft only after agreement |
| Card rendering, modes, languages, player tags | Vedant | Consumer of overlays and groups | Not started · M5 | Blue viewer shows raw envelopes |
| Existing specs and MCP code | Pranav | Told of the changes in F1, F3 | Pending · F1, F3 | — |
| `functions/function_app.py` (relay + archiver live there) | Arnav | Moment-trigger registration | Same owner · M3 | Local poller runs outside the Functions host |
| Web PubSub stand-in | Arnav | Audience groups, insights snapshot | Same owner · M5 | — |
| Foundry Local install / model download | Arnav | Licence and download approval | Pending · M1 | Unit tests with stubbed models |
| Azure Foundry, Translator, budget alert | Arnav | Go for the switch; $25 cap | Approved in principle; on Arnav's go · M7 | Local only |
| Azeem's review time | Azeem | Two review rounds (~40–50 items per agent) | Pending · M6 | Automatic checks only |
| `plans/REGISTRY.md` | Arnav | Layer 5 owner | F6 | — |

**My owned deliverables:** everything under `agents/`, `mcp_server/`, `functions/moment_trigger.py` and their specs;
the stand-in changes; this plan.
**Shared deliverables:** `CONTRACTS.md` §10 (with Azeem and Vedant); knowledge notes (docs unassigned, Arnav
decides; Pranav maintains the notes).

## 5. Proposed flow

```text
Cosmos moments (kind=moment) ──local poller (1 s) / Azure change feed──▶ moment trigger: claim job:<moment_id> once
          │                                                                          │
          │   shared state in `moments`: insight_job (lease, budget, stage outputs), insight_outbox
          ▼                                                                          ▼
 1 SPOTTER ─admit/merge/suppress─▶ 2 ANALYST ⇄ MCP tools ─why─▶ 3 NARRATOR (casual, analyst, player, club)
   code rules + small-model rank       (match_state, player context,         │ §5.1 lines + claims
                                         pressing, pass network…)             ▼
                                                              4 FACT-CHECKER (code numbers → model meaning;
                                                                ≤2 rewrites → labelled template)
                                                                              ▼
                                                              5 TRANSLATOR (es, hi, fr; words only; re-check)
                                                                              ▼
                                                              6 DIRECTOR (priority, timing, visual, groups,
                                                                player tags, expiry) ─▶ outbox ─▶ Cosmos overlays
 7 RECAP WRITER at full time (all moments + final match_state) ─────────────────────▶ recap card
                                                                              ▼
                       insights publisher ─▶ match-<id>-<mode>-<lang> · match-<id>-player-<playerId> ─▶ cards
```

- **Input arrives through:** a new `kind="moment"` document (poller locally; Cosmos change feed with a lease
  container on Azure).
- **Processing performed here:** admission, context, explanation, narration, checking, translation, direction,
  persistence and delivery; recap at full time.
- **Output goes to:** Web PubSub audience and player groups; Cosmos `overlays`; the insights snapshot.
- **Execution relationship:** one running job per match and two globally; agents run in sequence inside a job;
  the publisher runs on the outbox; the recap runs once per match at full time.
- **State retained:** job, budget and outbox documents in `moments`; overlays, deliveries and per-group counters in
  `overlays`. Everything else is temporary.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Agent structure | Seven separate agents with explicit handoffs and shared job state | Multi-Agent criteria: distinct roles, shared state, handoffs, recovery; the rules ask for recaps and multi-language | Pranav's slice (analyst+narrator merged, translator/recap deferred): fewer calls, weak for the category | Agreed (Arnav, 20 Oct) |
| Spotter | Hybrid: code rules from `agents-guide.md` §4 (admit every high-priority moment, merge same-event moments, one swing/press per team per 10 min when the budget is tight, budget/freshness) + a small-model ranking of remaining normal moments, behind a setting | Safe and cheap with a real agent decision where judgement matters | Code only (not an agent) or model only (no hard guards) | Agreed (Arnav, 20 Oct) |
| Model runtime | One client factory in `agents/config.py`: Foundry Local (OpenAI-compatible) now, Azure Foundry later; selected by settings | Local first, no cost while building; same code on Azure | Azure from day one: cost and quota before the flow works | Agreed (Arnav, 20 Oct) |
| Azure spending | Off until Arnav's go; then a $25 hard cap with a budget alert; reasoning effort low | Cost control | — | Agreed (Arnav, 20 Oct) |
| Model choice on Azure | GPT-5 mini, or the closest current mini model if it is deprecating (checked at the switch) | Cheap, good enough for short checked lines | Larger models: cost | Proposed |
| Languages | English + Spanish, Hindi, French via Azure AI Translator (words only); local fake offline; checker re-runs per language | Rule (vi); Microsoft service; numbers can't drift | Model translation: more calls, more drift | Agreed (languages, Arnav 20 Oct); service Proposed |
| Modes | `casual`, `analyst`, `player` (followed player), `club` (favourite-club perspective) | Rule (e) names player-focus and favourite club | Two modes only: misses named features | Agreed (Arnav, 20 Oct) |
| Player tags | Player speed/distance from `match_state` via an MCP tool; the director emits tags to `match-<id>-player-<playerId>` when a threshold is crossed | Rule (ii) without changing Azeem's engine (`sprint` deferred) | Ask Azeem for `sprint`: cleanest, more work for him | Agreed (Arnav, 20 Oct) |
| Director | Rules (priority, timing, visual per trigger from the guide, groups, expiry); no model required | Deterministic routing is safer; still a distinct agent stage with its own state | Model-chosen destinations: unpredictable | Proposed |
| Fact-checking | Step 1 code: each number ↔ one fact key, compared with the **stored** value at its `decimals` (never re-round), units xG/m/min/%, score only from goal facts, `shot_is_penalty` for "from the spot", press direction from the two rate facts; step 2 model meaning check; ≤2 rewrites; then template | Numbers come from code; agrees with Pranav's spec and Azeem's guide; Python rounds halves to even, so re-rounding could disagree | Model-only checking: unsafe | Proposed |
| Insights expiry playhead | A contracted playhead (latest base-stream status/snapshot per §7.3), not the relay's internal `screen` documents | Relay storage is private; contracts only | Read `screen` directly (#44 proposal): couples to internals | Proposed · F4 |
| Delivery | Insights publisher is the single sender per audience group, persistent per-group `seq` in `overlays`, save-before-send (#44 §10.4) | One sender per group (§7.1); recovery without duplicates | — | Agreed design (#44), extended in F4 |
| Hosting on Azure | Moment trigger + publisher in the existing Functions app (one instance), so audience `seq` has one writer | The relay already relies on one instance | Separate app: needs its own single-writer guarantee | Proposed |

**Assumptions** (checked in the named milestone):
- The Cosmos emulator supports the queries the poller needs (`kind`, ordered by `_ts`/id) — M3.
- Foundry Local runs a small model on the team laptop alongside a reduced stack — M1 (memory is tight).
- Agent Framework's Foundry Local and Foundry cloud clients can sit behind one factory — M1 (verify current package
  names and versions on Microsoft Learn at implementation time).
- Moments are written to a live Cosmos exactly as in replay — F2.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Moment document | Stats → agents/MCP | `CONTRACTS.md` §10.2 + `context.players`; `stats/agents-guide.md` §2 | No change to the shape; §10 promoted from "proposed" to agreed for all eight triggers (F4) | Azeem, Arnav · pending F4 |
| Match state | Stats → MCP | §4.2 | No | Azeem · agreed (#50) |
| Narrated line | Narrator → fact-checker/translator | §5.1 | No (modes extended below) | Arnav |
| Overlay | Director → publisher → web | §6, §10.3 | Yes: add `period`; `mode` values `casual`, `analyst`, `player`, `club`; `lang` `en`, `es`, `hi`, `fr`; one overlay per moment per audience; all triggers | Arnav, Vedant · pending F4 |
| Audience/player groups | Publisher → web | §7 groups, §10.4 | Yes: modes/languages above; player tags on `match-<id>-player-<playerId>` | Arnav, Vedant · pending F4 |
| Insights snapshot | Stand-in / web route → web | §10.4 | Yes: promoted; expiry uses a contracted playhead | Arnav, Vedant · pending F4 |
| Job/outbox/budget documents | Agents ↔ agents | `agents/specs/workflow.md` §2 | Internal to layer 5 (same container as moments, filtered by `kind`) | Arnav |

- Identity and dedupe: by `moment_id`; overlays `OV-NNNN-NNNN`; per-group `seq`; repeats are no-ops; conflicting
  content is an error, never an overwrite.
- Missing facts are left out by the producer; agents never invent or zero-fill them.
- Representative input: the 21 moments of `stats/tests/fixtures/SYN-1017` (`main.py replay … --moments`).

**Shared contract edits required:** `CONTRACTS.md` §10 (F4), in its own commit, agreed by Azeem and Vedant.
**Source of truth:** `CONTRACTS.md`; layer-5 internals in `agents/specs/*.md` and `mcp_server/specs/tools.md`.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_agents_insights-build.md`, `PLAN_agents_insights-build_S0.md` | Add | This plan; the fixes sprint | — | Arnav |
| `plans/active/PLAN_agents_ai-insights-mcp.md` | Modify (F3) | Record that this plan supersedes its M3–M5 scope | — | Arnav / Pranav told |
| `mcp_server/schema.py`, `mcp_server/tests/*`, `mcp_server/specs/tools.md`, `mcp_server/README.md` | Modify (F1, M2) | Accept real moments (D-02); then more tools | `tools.md` | Arnav / Pranav told |
| `mcp_server/tools/*.py`, `mcp_server/server.py`, `mcp_server/data_access.py` | Modify (M2) | `match_state`, `player_context`, `compare_periods`, `pressing`, `pass_network` | `tools.md` (M2 additions in F3) | Arnav |
| `agents/specs/agents.md`, `workflow.md`, `prompts.md`, `fact-checking.md`, `evaluation.md` | Modify (F3) | Seven agents, modes, languages, all triggers, local-first model, checker rules | Themselves | Arnav / Pranav told |
| `functions/specs/moment-trigger.md` | Modify (F3) | Local poller + Azure change feed, all triggers | Itself | Arnav |
| `CONTRACTS.md` §10 (own commit) | Modify (F4) | Promote and extend the handoffs | Itself | Arnav, Azeem, Vedant |
| `archiver/specs/storage.md` | Modify (F5) | Status line to agreed | Itself | Arnav |
| `plans/REGISTRY.md` | Modify (F6) | Layer 5 owner | — | **Arnav only** |
| `docs/knowledge/ai-insights.md`, `mcp.md`, `storage.md`, `README.md` | Modify (F7, then each milestone) | Status, ownership, D-02 | Knowledge-sharing spec | Arnav / Pranav told |
| `agents/config.py`, `agents/pyproject.toml` (new), `agents/README.md` | Modify / add (M1) | Settings, model factory, budget guard, translator adapter, pinned dependencies | `agents.md` §8 (as updated) | Arnav |
| `agents/state.py`, `agents/workflow.py`, `agents/fallbacks.py` | Modify (M3) | Job, leases, budgets, outbox, orchestration, per-trigger templates | `workflow.md` | Arnav |
| `functions/moment_trigger.py` | Modify (M3) | Local poller + Azure change-feed adapter, same entry point | `moment-trigger.md` | Arnav |
| `functions/function_app.py` (hot for relay/archiver) | Modify (M3, own commit) | Register the moment trigger and publisher | `moment-trigger.md` | Arnav |
| `agents/spotter.py`, `analyst.py`, `narrator.py`, `fact_checker.py`, `translator.py`, `director.py`, `recap_writer.py` | Modify (M4) | The seven agents | `agents.md`, `fact-checking.md` | Arnav |
| `agents/prompts/*.md` | Modify (M4, M6) | Role, inputs, output format, rules, examples per agent | `prompts.md` | Arnav; Azeem reviews rules |
| `agents/publisher.py` (new) | Add (M5) | Single sender per audience/player group; `overlays` persistence | `workflow.md`, §10.4 | Arnav |
| `infra/local/webpubsub_standin/standin/*` | Modify (M5) | Insights snapshot endpoint; audience/player groups | `infra/specs/local-development.md` §3 | Arnav |
| `infra/specs/local-development.md`, `infra/local/env.example` | Modify (M1, M5) | Model, translator and agents settings (names only); run order | Itself | Arnav |
| `agents/evals/*.py`, `agents/evals/review_sheet.py` (new) | Modify / add (M6) | Recall, numeric accuracy, faults, latency; Azeem's review sheet and gold set | `evaluation.md` | Arnav |
| `agents/tests/*` (new) | Add (M1–M6) | Unit, recovery and integration tests (no model calls in unit tests) | `evaluation.md` | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Duplicate moment notification | Same job reused; nothing sent twice | Conditional create of `job:<moment_id>` | None | Recovery test (M3) |
| Same event fires several moments | Spotter shows the highest priority; others feed the same card | Merge rule | One card | Spotter test (M4) |
| Model slow, failing, over budget or disabled | Labelled template from validated facts (`verified=false, fallback=true`) | Bounded attempts and deadline | Card still shown, marked as template | Fault tests (M3, M6) |
| Number not supported by a fact | Rejected; rewrite ≤2; then template | Fact-checker | No wrong number published | Numeric accuracy eval (M6) |
| Translation changes a number or claim | Rejected for that language; English template translated words-only, else that language suppressed | Checker re-run per language | That language shows a template or nothing | Translator test (M4) |
| Crash after claim / after outbox / after send | Resume the same job; resend the same `seq` and overlay id | Leases, outbox, dispatcher | Receiver dedupes | Recovery tests (M3, M5) |
| Card too late (period changed or > 5 match minutes behind the playhead) | Suppressed and recorded | Expiry wins | Nothing stale shown | Expiry test (M5) |
| MCP scope or version mismatch | Rejected and recorded; no template hides it | — | Visible error count | MCP negative tests (F1, M2) |
| Cosmos or stand-in unavailable before claim/outbox | Nothing sent; retried within the deadline | Durable state | Delayed or suppressed card | Integration test (M5) |
| Foundry Local not running | Clear startup error; unit tests unaffected | Start it, or switch settings | Local runs only | Smoke test (M1) |

## 10. Requirements specific to this work

- **Performance and load:** about 20 moments a match, about 12 admitted; target p95 ≤8 wall seconds from moment
  write to card ready (unmeasured until M7). At 20× a moment ages about 3 match minutes by then, inside the 5-minute
  expiry. Re-measure before any speed increase.
- **Observability:** per job: moment id, stages reached, model calls, tokens, verdicts, template/suppress reasons,
  latency per stage; per match: admitted/suppressed/expired counts. Application Insights on Azure.
- **Azure resources and access:** none created by this plan until Arnav's go (M7): Foundry project + model
  deployment, Azure AI Translator, budget alert; Cosmos lease container for the change feed; managed identity roles
  (read `moments`, `match_state`, `stats`; write `moments` job docs and `overlays`; Web PubSub send). Listed for the
  team's Azure pass.
- **Cost:** local: none. Azure: about $0.002–0.005 per moment, $0.05–0.15 per match, $5–15 for tuning (third-party
  price trackers, 20 Oct; verify on the Azure pricing page at the switch). Hard cap $25. Translator within its free
  tier.
- **Security and data:** validate every input document; read-only MCP; managed identity on Azure; no keys in the
  repo; storyline answer keys never reach any agent input.
- **AI behavior:** only evidence facts may be cited; names from `context`; wording rules from `agents-guide.md` §4;
  structured outputs; ≤2 rewrites; labelled templates; per-call and per-match limits from `workflow.md` §3.
- **Frontend experience:** Not applicable here — rendering is Vedant's; this plan supplies payloads and groups.
- **Synthetic data or calculations:** evaluation uses generated matches only (season, storyline and control runs,
  regenerated locally); no number is computed by an agent.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-F1 | Every moment of the `SYN-1017` replay passes `parse_moment`, and invalid variants are still rejected | `mcp_server` tests | Replay output | Pending implementation |
| AC-F2 | A live local match writes its moments to Cosmos `moments` identically to a replay of the same recording, and `match_state` is updated after each | Live run + comparison | Local stack | Pending implementation |
| AC-F3 | Updated specs state seven agents, four modes, four languages, all triggers, and the checker rules, with status lines | Spec review | — | Pending implementation |
| AC-F4 | `CONTRACTS.md` §10 agreed by Azeem and Vedant in review | PR review | — | Pending implementation |
| AC-01 | With Foundry Local running, a smoke call succeeds; switching to Azure settings without credentials fails clearly; unit tests make no model calls | Smoke + unit tests | Foundry Local | Pending implementation |
| AC-02 | A real MCP client calls every tool against moments written by `stats/main.py live`; negative tests fail visibly | MCP integration tests | Local stack | Pending implementation |
| AC-03 | The workflow recovery cases (duplicate, crash after claim, crash after outbox, partial audience, ambiguous send, restart past deadline) pass with models stubbed | Recovery tests | — | Pending implementation |
| AC-04 | On `SYN-1017` and ≥3 recorded matches, all seven agents run locally and produce lines for four modes and four languages; zero wrong numbers published | Offline run + numeric check | Foundry Local | Pending implementation |
| AC-05 | A browser receives cards for its mode and language and player tags for a followed player from a local live run; a late joiner catches up through the insights snapshot | Live run | Local stack | Pending implementation |
| AC-06 | Offline report over ~20 generated matches (storylines + controls): recall, numeric accuracy, fault results, template/suppression rates; Azeem's review sheet produced and his answers imported into prompts and a gold set | Eval bench | Generated matches | Pending implementation |
| AC-07 | A 20× local live run end to end with p50/p95 latency and suppressed/expired counts; then the same run on Azure with settings only, within the $25 cap | Live run; Azure run on Arnav's go | Local stack; Azure | Pending implementation |

**Validation limits:** local-model output quality is not representative; prompt quality is judged on the Azure
model after M7. Azure identity, quotas and change-feed behaviour are unproven until M7.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| S0 — Fixes F1–F7 | Real moments pass the reader and land in a live Cosmos; specs and §10 updated; registry and notes current | Arnav | Azeem, Vedant agreement for F4 | AC-F1–F4 | 20–21 Oct |
| M1 — Model switch | Foundry Local behind one settings-driven factory; budget guard; translator adapter | Arnav | F3; Foundry Local download | AC-01 | 21 Oct |
| M2 — MCP tools | Analyst tools over real moments and `match_state` | Arnav | F1 | AC-02 | 21 Oct |
| M3 — State and workflow | Jobs, leases, budgets, outbox, recovery; local poller | Arnav | F3, M1 | AC-03 | 22 Oct |
| M4 — Seven agents | All agents and prompts; four modes, four languages | Arnav | M2, M3 | AC-04 | 22–23 Oct |
| M5 — Delivery | Publisher, groups, insights snapshot; cards on a browser | Arnav (Vedant renders) | F4, M4 | AC-05 | 23 Oct |
| M6 — Evaluation and review | Bench on ~20 matches; Azeem's review round 1 | Arnav, Azeem | M4 | AC-06 | 23–24 Oct |
| M7 — Live and Azure | Local live run; Azure switch on Arnav's go; review round 2 on the real model | Arnav, Azeem | M5, M6 | AC-07 | 24–25 Oct |

- **Project calendar check:** required features by 24 Oct: M1–M6 fit. M7's Azure switch and Azeem's second round
  fall on 24–25 Oct, overlapping the freeze; flagged as the main calendar risk (R-05).
- **First integration checkpoint:** F2 (real stats engine → real local Cosmos), then AC-02 (MCP on live data).
- **Parallel work:** F1 and F2 are independent; M1 and M2 can run in parallel; Vedant can build card UI from F4
  sample payloads during M3–M4.
- **Dependency-bound work:** M5 waits on F4 agreement; M7 waits on Arnav's go.
- **Scope reduction if time runs short:** cut first the optional voice, then the small-model ranking in the spotter
  (code rules only), then the `compare_periods`/`pass_network` tools. Never cut fact-checking, recovery, modes or
  languages.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** one branch per fix and per milestone from fresh `main`:
  `mcp_server/real-moments` (F1), `agents/specs-seven-agents` (F3), `contracts/insights-handoffs` (F4),
  `archiver/storage-agreed` (F5), `registry/layer5-owner` (F6), `docs/knowledge-layer5` (F7);
  then `agents/model-switch` (M1), `mcp_server/tools` (M2), `agents/workflow` (M3), `agents/seven-agents` (M4),
  `agents/delivery` (M5), `agents/evals` (M6), `agents/live-azure` (M7). Each milestone gets its own sprint plan
  (`PLAN_agents_insights-build_S<n>.md`) when it starts.
- **Shared-file coordination:** `CONTRACTS.md` in its own PR (F4); `functions/function_app.py` in its own commit
  (M3); `plans/REGISTRY.md` by Arnav only (F6); Pranav told when his specs and MCP code change.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `agents/specs/*`, `mcp_server/*`, `functions/specs/moment-trigger.md`, `CONTRACTS.md` §10 | `PLAN_agents_ai-insights-mcp.md`, `_S1.md`, `_S2.md` | Pranav (author); layer 5 now Arnav | This plan supersedes their M3–M5 scope; F3 records it in the parent plan; his merged code is extended, not replaced | Pending (Pranav told) |
| Cosmos `moments`, `match_state` | `PLAN_stats_engine.md` (S4 on Azure) | Azeem | Read-only consumer; job/outbox docs filtered by `kind` (agreed in his guide) | Agreed (#54 guide) |
| `CONTRACTS.md` §6, §7 groups, §10.3–§10.4; `web/src/lib/contracts.ts` | `PLAN_web_live-match-viewer.md`, `PLAN_web_replay.md` | Vedant | F4 contract PR agreed before either side's code | Pending |
| `archiver/specs/storage.md` | `PLAN_web_replay.md` (R-04), `PLAN_archiver_archive-flow.md` | Vedant, Arnav | F5 sets status to agreed, as Vedant asked | Agreed (Arnav, 20 Oct) |
| `functions/function_app.py` | `PLAN_functions_screen-relay.md`, `PLAN_archiver_archive-flow.md` | Arnav | Same owner; own commit in M3 | Agreed (same owner) |
| `infra/local/webpubsub_standin/*`, `infra/specs/local-development.md`, `infra/local/env.example` | `PLAN_functions_screen-relay.md` | Arnav | Same owner | Agreed (same owner) |
| `docs/knowledge/*` | `PLAN_docs_knowledge-sharing.md`, `PLAN_docs_graphify-knowledge-map.md`, `PLAN_web_replay.md` (archiver note) | Pranav, Vedant | Notes updated in their own commits; this plan does not edit `archiver.md` | Pending (Pranav told) |
| `plans/REGISTRY.md` (hot) | — | Arnav | F6 by Arnav | Agreed (same owner) |

  **Scanned at `a1cef33` on 2026-10-20. Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ (none touch
  these files) · hot files ✓ (`CONTRACTS.md`, `plans/REGISTRY.md`).**
- **Integration procedure:** local stack per `infra/specs/local-development.md`; stats `main.py live`; Foundry Local;
  the agents runner; a generator match at 20×; blue viewer or Vedant's app joined to an audience group.
- **Configuration or setup changes:** new settings by name only (model provider, endpoints, deployment names,
  translator endpoint, budgets, modes, languages); local values in the untracked env file.
- **Deployment or data changes, if applicable:** Azure resources only at M7, on Arnav's go.
- **Documentation updates:** specs (F3), `CONTRACTS.md` §10 (F4), `agents/README.md`, `mcp_server/README.md`,
  `infra/specs/local-development.md`, knowledge notes.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Live Cosmos moments behave differently from replay (D-03) | Agents build on an unproven write path | Arnav, Azeem | F2 before M2 | M2 |
| R-02 | Vedant or Azeem disagree with the §10 extensions | Cards can't render or moments don't fit | Arnav, Vedant, Azeem | F4 review first | M5 |
| R-03 | Local small model too weak to judge prompt quality | Wrong prompt tuning | Arnav | Plumbing only locally; tune on Azure at M7 | M7 quality |
| R-04 | Laptop memory with stack + local model | Killed processes | Arnav | Run only needed services; Foundry Local with the stack down where possible | M1–M7 |
| R-05 | Calendar: Azure switch and review round 2 on 24–25 Oct | Real-model tuning squeezed into the freeze | Arnav | Switch earlier if M4 lands on 22 Oct | M7 |
| R-06 | Latency at 20× (≤8 s p95 unmeasured) | Many cards expire | Arnav | Measure in M7; fewer calls for normal triggers | M7 |
| R-07 | Season loader has no owner | Recap writer is match-only | Arnav decides | Match recaps only until decided | M4 (recap scope) |
| R-08 | Order of Vedant's work (replay vs charts vs cards) undecided | Cards may not render by 24 Oct | Arnav (decide later, 20 Oct) | Blue viewer shows envelopes meanwhile | M5 visual |

**Decisions requested from Arnav or affected owners:**

1. **F4:** Azeem and Vedant agree the §10 promotion and extensions (modes, languages, `period`, player tags,
   contracted playhead, insights snapshot).
2. **F6:** record layer 5 = Arnav in `plans/REGISTRY.md`.
3. **M1:** approve the Foundry Local download and the small local model.
4. **R-07, R-08:** season loader owner; order of Vedant's work.
5. **M7:** the date of the Azure switch (recommend as soon as M4 passes locally).

## 15. Review, agreement, and handover

### Author's submission checklist

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
| Arnav | v0.1 | — | Pending | — |

**Implementation readiness:** S0 (fixes) ready for go; M1–M7 after S0 and F4 agreement.
**Relevant specification agreement:** pending (F3, F4).
**Next action and owner:** review this plan and S0; say go for S0 · Arnav.

### Handover after implementation

**Pending implementation.**
