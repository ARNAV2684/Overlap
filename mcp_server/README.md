# Local moment context over MCP

The first implemented tool, `get_match_state`, reads the frozen context for one moment from Cosmos `live/moments`.
It returns the teams, score and source cursor captured at that moment. It does not calculate statistics or narrate.
The client obtains the evidence from the same stored document; only those evidence facts may become narrated numbers.

```text
Source-derived sample -> local Cosmos moments -> read-only MCP tool
                                  |                      |
                               evidence               context
                                  +----------+-----------+
                                             v
                                  verified offline JSON bundle
                                             |
                                      Foundry later (M3)
```

Governing [tools spec](specs/tools.md), [S2 plan and evidence](../plans/active/PLAN_agents_ai-insights-mcp_S2.md),
and [source example](../agents/specs/examples/shot-cluster.md). This is M2: no model calls, live trigger,
Agent Framework workflow, overlays, Web PubSub or frontend delivery. Other tool files remain placeholders and are
not advertised by the server. No Azure subscription or AI key is needed.

## 1. Install the isolated environment

From the repository root, with [uv](https://docs.astral.sh/uv/) installed:

```sh
cd mcp_server
uv sync --frozen --python 3.12 --managed-python --no-editable
```

This uses the pinned dependency lock and a project-local `.venv`; it does not change Anaconda. Initial downloads
need internet. `--no-editable` avoids reliance on editable-package `.pth` discovery, which macOS hidden-file flags
interfered with in the development workspace. After editing Python source, rebuild the installed copy before testing:

```sh
uv sync --frozen --no-editable --reinstall-package overlap-mcp
```

## 2. Check MCP without Docker

```sh
uv run --frozen --no-editable overlap-mcp-check --source fixture --output ../data/generated/insights/mcp-fixture-check.json
uv run --frozen --no-editable pytest -q
```

The smoke check launches a separate MCP subprocess and performs initialise, tools/list and tools/call. It checks
the declared schema, status, bound identity/cursor, exact context and structured/text agreement. The report says
`source=fixture`; this does not prove Cosmos access. The two Cosmos tests are skipped unless explicitly enabled.

## 3. Store and read the sample through Cosmos

Use the existing local Cosmos emulator. If it is not running, follow the shared
[local setup instructions](../infra/specs/local-development.md); do not start a second emulator on the same ports.
The current shared configuration uses HTTP on loopback port 8081. `infra/local/env.example` contains public emulator
credentials, not cloud credentials. These commands accept only a loopback endpoint and database `live`, and always
use container `moments` with partition key `/match_id`, regardless of the relay's container setting.

From `mcp_server/`:

```sh
uv run --frozen --no-editable --env-file ../infra/local/env.example overlap-mcp-seed
uv run --frozen --no-editable --env-file ../infra/local/env.example overlap-mcp-check --source cosmos --output ../data/generated/insights/mcp-cosmos-check.json
uv run --frozen --no-editable --env-file ../infra/local/env.example overlap-mcp-seed
```

The loader creates the database/container only if absent and creates `MO-1017-0001` under `SYN-1017`. It verifies
readback. Repeating it returns `already_present` for identical content. Conflicting content or a wrong existing
partition key fails; it never replaces a document, clears a container or resets the emulator. Keep the loader
separate from MCP: the reader only uses point reads and never creates or updates data.

Enable the real Cosmos integration tests (POSIX shells):

```sh
OVERLAP_TEST_COSMOS=1 uv run --frozen --no-editable --env-file ../infra/local/env.example pytest -q
uv run --frozen --no-editable ruff check __init__.py schema.py data_access.py server.py sample.py client.py tools tests
```

On PowerShell, first set `$env:OVERLAP_TEST_COSMOS = "1"`, then run the same `uv run ... pytest -q` command without
the POSIX variable prefix. No Docker services are stopped by these commands; the MCP subprocess closes at completion.

## 4. Use the server from another local MCP client

Configure the process command as the absolute path to `.venv/bin/python` (Windows: `.venv/Scripts/python.exe`),
with the following argument list and the same three `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_KEY`, and
`OVERLAP_COSMOS_DATABASE` environment variables from the local emulator configuration:

```text
-m mcp_server.server --source cosmos --match-id SYN-1017 --moment-id MO-1017-0001 --evidence-version 1
```

This is stdio, not a browser URL or a listening HTTP service. The server advertises one tool with this input:

```json
{"match_id":"SYN-1017","moment_id":"MO-1017-0001","evidence_version":1}
```

Create a fresh session per workflow job. A session is bound to those exact IDs/version and allows at most two
source-read attempts, including one retry for a transient failure. Each attempt has a two-second deadline;
the smoke workflow has a 20-second deadline. Wrong scope is denied before a read; invalid calls are protocol errors.
Missing or invalid source data returns `unavailable`. Cosmos never silently falls back to the fixture.

## 5. What the sample and report mean

[The sample](samples/MO-1017-0001.json) is a constructed moment derived from Azeem's generated Kestlebury United
versus Orrinford Albion recording, seed 1017. It matches the example merged in #44: Kestlebury has three shots in
the same-period five-minute window ending at event 1592, with the score then 3–0. [Provenance](samples/provenance.json)
records the generator revision, source hashes and checks. It is not output from an implemented stats engine, and
the moment ordinal is an illustrative test ID. No legacy mock source is used.

A passed smoke report contains the evidence loaded from the chosen store plus the MCP context projection. It
explicitly records `model_called=false` and `live_delivery=false`. Generated reports are ignored by Git. The CLI
returns nonzero on failure and writes a success report only atomically after validation. An old report is not
evidence that a later failed run passed.

Next, M3 needs the agreed workflow implementation plus an accessible Foundry project/model deployment and an
approved test budget. The local workflow can call the model and execute MCP locally; Foundry does not need inbound
access to this laptop. Production identity/RBAC, Azure deployment and live stats-to-card delivery remain untested.
Treat names and labels as untrusted data when the model adapter is added.

## Team handoff and future integration

Before this PR merges, fetch and check out `mcp_server/local-moments-s2` to review it. After merge, update your
normal checkout from main. Pulling code does not transfer the running emulator, Python environment or stored
sample: run the install, seed and check commands above on each laptop. Generated reports remain machine-local.

| Connection | What this milestone supplies | Future integration boundary |
|---|---|---|
| Azeem: stats producer | Strict validator and a source-derived example matching CONTRACTS §10.2 | Publish one immutable moment containing evidence, source cursor and frozen context to `live/moments`, partitioned by `match_id`. Use the agreed shot rule; do not copy the sample's IDs or score into live output. |
| Arnav: storage and delivery | Read-only point reader plus a separate create-only development loader | Keep source moments separate from job/outbox state. Production identity/RBAC and delivery remain later work; the seed command is not a production publisher. |
| Vedant: frontend | No new screen message or endpoint | The offline evidence/context bundle is not an overlay. Continue against the agreed overlay/delivery contract; a later integration must prove an actual displayed card. |
| Pranav: workflow | Real stdio MCP client, one scoped tool and a validated evidence/context bundle | Add the model adapter, prompts, claim checking and evaluation; secure Foundry access and a test budget before model calls. |

The current reader intentionally accepts only the first agreed shot-cluster slice. New triggers, metrics, schema
versions or source fields need coordinated spec/contract changes and updated tests; do not silently widen the reader
or calculate missing stats inside MCP. Context numbers are not extra narration evidence. For each later workflow
job, bind a new MCP session to the exact match, moment and evidence version. Coordinate MCP changes with Pranav;
Arnav maintains the ownership registry. These connections reflect the user-reported team agreements in the S2 plan.
