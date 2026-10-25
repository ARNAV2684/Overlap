# PLAN_agents_breaker-deadline — Count only full-length timeouts towards the model breaker

| Field | Complete this |
|---|---|
| Change | A model call timed out by the job's deadline no longer opens the breaker; on Azure the breaker waits for 5 failures and pauses for 20 s |
| Why | SYN-3012 (25 Oct, 20× on Azure): the breaker opened again and again, and 22 narrator, 11 analyst and 8 spotter calls were skipped as `breaker_open`, holding the AI-written share at 16% (48 of 291 cards) |
| Author / owner | Arnav (agents owner, `plans/REGISTRY.md`) |
| Status | In progress — built, PR open for review; the effect is measured by the next proving run on Azure |
| Reviewed commit | main · `1a60777` |
| Branch | `agents/breaker-deadline` |
| Governing spec | `agents/specs/workflow.md` §3 (timing and limits): new "Model breaker" row |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S1.1 | `Models.ask` counts a timeout only when the call had its full request timeout; a shortened one releases a probe and counts nothing | Code committed |
| S1.2 | Tests: a shortened timeout never trips, a full-length one still does, a shortened probe is released | New tests fail on `main`'s code and pass with S1.1 |
| S1.3 | Azure values in `functions.bicep` (5 failures, 20 s cooldown); spec row; this plan | Bicep builds in CI |
| S1.4 | Checks and the PR into `main` | ruff, agents and functions tests, CI green |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `agents/models.py` | Modify | `full_timeout` decides whether a timeout counts towards the breaker |
| `agents/tests/test_models.py` | Modify | Three breaker tests |
| `infra/modules/functions.bicep` | Modify | `OVERLAP_MODEL_BREAKER_FAILURES=5`, `OVERLAP_MODEL_BREAKER_COOLDOWN_S=20` on the insights app |
| `agents/specs/workflow.md` | Modify | "Model breaker" row in §3 |
| `plans/active/PLAN_agents_breaker-deadline.md` | Add | This plan |

- **Contracts or hot shared files touched:** none. The local defaults (3 failures, 60 s) are unchanged.
- **Conflict scan:** no open PRs; no active plan names these files' breaker code. Checked 25 Oct at `1a60777`.
- **Done when:** CI is green and the next 20× run on Azure shows `breaker_open` only during real outages; the AI share is
  recorded in `docs/evaluation.md`.
- **Risk:** a model that is slow for every call (each one cut short by the deadline) is never paused, so each moment
  spends its deadline on it before the template. The deadline still bounds every card, and provider errors still trip
  the breaker.
- **Handover:** Pending review.
