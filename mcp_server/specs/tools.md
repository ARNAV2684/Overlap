# MCP tools spec

> **Status: not started.** Write and agree this before coding `server.py` and `tools/*.py`.

Decides every tool the server exposes, its inputs and its outputs.

## 1. Tool list

- Which tools exist (match state, compare periods, pressing window, player context, pass network, season milestones)?

_Answer:_

## 2. Each tool

- For each tool: name, description shown to the agent, inputs with types, output shape, example call.

_Answer:_

## 3. Data access

- Which Cosmos containers does each tool read, and how is it scoped by match and season?

_Answer:_

## 4. Limits

- Response size limits, timeouts and caching.

_Answer:_

## 5. Access

- How do the agents (and other MCP clients) connect and authenticate?

_Answer:_
