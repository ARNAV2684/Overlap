# PLAN_web_match-list — the match picker lists matches from the archive, not the mock

| Field | Complete this |
|---|---|
| Change | New route `GET /api/matches` lists the archived matches (live and finished) from Cosmos; the match picker at `/` reads it instead of the mock's `GET /mock/matches`, and links finished matches to their replay |
| Why | The picker is the last part of the live screen that only works with the mock: the Web PubSub stand-in (`infra/local/webpubsub_standin`) serves negotiate and snapshot but no match list, so with the real local chain (generator → Event Hubs → relay → stand-in) the picker says the server is down |
| Author / owner | Vedant (layer 7, `web/`) |
| Status | In progress · built on `web/match-list` (22 Oct) and merged to `main` in PR #77 (23 Oct) with its specs, tests and docs. Not run against a real archive yet, so it stays in `active/` until that run passes. The spec change waits for review with the replay specs |
| Reviewed commit | `web/replay-page` · 837d3de (stacked: `archive-store.ts` is not on `main` yet; `main` · 14a3443) |
| Branch | `web/match-list`, stacked on `web/replay-page`; rebased on `main` once the replay PRs merge |
| Governing spec | `web/specs/realtime.md` §5.3 (new: match list route) and `web/specs/screens.md` §1 (match picker). Neither is agreed yet (both "merged for review in #19") |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `plans/active/PLAN_web_match-list.md` | Add | This plan |
| `web/specs/realtime.md` | Modify | New §5.3: `GET /api/matches`, its sources, shape, order, errors; status line and §1 note on the match list no longer provisional |
| `web/specs/screens.md` | Modify | §1 match picker: reads `/api/matches`, team names, live vs finished links, error and empty states; status line |
| `web/src/lib/match-list.ts` | Add | Pure: stored rows + `match_state` documents → the list; the response schema shared by the route and the browser |
| `web/src/lib/server/archive-store.ts` | Modify | `createMatchListStore()`: recent `matches` rows across partitions (projected fields only) and one `match_state` point read |
| `web/src/lib/server/archive-env.ts` | Modify | `describeArchiveEnvProblems()` takes the feature's name, so the match list's log line doesn't say "Replay" (default unchanged) |
| `web/src/app/api/matches/route.ts` | Add | The route: settings, reads, error codes, `no-store` |
| `web/src/lib/api.ts` | Modify | `listMatches()` calls this app's `/api/matches` (same origin), not the stream server; mock-only `MatchSummary` removed |
| `web/src/app/page.tsx` | Modify | Picker cards show team names and status; finished → `/replay/<id>`; archive wording and error states |
| `web/src/lib/__tests__/{match-list,matches-route}.test.ts` | Add | Builder and route tests (fake store) |
| `web/src/lib/__tests__/api.test.ts` | Modify | `listMatches` tests for the new shape |
| `web/src/lib/__tests__/stream.qa.test.ts` | Modify | Compare the final score with the snapshot's status instead of the mock's list |
| `web/.env.example`, `web/README.md` | Modify | Say the archive settings also feed the match list |

- **Contracts or hot shared files touched:** none changed. Reads Cosmos `matches` (`CONTRACTS.md` §4.1, Arnav) and
  `match_state` (§4.2, Azeem) as they are; the web route becomes one more reader of `match_state`. Arnav and Azeem
  to be told in the PR.
- **Conflict scan:** checked 22 Oct at `main` · 14a3443 and `web/replay-page` · 837d3de. Plans: only
  `PLAN_web_replay` (same author) names the picker, as its optional M4 link; this plan delivers that link, and M4's
  separate `/replay` list is no longer needed for finding a match. `PLAN_stats_engine` defines `match_state` (D-02);
  no plan changes its shape. Branches touching these web files are the author's own (`web/replay-*`, old
  `fork/vedant/web-app`, `fork/web/live-match-ui-setup`). No overlaps with anyone else.
- **Done when:** with the local stack running and a generator match playing, `/` lists it as live with its score
  and clock, then as finished with the archived score once full time is archived, and its link opens the replay;
  without the archive settings `/` says the list is not set up and still links the default match. Lint, typecheck,
  build and unit tests pass.
- **Risk:** a match that never reaches full time (generator stopped) stays "live" in the archive forever, so the
  picker offers a live screen with nothing on it. Locally the stack starts clean each run; on Azure this needs a
  rule (for example "live but no `match_state` change for 10 minutes"), left for later.
- **Handover (22 Oct, partial):**
  - Done: `GET /api/matches` with `match-list.ts` and `createMatchListStore()`; the picker on the new list (team
    names, live → `/match/<id>`, finished → `/replay/<id>`, "not set up", "can't read" and "empty" states);
    `realtime.md` §5.3 and the `screens.md` picker section; 14 new tests (`match-list`, `matches-route`) and the
    `api` tests rewritten for the new shape. The opt-in `stream.qa` test now takes the final score from the snapshot.
  - Checked: lint, typecheck, `npm test` (457 passed, 2 opt-in skipped) and build pass; the build lists
    `/api/matches` as dynamic. `connection()` keeps it off the build's prerender, which would otherwise freeze a
    503. Smoke run with `next start` and no settings: `503 matches_unavailable`, `no-store`, and one log line naming
    `OVERLAP_COSMOS_ENDPOINT` only.
  - **Not checked:** the cross-partition `TOP @limit … ORDER BY c._ts DESC` query and the `match_state` point read
    against the Cosmos emulator, and the "Done when" run with a generator match. Both need Docker (not installed on
    this machine).
  - To tell: Arnav (the web app reads `matches` across partitions) and Azeem (one more reader of `match_state`),
    in the PR.
