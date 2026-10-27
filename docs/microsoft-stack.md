# How we use the Microsoft stack

Every piece below is in the repository and was deployed to Azure (resource group `rg-overlap`, Sweden Central) on
24 Oct 2026. The whole resource group is Bicep run with `azd`, and every service signs in with a managed identity:
there are no keys in code, settings or the repository.

## Microsoft Foundry and gpt-5-mini

**What it does.** The agents' model. It ranks normal moments (spotter), interprets the context (analyst), writes
the lines for each audience (narrator), judges each line's meaning (fact-checker), confirms each translation's
meaning (translator) and writes the full-time recap (recap writer).

**Why.** gpt-5-mini is the cheapest model that writes good structured JSON quickly, and Foundry gives us the
project, the deployment, managed-identity access and a budget in one place. Locally the same code runs against
Foundry Local (on-device, OpenAI-compatible) or with the model off, when every step uses its checked template.

**Where.**
- [`agents/models.py`](../agents/models.py): one chat client for both providers (Agent Framework's
  `OpenAIChatCompletionClient`, with `DefaultAzureCredential` on Azure, no key); `ModelGate` puts every call through
  per-moment and per-match budgets and a timeout; a breaker falls back to templates when the provider keeps failing.
- [`agents/config.py`](../agents/config.py): the provider switch (`OVERLAP_MODEL_PROVIDER=off|local|azure`) and the
  budgets (`OVERLAP_MAX_CALLS_PER_MATCH`, `OVERLAP_MAX_TOKENS_PER_MATCH`, `OVERLAP_MAX_MODEL_JOBS_PER_MATCH`, …).
- [`infra/modules/foundry.bicep`](../infra/modules/foundry.bicep): the AI Services account, the Foundry project
  `overlap`, the gpt-5-mini deployment (Global Standard, 100K tokens a minute), the "Cognitive Services OpenAI User"
  role for the agents' identity, and the $25 model budget with alerts at 50, 80 and 100 %.
- [`agents/prompts/`](../agents/prompts): each agent's instructions, versioned; every job records the prompt
  version and the model it used.

### Tracing, evaluation and content safety

Foundry does more than host the model: every agent run is traced, and the published lines are scored by Foundry's
evaluators.

- **Tracing.** Agent Framework's OpenTelemetry exports to Application Insights, one trace per card: the job, a span
  for each of the seven agents, each model call (with Agent Framework's own `invoke_agent` and `chat` spans, tokens and
  model) and each MCP tool call. No prompt, payload or line text is ever put on a span, and a test checks it. On Azure
  (SYN-3010, 25 Oct) one match gave 29 traces whose model-call outcomes matched the jobs' records in Cosmos exactly.
  [`agents/telemetry.py`](../agents/telemetry.py), on with `OVERLAP_TRACING=azure`
  ([`infra/modules/functions.bicep`](../infra/modules/functions.bicep)); queries in
  [`agents/specs/observability.md`](../agents/specs/observability.md) §2.1.
- **Evaluation.** Azure AI Evaluation's groundedness, relevance and fluency evaluators, run on the Foundry deployment
  with Entra ID, over a sample of published lines and their evidence. On 60 lines of SYN-3010 (all 25 model lines and
  35 templates): groundedness 98.3%, relevance 91.7%, fluency 100%
  ([`evaluation.md`](evaluation.md#line-quality-azure-ai-evaluation)).
  [`agents/evals/foundry_quality.py`](../agents/evals/foundry_quality.py); a dry run unless `--run` is given.
- **Content safety (built, off).** With `OVERLAP_CONTENT_SAFETY=azure`, Azure AI Content Safety screens each verified
  model line after the fact-checker; a flagged line, a failed screen or a timeout falls back to the template.
  [`agents/safety.py`](../agents/safety.py). It needs a Content Safety resource, which is not deployed yet.

## Microsoft Agent Framework

**What it does.** Runs the seven agents for each moment as one workflow, and gives each model agent its chat client
and tools.

**Why.** The workflow model (executors joined by edges, with a shared context) matches our design: seven stages in a
fixed order, each saving its output so a crashed run resumes from its last stage. Its MCP client let the analyst
use our MCP server without writing a protocol client of our own.

**Where.**
- [`agents/workflow.py`](../agents/workflow.py): `WorkflowBuilder` with one `Executor` per stage (spotter → analyst
  → narrator → fact-checker → translator → director, and the recap writer at full time).
- [`agents/runtime.py`](../agents/runtime.py), [`agents/state.py`](../agents/state.py): the run state and the job
  document in Cosmos `moments` (lease, stage outputs, budget reservations, outbox).
- [`agents/models.py`](../agents/models.py): each model agent is an Agent Framework `Agent` with its prompt as its
  instructions.
- Version: Agent Framework core 1.22.0 ([`agents/pyproject.toml`](../agents/pyproject.toml)).

## Model Context Protocol

**What it does.** Our MCP server gives the analyst read-only tools over the live match: `get_match_state` (the
moment's frozen context), `get_live_state`, `get_player_context`, `get_team_pressing`, `get_pass_network` and
`compare_periods`. Each session is bound to one match, moment and evidence version, so the analyst can never read
another match or a later state.

**Why.** It keeps the agents' data access behind one small, testable interface with the same shapes locally and on
Azure, and it keeps numbers out of the model's reach: the tools give context, while the only numbers a line may
quote come from the moment's evidence pack.

**Where.**
- [`mcp_server/`](../mcp_server): the server ([`server.py`](../mcp_server/server.py)), the tools
  ([`tools/`](../mcp_server/tools)), the spec ([`specs/tools.md`](../mcp_server/specs/tools.md)), 151 tests.
- [`agents/context.py`](../agents/context.py): the client through Agent Framework's `MCPStdioTool` (a separate
  process per job).
- [`agents/embedded_context.py`](../agents/embedded_context.py): the same MCP protocol, the same server and tools,
  over in-memory streams inside the Functions worker (`OVERLAP_MCP_TRANSPORT=embedded`, the default). Opening a
  session went from about 570 ms to about 22 ms in a local fixture benchmark
  ([`docs/release-readiness.md`](release-readiness.md)); on Azure a fresh process had taken 4–5 s.

## Azure AI Translator

**What it does.** Translates the checked English lines into Spanish, Hindi and French. Club and player names are
protected with the dynamic dictionary so they come back as written.

**Why.** A dedicated translation service is fast, cheap (the free F0 tier) and leaves the model budget for writing.
Every translated line is checked again in code, and a verified line also needs a model check of its meaning.

**Where.** [`agents/translation.py`](../agents/translation.py) (the adapter, managed identity on Azure, a fake
offline), [`agents/translator.py`](../agents/translator.py) (the agent and its re-checks), the Translator account
in [`infra/modules/foundry.bicep`](../infra/modules/foundry.bicep).

## Azure services

| Service | What it does in Overlap | Why | Where |
|---|---|---|---|
| **Event Hubs** (Standard, 1 TU) | Hubs `match-events` and `match-tracking`, 4 partitions, consumer groups `relay`, `stats`, `archiver` | Ordered per-match partitions, several independent readers of one stream, checkpoints | [`infra/modules/event-hubs.bicep`](../infra/modules/event-hubs.bicep) |
| **Functions** (B3 plan, Python) | App `live`: the screen relay. App `insights`: archiver, `moment_trigger` and `recap_trigger` (Cosmos change feed), `insights_publisher` (timer) | Event Hubs and change-feed triggers with retries and checkpoints; the relay has its own app so it never waits behind the agents | [`functions/function_app.py`](../functions/function_app.py), [`infra/modules/functions.bicep`](../infra/modules/functions.bicep) |
| **Container Apps** | The web app (public link), the stats engine (1 replica), the generator (a manual job the web app starts) | Long-running containers and a start-on-demand job in one environment; the web app keeps one replica while paused, so the link never cold-starts | [`infra/modules/container-apps.bicep`](../infra/modules/container-apps.bicep), [`infra/containers/`](../infra/containers) |
| **Cosmos DB** (free tier) | Database `live`: `screen`, `matches`, `events`, `stats`, `match_state`, `moments`, `overlays`, plus `leases` | Per-match partitions, the change feed that starts the agents, transactional batches for card sequence numbers | [`infra/modules/cosmos.bicep`](../infra/modules/cosmos.bicep) |
| **Web PubSub** | Hub `live`: match frames to every viewer, and one group per audience (mode, language, club, player) for cards | Managed WebSockets with groups, so each viewer gets only their audience's cards | [`infra/modules/web-pubsub.bicep`](../infra/modules/web-pubsub.bicep) |
| **Blob Storage** (shared keys off) | Archived tracking for replays, stats checkpoints, the Functions host | Cheap storage for the large tracking stream | [`infra/modules/storage.bicep`](../infra/modules/storage.bicep) |
| **Application Insights**, Log Analytics | Logs and request traces of every app, and one trace per card from the agents (0.5 GB daily cap) | One place to see a run end to end, down to each agent and model call | [`infra/modules/monitoring.bicep`](../infra/modules/monitoring.bicep) |
| **Managed identities** | Four user-assigned identities (functions, stats, generator, web), each with only its roles | No keys anywhere | [`infra/modules/identity.bicep`](../infra/modules/identity.bicep), [`infra/specs/security.md`](../infra/specs/security.md) |
| **Bicep and `azd`** | The whole resource group; `azd provision` is safe to repeat | Repeatable deploy, pause and resume | [`infra/main.bicep`](../infra/main.bicep), [`azure.yaml`](../azure.yaml), [`infra/README.md`](../infra/README.md) |

Locally each service has a Microsoft stand-in (Event Hubs, Cosmos DB and Azurite emulators, Foundry Local) or our
own (a Web PubSub stand-in), so the same code runs on a laptop with settings changed only
([`infra/specs/local-development.md`](../infra/specs/local-development.md)).

## GitHub, GitHub Actions and GitHub Copilot

Four people built Overlap in parallel, every layer at once. GitHub is how that worked.

**Pull requests.** Every change is a branch and a pull request into `main`, with the template in
[`.github/pull_request_template.md`](../.github/pull_request_template.md): which layers it touches, whether a message
shape changed, synthetic data only, no secrets, and how to test it. Each layer has named owners in
[`plans/REGISTRY.md`](../plans/REGISTRY.md), and a pull request touching another layer's files tells its owners first.
By 25 Oct, 107 pull requests had been reviewed and merged this way.

**Contracts first.** [`CONTRACTS.md`](../CONTRACTS.md) is the one source of truth for every message between layers:
match setup, events, tracking frames, evidence packs, overlays, browser envelopes, metric definitions, insight
handoffs, the season document. Each layer builds against the contract and its fixtures
([`fixtures/`](../fixtures)), not against another layer's code, so the generator, stats engine, agents, relay and
web app were built at the same time and fitted together. A pull request that changes a shape updates
`CONTRACTS.md` in the same change (the template asks), and each layer's tests check its messages against the
contract's shapes (for example the web app's schemas in [`web/src/lib/contracts.ts`](../web/src/lib/contracts.ts)).

**Specs and plans.** Each folder has its specs (`*/specs/`) agreed before its code, and each piece of work a plan in
[`plans/`](../plans) with acceptance criteria and a handover, so anyone picking up a layer knows what is done, what
was proven and what is open.

**A shared knowledge graph (Graphify).** [`docs/knowledge/`](knowledge/README.md) holds one note per component (eleven
boxes: generator, Event Hubs, relay, archiver, storage, stats engine, MCP, insights, Web PubSub, frontend,
environments), each with its evidence and dependencies. Graphify builds them, with the code's structure, into a local
graph ([`docs/knowledge/setup.md`](knowledge/setup.md)), so a teammate starting on any layer queries the graph for
how a symbol or file connects instead of reading the whole repository. Notes are updated in the same pull request as
the change they describe.

**GitHub Actions: 11 jobs on every pull request** ([`.github/workflows/`](../.github/workflows)):

| Workflow | Jobs |
|---|---|
| [`pr-checks.yml`](../.github/workflows/pr-checks.yml) | Policy (commit identity, branch name, template, attribution); private blocklist; secrets scan (gitleaks over the PR's commits); scope and spec gate (layers and shared files touched, plan present, overlaps with other open PRs) |
| [`python.yml`](../.github/workflows/python.yml) | Detect changed projects; ruff on changed files; pytest per changed project with a locked `uv sync`; tests of the CI scripts; one result job |
| [`web.yml`](../.github/workflows/web.yml) | Web lint, type check and production build |
| [`infra.yml`](../.github/workflows/infra.yml) | Bicep build and lint |
| [`main.yml`](../.github/workflows/main.yml) | After every merge, on the whole of `main`: every Python project's tests, ruff, the web lint, types, tests and build, and the Bicep template |

**GitHub Copilot.** Used in the editor (chat while writing and debugging code) and for reviews of pull requests,
alongside the team's own reviews. Every change still passed the same CI jobs and a human merge.
