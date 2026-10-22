# PLAN_agents_azure-readiness — make the local flow ready for Azure (sprints H1–H5)

| Field | Complete this |
|---|---|
| Proposal title | Azure readiness · finish the local hardening that should land before any Azure resource is paid for |
| Author / primary owner | Arnav |
| Status | Done: H1–H5 (H2, H3, H5 in #74; H4 on `agents/functions-packaging`, 23 Oct). Next: Azure sprints A1–A7 on Arnav's go |
| Reviewed branch and commit | main · 0f11b7d (M4–M7 merged) |
| Planned branch | `agents/azure-readiness` |
| Follows | [`PLAN_agents_insights-build`](PLAN_agents_insights-build.md) M7 (local done); precedes the Azure integration sprints A1–A7 (resources, security and costs specs first) |

## 1. Why

Moving to Azure costs money by the hour and is slower to debug. Five things found in the local runs would either waste
the $25 cap or fail on Azure. Fix them locally first; everything else (AI-written cards, real translations) only
arrives with Azure, and the web screen and Azeem's review run in parallel.

## 2. Sprints

| Sprint | Work | Done when |
|---|---|---|
| **H1. Merge** | Merge M5 (#69), M6 and M7-local (#71; #70 had merged into its stacked base only) | **Done 22 Oct**: all on main at 0f11b7d; Graphify rebuilt |
| **H2. Model breaker and queue limit** | (a) After N model failures in a row (timeout, provider error, budget) the gate stops calling the model for a cool-down; every step takes its template at once; one probe call after the cool-down. (b) The poller keeps at most 2 moments queued per match (workflow.md §3); older queued moments are suppressed durably with reason `queue_overflow` | Unit tests; a live run with the model failing shows no expired cards caused by waiting on the model |
| **H3. MCP server on Azure Cosmos** | `mcp_server` reads Azure Cosmos with managed identity (DefaultAzureCredential) when no key is set; the loopback-only rule stays for key auth (emulator); still read-only, database `live` only | MCP tests pass; identity path covered by a test with a fake credential |
| **H4. Functions packaging** | The Functions app ships the agents and the MCP server (same Python, no second venv); `moment_trigger`, the publisher (timer) and the full-time recap run inside it; `func start` locally with the emulators | **Done 23 Oct** (branch `agents/functions-packaging`): `func start` lists all 8 functions; SYN-0804 and SYN-0805 published every card through the host (§5) |
| **H5. Nice to have** | Archiver `--from-latest` (like the relay); a pre-run health check (`infra/local/check_stack.py`: emulators, stand-in, Foundry Local and its port, model smoke) | Archiver skips an old backlog; the check names what's down |

## 3. Not in these sprints

AI-written live cards and real translations (need Azure), Vedant's card screen and Azeem's review (parallel tracks),
sprint moments, season recap, shot map (deferred by design), every Azure resource (A1–A7, after the specs).

## 4. Shared files

`functions/function_app.py` (H4) is a hot shared file: its changes go in their own commit.

## 5. Handover

**H2, H3, H5** merged in #74. **H4** (23 Oct, branch `agents/functions-packaging`):

- `functions/package.py` builds `functions/dist/`: the Functions files plus `archiver/`, `agents/` and `mcp_server/`
  (57 files, runtime code and prompts only). `functions/pyproject.toml` / `requirements.txt` carry the agents' and MCP
  server's pinned packages; the agents' 175 tests pass on that one environment, and the agents open the MCP server
  on it (`agents/context.py` falls back to this Python with `PYTHONPATH`, and passes the managed identity settings to
  the child process, which otherwise only inherits a minimal environment).
- `function_app.py`: `moment_trigger` (change feed on `moments`, polled every 1 s), `recap_trigger` (change feed on
  `match_state`, lease prefix `recap-`), `insights_publisher` (timer, 1 s; visits matches with an outbox not done or
  a recent `match_state` change). The insight functions are async and share one set of dependencies, so the model
  breaker keeps its state between invocations.
- Three bugs found only by running the host, all fixed with tests: the worker rejected the built-in `list[...]`
  annotation and loaded no function; batch triggers lost every message's properties (they are in
  `PropertiesArray`), so the relay and archiver marked every setup and event invalid (both on main since the relay
  sprint, hidden because local runs used `relay_runner.py`); change-feed documents carry `_lsn`, which the strict
  moment schema rejected (now a system field in validation and in the source hash).
- Checked with `func start` (Core Tools 4.16.0) on the emulators, provider off (templates):

| Match | Jobs | Deliveries | Moment → card |
|---|---|---|---|
| SYN-0804 (5 s feed poll) | 21 published (20 cards + recap), 2 suppressed, 0 expired | 520 cards, 24 recap, 36 player tags | p50 4 s, p95 7 s |
| SYN-0805 (1 s feed poll) | 21 published, 2 suppressed, 0 expired | 504 cards, 28 recap, 36 player tags | p50 2 s, p95 3 s |

  The relay and archiver ran inside the same host (SYN-0802: 2,237 screen documents, match archived 4–1).
- Found on the way, not changed (stats engine is Azeem's): after a Docker restart its saved Event Hubs positions are
  past the emulator's new end on some partitions, so it reads nothing there; it needs a `--from-latest` like the
  relay and archiver (`infra/specs/local-development.md` §5).
- Not done here: the spec's wish that the change-feed callback not wait for the agents (`moment-trigger.md` §1) —
  the batch still runs the workflow before returning; with templates that is well under a second, with the Azure
  model it is bounded by the 15 s moment deadline. Revisit in A4 if the trigger lags.
