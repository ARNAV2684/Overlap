# PLAN_web_first-visit — The home page explains itself and opens on a chosen replay

| Field | Complete this |
|---|---|
| Change | A "What you're seeing" panel on a first visit to the home page, and showcase replays the home page opens on first (`OVERLAP_SHOWCASE_MATCH_IDS`) |
| Why | 90-point plan D14: judges mostly open the home page and replays; the newest replay may have only template cards, and nothing told a first-time visitor what the screen shows |
| Author / owner | Arnav (requested this work, 25 Oct). `web/` owners: Arnav, Azeem (`plans/REGISTRY.md`) |
| Status | Done — merged into `main` in #112 (25 Oct) |
| Reviewed commit | main · `1a60777` |
| Branch | `web/first-visit` |
| Governing spec | `web/specs/screens.md` §1 (home), `web/specs/realtime.md` §5.3 (match list) |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S6.1 | The home page's choice of match as a pure, tested function (`lib/home-choice.ts`); no behaviour change | Tests for live, quiet, moving, replay, keep-current |
| S6.2 | `OVERLAP_SHOWCASE_MATCH_IDS`: `/api/matches` marks those finished matches `showcase: true` (read on every request, no rebuild); the home page prefers them; `azd` value `SHOWCASE_MATCH_IDS` in Bicep | List, route and choice tests; Bicep builds |
| S6.3 | `FirstVisitHint`: four lines, the cards' own badges, Got it remembered in this browser, nothing rendered on the server | Storage and server-render tests |
| S6.4 | Specs, judge's guide, this plan; full web checks; the PR | lint, types, all web tests, build |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `web/src/lib/home-choice.ts` | Add | `pickHomeMatch` |
| `web/src/components/home/HomeLive.tsx` | Modify | Uses `pickHomeMatch`; shows the hint |
| `web/src/components/home/FirstVisitHint.tsx` | Add | The panel and its storage helpers |
| `web/src/lib/match-list.ts`, `web/src/app/api/matches/route.ts` | Modify | `parseShowcaseIds`, the optional `showcase` flag |
| `web/src/lib/__tests__/home-choice.test.ts`, `first-visit-hint.test.ts` | Add | Tests |
| `web/src/lib/__tests__/match-list.test.ts`, `matches-route.test.ts` | Modify | Showcase tests |
| `web/.env.example` | Modify | The setting, documented |
| `web/specs/screens.md`, `web/specs/realtime.md`, `docs/testing.md` | Modify | Describe the above |
| `infra/modules/container-apps.bicep`, `infra/main.bicep`, `infra/main.parameters.json` | Modify | `showcaseMatchIds` from `SHOWCASE_MATCH_IDS` to the web app |
| `plans/done/PLAN_web_first-visit.md` | Add | This plan |

- **Contracts or hot shared files touched:** `infra/main.bicep` and `infra/main.parameters.json` (hot: Arnav, Pranav),
  one parameter each. The match list gains an optional field (`web/specs/realtime.md` §5.3), read by the web app only.
- **Conflict scan:** open PRs on 25 Oct at `1a60777`: #110 also changes `infra/main.bicep` (the monitoring module's
  parameters) and #109 also changes `docs/testing.md` (other lines). Different hunks; both merge cleanly.
- **Done when:** CI is green. After the showcase replays exist (E2): `azd env set SHOWCASE_MATCH_IDS "SYN-…,SYN-…"`,
  `azd provision`, and the home page opens on one of them.
- **Risk:** a showcase id outside the 50 most recent matches is not in the list, so the home page falls back to the
  newest replay. Choose showcase replays from the latest runs.
- **Handover:** Pending review.
