# PLAN_infra_monitoring — A workbook for live runs and email alerts on failures

| Field | Complete this |
|---|---|
| Change | An "Overlap live run" workbook on Application Insights and three email alerts (function failures, the model breaker opening, cards expiring), in Bicep |
| Why | 90-point plan D11 (operations dashboard) and D12 (alerts on function failures): until now a run was watched with ad hoc Log Analytics queries, and only the budgets sent alerts |
| Author / owner | Arnav (requested this work, 25 Oct). `infra/` modules are "Unassigned (Arnav decides)" in `plans/REGISTRY.md` |
| Status | In progress — built, PR open for review; deployed by the next `azd provision` |
| Reviewed commit | main · `1a60777` |
| Branch | `infra/monitoring` |
| Governing spec | `infra/specs/resources.md` §2.8 (monitoring), `infra/specs/costs.md` §1 |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S4.1 | Action group and three log alerts in `monitoring.bicep`, to the budget contact | `bicep build` and `bicep lint` clean |
| S4.2 | The workbook: cards sent and expired, model-written jobs, function runs and failures, relay and archiver batch time, agent stage time, model calls by outcome, MCP calls, exceptions | Same |
| S4.3 | Specs, infra README, costs, this plan; the PR | CI green |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `infra/modules/monitoring.bicep` | Modify | Workbook, action group, three scheduled query rules; `alertEmail` parameter |
| `infra/main.bicep` | Modify | Passes the budget contact as `alertEmail` |
| `infra/specs/resources.md` | Modify | §2.8 workbook and alerts rows |
| `infra/specs/costs.md` | Modify | Cost of the three alerts |
| `infra/README.md` | Modify | Files table; how to watch a run |
| `plans/active/PLAN_infra_monitoring.md` | Add | This plan |

- **Contracts or hot shared files touched:** `infra/main.bicep` (hot shared file: Arnav, Pranav), one parameter line.
- **Conflict scan:** open PRs on 25 Oct at `1a60777`: #108 and #109 change `infra/modules/functions.bicep`, not these
  files. No overlap.
- **Done when:** CI is green; after the next provision the workbook opens under the Application Insights resource and
  each alert shows as enabled.
- **Risk:** the queries can only be run on Azure. They use the field names in `agents/specs/observability.md` and the
  Functions host's `requests`; a panel with a wrong field shows an error in the workbook and nothing else breaks.
- **Handover:** Pending review.
