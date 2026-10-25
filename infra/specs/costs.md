# Costs spec

> **Status: draft for review.** Plan: [`PLAN_infra_azure-pass`](../../plans/active/PLAN_infra_azure-pass.md) (A0).
> Set this line to `> **Status: agreed.**` in the PR that approves it. Governs every module.

Decides budgets and how the judges' link stays up until 10 Nov.

**Subscription (decided by Arnav, 23 Oct):** the Azure free account, $200 of credit for 30 days. Two consequences:

- **No model quota on Free Trial.** Microsoft gives Free Trial subscriptions zero quota for Foundry / Azure OpenAI
  models and no quota increases. The model (sprint A4) can only be deployed after the subscription is **upgraded to
  pay-as-you-go**; the remaining credit is expected to carry over (to confirm on the upgrade page).
- **The credit and the trial end 30 days after sign-up.** The link must survive until 10 Nov, so the upgrade happens
  before the expiry date in any case (handoff §11). After the upgrade the trial's spending limit no longer stops
  charges, so the budgets below are the protection.

## 1. Budgets

- Budget alert levels and who receives them.

_Answer:_

| Budget | Scope | Amount | Alerts at | Receives |
|---|---|---|---|---|
| Overall: eight budgets `overlap-budget-025` … `overlap-budget-200` (**created 23 Oct**) | Subscription | $25, $50, $75, $100, $125, $150, $175, $200; quarterly (1 Oct – 31 Dec), so spend adds up across October and November | 100 % of actual cost on each, so an email at every $25 step; the $200 budget also at 100 % of forecast | Arnav (address kept out of the repository) |
| Model | The Foundry (AI Services) resource | **$25 hard cap** (Arnav, 20 Oct) | 50 %, 80 %, 100 % | Arnav |

The overall budgets were created directly on the subscription (they cover everything, including anything outside the
resource group); the model budget is created by Bicep with the Foundry resource (A4).

The three log alerts on Application Insights ([`resources.md`](resources.md) §2.8) cost about $1.50 a month each at
a 5-minute frequency (list price), about $4.50 a month for the three; the workbook is free.

Azure budgets only send alerts; they never stop spending. The $25 model cap is enforced by:

1. **Code:** the agents' budget settings (`OVERLAP_MAX_CALLS_PER_MATCH`, `OVERLAP_MAX_TOKENS_PER_MATCH`,
   `OVERLAP_MAX_MODEL_JOBS_PER_MATCH`, `OVERLAP_MAX_INPUT_TOKENS`, `OVERLAP_MAX_OUTPUT_TOKENS`, …) bound every match;
   the model breaker (H2) falls back to templates on failure.
2. **Capacity:** the deployment's small tokens-per-minute limit ([`resources.md`](resources.md) §2.9).
3. **Operator action:** at the 100 % model alert, Arnav removes the model deployment; cards fall back to checked
   templates and the site keeps working.

## 2. Tiers over time

- Which tiers in development, and which for the demo and judging?

_Answer:_

The same tiers throughout ([`resources.md`](resources.md) §2), with **replica counts** changed by period:

| Period | What runs | Notes |
|---|---|---|
| A0–A3 (24 Oct) | Event Hubs, Cosmos, Storage, monitoring, Web PubSub; laptop services against them | From A1 Event Hubs bills by the hour |
| A4–A10 (24–26 Oct) | Everything | Between test sessions, stats engine and web app may be set to 0 replicas |
| Judging (27 Oct – 10 Nov) | Everything, web app min 1 replica, stats engine 1, Functions app 1 instance (Always On), Web PubSub Standard | The judges' link opens on replay by default (handoff), so viewing costs no model calls; live matches only start from the rate-limited button |

**Estimate per day while everything runs** (estimates, to be checked on the Azure pricing pages for the chosen region
before A1, then replaced by measured cost after A8):

| Item | Per day (approx.) |
|---|---|
| Event Hubs Standard, 1 TU | $0.75 |
| Web PubSub Standard, 1 unit | $1.6 |
| App Service plan B3 (both Functions apps) | $1.8 |
| Cosmos DB at 4,000 RU/s during live runs (3,000 above the free tier) | $5.8 while set; set it back to 1,000 between runs |
| Container Apps (stats + web at 1 replica each) | $1–2 |
| Container registry Basic | $0.17 |
| Log Analytics (0.5 GB daily cap) | ≤ $1.4 (normally far less) |
| Cosmos DB free tier, Storage, Translator F0 | ~$0 |
| **Total** | **about $5.5–8**, plus Cosmos while at 4,000 RU/s |

From 24 Oct to 10 Nov (18 days): **about $80–125, plus up to $25 of model calls**, inside the $200 credit if the
credit carries over the upgrade. Main cost drivers: Web PubSub, Container Apps, Event Hubs.

Upgrade to pay-as-you-go: **before A4** (model quota), and in any case before the trial's expiry date.

## 3. Shutdown

- What gets scaled down or deleted after judging?

_Answer:_

- **11 Nov:** after judging closes, Arnav deletes the whole resource group with `azd down --purge` (it also purges
  the AI Services and Translator accounts so their names and the Cosmos free tier are released). Archived matches
  are test data and are not kept.
- If the organisers ask for the link to stay up longer, the model deployment is removed first (templates only), the
  stats engine and generator stop (replay only), and Web PubSub drops to Free.
- Budget alerts stay on until the resource group is deleted.
