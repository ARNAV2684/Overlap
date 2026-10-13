# Agents

A Microsoft Agent Framework workflow on Microsoft Foundry. It runs only on flagged moments, never on every event.

| Agent | Job |
|---|---|
| Moment spotter | Is this worth saying? Classify, prioritise, merge duplicates |
| Tactical analyst | Explain *why*, using the MCP stats tools |
| Narrator | One line per viewer mode, with structured claims for every number |
| Fact-checker | Verify every claim against the evidence pack; send back for a rewrite (max 2, then a labelled template) |
| Translator | Other languages, keeping every number intact |
| Director | Pick the chart, priority, timing and audience for each overlay |
| Recap writer | Half-time and full-time stories |

Hand-offs between agents and failure recovery are described in [`CONTRACTS.md`](../CONTRACTS.md).
