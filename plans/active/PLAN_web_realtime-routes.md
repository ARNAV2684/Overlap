# PLAN_web_realtime-routes — the web app serves negotiate and snapshot itself, and stops using the mock

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · real `GET /api/negotiate` and `GET /api/match/<id>/snapshot`; `api.ts` switched to them; the live screen no longer depends on the mock |
| Author / primary owner | Vedant (layer 7, `web/`) |
| Collaborators and responsibilities | Arnav (Pranav helping): screen relay and its Cosmos `screen` container, the Web PubSub stand-in, `CONTRACTS.md` §7.3 producer side, `infra/local/`, `.github/`, `mock/` |
| Review coordinator | Arnav |
| Affected component owners | Arnav (relay, stand-in, §7.3, local stack docs, CI, mock); Azeem (stat panels, `CONTRACTS.md` §7.4, informed only) |
| Proposal version and date | v0.2 · 23 Oct 2026 (v0.1 was a scratch draft on 22 Oct, never shared) |
| Status | Implemented on `web/realtime-routes` (23 Oct); PR not opened. The `CONTRACTS.md` §7.3 commit waits for Arnav |
| Plan tier and file | Full · `plans/active/PLAN_web_realtime-routes.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | `main` · `329153d`; branch `web/realtime-routes` created from it (no commits yet) |
| Architecture box / work area | Layer 7 web app ↔ layer 6 Web PubSub (local stand-in) ↔ layer 2 screen relay store |
| Relevant issue, spec PR, or discussion | `web/specs/realtime.md` §1, §3 (approach **agreed in person**, reported by Vedant on 23 Oct; no written record yet, to be recorded in this plan's spec PR); `functions/specs/screen-relay.md` §4 (agreed, PR #29); Vedant's 20 Oct review of `PLAN_stats_engine` (snapshot `stats` trimming request) |

### Decisions recorded on 23 Oct (from Vedant)

| # | Question | Answer |
|---|---|---|
| 1 | Keep a direct-to-stream-server mode for the mock? | **No.** Remove the web app's dependency on the mock: no `NEXT_PUBLIC_STREAM_BASE_URL`, no "Mock WebSocket" wording. The `mock/` folder itself is Arnav's and is not touched |
| 2 | Spec gate for `realtime.md` §1 and §3 | **Agreed in person.** The spec text is written in M0 and the agreement noted in that PR |
| 3 | Azure | **Local Docker stack only for now.** Azure (Web PubSub resource, hosting, identity, roles) is out of scope. The managed-identity code path is written, mirroring `archive-env.ts`, but **not run** |
| 4 | Snapshot size at full time | **Trim in the route (D-9 B), now.** The `CONTRACTS.md` §7.3 sentence is changed in its own commit and needs Arnav's agreement before merge |

---

## 1. Purpose and intended outcome

- **Problem or need:** both routes are build-safe stubs answering `501`
  (`web/src/app/api/negotiate/route.ts`, `web/src/app/api/match/[id]/snapshot/route.ts`). The browser gets its
  socket URL and its catch-up snapshot straight from whatever runs on `NEXT_PUBLIC_STREAM_BASE_URL` (port 8787: the
  mock or the Web PubSub stand-in). On Azure nothing runs there, and the real service needs a server to sign client
  tokens. `functions/specs/screen-relay.md` §4 assigns the snapshot route to Vedant.
- **Proposed outcome:**
  1. `GET /api/negotiate?groups=match-<id>` returns `{ baseUrl, url, token }`: a short-lived, receive-only client
     URL, signed on the server, that can only join the requested match group.
  2. `GET /api/match/<id>/snapshot` returns the `CONTRACTS.md` §7.3 snapshot, built from the relay's Cosmos
     `screen` container the same way the stand-in builds it today.
  3. `api.ts` calls both on the app's own origin, as `listMatches()` already does. `NEXT_PUBLIC_STREAM_BASE_URL`
     and every mock-specific path and wording leave `web/`.
- **Benefit:** the browser only ever talks HTTP to its own app. Moving to Azure later changes server settings, not
  browser code. No key or Cosmos credential reaches the browser.
- **Success statement:** on the local Docker stack (generator → Event Hubs emulator → relay → stand-in + Cosmos
  emulator), `/match/<id>` connects through `/api/negotiate`, catches up through `/api/match/<id>/snapshot`, and
  plays to full time. The only traffic to port 8787 is the WebSocket, and a reload mid-match shows no duplicate rows.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| `web/src/app/api/negotiate/route.ts`, `web/src/app/api/match/[id]/snapshot/route.ts` | `main` · 329153d | Stubs, `501`, `GET` "a guess until the spec says otherwise" |
| `web/src/lib/api.ts` | 329153d | `createApiClient(env.streamBaseUrl)`: negotiate `GET /negotiate?groups=…`, snapshot `GET /api/match/<id>/snapshot`, both on the stream server. `negotiateResponseSchema` is `{baseUrl,url,token}`, marked PROVISIONAL "from the mock". `createMatchListClient("")` is the same-origin pattern |
| `web/src/lib/socket.ts` | 329153d | Reads only `negotiate(groups).url`; renegotiates on **every** (re)connect; sends its own `joinGroup`, waits ≤ 3 s, a failed ack only logs a warning. Needs no change |
| `web/src/app/api/matches/route.ts`, `web/src/app/api/replay/[id]/route.ts` | 329153d | House style: `await connection()`, one cached client per settings, typed `ErrorCode → status` table, `no-store`, log by operation only |
| `web/src/lib/server/archive-env.ts`, `archive-store.ts` | 329153d | Settings that return problems instead of throwing; Cosmos with emulator key or `DefaultAzureCredential`; 10 s `guarded()` |
| `infra/local/webpubsub_standin/standin/snapshot.py` | 329153d | Reference snapshot builder: one partition query, `state.setup`, envelope docs + `positions-latest`, per-envelope shape check, sort by `seq`; `404 unknown_match`, `503 setup_pending` |
| `infra/local/webpubsub_standin/standin/server.py` | 329153d | Stand-in accepts **any** `access_token` on `ws://127.0.0.1:8787/client/hubs/live`; joins on `joinGroup` |
| `functions/relay_store.py` | 329153d | Setting names `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB` (default `live`), `OVERLAP_COSMOS_CONTAINER` (default `screen`); a local endpoint uses a fake access key |
| `functions/specs/screen-relay.md` §4 | Agreed (PR #29) | Store layout (`env-<seq>`, `positions-latest`, `state`, partition `/match_id`); "on Azure the web app's `/api/negotiate` … issues a client token allowed to join only that group" |
| `CONTRACTS.md` §7.3 | v0 draft | Snapshot shape; "every `event`, `status` and `stats` envelope sent so far plus the latest `positions`"; `404` / `503`; `{ "error": "<code>" }` |
| `web/specs/realtime.md` §1, §3, §6 | Not agreed in writing; approach agreed in person 23 Oct | Negotiate via own route "not implemented yet"; negotiate shape provisional; many mock references |
| Mock references in `web/` | 329153d | `env.ts`, `.env.example`, `vitest.config.mts`, `SourceCard.tsx` ("Mock WebSocket · localhost:8787"), `AppFooter.tsx`, `app/dev/ui/page.tsx`, `README.md` ("With the mock stream"), `specs/realtime.md`, `specs/screens.md` §1, and tests `env`, `layout`, `live-match-view`, `replay-view`, `api`, `stream.qa` |
| Unmerged stat-charts work | `origin/web/match-list` · 9f289e5 (13 commits ahead of `main`) | Store keeps only the newest stat panel and the newest heavy panel; its plan's R-03 notes ~5,700 panels in a full-time snapshot |

**Differences between references:**
- `realtime.md` calls the negotiate shape provisional. The stand-in, the mock and the Web PubSub SDK all return
  `{ baseUrl, url, token }`, so this plan makes it final in `realtime.md`. It's a web-internal API, so
  `CONTRACTS.md` doesn't change for it.
- The stand-in's `503 store_unavailable` carries a `detail` field. The web route sends no `detail` and logs it
  instead, following the house rule. Clients read only `error`.
- `CONTRACTS.md` §7.3 requires every `stats` envelope in the snapshot, but the browser keeps two (see D-9).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| `GET /api/negotiate`: validate groups, sign a receive-only token, return `{baseUrl,url,token}` | Azure: Web PubSub resource, hosting, managed identity, roles (all Bicep is placeholder) |
| `GET /api/match/<id>/snapshot`: read Cosmos `screen`, build §7.3 | Audience and player groups (`CONTRACTS.md` §10.4): the live screen joins none |
| Server settings reader for Web PubSub + `screen` | Insights snapshot (`/api/match/<id>/insights/snapshot`, stand-in only) |
| `api.ts` same-origin; remove `NEXT_PUBLIC_STREAM_BASE_URL` and mock wording from `web/` | Deleting or changing `mock/` (Arnav); CI's leftover `NEXT_PUBLIC_STREAM_BASE_URL` (Arnav, `.github/`) |
| Snapshot `stats` trimming in the route, **if** Arnav agrees the §7.3 wording (D-9) | Relay storage change for `stats` (Arnav's follow-up, option C in D-9) |
| `realtime.md` §1.1 and §3.1; `screens.md` §1 source card; README; `.env.example` | Stale-connection fallback to the snapshot (`realtime.md` §3 open question); negotiate rate limiting |

- **Minimum complete result:** both routes working on the local Docker stack, the browser using them, and no mock
  dependency left in `web/`. Snapshot as §7.3 says today (every `stats` envelope).
- **Optional extension:** snapshot `stats` trimming (D-9 option B), once §7.3 is amended.
- **Boundary with neighbouring components:** the web app only **reads** `screen` and only **signs tokens**. It never
  sends to a group; the relay stays the only sender on `match-<id>` (`CONTRACTS.md` §7.1).

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Cosmos `screen` layout | Arnav | Read as-is (`screen-relay.md` §4) | Agreed · M2 | — |
| Stand-in accepting web-signed tokens | Arnav | Accepts any `access_token` already | Confirmed in code · M1 | — |
| Local Docker stack (`infra/local/docker-compose.yml`), stand-in on the host, `relay_runner.py` | Arnav | Running services for AC-07 | Exists · M3 | Unit tests with fakes |
| `CONTRACTS.md` §7.3 wording for `stats` (D-9) | Arnav (producer side), Vedant (consumer); Azeem informed | Agreement to send only the newest panel and the newest heavy panel | Pending · optional extension | Route serves every panel; store already keeps two |
| `@azure/web-pubsub` npm package | Vedant | New dependency; lockfile regenerated by npm | — · M1 | — |
| Stat-charts work on `origin/web/match-list` | Vedant | Merge order for `realtime.md`, `screens.md`, `README.md` (§13) | Unmerged · before M0 | Branch from `main`; merge `main` in once stat-charts lands |

**My owned deliverables:** both routes, settings reader, token issuer, screen store, snapshot builder, `api.ts`
switch, mock removal in `web/`, tests, spec and README text.
**Shared deliverables:** the §7.3 amendment (Arnav coordinates).

A mock enables parallel development; it does not prove that the real integration works. This plan's real check
(AC-07) runs against the relay's actual store and the stand-in's socket. Azure stays unproven.

## 5. Proposed flow

```text
Browser (socket.ts)                     Web app (Next.js server)                         Local Docker stack
─────────────────                       ────────────────────────                         ──────────────────
negotiate(["match-SYN-0042"])
  ── GET /api/negotiate?groups=match-SYN-0042 ──▶ validate groups
                                         WebPubSubServiceClient(endpoint, cred, "live")
                                         .getClientAccessToken({ roles: [joinLeaveGroup.<g>],
                                            groups: [<g>], expirationTimeInMinutes: 10 })
  ◀── { baseUrl, url, token }  no-store
open WebSocket(url, json.webpubsub.azure.v1) ────────────────────────────────────────▶ stand-in :8787 (host)
joinGroup → ack                                                                          ◀── relay sends envelopes
getSnapshot("SYN-0042")
  ── GET /api/match/SYN-0042/snapshot ──▶ query Cosmos `screen`, partition SYN-0042 ──▶ Cosmos emulator (Docker)
                                         build §7.3 (port of standin/snapshot.py)
  ◀── { match_id, setup, status, envelopes, rejected }  no-store
merge by seq, continue live (unchanged)
```

- **Input arrives through:** HTTP GET from the browser.
- **Processing performed here:** validation, token signing, one partition-scoped Cosmos query, snapshot assembly.
- **Output goes to:** the browser's `api.ts` → `socket.ts` → store (unchanged).
- **Execution relationship:** request-time only (`await connection()`), Node runtime.
- **State retained:** one in-memory client per route, keyed by its settings (as `matches/route.ts`). Nothing per
  match.

## 6. Technical approach and decision rationale

| # | Decision | Proposed choice | Reason | Credible alternative and trade-off | Status |
|---|---|---|---|---|---|
| D-1 | Token signing | `@azure/web-pubsub` `WebPubSubServiceClient`. A local endpoint (`http:` on `localhost` / `127.0.0.1`) gets `AzureKeyCredential("local-development-only-not-a-real-key")`; any other endpoint gets `DefaultAzureCredential` | Same rule as `functions/relay_store.py`, so later only settings change | Hand-signed JWT: no new dependency, but duplicates the SDK and has no managed-identity path | Proposed |
| D-2 | Token permissions | `roles: ["webpubsub.joinLeaveGroup.<g>"]` per group, `groups: [<g>]`, **no** send role, no `userId`, `expirationTimeInMinutes: 10` | Receive-only and limited to the match; the role makes `socket.ts`'s own `joinGroup` ack succeed | `groups` only: every connect logs "Could not join group" on the real service | Proposed |
| D-3 | Mock path | **Removed from `web/`.** `env.ts` keeps only `NEXT_PUBLIC_DEFAULT_MATCH_ID`; `api.ts` has one same-origin client (`createApiClient(baseURL = "")`, `baseURL` kept for tests) | Decision 1 above | — | **Agreed** (Vedant, 23 Oct) |
| D-4 | Snapshot code layout | New `web/src/lib/server/screen-store.ts` (Cosmos read) + pure `web/src/lib/snapshot.ts` (builder) | Keeps the archive store about the archive; builder testable without Cosmos | Extend `archive-store.ts`: fewer files, mixes two owners' containers | Proposed |
| D-5 | Snapshot query | Partition-scoped and projected: `SELECT c.id, c.type, c.envelope, c.setup FROM c WHERE c.match_id = @m AND c.type IN ('envelope','positions','state')`, all pages, 10 s guard | Skips the relay's held messages and duplicate marks in `state` (up to 2 MB) | `SELECT *` like the stand-in: simpler, more RU and bytes | Proposed |
| D-6 | Settings | New `web/src/lib/server/stream-env.ts`: `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB` (default `live`); `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_DATABASE` (default `live`), `OVERLAP_COSMOS_KEY` (emulator only), `OVERLAP_COSMOS_CONTAINER` (default `screen`). Returns problems, never throws; values never logged | Same names as the relay and stand-in; the snapshot must not need the archive's Blob setting | Reuse `readArchiveEnv`: would switch the snapshot off without Blob | Proposed |
| D-7 | Group validation | 1–4 comma-separated groups, each `match-` + `isMatchId`; else `400 bad_groups` | Never sign a token for an arbitrary group | Allow audience patterns now: not needed yet | Proposed |
| D-8 | Caching | `Cache-Control: no-store` on every response, errors included | Tokens and live state must never be cached | — | Proposed |
| D-9 | Snapshot size (decision 4) | **B: trim in the route** (decided 23 Oct, before measuring). See below | The store keeps only two panels | A and C below | Agreed by Vedant · §7.3 line pending Arnav |
| D-10 | Source card wording | "Live WebSocket · Web PubSub hub `live`" instead of "Mock WebSocket · localhost:8787"; `sourceHost()` removed if unused | The browser no longer knows a stream host; the card still says where data comes from | Show the negotiated `baseUrl` host: needs plumbing from `socket.ts` to the UI | Proposed |

**D-9: how the snapshot size can be resolved**

*The problem (estimate, unmeasured).* §7.3 puts every `stats` envelope in the snapshot. The stats engine sends one
panel per match second, so about 5,700 by full time. A light panel envelope is about 0.8 KB (measured from the
§7.4 example), which is about 4.5 MB. The ~95 heavy panels add more, and ~2,200 events add about 1 MB. A late
joiner at full time would make the route read ~8,000 Cosmos documents and download several MB. The browser would
then strictly validate every panel, inside the 7 s client timeout. The store keeps only the newest panel and the
newest heavy one (`origin/web/match-list`, `realtime.md` §2 there), so almost all of that is discarded.

| Option | What changes | Who | Effect | Cost |
|---|---|---|---|---|
| **A. Measure and compress only** | Nothing in the contract. Next.js `next start` already gzips responses | Vedant | Transfer drops (repetitive JSON), but the Cosmos read, server memory and browser parse/validate stay full size | Free; may still miss 7 s at full time |
| **B. Trim in the route** (recommended) | §7.3 wording: "the newest `stats` envelope and the newest `stats` envelope with `heavy`" instead of "every `stats` envelope". The route queries non-stats envelopes, plus two `TOP 1 … ORDER BY c.envelope.match_ms DESC` queries (one with `IS_DEFINED(c.envelope.data.heavy)`), all in one partition | Vedant (route); Arnav agrees §7.3 | Snapshot drops to roughly events + statuses + 2 panels (~1 MB at full time, estimate). The Cosmos read is filtered by index, so excluded panels aren't read. Store unchanged; `seq` gaps are already allowed | One `CONTRACTS.md` line (hot file, own commit); the stand-in's snapshot no longer matches, but the web app no longer calls it |
| **C. Trim in the relay** | Relay keeps `stats-latest` and `stats-heavy-latest` documents (like `positions-latest`) and stops writing one envelope document per panel. This is the change Vedant requested in the 20 Oct `PLAN_stats_engine` review | Arnav | Same snapshot as B, plus ~5,700 fewer Cosmos writes per match | Relay code change, not started |

*Recommendation.* Measure first (AC-08, M2). If a full-time snapshot is over **1 MB raw or 1 s** in the route, do
B in this plan, with Arnav agreeing the §7.3 line. Read stats by `envelope.kind`, not by document id, so the route
keeps working if Arnav later does C. If the numbers are under budget, keep A and leave B/C as follow-ups. If Arnav
doesn't agree to B before 24 Oct, ship A. It's correct, just slower for late joiners.

**Assumptions (checked in M1 unless stated):**
- A1: given `http://localhost:8787`, the JS SDK returns `baseUrl` `ws://localhost:8787/client/hubs/live` (`http→ws`).
  If not, the issuer rewrites the scheme.
- A2: the stand-in ignores `roles` and `groups` in the token (it accepts any token), so local runs behave as today.
  Enforcement by the real service is unproven until Azure.
- A3: the relay's container has default indexing (`infra/local/check_cosmos.py`), so `ORDER BY c.envelope.match_ms`
  works in one partition without a composite index. Checked in M2 only if B is chosen.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| `GET /api/negotiate` | web route → `api.ts` | `web/specs/realtime.md` §1 (provisional) | **Yes:** make `{baseUrl,url,token}` final; new §1.1 for the route | Vedant (both sides) · agreed in person 23 Oct |
| `GET /api/match/<id>/snapshot` | web route → `api.ts` | `CONTRACTS.md` §7.3 | No for the minimum. **Yes, one line, only if D-9 B** | Arnav (producer side) + Vedant · pending |
| Cosmos `screen` documents | relay → web route | `functions/specs/screen-relay.md` §4 | No (read-only) | Arnav → Vedant |
| Stat panel | stats engine → relay → browser | `CONTRACTS.md` §7.4 | No | Azeem, informed |

**Negotiate** (to be written as `realtime.md` §1.1):

| Status | Body | When |
|---|---|---|
| 200 | `{ baseUrl, url, token }` | OK |
| 400 | `{ "error": "bad_groups" }` | Missing, more than 4, or not `match-SYN-NNNN` |
| 503 | `{ "error": "negotiate_unavailable" }` | Web PubSub settings missing or malformed; one log line names them |
| 502 | `{ "error": "pubsub_error" }` | Token generation failed or took > 10 s |
| 500 | `{ "error": "internal_error" }` | Anything else; the log names only the error's type |

**Snapshot** (to be written as `realtime.md` §3.1). The success body is exactly §7.3, and the codes match the stand-in:

| Status | Code | When |
|---|---|---|
| 400 | `bad_match_id` | Not `SYN-NNNN` |
| 404 | `unknown_match` | No documents in the partition |
| 503 | `setup_pending` | No `state.setup`, or no status envelope yet |
| 503 | `snapshot_unavailable` | Cosmos settings missing or malformed |
| 502 | `storage_error` | Cosmos failed or took > 10 s |
| 500 | `internal_error` | Anything else |

- **Per-envelope check:** mirrors `envelope_problem()`: exact fields `seq, kind, match_id, match_ms, clock, data`;
  known kind; same `match_id`; integer `seq ≥ 1`. Failures go to `rejected` (≤ 5 samples, `"<doc id>: <problem>"`).
- **Cosmos system fields:** they sit on the document, not inside `envelope`, so envelopes pass through untouched.
  `setup` has any `id` / `_*` fields removed.
- **Ordering:** sorted by `seq`; `status` is the last status envelope. The browser still validates every envelope.
- **Compatibility:** `api.ts`'s snapshot schema and `socket.ts`'s merge are unchanged. With B, only the number of
  `stats` envelopes changes, and the client never assumes contiguous `seq`.

**Shared contract edits required:** none for the minimum. With D-9 B, one sentence in `CONTRACTS.md` §7.3 (and the
matching sentence in `functions/specs/screen-relay.md` §4 "Snapshot", Arnav's file, edited by Arnav).
**Source of truth:** `CONTRACTS.md` §7.3 (snapshot); `web/specs/realtime.md` §1.1 (negotiate).

## 8. File and specification map

| File or small related group | Action | Responsibility | Governing spec | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_web_realtime-routes.md` | Add | This plan | — | Vedant |
| `web/specs/realtime.md` | Modify | Status line; §1 negotiate final + new §1.1 route; §3 snapshot + new §3.1 route; mock wording in §1, §3, §6 replaced by the local stack; §6 "Not covered" | Itself | Vedant · Arnav |
| `web/specs/screens.md` | Modify | §1 source card text (D-10); mock run in §1 checks → local stack | Itself | Vedant |
| `web/package.json`, `web/package-lock.json` | Modify | Add `@azure/web-pubsub` (exact version, like `@azure/cosmos`); lockfile **regenerated by npm** | — | Vedant |
| `web/src/lib/server/stream-env.ts` | Add | Web PubSub + `screen` settings (D-6) | `realtime.md` §1.1, §3.1 | Vedant |
| `web/src/lib/server/pubsub-token.ts` | Add | `createTokenIssuer(settings).issue(groups)` → `{baseUrl,url,token}` (D-1, D-2) | §1.1 | Vedant |
| `web/src/lib/server/screen-store.ts` | Add | `createScreenStore(settings).matchDocs(id)` (and, with B, the two newest-panel reads); 10 s guard → `ScreenStoreError` | §3.1 | Vedant |
| `web/src/lib/snapshot.ts` | Add | Pure `buildSnapshot(matchId, docs)` → `{ status, body }` | §3.1, `CONTRACTS.md` §7.3 | Vedant |
| `web/src/app/api/negotiate/route.ts` | Modify (replace stub) | Validate, issue, error table, `no-store`, never log the token | §1.1 | Vedant |
| `web/src/app/api/match/[id]/snapshot/route.ts` | Modify (replace stub) | Validate id, read, build, error table, `no-store`, one log line per request | §3.1 | Vedant |
| `web/src/lib/api.ts` | Modify | One same-origin client; drop PROVISIONAL and mock notes; error text "this app's negotiate route" / "this app's snapshot route" | §1, §3 | Vedant |
| `web/src/lib/env.ts` | Modify | Remove `NEXT_PUBLIC_STREAM_BASE_URL` / `streamBaseUrl` | §6 | Vedant |
| `web/vitest.config.mts` | Modify | Require only `NEXT_PUBLIC_DEFAULT_MATCH_ID` | §6 | Vedant |
| `web/.env.example` | Modify | Remove `NEXT_PUBLIC_STREAM_BASE_URL`; add `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB`, `OVERLAP_COSMOS_CONTAINER` (local values, names only) | — | Vedant |
| `web/README.md` | Modify | "With the mock stream" → "With the local stack" (Docker, stand-in, relay, generator) | — | Vedant |
| `web/src/components/layout/SourceCard.tsx` | Modify | D-10 wording; no `env.streamBaseUrl` | `screens.md` §1 | Vedant |
| `web/src/components/layout/AppFooter.tsx` | Modify | Default note without "mock’s terminal" | `screens.md` §1 | Vedant |
| `web/src/app/dev/ui/page.tsx` | Modify | Empty-state hint "Start the local stack…" | — | Vedant |
| `web/src/lib/__tests__/stream-env.test.ts` | Add | Missing / malformed / defaults; values never echoed | — | Vedant |
| `web/src/lib/__tests__/pubsub-token.test.ts` | Add | Local endpoint → `ws://` URL (A1); roles and groups set; no send role (decoded JWT) | — | Vedant |
| `web/src/lib/__tests__/snapshot.test.ts` | Add | Same cases as `standin/snapshot.py` | — | Vedant |
| `web/src/lib/__tests__/negotiate-route.test.ts`, `snapshot-route.test.ts` | Add | Error tables with fake issuer / store (like `matches-route.test.ts`) | — | Vedant |
| `web/src/lib/__tests__/api.test.ts` | Modify | Same-origin paths; mock comments and CORS-preflight test reworded | — | Vedant |
| `web/src/lib/__tests__/env.test.ts` | Modify | Drop stream URL cases | — | Vedant |
| `web/src/lib/__tests__/layout.test.ts`, `live-match-view.test.ts`, `replay-view.test.ts` | Modify | New source card text; `sourceHost` test removed if the helper goes | — | Vedant |
| `web/src/lib/__tests__/stream.qa.test.ts` | Modify | Run against the app (`QA_APP_URL`, default `http://localhost:3000`) on the local stack, not the mock | — | Vedant |
| `CONTRACTS.md` | Modify **only with D-9 B** | One sentence in §7.3 on `stats`; own small commit | Itself | Arnav + Vedant (hot file) |

**Not touched:** `web/src/lib/socket.ts` (comment mentions the mock; left as is to keep the diff out of a working
file. Change only if a reviewer asks), `web/src/lib/contracts.ts` (hot file; its mock notes are about the status
and positions shapes, not this plan), `MatchStreamProvider.tsx`, `mock/`, `infra/`, `functions/`, `.github/`.

## 9. Failure handling and recovery

| Failure or edge case | Expected behaviour | Recovery / fallback | Effect on viewers | How it will be checked |
|---|---|---|---|---|
| Web PubSub settings missing | `503 negotiate_unavailable`, one log line naming variables | Set them in `web/.env.local` | "Cannot reach the stream server", then `socket.ts` retries (3 → 15 s) | Route test |
| Stand-in not running | Negotiate still answers 200 (local signing needs no service); the WebSocket fails to open | `socket.ts` retry schedule | Reconnecting badge | AC-07 manual |
| Token generation fails (non-local endpoint) | `502 pubsub_error` | `socket.ts` retries | Reconnecting badge | Route test with a throwing issuer |
| Bad or foreign group | `400 bad_groups`, no token | — | None (crafted requests only) | Route test |
| Cosmos settings missing | `503 snapshot_unavailable` | Set them | "Earlier history is unavailable", live continues | Route test |
| Cosmos slow or down | `502 storage_error` after 10 s (the client gives up at 7 s first) | Next reconnect re-reads | Same notice | Route test with a hanging fake |
| Match has no setup / status yet | `503 setup_pending` | Next reconnect | Same notice | Builder test |
| Malformed stored envelope | Left out, counted in `rejected` | — | Rejected count on screen | Builder test |
| Token or setting logged by mistake | Routes log codes and counts only | — | — | Grep during validate |

## 10. Requirements specific to this work

- **Performance and load:** negotiate is one call per (re)connect, signed in memory locally. Snapshot is one
  partition query per (re)connect. Full-time size and duration are **unmeasured** (D-9). Budget: ≤ 1 MB raw and
  ≤ 1 s in the route, measured on the local stack at full time.
- **Observability:** snapshot logs one line per request (`snapshot <id>: N envelopes, R rejected, D ms`). Negotiate
  logs failures only, never the token or URL.
- **Azure resources and access:** not applicable for now (decision 3). For later: the web app identity would need
  *Web PubSub Service Owner* on hub `live` and Cosmos data-reader access to `screen`. Not provisioned, not
  requested in this plan.
- **Cost:** local only, no Azure spend.
- **Security and data:** the token only allows join/leave on the requested match groups, with no send rights, and
  expires in 10 minutes. It is never logged or rendered. Server settings never get a `NEXT_PUBLIC_` prefix. All
  input is validated before any I/O. No secrets in this plan; the emulator key is referenced by name only.
- **AI behaviour:** not applicable — no AI is involved.
- **Frontend experience:** unchanged notices and badges; the source card wording changes (D-10).
- **Synthetic data or calculations:** not applicable — the routes read what the relay wrote.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach |
|---|---|---|---|---|
| AC-01 | Given stand-in settings, `GET /api/negotiate?groups=match-SYN-0042` → 200 with `url` `ws://localhost:8787/client/hubs/live?access_token=…` | Unit test with the real SDK | — | Test output |
| AC-02 | The token has `webpubsub.joinLeaveGroup.match-SYN-0042`, `groups` contains it, no send role, expires in 10 min | Decode JWT in test | — | Test output |
| AC-03 | Missing, bad or > 4 groups → 400 `bad_groups`; missing settings → 503; every response `no-store` | Route tests | — | Test output |
| AC-04 | `buildSnapshot` matches `standin/snapshot.py` for: normal, no docs (404), no setup (503), no status (503), bad envelope (counted, ≤ 5 samples), unsorted `seq` | Unit tests | — | Test output |
| AC-05 | Snapshot route: bad id 400, missing settings 503, store error 502, success `no-store` | Route tests with a fake store | — | Test output |
| AC-06 | `api.ts` calls `/api/negotiate` and `/api/match/<id>/snapshot` on the same origin with no custom headers; `git grep -i "mock websocket\|STREAM_BASE"` in `web/` finds nothing | `api.test.ts` + grep | — | Test output, grep output |
| AC-07 | **Real local chain:** Docker stack + stand-in + `relay_runner.py` + generator `live`. `/match/<id>` connects and catches up through the app's routes (network tab: only the WebSocket goes to 8787) and plays to full time; a reload mid-match shows no duplicate rows | Manual run | `infra/local` stack | Screenshots, network tab |
| AC-08 | Full-time snapshot size (raw and gzipped) and route duration recorded; D-9 decided from them | Manual run | AC-07 | Numbers in the PR |
| AC-09 | `npm run lint`, `typecheck`, `build`, `test` pass | Local run (CI does not run tests) | — | Command output |
| AC-10 | *(only with D-9 B)* Snapshot holds every event and status, the latest positions, and exactly the newest and newest-heavy stats panels; the stats charts show the same numbers after a reload | Builder test + manual | AC-07 | Test output, screenshot |

**Validation limits:** Azure is not run (decision 3): managed identity, real `generateToken` and the service
enforcing roles stay unproven. Locally AC-02 checks the token's claims, not their enforcement (the stand-in accepts
any token).

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | ACs | Estimate |
|---|---|---|---|---|---|
| M0: spec | `realtime.md` §1.1 and §3.1 written, mock wording replaced; `screens.md` §1 | Vedant | Stat-charts merge order (§13) | — | 1 h · 23 Oct |
| M1: negotiate | Route, `stream-env.ts`, `pubsub-token.ts`, tests | Vedant | npm dependency | AC-01–03 | 2 h · 23 Oct |
| M2: snapshot | Route, `screen-store.ts`, `snapshot.ts`, tests; first size measurement | Vedant | — | AC-04, 05, 08 | 2–3 h · 24 Oct |
| M3: switch and mock removal | `api.ts` same-origin, env, UI wording, README, tests; real local run | Vedant | M1, M2 | AC-06, 07, 09 | 2 h · 24 Oct |
| M4: stats trimming | D-9 B in the route + `CONTRACTS.md` line | Vedant | Arnav agrees §7.3 before merge | AC-10 | 1–2 h · 24 Oct |

- **Project calendar check:** M0–M3 fit "every required feature by 24 Oct". M4 fits only if Arnav agrees on 24 Oct.
  Otherwise it moves after the freeze (25–26 Oct) or is dropped. The minimum result doesn't need it.
- **First integration checkpoint:** AC-07, a **real** local run against the relay's store and the stand-in's socket.
- **Parallel work:** M1 and M2 are independent.
- **Dependency-bound work:** M4 waits for Arnav. M0's spec edits wait for the stat-charts merge, or are done
  carefully around it (§13).
- **Scope reduction if time runs short:** drop M4; keep `stream.qa.test.ts` changes to a minimal URL swap. Never cut
  group validation, `no-store`, or "never log the token".

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `web/realtime-routes` (created from `main` · 329153d). One PR for M0–M3.
  If M4 happens, the `CONTRACTS.md` line goes in its own commit. The lockfile is regenerated with `npm install`,
  never hand-merged.
- **Shared-file coordination:** `CONTRACTS.md` only with M4 (tell Arnav as producer side, Azeem for information). No
  other hot file.
- **Conflict scan result** (23 Oct, `main` · 329153d; `git fetch --all --prune`, every unmerged remote branch
  diffed against this file map, active plans read, local worktrees checked). **Open PRs could not be listed**:
  `gh` is not signed in on this machine. Re-check on GitHub before opening the PR.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `web/specs/realtime.md` (status line, §1 "Accepted kinds", §2), `web/specs/screens.md`, `web/README.md` (the "With the mock stream" list this plan rewrites) | `PLAN_web_stat-charts` on `origin/web/match-list` · 9f289e5 (13 commits ahead of `main`, unmerged); same commit in worktree `.claude/worktrees/web-stat-charts` | Vedant | **Merge stat-charts to `main` first**, then `git merge origin/main` into `web/realtime-routes` before M0. If it can't merge first, M0 edits only §1.1/§3.1 and leaves the status line and README for after | Pending (own work) |
| `CONTRACTS.md` §7.3 `stats` (M4 only) | `PLAN_stats_engine` review (20 Oct, option C request); `PLAN_web_stat-charts` R-03 | Arnav | B and C are compatible (the route reads by `envelope.kind`); agree one §7.3 wording | Pending · Arnav |
| Cosmos `screen` (read) | `PLAN_functions_screen-relay` | Arnav | Read-only, layout unchanged; tell in PR | Tell |
| `api.ts`, `env.ts`, `socket.ts`, routes, `SourceCard`, `AppFooter`, `.env.example`, `vitest.config.mts` | `fork/vedant/web-app` (17 Oct), `fork/web/live-match-ui-setup` (16 Oct) | Vedant | Stale, superseded by the merged live viewer; ignore (delete when convenient) | Clear |
| `web/specs/realtime.md` §5 | `PLAN_web_replay`, `PLAN_web_match-list` (merged) | Vedant | Different sections | Clear |
| Worktree `../overlap-replay-fix` (`web/replay-page` · 119e0aa) | — | Vedant | Already merged into `main`, clean | Clear |

- **Integration procedure:** start `infra/local` (Docker), the stand-in (`uv run standin`), `relay_runner.py` and the
  generator in `live` mode. Copy the new settings into `web/.env.local`, `npm run dev`, open `/match/<id>`.
- **Configuration or setup changes:** `web/.env.local` loses `NEXT_PUBLIC_STREAM_BASE_URL` and gains
  `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB`, `OVERLAP_COSMOS_CONTAINER` (same values as
  `infra/local/env.example`). The Cosmos settings it already has for replay are reused.
- **Deployment or data changes:** not applicable (local only, read-only).
- **Documentation updates:** `realtime.md`, `screens.md`, `web/README.md`, `web/.env.example`. To tell Arnav, not
  edited here:
  - `infra/specs/local-development.md` lines 56 and 68 (negotiate URL "used by the browser", "Vedant's app").
  - `.github/workflows/web.yml` still sets `NEXT_PUBLIC_STREAM_BASE_URL`. It's harmless once unused, so it can be
    removed when convenient.
  - `mock/README.md`: the web app no longer reads the mock.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Full-time snapshot is several MB (estimate) | Slow catch-up; possible 7 s client timeout | Vedant measures; Arnav decides §7.3 | D-9: A → B (route) → C (relay) | M4 only |
| R-02 | Stat-charts and this plan both edit `realtime.md`, `screens.md`, `README.md` | Merge conflicts in own work | Vedant | Merge stat-charts first (§13) | M0 |
| R-03 | Spec agreement exists only in person | A reviewer asks for the written record | Vedant | Note it in the PR; Arnav confirms in review | Merge |
| R-04 | Azure path written but never run | Surprises when Azure starts | Arnav (infra), Vedant | Settings-only switch by design; verify when Azure is in scope | — |
| R-05 | Removing the mock path | Anyone running the mock alone loses the live screen | Vedant (decided) | Use the local stack; tell Arnav | — |
| R-06 | A1 wrong (SDK URL scheme for `http://`) | Local socket URL broken | Vedant | Rewrite scheme in `pubsub-token.ts` | M1 |
| R-07 | Negotiate is unauthenticated and unthrottled | Token farming (receive-only, 10 min each) | Arnav | Accept for the hackathon; revisit for Azure | — |

**Decisions requested from Arnav or affected owners:**

1. **§7.3 `stats` wording (D-9 B):** "the newest `stats` envelope and the newest one with `heavy`" instead of "every
   `stats` envelope". This is the recommendation if the measurement is over budget. It's the same request as the
   20 Oct review, but done in the web route, so the relay doesn't have to change first.
2. **Token lifetime:** 10 minutes (D-2). Proposed; says yes or no only.

## 15. Review, agreement, and handover

### Author's submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked.
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Vedant | v0.1 → v0.2 | Remove the mock; spec agreed in person; local Docker only; asked how to resolve snapshot size | Folded into v0.2 | 23 Oct · this conversation |

**Implementation readiness:** M0–M4 implemented. Merge waits for Arnav on the §7.3 sentence (commit `cacd713`).
**Relevant specification agreement:** in person, 23 Oct (reported by Vedant); written record pending in the PR.
**Next action and owner:** open the PR (after the stat-charts merge, or merge `main` in first), ask Arnav to agree §7.3 and to update the docs listed in §13 · Vedant.

### Handover after implementation

- **Commits** on `web/realtime-routes` (not pushed by the implementation; the plan commit `e38368d` was):
  `43ea39d` spec · `e224bf4` negotiate · `c41e363` snapshot · `cacd713` `CONTRACTS.md` §7.3 (own commit, needs
  Arnav) · `a6ea758` same-origin switch and mock removal · `58e8d30` one-page Cosmos read.
- **Acceptance results** (23 Oct, local Docker stack: Cosmos, Event Hubs and Azurite emulators):

  | ID | Result | Evidence |
  |---|---|---|
  | AC-01 | Pass | `pubsub-token.test.ts` with the real SDK: `ws://localhost:8787/client/hubs/live?access_token=…` |
  | AC-02 | Pass | Decoded token: `role` = `webpubsub.joinLeaveGroup.<group>` only, `webpubsub.group` set, 600 s lifetime, no `sub` |
  | AC-03 | Pass | `negotiate-route.test.ts`; built app answered 400 for `groups=everyone` |
  | AC-04 | Pass | `snapshot.test.ts` (stand-in cases plus the stats rule) |
  | AC-05 | Pass | `snapshot-route.test.ts`; built app: `SYN-9999` → 404 `unknown_match`, `SYN-12` → 400 |
  | AC-06 | Pass | `api.test.ts`; `git grep` finds no `NEXT_PUBLIC_STREAM_BASE_URL` / "Mock WebSocket" in `web/src`, README or `.env.example` |
  | AC-07 | Pass, without a browser | Generator `SYN-4201` at 20× → Event Hubs emulator → `relay_runner.py` → Cosmos `screen` + stand-in → built app (`next start`) → `stream.qa.test.ts` with `QA_APP_URL`: 2,453 events, 4 goals, final 4–0 at 90+7:35, every message applied once, badge live → stale → live → finished. It joined ~10 s in, so the history came from the snapshot route. No screenshots: no browser was driven |
  | AC-08 | Measured | `SYN-0501` at full time (8,501 stored documents, 6,125 of them panels): the stand-in's untrimmed snapshot 7.4 MB in 29.5 s; this route 0.95 MB, 2,376 envelopes, in 1.3–1.6 s (9 s before `58e8d30`). Gzip was not applied to the route's response by `next start` |
  | AC-09 | Pass | `npm run lint`, `typecheck`, `build`, `test` (491 passed, 2 opt-in skipped) |
  | AC-10 | Pass | `SYN-0501` snapshot holds 11 status, 2,363 event, 1 positions and 1 stats envelope (the full-time panel, which is also the newest heavy one); the browser client accepted all 2,376, 0 rejected; the negotiated URL opened on the stand-in and `joinGroup` was acked |

- **Setup:** `web/.env.example` (new `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB`, `OVERLAP_COSMOS_CONTAINER`;
  `NEXT_PUBLIC_STREAM_BASE_URL` removed); run order in `web/README.md` "With the local stack".
- **Differences from the agreed proposal:**
  - D-9 B was chosen before measuring (Vedant, 23 Oct); the measurement confirmed it (AC-08).
  - New: the Cosmos read asks for one page (`maxItemCount: -1`). With the default 100 per page a full-time snapshot
    took ~9 s on the emulator, past the browser's 7 s timeout.
  - The setup is passed through as stored; stripping Cosmos fields from it was not needed (they sit on the document).
  - `socket.ts` and `contracts.ts` still mention the mock in comments (left out of the diff on purpose, §8).
- **Known limitations and follow-up:**
  - Azure not run (decision 3): managed identity, real token generation and role enforcement unproven · Vedant, Arnav.
  - The live run did not include the stats engine, so live panels were checked on stored data only (`SYN-0501`).
  - The repo pins `uv` ≥ 0.13.4; this laptop has 0.13.1, so the stand-in and relay were started from their existing
    virtual environments.
  - Snapshot responses are not compressed; worth checking on Azure hosting · Vedant.
  - Tell Arnav: §7.3 sentence; `functions/specs/screen-relay.md` §4 "Snapshot" sentence; the stand-in's own snapshot
    still sends every panel; `infra/specs/local-development.md` lines 56 and 68; CI's `NEXT_PUBLIC_STREAM_BASE_URL`;
    `mock/README.md`.
