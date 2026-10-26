# PLAN_web_card-drawer — "How this card was made"

| Field | Complete this |
|---|---|
| Change | A drawer on every commentary card showing the agents' work behind it: each agent in order with its time and model calls, the analyst's MCP tools, the fact-check rounds and verdict, translations, and the working time against the deadline |
| Why | 90-point plan D5, the largest remaining lever for Agentic Design and Category: it puts the multi-agent system on screen. The data is already in each job record |
| Author / owner | Arnav (web owners Arnav and Azeem, `plans/REGISTRY.md`) |
| Status | In progress — built, PR open for review |
| Reviewed commit | main · `109c071` |
| Branch | `web/card-drawer` |
| Governing spec | `web/specs/screens.md` §4.1, `web/specs/realtime.md` §5.4 |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S1.1 | `card-trace.ts`: a job record → the drawer's view (pure) | Unit tests on a record shaped like SYN-3013's |
| S1.2 | `jobs-store.ts` and the route `GET /api/match/<id>/moments/<moment>/trace` | Route tests: 200, 400, 404, 503, 502 without leaking settings |
| S1.3 | `CardTrace.tsx`: the link on the strip and feed cards, the drawer | Seen on the SYN-3013 replay against Azure data, desktop and phone |
| S1.4 | Specs, this plan, the PR | CI green |

**Files (the only files that may change):** `web/src/lib/card-trace.ts`, `web/src/lib/server/jobs-store.ts`,
`web/src/app/api/match/[id]/moments/[moment]/trace/route.ts`, `web/src/components/match/CardTrace.tsx`,
`web/src/components/match/MomentStrip.tsx`, `web/src/components/match/AiFeed.tsx`,
`web/src/lib/__tests__/card-trace.test.ts`, `web/src/lib/__tests__/card-trace-route.test.ts`,
`web/specs/screens.md`, `web/specs/realtime.md`, this plan.

- **Contracts:** none changed. The route reads the agents' existing job record read-only.
- **Handover:** Pending review.
