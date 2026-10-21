# PLAN_agents_insights-build_S7 — local live run end to end (M7, local part)

| Field | Complete this |
|---|---|
| Sprint | S7 — a 20× match through every local service at once, with the model on under the spec limits, cards rendered in a browser, and a live-run report (latency, sent, expired, suppressed). The Azure switch is **out of scope** for this sprint (Arnav, 21 Oct: "leave Azure out for now") |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M7 (local) · AC-07 (local part) |
| Author / owner | Arnav |
| Status | Done (local); Azure part waits for Arnav's go |
| Reviewed branch and commit | `agents/evals` (M6, PR #70) |
| Planned branch | `agents/live` (stacked on `agents/evals`) |

## 1. Outcome

- **What works at the end of this sprint:** generator → Event Hubs emulator → stats engine (moments, `match_state`,
  panels) and the screen relay and archiver → the moment trigger and the seven agents with the MCP server and the
  local model → the insights publisher → the Web PubSub stand-in → browsers: two protocol viewers and a page that
  renders one audience's cards, the match score and clock.
  - `standin/viewer.html` at `/insights/viewer`: a development page that renders cards, player tags and the recap
    for one audience group (catch-up through the snapshot, then live). Not the product UI (the web app's card
    rendering is Vedant's).
  - `evals/live_run.py`: the live-run report from Cosmos (jobs by state, deliveries sent and expired, model calls,
    latency moment written → card sent, model-backed and template moments apart).
  - `functions/relay_runner.py --from-latest`: a relay that was off while matches streamed skips that backlog.
- **Not in this sprint:** Azure (resources, managed identity, Web PubSub, Foundry model, Translator, hosting the
  trigger and publisher) — on Arnav's go, within the $25 cap.

## 2. Settings of the run

20× speed; phi-4-mini on Foundry Local; the spec limits (`OVERLAP_MODEL_TIMEOUT_S=4`, `OVERLAP_MOMENT_DEADLINE_S=15`,
12 model jobs a match); fake translator; every service from `infra/specs/local-development.md` §5.

## 3. Files

| File | Add / modify | What changes |
|---|---|---|
| `infra/local/webpubsub_standin/standin/viewer.html`, `server.py` | Add / modify | The dev viewer page |
| `agents/evals/live_run.py` | Add | The live-run report |
| `functions/relay_runner.py` | Modify | `--from-latest` |
| `agents/evals/results/live-SYN-0701/`, `live-SYN-0702/` | Add | The two runs' reports |
| `infra/specs/local-development.md`, `agents/README.md`, `docs/knowledge/ai-insights.md`, this plan | Modify | Run order, status, handover |

## 4. Acceptance criteria

| ID | Given / when / then | Evidence |
|---|---|---|
| AC-07a | A 20× match through every local service: cards for each mode and language, player tags and the recap reach browsers in seq order; a late joiner catches up | Pass on SYN-0702 (CAL v DTN): viewer A got 10 cards + recap in casual-en, analyst-es and club-DTN-fr, a player tag and 3 player cards + recap in player-CAL-09 en and hi, all in order; viewer B joined late, snapshot 200, then 3–11 live. The page rendered all 11 casual-en cards from 25:18 to "Full time: Calverholme Athletic 2–0 Dunmarrow Town." with the relay's live score and clock in its header. SYN-0701 passed the same viewer checks |
| AC-07b | Latency and outcomes reported: p50/p95 moment → send, sent / expired / suppressed | SYN-0702: 18 moments; 11 published, 4 expired, 3 suppressed; 264 card, 24 recap and 32 tag deliveries sent, 100 card deliveries expired; template moments p50 1 s / p95 2 s, model-backed moments p50 10 s / p95 13 s. SYN-0701: 9 published, 5 expired, 4 suppressed; template p50 1 s, model p50 11 s / p95 14 s |
| AC-07c | The same run on Azure with settings only, within the $25 cap | **Not run** (Azure out of scope by Arnav's decision) |

## 5. Findings

- **The local model can't serve a live match under the spec limits.** Every model call ended in a timeout (4 s) or
  an HTTP 500 from Foundry Local; outside the run the same narrator call takes about 47 s. So the live cards were
  labelled templates, and the moments that waited on the model (up to three calls of 4 s, then the template) were
  the ones that expired at 20× (5 match minutes = 15 wall seconds). Model-written cards in a live match need the
  Azure model; a breaker that skips the model after repeated failures would also save those moments (proposal for
  M7's Azure part).
- **Relay backlog:** a relay that was off while other matches streamed replays their events without their setups
  and drops them for a long time; `--from-latest` starts it at the newest messages (local only).
- **Translator:** the fake translator marks lines `(es) …`; real translations need Azure AI Translator (M7 Azure).

## 6. Handover

- The local live path is complete and repeatable with `infra/specs/local-development.md` §5 (run order now includes
  the viewer page and the relay's `--from-latest`).
- Azure part of M7 (resources, Web PubSub, Foundry deployment, Translator, hosting the trigger and publisher in the
  Functions app, `overlays` in Bicep, the same live run on Azure) waits for Arnav's go.
