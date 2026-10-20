# PLAN_agents_insights-build_S1 — model switch, budget guard and translator adapter (M1)

| Field | Complete this |
|---|---|
| Sprint | S1 — one settings-driven model client (Foundry Local ↔ Azure Foundry), a budget guard, and a translator adapter |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M1 · AC-01 |
| Author / owner | Arnav |
| Status | Done, in review |
| Reviewed branch and commit | main · 67bf962 |
| Planned branch | `agents/model-switch` |

## 1. Outcome

- **What will work at the end of this sprint:** `agents/` is a Python project. One factory builds the chat client
  for the configured provider — `off` (default; every call refused), `local` (Foundry Local or any
  OpenAI-compatible endpoint on loopback) or `azure` (Azure OpenAI in Foundry, managed identity) — using Agent
  Framework's `OpenAIChatCompletionClient` for both, so switching is settings only. A gate wraps every model call
  with the budget (per moment, per match, tokens) and a timeout. A translator adapter calls Azure AI Translator or a
  local fake. `smoke.py` makes one call through the configured provider and fails clearly when it can't.
- **Not in this sprint:** agents, prompts, workflow state in Cosmos (M3–M4), Azure resources (M7).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Agreed specs: `agents/specs/agents.md` §8, `workflow.md` §3 | #61 | Yes |
| Agent Framework packages | PyPI: `agent-framework-core` 1.22.0 (checked 20 Oct) | Yes |
| Foundry Local and a small model on the laptop | Arnav approved phi-4-mini (20 Oct) | Yes: Foundry Local 0.11.0, `phi-4-mini-instruct-openvino-gpu:2` |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `agents/pyproject.toml`, `agents/.gitignore` | Add | Project, pinned dependencies, test settings | `agents.md` §8 |
| `agents/config.py` | Modify | Settings from environment (provider, endpoints, model/deployment, timeouts, budgets, modes, languages) | `agents.md` §8, `workflow.md` §3 |
| `agents/models.py` | Add | Client factory and `ModelGate` (budget reservation, timeout, usage) | `agents.md` §8, `workflow.md` §3 |
| `agents/translation.py` | Add | Translator adapter: Azure AI Translator or local fake | `agents.md` §5, `fact-checking.md` §4 |
| `agents/smoke.py` | Add | One call through the configured provider | `agents.md` §8 |
| `agents/tests/test_config.py`, `test_models.py`, `test_translation.py` | Add | Settings, factory, gate and adapter tests with no model or network calls | `evaluation.md` |
| `agents/README.md` | Modify | How to run; settings; status | — |
| `infra/local/env.example`, `infra/specs/local-development.md` | Modify | Model and translator settings by name; Foundry Local in the local services table | `local-development.md` |
| `docs/knowledge/ai-insights.md` | Modify | Status | Knowledge-sharing spec |
| This plan, parent plan status | Add / modify | Status and handover | — |

## 4. Steps

1. Project files; settings; factory; gate; translator adapter; smoke CLI.
2. Unit tests (no model calls, no network): provider `off` refuses; `local` builds a client only for loopback URLs;
   `azure` requires endpoint and deployment and uses a credential, never a key from the repository; the gate refuses
   beyond each budget and on timeout; the fake translator keeps numbers; the Azure translator builds requests
   correctly against a stubbed transport.
3. Docs and settings names.
4. With Arnav's approval: install Foundry Local, load a small model, run `smoke.py` (AC-01 part 1).

## 5. Contracts and shared files

- **Contract changes:** none.
- **Hot shared files touched:** none. `infra/local/env.example` and `infra/specs/local-development.md` are Arnav's.

## 6. Conflict scan

Scanned at `67bf962` on 2026-10-20: no open PRs; no branch touches `agents/`, `infra/local/env.example` or
`infra/specs/local-development.md`. Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-01a | Given Foundry Local running a small model, when `smoke.py` runs with provider `local`, then it gets a reply | Live smoke | Pending implementation |
| AC-01b | Given provider `azure` with no endpoint or deployment, then the factory fails with a clear message; given provider `off`, every gated call is refused; no silent fallback | Unit tests | Pending implementation |
| AC-01c | Unit tests make no model or network calls; the gate enforces per-moment and per-match budgets and the timeout | Unit tests | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Foundry Local download and model choice | No live smoke | Arnav | AC-01a only |
| About 1 GB of free memory on the laptop | A local model may not load | Arnav | AC-01a only; choose the smallest model |

## 9. Handover

**Done (20 Oct 2026, branch `agents/model-switch`).**

| AC | Result |
|---|---|
| AC-01a | **Passed.** Foundry Local 0.11.0 (`winget install Microsoft.FoundryLocal`), model `phi-4-mini-instruct-openvino-gpu:2` (2.2 GB) loaded with `foundry model load phi-4-mini`; endpoint from `foundry server status` (`http://127.0.0.1:<port>`). `smoke.py` with `OVERLAP_MODEL_PROVIDER=local`, `OVERLAP_LOCAL_MODEL_URL=http://127.0.0.1:<port>/v1`: reply `Ready` in 0.6 s, PASS |
| AC-01b | Passed: provider `off` refuses every call (smoke prints the reason, exit 1); a non-local URL and missing Azure endpoint or deployment fail with the variable named; no fallback between providers |
| AC-01c | Passed: 36 unit tests, no model or network calls; the gate enforces per-moment, per-match and token budgets and the timeout, and keeps the reservation when usage is unknown |

- **Differences from the plan:** `models.py`, `translation.py` and `smoke.py` were added beside `config.py` (in the file map). The Foundry Local port is chosen by the service, so it is read from `foundry server status`, not fixed.
- **Follow-ups:** the durable per-match budget in Cosmos (M3); the Azure path is unit-tested only until the switch (M7).
