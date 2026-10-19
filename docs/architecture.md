# Architecture

The [shared project map](knowledge/README.md) documents the current boxes, ownership and evidence at main `a61166b` (18 October 2026).

- Live: generator → Event Hubs → screen relay → Web PubSub → frontend.
- Archive: Event Hubs → archiver → Cosmos/Blob → archive reader → future replay integration.
- Insights: planned stats moments → planned workflow using the implemented local MCP reader → future verified overlays.

See each note for implemented versus proposed behaviour and recorded test limitations. Arrows describe responsibilities, not a new end-to-end test. [Graphify setup](knowledge/setup.md) builds a local exploration view; [validation](knowledge/validation.md) records tool checks.

Message authority remains [CONTRACTS.md](../CONTRACTS.md). The map does not change application APIs or deployment.
