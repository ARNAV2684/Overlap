# PLAN_agents_longer-window — More time for each card at 20×, and a recap the model can finish

| Field | Complete this |
|---|---|
| Change | Job deadline 25 s on Azure (was 15 s); a card may go on screen up to 10 match minutes after its moment (was 5); the recap writer gets its own output allowance (2,400 tokens) and two clearer number rules |
| Why | SYN-3013 (26 Oct, 20× on Azure): jobs took 13.9 s p50 against 15 s, the translator came last and was cut short (29 of 33 calls), 302 deliveries expired against 118 sent, and the recap writer's rewrite spent all 800 tokens on reasoning, so every recap line fell back to the template |
| Author / owner | Arnav (agents owner, `plans/REGISTRY.md`) |
| Status | In progress — built, PR open; measured by the next 20× run on Azure |
| Reviewed commit | main · `109c071` |
| Branch | `agents/longer-window` |
| Governing spec | `CONTRACTS.md` §10.6 (expiry), `agents/specs/workflow.md` §3, `agents/prompts/recap_writer.md` |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S1.1 | `LIVE_WINDOW_MS` 600,000 in the publisher, the stand-in and the web (snapshot and feed); contract and specs | Tests updated to the constant |
| S1.2 | `OVERLAP_MOMENT_DEADLINE_S=25` on the insights Functions app | Bicep builds |
| S1.3 | `recap_max_output_tokens` (2,400) for the recap writer; prompt: no "once"/"twice", no ranges, `claims` only for numbers in the text | New test passes |
| S1.4 | Deploy, one 20× match on Azure, record the share | Row in `docs/evaluation.md` |

**Files (the only files that may change):** `agents/publisher.py`, `agents/config.py`, `agents/models.py`,
`agents/prompts/recap_writer.md`, `agents/specs/workflow.md`, `agents/tests/test_publisher.py`,
`agents/tests/test_agents.py`, `agents/tests/test_insights_snapshot.py`, `agents/tests/test_models.py`,
`infra/local/webpubsub_standin/standin/insights.py`, `infra/modules/functions.bicep`, `web/src/lib/live/insights.ts`,
`web/src/lib/server/insights-snapshot.ts`, `web/src/lib/__tests__/insights.test.ts`, `web/specs/realtime.md`,
`CONTRACTS.md`, this plan.

- **Contracts:** `CONTRACTS.md` §10.6 expiry changes from 300,000 to 600,000 match ms; no message shape changes.
- **Risk:** a card can now appear up to 10 match minutes after its moment; it still carries its own minute, so it reads
  as commentary catching up. Longer jobs hold a match's two job slots longer, so more moments may queue.
- **Handover:** Pending review.
