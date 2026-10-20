# PLAN_agents_insights-build_S2 — MCP tools for the analyst (M2)

| Field | Complete this |
|---|---|
| Sprint | S2 — five more read-only MCP tools over real stats data, inside the existing bound session |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M2 · AC-02 |
| Author / owner | Arnav |
| Status | Done, in review |
| Reviewed branch and commit | main · 67bf962 |
| Planned branch | `mcp_server/tools` |

## 1. Outcome

- **What will work at the end of this sprint:** besides `get_match_state` (the moment's frozen context), the server
  advertises:
  - `get_live_state` — the latest `match_state` (§4.2): score, phase, the latest panel's team numbers, team totals;
    flagged `after_moment` when it is newer than the moment;
  - `get_player_context` — one player's match numbers from `match_state` (minutes, goals, shots, xG, passes,
    distance, top speed, sprints …), for player-focus lines and player tags;
  - `get_team_pressing` and `get_pass_network` — from the latest archived heavy panel at or before the moment;
  - `compare_periods` — a team's panel numbers at the moment and 10 match minutes earlier (same period).
  All are bound to the session's match and moment, read-only, point reads only, two attempts and a deadline each,
  size-limited, and return `status` / `as_of` / `provenance` like the first tool. They return numbers for context
  only: narrated numbers still come only from the moment's evidence.
- **Not in this sprint:** `season` (no `season` producer yet; stays unadvertised), agent code (M4).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Real reader for moments (D-02) | #58 | Yes |
| `match_state` and archived panel shapes | `CONTRACTS.md` §4.2, §7.4; `stats/specs/publishing.md` | Yes (live `match_state` checked on SYN-0507) |
| Archived panels in Cosmos `stats` | Archiver running beside the stats engine | Yes locally; needed for the live integration check |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `mcp_server/schema.py` | Modify | Input and reply models for the five tools | `tools.md` §2b |
| `mcp_server/data_access.py` | Modify | Point reads of `match_state` and archived panels (fixture and Cosmos) | `tools.md` §3 |
| `mcp_server/tools/base.py` | Add | Bound session: moment cache, scope check, attempt budget | `tools.md` §2b |
| `mcp_server/tools/live_state.py`, `player_context.py`, `pressing.py`, `pass_network.py`, `compare_periods.py` | Add / modify | The five tools | `tools.md` §2b |
| `mcp_server/server.py` | Modify | Advertise and dispatch all tools | `tools.md` §5 |
| `mcp_server/tests/test_tools.py`, `tests/data/*` | Add | Tool behaviour on fixture data; scope and failure cases | `tools.md` |
| `mcp_server/specs/tools.md`, `mcp_server/README.md` | Modify | §1 tool list, §2b definitions | Itself |
| `docs/knowledge/mcp.md` | Modify | Status | Knowledge-sharing spec |
| This plan | Add | Status, handover | — |

## 4. Steps

1. Data access: `read_doc(container, match_id, doc_id)` for fixture and Cosmos (point reads, same deadline and error mapping).
2. Bound session base: read and validate the bound moment once; reject other matches/moments, players and teams
   not in the match; two attempts per tool.
3. The five tools and their reply models; server registration.
4. Tests on fixture data built from real shapes; protocol test that lists and calls each tool.
5. Live check against the local Cosmos (a match played with stats engine + archiver running).
6. Spec, README, knowledge note.

## 5. Contracts and shared files

- **Contract changes:** none (reads §4.2 and §7.4 as agreed).
- **Hot shared files touched:** none.

## 6. Conflict scan

Scanned at `67bf962` on 2026-10-20: open PR #64 touches `agents/`, `infra/local/env.example`,
`infra/specs/local-development.md`, `docs/knowledge/ai-insights.md` — none of this sprint's files. Sources checked:
plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-02a | Given fixture data, each tool returns the expected bounded projection; out-of-scope match, moment, team or player is denied without a read | Unit tests | Pending implementation |
| AC-02b | Missing documents, wrong shapes, timeouts and oversize answers return `unavailable` with a reason; never a guessed value | Unit tests | Pending implementation |
| AC-02c | A real MCP client lists all six tools and calls each against a match written by the stats engine and archiver in the local Cosmos | Live check | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Archived panels exist only when the archiver ran | History tools unavailable for that match | Arnav | AC-02c run setup |
| `match_state` is "now", possibly after the moment | Misread as the moment's cause | — | Flag `after_moment`; spec says context, not evidence |

## 9. Handover

**Done (20 Oct 2026, branch `mcp_server/tools`).**

| AC | Result |
|---|---|
| AC-02a | Passed: on the stats engine's own output for `SYN-1017` at `MO-1017-0013` (moment, `match_state` right after it, archived panels), each tool returns the bounded projection; another match or moment, a team or a player outside the match is denied with no read |
| AC-02b | Passed: missing documents → `unavailable/not_found`; a `match_state` of another match → `context_mismatch`; two attempts per tool per session; fields the engine did not compute (speed and distance without tracking) are left out, never zero |
| AC-02c | **Passed (live).** Stats engine and archiver running beside a 20× match SYN-0508 (seed 508, 27 moments, 5–0). A real MCP client listed all six tools and called each for `MO-0508-0002` (shot cluster, 13:37): all `ok`, Cosmos provenance, `get_live_state` and `get_player_context` flagged `after_moment: true`, pressing and pass network from `stats-000780000`, `compare_periods` from `stats-000817000`; a request for another moment was denied |

- 123 MCP tests pass (3 skipped: two opt-in Cosmos tests, one symlink test on Windows); ruff clean.
- **Differences from the plan:** the pass-network tool lives in its own module (`tools/pass_network.py`) as the repository layout suggests; the stdio smoke client now accepts exactly the six read-only tools instead of one.
- **Follow-ups:** `season` stays unadvertised until a `season` producer exists.
