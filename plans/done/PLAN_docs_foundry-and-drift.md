# PLAN_docs_foundry-and-drift — Show the Foundry work, fix stale docs, check the whole of main

| Field | Complete this |
|---|---|
| Change | Keep tracing on in Bicep; show the Foundry tracing, evaluation and content safety in the judge-facing pages; bring their numbers up to date; name the Azure services on How it works; check the whole of `main` after every merge, with a README badge |
| Why | The 25 Oct evening audit: #100's Foundry work appeared on no judge-facing page and would switch off at the next provision; the live AI-share table was empty; test counts, the judge's guide, `release-readiness.md` and plan statuses had drifted; CI never ran on `main` (90-point plan C4, C9, C10, D4) |
| Author / owner | Arnav (requested this work, 25 Oct). Docs are "Unassigned (Arnav decides)" in `plans/REGISTRY.md` |
| Status | Done — merged into `main` in #109 (25 Oct) |
| Reviewed commit | main · `1a60777` |
| Branch | `docs/foundry-and-drift` |
| Governing spec | `agents/specs/observability.md` (tracing setting), `web/specs/screens.md` §7 (How it works) |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S3.1 | `OVERLAP_TRACING=azure` in `infra/modules/functions.bicep`; observability spec says so | Bicep builds and lints |
| S3.2 | Foundry tracing, Azure AI Evaluation scores and the Content Safety screen in the README, Microsoft stack, architecture, evaluation and responsible AI pages | Every figure traced to `agents/evals/results/` or the observability spec |
| S3.3 | The four Azure runs of 25 Oct in "Live AI share"; README results, known gap and test counts; architecture latency rows | Every figure has its source (report or PR) |
| S3.4 | How it works names the Azure services; the judge's guide describes the Casual and Analyst screens; `release-readiness.md` matches #99 | Web lint, types and tests pass |
| S3.5 | `.github/workflows/main.yml` and the README badge | The workflow runs green on this PR |
| S3.6 | Plan status lines; this plan; links checked | Every relative link in the changed pages resolves |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `infra/modules/functions.bicep` | Modify | `OVERLAP_TRACING=azure` |
| `agents/specs/observability.md` | Modify | Tracing is on through Bicep |
| `README.md` | Modify | Badge, stack rows, results, known gap, test counts, CI |
| `docs/microsoft-stack.md`, `docs/architecture.md`, `docs/evaluation.md`, `docs/responsible-ai.md`, `docs/testing.md`, `docs/release-readiness.md` | Modify | As in the sprints |
| `web/src/app/how-it-works/page.tsx`, `web/specs/screens.md` | Modify | Azure service names in the pipeline steps |
| `.github/workflows/main.yml` | Add | Checks on the whole of `main` |
| `plans/done/PLAN_web_football-revamp_S7.md`, `…_S8.md`, `PLAN_cross_live-insight-moments.md`, `PLAN_agents_foundry-observability.md`, `PLAN_local_release-fixes.md`, `PLAN_web_viewer-replay-acceptance.md`, `PLAN_infra_azure-pass.md` | Modify | Status lines |
| `plans/done/PLAN_docs_foundry-and-drift.md` | Add | This plan |

- **Contracts or hot shared files touched:** none. `infra/modules/functions.bicep` is also changed by #108, in a
  different part of the settings list.
- **Conflict scan:** open PRs on 25 Oct at `1a60777`: #108 (breaker). It touches `functions.bicep` at the end of the
  settings list; this branch adds its setting next to `APPLICATIONINSIGHTS_CONNECTION_STRING`, so the two merge cleanly.
- **Done when:** CI is green, including the new `main.yml` on this PR.
- **Risk:** `main.yml` runs the generator's full test suite (about 7 minutes) after every merge; it runs in parallel and
  blocks nothing.
- **Handover:** Pending review.
