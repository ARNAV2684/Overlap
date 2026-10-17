# Azure Functions

A separate Python Functions app (Flex Consumption on Azure).

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
| `function_app.py` | The Functions: `relay_events`, `relay_tracking` (Event Hubs triggers), `relay_tick` (timer) |
| `host.json`, `requirements.txt` | Functions host settings and packages |
| `tests/test_screen_relay.py` | Unit tests (no emulators) |
| `tests/e2e_local.py` | Full match end to end on the local stack |
| `moment_trigger.py` | New moment → agent workflow (the slow lane; insight flow) |

## Run locally

Start the local stack first ([`infra/specs/local-development.md`](../infra/specs/local-development.md)): the emulators
in `infra/local/` and the Web PubSub stand-in. Load the settings from `infra/local/env.example`, then:

```bash
uv sync
uv run pytest                                   # unit tests
uv run python relay_runner.py                   # the relay, reading both hubs as consumer group "relay"
uv run python tests/e2e_local.py --speed 20     # in another terminal: plays a match and checks every message
```

## On Azure

The same code runs as `function_app.py`. Only settings change: `EVENTHUBS__fullyQualifiedNamespace`,
`OVERLAP_COSMOS_ENDPOINT` and `OVERLAP_WEBPUBSUB_ENDPOINT` point at the real services, `OVERLAP_COSMOS_KEY` is left
unset, and the app's managed identity signs in. `OVERLAP_EVENTS_HUB`, `OVERLAP_TRACKING_HUB` and
`OVERLAP_RELAY_CONSUMER_GROUP` (`relay`) are the same as locally. Local settings never go in the repo.
