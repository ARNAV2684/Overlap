# PLAN_agents_insights-build_S0 — fixes before the agents are built

| Field | Complete this |
|---|---|
| Sprint | S0 — fixes F1–F7: real moments readable, proven in a live Cosmos, specs and contracts brought to the agreed design |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | S0 · AC-F1, AC-F2, AC-F3, AC-F4 |
| Author / owner | Arnav |
| Status | In progress (F1 #58, F5 #59, F6 #60; F2 running; F3 this PR) |
| Reviewed branch and commit | main · a1cef33 |
| Planned branch | One per fix: `mcp_server/real-moments`, `agents/specs-seven-agents`, `contracts/insights-handoffs`, `archiver/storage-agreed`, `registry/layer5-owner`, `docs/knowledge-layer5` (F2 changes no files) |

## 1. Outcome

- **What will work at the end of this sprint:**
  - Every real moment the stats engine writes passes the MCP reader (D-02).
  - A live local match is shown to write its moments to Cosmos `moments` exactly as a replay does, with
    `match_state` updated after each (D-03).
  - Layer-5 specs describe seven agents, four modes, four languages, all eight triggers and the fact-checker rules;
    `CONTRACTS.md` §10 is promoted and extended with Azeem's and Vedant's agreement; `storage.md` is agreed; the
    registry and knowledge notes are current.
- **Not in this sprint:** any agent, model, tool or delivery code (M1–M7).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Stats moments (#54) and agents guide | `stats/`, `stats/agents-guide.md` | Yes (merged) |
| Local stack for F2 | `infra/local/`, `infra/specs/local-development.md` | Yes (Docker up when needed) |
| Arnav's decisions (seven agents, modes, languages, hybrid spotter, player tags, local first) | Conversation, 20 Oct; parent plan §6 | Yes |
| Azeem's and Vedant's review of F4 | PR review | No — blocks merging F4, not drafting it |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `mcp_server/schema.py` | Modify (F1) | Accept `context.players`; all eight trigger values and their fact keys (`decimals` 0 or 2, optional unit `xG`/`m`/`min`/`%`, 2–7 facts); `event_ids` 1–500; engine ordinals. Strict elsewhere | `mcp_server/specs/tools.md` |
| `mcp_server/tests/*` | Modify / add (F1) | Every `SYN-1017` replay moment passes; invalid variants still fail | `tools.md` |
| `mcp_server/specs/tools.md`, `mcp_server/README.md` | Modify (F1) | Record the accepted shapes; the sample `MO-1017-0001` is a constructed sample (a real run numbers it `MO-1017-0013`) | Itself |
| `agents/specs/agents.md`, `workflow.md`, `prompts.md`, `fact-checking.md`, `evaluation.md` | Modify (F3) | Seven agents; hybrid spotter; separate analyst and narrator; translator (en/es/hi/fr) and recap now; modes casual/analyst/player/club; all triggers; local-first model client; checker compares stored values, press direction from rate facts, score only from goal facts | Themselves |
| `functions/specs/moment-trigger.md` | Modify (F3) | All triggers; local poller and Azure change feed share one entry point; lease container on Azure | Itself |
| `plans/active/PLAN_agents_ai-insights-mcp.md` | Modify (F3) | Note that `PLAN_agents_insights-build` supersedes its M3–M5 scope | — |
| `CONTRACTS.md` §10 (own commit, own PR) | Modify (F4) | Promote to agreed for all triggers; overlay `period`; modes and languages; player tags group; contracted playhead for expiry; insights snapshot | Itself |
| `archiver/specs/storage.md` | Modify (F5) | Status line to agreed (Vedant's R-04) | Itself |
| `plans/REGISTRY.md` | Modify (F6, Arnav only) | Layer 5 (agents, MCP, moment trigger) owner: Arnav | — |
| `docs/knowledge/ai-insights.md`, `mcp.md`, `storage.md`, `README.md` | Modify (F7) | Ownership, status, D-02, the build plan | Knowledge-sharing spec |
| `plans/active/PLAN_agents_insights-build*.md` | Modify | Status and handover | — |

## 4. Steps

1. **F1:** extend `schema.py`; generate the 21 `SYN-1017` moments with `stats/main.py replay … --moments` in the
   test and assert each parses; keep the negative tests; update `tools.md` and the README. PR → Arnav.
2. **F2 (no file changes):** start the local stack, the stats engine (`main.py live`) and the archiver; play a 20×
   match with `--record`; read Cosmos `moments` and `match_state`; compare the stored moments with a replay of the
   same recording. Record the result in this plan's handover and tell Azeem (it closes his D-03).
3. **F5:** one-line status change. PR → Arnav.
4. **F6:** Arnav edits `plans/REGISTRY.md`.
5. **F3:** update the five agent specs, `moment-trigger.md` and the old parent plan note. PR → Arnav; Pranav told.
6. **F4:** draft the §10 change in its own PR; request review from Azeem (producer) and Vedant (consumer); merge
   only after both agree.
7. **F7:** knowledge notes, then rebuild the Graphify graph after merge.

## 5. Contracts and shared files

- **Contract changes:** `CONTRACTS.md` §10 (F4). Producer Azeem, consumer Vedant, owner of the flow Arnav. Pending.
- **Hot shared files touched:** `CONTRACTS.md` (F4, own PR), `plans/REGISTRY.md` (F6, Arnav). Azeem and Vedant told
  before F4; Pranav told for F1/F3/F7.

## 6. Conflict scan

Same as the parent plan §13. **Scanned at `a1cef33` on 2026-10-20. Sources checked: plans ✓ · PRs ✓ (none open) ·
branches ✓ · hot files ✓.** No open PR or branch touches these files; overlaps are with Pranav's active agents
plans (superseded scope recorded in F3), Vedant's web plans (F4 agreement) and `PLAN_web_replay` (F5, as he asked).

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-F1 | Given the 21 `SYN-1017` replay moments, when parsed, then all pass; missing facts, unknown fields outside `players`, bad ids, 0 or >500 `event_ids` and unknown triggers still fail | `mcp_server` tests | Pending implementation |
| AC-F2 | Given a 20× live match on the local stack, then Cosmos `moments` holds exactly the moments a replay of its recording produces (same ids and content, apart from Cosmos system fields), and `match_state` was updated after each | Live run + comparison script output | Pending implementation |
| AC-F3 | Given the updated specs, then seven agents, four modes, four languages, eight triggers and the checker rules are stated, with status lines | Spec review | Pending implementation |
| AC-F4 | Given the §10 PR, then Azeem and Vedant approve it in review before merge | PR review record | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| F2 finds a difference between live and replay moments | Agents would build on a broken write path | Azeem (fix in stats), Arnav | M2 |
| F4 review takes time | M5 delivery slips | Azeem, Vedant | M5 only |
| Memory pressure during F2 | Killed processes mid-run | Arnav | F2 (re-run) |

## 9. Handover

**Pending implementation.**
