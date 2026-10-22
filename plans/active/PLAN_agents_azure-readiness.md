# PLAN_agents_azure-readiness — make the local flow ready for Azure (sprints H1–H5)

| Field | Complete this |
|---|---|
| Proposal title | Azure readiness · finish the local hardening that should land before any Azure resource is paid for |
| Author / primary owner | Arnav |
| Status | In progress (Arnav, 22 Oct: "make sprints of these tasks and let's start") |
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
| **H4. Functions packaging** | The Functions app ships the agents and the MCP server (same Python, no second venv); `moment_trigger`, the publisher (timer) and the full-time recap run inside it; `func start` locally with the emulators | `func start` lists every function; a local match produces published cards through the Functions host |
| **H5. Nice to have** | Archiver `--from-latest` (like the relay); a pre-run health check (`infra/local/check_stack.py`: emulators, stand-in, Foundry Local and its port, model smoke) | Archiver skips an old backlog; the check names what's down |

## 3. Not in these sprints

AI-written live cards and real translations (need Azure), Vedant's card screen and Azeem's review (parallel tracks),
sprint moments, season recap, shot map (deferred by design), every Azure resource (A1–A7, after the specs).

## 4. Shared files

`functions/function_app.py` (H4) is a hot shared file: its changes go in their own commit.

## 5. Handover

Pending.
