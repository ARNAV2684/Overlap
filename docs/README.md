# Docs

## For judges

| File | What it holds |
|---|---|
| [`testing.md`](testing.md) | The judge's guide: the link, which replay to watch, modes, languages, what the badges mean |
| [`architecture.md`](architecture.md) | As deployed on Azure: the live, archive and insight flows, latency, security, scaling, cost, pause and resume |
| [`microsoft-stack.md`](microsoft-stack.md) | Foundry, Agent Framework, MCP, Translator, the Azure services, GitHub and Copilot: what, why and where in the code |
| [`evaluation.md`](evaluation.md) | The agents bench (recall, numeric accuracy, fault injection, latency) and the Azure run results |
| [`responsible-ai.md`](responsible-ai.md) | Synthetic data, the fact-checker and templates, honest labels, translation checks, no personal data, cost caps |
| [`demo-script.md`](demo-script.md) | The 2-minute demo video, beat by beat |

Diagrams, exported from the team's Lucid data flow diagrams: [Azure deployment](img/azure-deployment.png),
[main data flow](img/main-dfd.png), [each layer opened up](img/expanded-dfd.png).

## Release notes

| File | What it holds |
|---|---|
| [`release-readiness.md`](release-readiness.md) | The 24 Oct latency fixes (in-process MCP, parallel narration) and match-start control |
| [`viewer-replay-acceptance.md`](viewer-replay-acceptance.md) | Viewer reconnection and local replay acceptance |

## Shared knowledge map

Start at [knowledge/README.md](knowledge/README.md) for eleven component notes, evidence and dependencies. [Setup](knowledge/setup.md) explains manual Graphify generation; [validation](knowledge/validation.md) records platform results.
