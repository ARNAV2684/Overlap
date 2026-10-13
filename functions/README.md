# Azure Functions

| Function | Trigger | Job |
|---|---|---|
| Screen relay | Event Hubs (`match-events`, `match-tracking`) | Trim events, bundle positions to about one message per second, send them to the match's Web PubSub group |
| Moment trigger | New moment documents | Start the agent workflow for a moment |

Local settings never go in the repo; services authenticate with managed identity.
