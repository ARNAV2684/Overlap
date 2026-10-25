# Azure Functions

Python Functions code, deployed on Azure as two apps on one dedicated B3 plan (always on, one instance;
`infra/specs/resources.md`): the screen relay, the archiver and the insight agents
(moment trigger, recap, publisher), all on one Python with one set of packages.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/screen-relay.md`](specs/screen-relay.md) (agreed) | Input hubs, validation, bundling, numbering, delivery to `match-<id>`, the Cosmos store, scaling | `screen_relay.py`, `relay_store.py`, `relay_runner.py`, `function_app.py` |
| 2 | [`specs/moment-trigger.md`](specs/moment-trigger.md) | How a new moment starts the agents with low latency, exactly once, and what happens on failure | `moment_trigger.py` |

## Files

| File | Job |
|---|---|
| `screen_relay.py` | Relay core: raw hub messages → `CONTRACTS.md` §7 envelopes. No I/O |
| `relay_store.py` | Cosmos store (container `screen`) and Web PubSub sender; local or Azure by settings |
| `relay_runner.py` | Runs the core with the Event Hubs SDK (local development, end-to-end checks) |
| `function_app.py` | The Functions: `relay_events`, `relay_tracking`, `archive_events`, `archive_tracking` (Event Hubs triggers), `relay_tick` (timer), `moment_trigger` (Cosmos change feed on `moments`), `recap_trigger` (change feed on `match_state`), `insights_publisher` (timer) |
| `host.json`, `requirements.txt` | Functions host settings and packages |
| `tests/test_screen_relay.py` | Unit tests (no emulators) |
| `tests/e2e_local.py` | Full match end to end on the local stack |
| `moment_trigger.py` | New moment → agent workflow (the slow lane; insight flow); the recap and publisher entry points; the local poller |
| `package.py` | Builds the deployment package `dist/`: these files plus `archiver/`, `agents/` and `mcp_server/` |
| `local.settings.example.json` | Emulator settings for `func start` (copy to `local.settings.json`, ignored by git) |
| `tests/test_function_app.py` | The Event Hubs entry points read each message's properties from a batch |

## Run locally

Start the local stack first ([`infra/specs/local-development.md`](../infra/specs/local-development.md)): the emulators
in `infra/local/` and the Web PubSub stand-in. Load the settings from `infra/local/env.example`, then:

```bash
uv sync
uv run pytest                                   # unit tests
uv run python relay_runner.py                   # the relay, reading both hubs as consumer group "relay"
uv run python tests/e2e_local.py --speed 20     # in another terminal: plays a match and checks every message
```

Or run the whole Functions app as it will run on Azure (relay, archiver and insights in one host). Needs Azure
Functions Core Tools 4 (`func`) and this project's `.venv` (`uv sync`):

```bash
cp local.settings.example.json local.settings.json      # once
python package.py                                       # builds dist/ (rebuild after code changes; stop func first)
cd dist && func start                                   # with .venv activated, or languageWorkers__python__defaultExecutablePath
                                                        # set to .venv's python; func lists the 8 functions
```

`func start` replaces `relay_runner.py`, the archiver's `main.py` and the insights poller: don't run them at the same
time. The host keeps its own Event Hubs checkpoints (Azurite container `azure-webjobs-eventhub`), so on its first start
it reads each hub's whole backlog. The stats engine still runs on its own (`stats/`).

Run **one** relay at a time: two relays share the `relay` consumer group, split the partitions and send at the same
time, so a match's envelopes can arrive out of order. On Azure the Function app is limited to one instance for the
same reason.

## On Azure

The same code runs as `function_app.py`. Only settings change: `EVENTHUBS__fullyQualifiedNamespace`,
`OVERLAP_COSMOS_ENDPOINT` and `OVERLAP_WEBPUBSUB_ENDPOINT` point at the real services, `OVERLAP_COSMOS_KEY` is left
unset, and the app's managed identity signs in. `OVERLAP_EVENTS_HUB`, `OVERLAP_TRACKING_HUB` and
`OVERLAP_RELAY_CONSUMER_GROUP` (`relay`) are the same as locally. Local settings never go in the repo.
`COSMOS` (the Cosmos triggers' connection) becomes `COSMOS__accountEndpoint` with the managed identity. Deploy the
package: `python package.py`, then `func azure functionapp publish <app>` in `dist/`. The MCP server runs as a child
process on the same Python and is given the identity settings (`agents/context.py`).
