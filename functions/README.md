# Azure Functions

A separate Python Functions app.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/screen-relay.md`](specs/screen-relay.md) | Input hubs, which fields reach the browser, bundling to about one message per second, groups, scaling and ordering | `screen_relay.py` |
| 2 | [`specs/moment-trigger.md`](specs/moment-trigger.md) | How a new moment starts the agents with low latency, exactly once, and what happens on failure | `moment_trigger.py` |

## Files

| File | Job |
|---|---|
| `function_app.py` | Registers the Functions |
| `screen_relay.py` | Event Hubs → trimmed and bundled → Web PubSub (the fast lane) |
| `moment_trigger.py` | New moment → agent workflow (the slow lane) |

Local settings never go in the repo; services authenticate with managed identity.
