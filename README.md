# Overlap

**Every fan watches a different match.**

Overlap is a live match companion for football. A synthetic match engine plays the game, a stats engine turns
every action into numbers, and a team of agents on Microsoft Foundry explains *why* each moment matters, backs it
with a chart, checks every number before it reaches the screen, and personalises the view for analysts, casual
fans, followers of one player, and fans in other languages.

> 🚧 **Status: planning.** The repository structure and shared documents are in place. No code yet.

## How it fits together

```
synthetic generator ─▶ Azure Event Hubs ─▶ stats engine ─▶ Azure Cosmos DB
                              │                                  │ (moments)
                              │ fast lane                        ▼
                              │                     agents on Microsoft Foundry
                              ▼                     (Agent Framework workflow + MCP tools)
                     Azure Web PubSub ◀──────────────────────────┘ verified overlays
                              │
                              ▼
                        Next.js web app ─▶ viewer
```

- **Fast lane (under 1 s):** every event and position goes straight to the screen, so the pitch never lags.
- **Slow lane (a few seconds):** only key moments go through the agents, which add explanations and charts.
- **Numbers come from code, words come from the agents.** Agents may only cite numbers from the moment's
  evidence pack, and a fact-checker verifies every one.

## Repository layout

| Path | What will live there |
|---|---|
| [`generator`](generator) | Synthetic match generator: world builder, match engine, movement, storylines |
| [`stats`](stats) | Stats engine: per-event metrics, rolling windows, moment triggers |
| [`archiver`](archiver) | Stores every event and tracking chunk for replays |
| [`agents`](agents) | Agent workflow: spotter, analyst, narrator, fact-checker, translator, director, recap writer |
| [`mcp_server`](mcp_server) | MCP server exposing match stats as tools |
| [`functions`](functions) | Azure Functions: screen relay and moment trigger |
| [`web`](web) | Next.js web app |
| [`infra`](infra) | Bicep templates for `azd` |
| [`fixtures`](fixtures) | Hand-written synthetic examples of every message type |
| [`data/recorded`](data/recorded) | Recorded synthetic matches for replay and development |
| [`docs`](docs) | Architecture, demo script, evaluation results |
| [`scripts`](scripts) | Shared development scripts |

Shared documents:
- [`CONTRACTS.md`](CONTRACTS.md): the message shapes every layer builds against
- [`CALIBRATION.md`](CALIBRATION.md): every generator target, with its public source
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how we work

## Data

All match data in this repository is **synthetic**: clubs, players and matches are invented by our generator.
Calibration targets come from publicly available aggregate statistics, cited in [`CALIBRATION.md`](CALIBRATION.md).

## License

[MIT](LICENSE)
