# PLAN_web_insight-cards — insight cards, viewer controls, recap page and the overlay charts on the web app

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · insight cards: show the agents' overlay cards (and player tags) for the viewer's mode and language on the live screen, with viewer controls, a commentary feed, the recap page and the key events chart. Shot map follows once the stats engine sends per-shot xG |
| Author / primary owner | Vedant |
| Collaborators and responsibilities | None named. Arnav's M5 (delivery) and Azeem's `heavy.shots` are dependencies, not collaborations (§4) |
| Review coordinator | Arnav |
| Affected component owners | Arnav (layer 5: overlay producer, publisher, audience groups, insights snapshot in the Web PubSub stand-in; `CONTRACTS.md` §6, §7 groups, §10; screen relay). Azeem (stats engine: `heavy.shots`, `CONTRACTS.md` §7.4; confirmer of `CONTRACTS.md` §10). Vedant (web app, consumer of every interface here) |
| Proposal version and date | v0.1 · 23 Oct 2026 |
| Status | Draft · ready for review. Not started |
| Plan tier and file | Full · `plans/active/PLAN_web_insight-cards.md` (full: it touches the hot file `web/src/lib/contracts.ts`, spans web and the layer-5 handoff, and the governing specs are not agreed) |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | `main` · `3353483` (PR #77). Branch `web/insight-cards` created from `web/realtime-routes` · `8109f97` (25 commits ahead of `main`, 0 behind, unmerged, PR not opened), on Vedant's instruction, because the cards need that branch's negotiate and snapshot routes (same arrangement as `PLAN_web_e2e-stats-run`) |
| Architecture box / work area | Layer 7 · web app (live screen, recap page, charts) |
| Relevant issue, spec PR, or discussion | `CONTRACTS.md` §10.3–§10.6 (agreed by Arnav 20 Oct; Azeem and Vedant "asked to confirm", no written confirmation seen); `PLAN_agents_insights-build` row "Card rendering, modes, languages, player tags" and R-08; spec PR not opened yet |

## 1. Purpose and intended outcome

- **Problem or need:** the agents (layer 5) now write verified explanation cards per audience, but the web app drops
  every `overlay`, `player_tag` and `recap` envelope (`contracts.ts` passes them through as plain objects, `store.ts`
  returns `ignored`, and `negotiate` refuses any group that is not `match-<id>`). `MomentCard`, `CommentaryFeed`,
  `AgentTrace`, `ViewerControls`, `overlay-scheduler.ts`, `preferences.ts`, `visuals.ts`, the recap page, `KeyEvents`
  and `ShotMap` are comment-only placeholders and `/api/preferences` returns `501`. Arnav's M5 ("a browser receives
  cards") cannot be shown, and the project's explain-in-your-language feature is invisible.
- **Proposed outcome:** a viewer opens `/match/SYN-NNNN`, picks a mode and language (and optionally a club or a player),
  and during the match sees at most one explanation card at a time, in that mode and language, with a clear
  Verified or Template badge and the chart the agent chose, then finds earlier cards in a commentary feed. After full
  time `/match/SYN-NNNN/recap` tells the match story in the same mode and language.
- **Benefit to viewers or teammates:** viewers get words, not only numbers; Arnav can demonstrate delivery end to end;
  judges can see the multi-language, evidence-checked output.
- **Success statement:** on the local stack at 20×, a browser in casual/English shows each live card for no more than 6
  seconds, never two at once, never a card from the wrong half or older than 5 match minutes, and shows nothing it was
  not sent.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Web placeholders | `web/src/components/{MomentCard,CommentaryFeed,AgentTrace,ViewerControls}.tsx`, `web/src/lib/{overlay-scheduler,preferences,visuals}.ts`, `web/src/components/charts/{ShotMap,KeyEvents}.tsx`, `web/src/app/match/[id]/recap/page.tsx`, `web/src/app/api/preferences/route.ts` · `8109f97` | Header comments only (the recap page and route export a build-safe stub). Checked by reading each file |
| Web specs | `web/specs/screens.md` §2 (modes), §3 (preferences), §1 recap; `web/specs/realtime.md` §4 (scheduler); `web/specs/charts.md` §1 (`window`/`highlight`), §2 (key events, shot map) | All "Not started" or "Not decided". None is agreed on `main` (the live-screen sections are "merged for review", not marked agreed) |
| Shared contracts | `CONTRACTS.md` §6 (overlay), §7 (envelope, groups), §10.3–§10.6 (period, audiences, insights snapshot, expiry, recap, player tags) | §10 agreed by Arnav 20 Oct; Azeem and Vedant asked to confirm. §10.3 says "Current web code does not implement" its timing choices |
| Producer code | `agents/publisher.py` (`eligibility`, `envelope`), `agents/director.py` (recap `data`: `recap_id`, `match_id`, `kind`, `mode`, `lang`, `lines`, `verified`, …), `infra/local/webpubsub_standin/standin/insights.py` · all on `main` | What the producer sends today, including the recap shape that the contract text only describes loosely. Read, not run |
| Web transport (unmerged) | `web/src/lib/server/pubsub-token.ts` `parseGroups`, `socket.ts`, `api.ts`, `snapshot.ts` on `web/realtime-routes` | `parseGroups` accepts only `match-` + a match id, so `match-SYN-0042-casual-en` gets `400 bad_groups`. The socket joins one group (`match-<id>`) and dedupes on `seq` |
| Stat panel | `CONTRACTS.md` §7.4, `stats/specs/publishing.md` §2 · `main` | `heavy` holds `momentum_buckets`, `pass_network`, `pressing_grid`, `zones`, `players`. **No per-shot list**, so no shot map yet |
| Registry | `plans/REGISTRY.md` | Web is Vedant's; layer 5 and the stand-in are Arnav's; stats is Azeem's |

**Differences between references (stated, not chosen silently):**

1. **`seq` namespaces collide.** `CONTRACTS.md` §7.1: `seq` belongs to the group; an audience group's counter starts
   at 1 like the base group's. The web store dedupes on `seq` alone, so a card with `seq` 12 would be dropped as a
   duplicate of base envelope 12. Cards therefore need their own store and a `(group, seq)` key (§10.4 already says
   "merge by `(group,seq)`"). This is a design finding, not a contract change.
2. **Playhead.** §10.6 defines the expiry playhead as `match_state.source.match_ms` (stats engine). The browser only
   has the base stream's newest `match_ms`. Treated as an **Assumption** (§6, R-09): they differ by at most about 5
   match seconds; confirm in M0.
3. **Recap retrieval.** §10.6 sends one `recap` envelope per audience group at full time, but nothing says how a viewer
   who arrives after full time gets it: the insights snapshot returns "the two newest eligible persisted cards" and
   `eligibility()` expires everything at full time. Unresolved (R-05).
4. **Agent trace.** `AgentTrace` is described as "each agent step with timings", but the overlay carries only
   `verified`, `fallback` and `facts_checked`. No contract provides steps or timings (R-06).
5. **Preferences storage.** `/api/preferences` says "save the anonymous viewer profile"; no store, container or owner is
   named for it (R-08).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Specs first: `screens.md` §1 recap, §2, §3; `realtime.md` §4 and the audience join and insights catch-up; `charts.md` window/highlight, key events | The agents, publisher, audience groups, stand-in snapshot (Arnav's `PLAN_agents_insights-build`) |
| Web copy of the §6/§10 overlay, `player_tag` and `recap` shapes (`contracts.ts`, strict) | Changing any shared message (this plan mirrors §6/§10 as they stand) |
| Viewer preferences (mode, language, club, player): one schema, remembered per viewer; `/api/preferences` | A user account or any personal data |
| Joining the viewer's audience group; `(group, seq)` dedupe; catch-up through the insights snapshot where it exists | An Azure/Cosmos-backed insights snapshot route in the Next.js app (optional extension) |
| Overlay scheduler (one visible, at most two waiting, expiry, period check, no redisplay) | Showing cards on the replay screen (`CONTRACTS.md` §10.3: replay use is a future feature) |
| `MomentCard`, `CommentaryFeed`, `ViewerControls`, a minimal `AgentTrace`, `KeyEvents`, `visuals.ts` | A full agent trace with steps and timings (needs a contract; R-06) |
| Recap page `/match/[id]/recap` | The judges' path and `how-it-works` page |
| Shot map: spec and build **after** `heavy.shots` exists (M5, blocked) | Computing xG or any number in the browser: numbers come from the producers |

- **Minimum complete result:** M0–M4 for the casual and analyst modes in English: spec, strict schemas, preferences,
  scheduler, live audience join, `MomentCard` (text, badge, `key_events` chart or text-only when no chart),
  `CommentaryFeed`, `ViewerControls`, a recap page that shows the archived summary and the recap text when one is
  available, and an honest empty state when it is not. Club and player modes, other languages and player tags are
  selectable and built from the same group-name function and tested with fixtures, but only casual/analyst English is
  proven against the real stack (AC-08).
- **Optional extension:** insights snapshot route in the Next.js app; player tag chips; `AgentTrace` beyond the badge
  and `facts_checked` list. "None" is valid and the minimum does not depend on them.
- **Boundary with neighbouring components:** the producer decides what a card says, when it exists and for whom; the
  web app decides only whether it is still worth showing now. The browser never writes a number.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| `web/realtime-routes` (negotiate, snapshot routes, `parseGroups`) | Vedant | Merged to `main` before this branch's PR | Pending · before M2's PR (M2 code can start on the stacked branch) | Branch is stacked on it now |
| `CONTRACTS.md` §10 confirmation | Azeem, Vedant | Written confirmation, or amendments | Pending · before M1 code (R-03) | Spec PR (M0) is where the confirmation is recorded |
| Audience groups, publisher, insights snapshot in the stand-in | Arnav (`PLAN_agents_insights-build` M5) | Real overlays on `match-<id>-<mode>-<lang>` | In progress on their side · needed by M3 AC-08 | Fixture envelopes from `agents/specs/examples/shot-cluster.md` and a fake socket in tests (a mock proves rendering, not delivery) |
| `heavy.shots` (per-shot xG, position, outcome) | Azeem | An agreed shape in `CONTRACTS.md` §7.4 / `stats/specs/publishing.md` §2 and real data | **Blocking M5 only** · not scheduled | `shot_map` visuals fall back to `key_events`, which §10.6 allows |
| Recap retrieval after full time | Arnav | A decision (R-05) | Pending · M4 | Page works from the archive summary and any recap received while the page is open |
| Agent trace data (steps, timings) | Arnav | A contract, if wanted (R-06) | Pending · optional | Minimal trace from fields the overlay already has |
| `web/src/lib/contracts.ts` (hot) | Vedant, and the owner of the contract mirrored (Arnav) | Own small commit; owners told first | Pending · M1 | — |
| `web/src/lib/server/pubsub-token.ts` and `negotiate` tests | Vedant (file arrives with `web/realtime-routes`) | Accept audience group names | Pending · M2 | Own small commit |

**My owned deliverables:** everything in the file map (§8).
**Shared deliverables:** the `contracts.ts` mirror (coordinating owner: Arnav, producer of §6/§10); any contract
amendment that M0 finds necessary (Arnav and Azeem).

## 5. Proposed flow

```text
generator -> stats -> moments -> agents (spotter..director) -> publisher --seq per group--> Web PubSub group
                                                                                     match-<id>-<mode>-<lang>
browser:  base group match-<id> (events, status, stats) ---------------------> store (playhead, period, scoreboard)
          audience group (overlay, player_tag, recap) -> insights store -> scheduler -> MomentCard / CommentaryFeed
          insights snapshot (late joiner, where available) ----^                          |
          preferences (cookie) -> group name, snapshot query                              +-> KeyEvents (window, highlight)
```

- **Input arrives through:** one Web PubSub connection from the existing `negotiate` route, asking for the base group
  and the viewer's audience group (`match-<id>`; `match-<id>-casual-en`; `match-<id>-club-<teamId>-<lang>`;
  `match-<id>-player-<playerId>-<lang>`); optionally `GET /api/match/<id>/insights/snapshot?mode=&lang=[&club=|&player=]`.
- **Processing performed here:** validate each envelope (strict); route `overlay`, `player_tag` and `recap` to the
  insights store keyed by `(group, seq)` and, for display, by `overlay_id`; the scheduler admits a card only when the
  base playhead is in the card's period and between `show_at_ms` and `show_at_ms + 300000`; it shows one card for at
  most `duration_ms` (6000) of wall-clock time, keeps at most two waiting, never redisplays an `overlay_id` in the page
  session, and drops everything at full time.
- **Output goes to:** `MomentCard` (visible card), `CommentaryFeed` (cards seen this session, tap to reopen),
  `ViewerControls` (change audience; the socket renegotiates), `/match/<id>/recap`.
- **Execution relationship:** the base store keeps working with no audience group; a failed audience join shows
  "Insights unavailable" and leaves the live screen unchanged.
- **State retained:** preferences (a cookie, no personal data); cards seen and shown ids live only for the page session.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| D-01 Spec gate vs the 24 Oct date | M0 is a small spec PR (opened as a draft early); code branches stay on the same branch and are merged only after the spec is agreed | Rule 3. The calendar leaves one day | Code first, specs after: breaks the gate and risks rework; wait for agreement before any code: misses 24 Oct | Proposed · Arnav decides (§14) |
| D-02 Cards get their own store | `insights-store.ts`: `(group, seq)` dedupe, `overlay_id` dedupe, ring of the last 50 cards, no effect on `store.ts` ingest | Fixes the `seq` collision (§2 item 1) and keeps `store.ts` (hot, 719 lines) nearly untouched | Add an `insights` slice to `store.ts`: one hook family, but must change the dedupe key for everyone | Proposed · Vedant |
| D-03 One connection, two groups | `socket.ts` asks `negotiate` for `[match-<id>, <audience group>]` and renegotiates when the audience changes (the socket already renegotiates on every reconnect) | Reuses auth, reconnect and catch-up; `MAX_GROUPS` is 4 | A second socket per audience: duplicate reconnect logic | Proposed · Vedant |
| D-04 Audience names built in one function | `preferences.ts` `audienceGroup(matchId, prefs)`; `parseGroups` accepts the four audience patterns (strict regexes: `mode` in the §10.6 list, `lang` in `en es hi fr`, `teamId`/`playerId` formats from the contract) and still signs receive-only tokens | Never sign a token for an arbitrary group (the rule that made `parseGroups` strict) | Allow any `match-…` suffix: weaker | Proposed · Vedant; Arnav told (token route is his stack's consumer) |
| D-05 Insights catch-up | The client calls `/api/match/<id>/insights/snapshot` and treats any failure as "history unavailable"; **no Next.js route in the minimum** | §10.4 allows live-only after a failed snapshot; the route needs a Cosmos `overlays` reader and more time than is left | Build the route now (copy `standin/insights.py` logic): complete, one more milestone; proxy to the stand-in: not valid on Azure | Proposed · Vedant, Arnav |
| D-06 Priority | A `high` card replaces a visible `normal` card once the visible one has been up 2 s; otherwise newest eligible `normal` wins (§10.3); a replaced card stays in the feed | §6 has `priority`; §10.3 only describes `normal` | Ignore priority: simpler, but a goal card can wait behind a filler card | Proposed · written into `realtime.md` §4 for review |
| D-07 Preferences | A cookie `overlap_prefs` read and written through `/api/preferences` (`GET`, `PUT`, validated with the same strict schema); no `localStorage`; no database | A server component (the recap page) can render in the viewer's mode with no flash; no new resource | `localStorage` only: simpler, but the recap would flash the default mode; Cosmos profile: needs a container and an owner | Proposed · Vedant |
| D-08 Charts degrade | Unknown or unavailable `visual.component` renders the card as text only; `shot_map` renders `KeyEvents` until M5 | Matches §10.3 ("text must remain renderable") and §10.6 | Hide the card: loses content | Proposed |
| D-09 Verified vs template | Badge text "Verified" / "Template line" (never colour alone); both are shown; a card with `verified: false` and `fallback: false` is not rendered and is counted as rejected | §6: a line is never both | Show everything: hides a producer bug | Proposed |

**Assumptions** (each checked in the named milestone): frames from Web PubSub carry `group` so the socket can key by
`(group, seq)` (M1, read in `socket.ts` and the stand-in); the base playhead may stand in for
`match_state.source.match_ms` (M0, with Arnav); the recap `data` shape in `director.py` is what the contract intends
(M0, with Arnav); `MAX_GROUPS` of 4 is enough for base + audience (it is, by construction).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Overlay envelope body (`modes`, `visual`, `period`, `mode`, `lang`, `club`/`player`, `verified`, `fallback`, `facts_checked`) | Agents publisher → web | `CONTRACTS.md` §6, §10.3, §10.6; `agents/specs/examples/shot-cluster.md` | No: mirrored as strict schemas | Arnav (producer) · confirmation by Vedant and Azeem pending (R-03) |
| `player_tag` envelope (`player_id`, `name`, `metric`, `value`, `unit`, `threshold`) | Publisher → web | §10.6 | No | Arnav · as above |
| `recap` envelope (`recap_id`, `mode`, `lang`, `lines[]`, `verified`, …) | Publisher → web | §10.6; shape read from `agents/director.py` | **Possibly**: the contract text is looser than the producer. Finding goes to Arnav in M0; any amendment is its own PR | Arnav · pending |
| Audience groups on the negotiate route | Web (`pubsub-token.ts`) → Web PubSub | §7 groups, §10.6 | No contract change; the web route's allow-list widens | Vedant; Arnav told |
| Insights snapshot `GET /api/match/<id>/insights/snapshot` | Stand-in / future route → web | §10.4, §10.6 | No | Arnav · pending (R-03) |
| `GET/PUT /api/preferences` | Web route → browser | `screens.md` §3 (to be written) | New web-internal endpoint | Vedant |
| Stat panel `heavy.shots` | Stats engine → web | `CONTRACTS.md` §7.4, `publishing.md` §2 | **Yes, by Azeem** (new field); not part of this plan's edits | Azeem · pending (R-07) |

- **Required fields, ids, units:** exactly §6/§10; `show_at_ms` and `window_ms` are `match_ms`; coordinates in the
  pitch frame through `coordinates.ts` only; `period` is 1 or 2. English is always present for every included mode;
  a missing viewer language falls back to English and says so (the card shows "English" when it does).
- **Validation:** strict zod schemas reject unknown fields; a rejected envelope is counted and never thrown (the
  inspector's existing "rejected" count). An overlay whose `lang`/`mode`/`club`/`player` does not match the joined
  audience is dropped and counted.
- **Duplicates and ordering:** `(group, seq)` for transport, `overlay_id` for display; seq is not contiguous.
- **Compatibility:** nothing here changes what the relay or replay route sends; with no audience group joined the
  screen is unchanged.

**Shared contract edits required:** None in this plan. If M0 finds the recap shape or the playhead wording needs an
amendment, it goes in a separate `CONTRACTS.md` PR agreed by Arnav (producer) and Vedant (consumer) before the dependent code merges.
**Source of truth:** `CONTRACTS.md` §6, §7, §10; `web/src/lib/contracts.ts` is the web copy.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `web/specs/screens.md` | Modify (M0) | §1 recap page and cards on the live screen, §2 modes, §3 preferences | Itself; all "Not started" | Vedant · Arnav |
| `web/specs/realtime.md` | Modify (M0) | §4 scheduler; audience join and insights catch-up | Itself; §4 "Not started" | Vedant · Arnav |
| `web/specs/charts.md` | Modify (M0, M5) | §1 `window`/`highlight` meaning; §2 key events (M0), shot map (M5) | Itself; "Not decided" | Vedant · Azeem (shot map) |
| `web/src/lib/contracts.ts` | Modify (M1) | `overlay`, `player_tag`, `recap` schemas; `parseEnvelope` returns them | `CONTRACTS.md` §6, §10 (hot file, own commit) | Vedant · Arnav |
| `web/src/lib/preferences.ts` | Replace placeholder (M1) | Preferences schema, defaults, cookie text, `audienceGroup()`, snapshot query | `screens.md` §3 | Vedant |
| `web/src/lib/overlay-scheduler.ts` | Replace placeholder (M1) | Pure eligibility and queue logic | `realtime.md` §4 | Vedant |
| `web/src/lib/visuals.ts` | Replace placeholder (M1) | `visual.component` → chart and props, with fallbacks | `charts.md` §1–§2 | Vedant |
| `web/src/lib/insights-store.ts` | Add (M2) | Cards store: `(group, seq)` and `overlay_id` dedupe, scheduler host, feed ring | `realtime.md` §4 | Vedant |
| `web/src/lib/server/pubsub-token.ts` | Modify (M2, own commit) | `parseGroups` accepts the four audience patterns | `realtime.md` §1.1 (from `web/realtime-routes`) | Vedant · Arnav told |
| `web/src/lib/socket.ts` | Modify (M2) | Ask for two groups, route audience kinds to the insights store, renegotiate on audience change | `realtime.md` §1 | Vedant |
| `web/src/lib/api.ts` | Modify (M2) | `getInsightsSnapshot()` (validated; any failure → "unavailable") | `realtime.md` §3 | Vedant |
| `web/src/components/live/MatchStreamProvider.tsx` | Modify (M2) | Create the insights store beside the match store; provide it | `realtime.md` §2 | Vedant |
| `web/src/app/api/preferences/route.ts` | Replace stub (M2) | `GET`/`PUT` the cookie profile, strict validation, `no-store` | `screens.md` §3 | Vedant |
| `web/src/components/MomentCard.tsx`, `CommentaryFeed.tsx`, `ViewerControls.tsx`, `AgentTrace.tsx` | Replace placeholders (M3) | Card, feed, controls, minimal trace | `screens.md` §1–§3 | Vedant |
| `web/src/components/charts/KeyEvents.tsx` | Replace placeholder (M3) | Key events timeline with `window` and `highlight` | `charts.md` §2 | Vedant |
| `web/src/components/live/LiveMatchView.tsx` | Modify (M3, one slot) | Mount controls, card and feed | `screens.md` §1 | Vedant |
| `web/src/app/match/[id]/recap/page.tsx` | Replace stub (M4) | Server page: id check, preferences, archive summary | `screens.md` §1 | Vedant |
| `web/src/components/recap/RecapView.tsx` | Add (M4) | Recap text per mode and language, summary, charts, empty states | `screens.md` §1 | Vedant |
| `web/src/components/charts/ShotMap.tsx` | Replace placeholder (M5, blocked) | Shot map with `window`/`highlight` | `charts.md` §2 | Vedant · Azeem |
| `web/src/lib/__tests__/overlay-scheduler.test.ts`, `preferences.test.ts`, `visuals.test.ts`, `insights-store.test.ts`, `insight-cards.test.ts`, `recap-view.test.ts`, `preferences-route.test.ts` | Add (M1–M4) | Unit and component checks | — | Vedant |
| `web/src/lib/__tests__/contracts.test.ts`, `pubsub-token.test.ts`, `socket.test.ts` | Modify (M1, M2) | New schema, group and routing cases | — | Vedant |
| `web/src/lib/__tests__/fixtures.ts` | Modify (M1) | Overlay, tag and recap fixtures (invented clubs and players only) | — | Vedant |

Used unchanged: `store.ts`, `store-hooks.ts`, `replay-client.ts`, `coordinates.ts`, `team-colours.ts`, the `ui/` primitives,
`web/package.json` (no new dependency), `.github/`, `CONTRACTS.md`, `fixtures/`, `plans/REGISTRY.md`.
Nothing outside `web/` and this plan is edited. `web/AGENTS.md` (untracked, written by `next dev`) is not part of this plan.

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Audience join fails or token refused | "Insights unavailable" notice; base screen unchanged | Retry on the socket's normal reconnect | None | AC-04 |
| Snapshot fails or does not exist | "Insight history unavailable"; live cards still accepted if a playhead exists | Retried on reconnect | None | AC-04 |
| Card arrives with no known playhead | Held, never shown | Shown if still eligible once a playhead arrives | None | AC-03 |
| Card for a finished half, or older than 300,000 match ms | Dropped and counted ("expired") | — | None | AC-03 |
| Same `overlay_id` again (reconnect, mode switch) | Shown at most once per page session | — | None | AC-03, AC-04 |
| Pile-up at 20× | One visible, at most two waiting, newest eligible `normal` kept (D-06) | Older cards stay in the feed | Feed longer than screen | AC-03 |
| Envelope fails the schema or wrong audience | Counted as rejected, not shown | — | Inspector count rises | AC-02 |
| Unknown `visual.component` or no chart data | Text-only card | — | — | AC-06 |
| Viewer language missing on a card | English text with an "English" label | — | — | AC-06 |
| Full time | Cards cleared; recap link appears | — | — | AC-03 |
| Preferences cookie missing or invalid | Defaults (casual, English); never an error | Overwritten on next save | — | AC-05 |
| Recap not retrievable (R-05) | "The recap story isn't available yet" with the archive summary | Decision R-05 | Recap page less rich | AC-07 |
| `heavy.shots` absent | `shot_map` cards render `KeyEvents` | M5 after Azeem's field | — | AC-06 |

## 10. Requirements specific to this work

- **Performance and load:** a 20× match sends tens of base messages a second and only a few cards a minute.
  Overlay handling must not add a re-render per base message: the insights store notifies at most once per 250 ms
  like the match store. Target is unmeasured until M3 checks it in a browser.
- **Observability:** the inspector's rejected count covers overlay envelopes; the insights store exposes counters
  (received, shown, expired, duplicate, wrong audience) for tests and the dev view; no token or cookie value is logged.
- **Azure resources and access:** none new. The audience token stays receive-only and per group; settings stay
  server-side (`OVERLAP_WEBPUBSUB_*`, names only).
- **Cost:** no model calls in the browser; no new paid resource.
- **Security and data:** ids are validated with strict patterns before they become group names; the preferences cookie
  holds only mode, language and two ids, `SameSite=Lax`, no personal data; text is rendered as text, never as HTML.
- **AI behavior:** the browser shows only producer text and producer-checked numbers; it displays the Verified or
  Template label from the payload and never recomputes or "fixes" a number; a card with neither flag is rejected.
- **Frontend experience:** loading, empty ("No insight cards yet for this audience"), stale and error states;
  a visible card is a labelled region, announced politely once per card and not re-announced for countdown; the card
  can be dismissed and reopened from the feed with the keyboard; motion off under reduced motion; works at 375, 768
  and 1440 px; contrast of the two badges checked against the tokens.
- **Synthetic data or calculations:** fixtures use invented clubs and players only. No calculation of football numbers.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-00 | The M0 specs answer every `_Answer:_` blank for the sections in §8 and record the §10 confirmation, the playhead and recap-shape findings | Review of the spec PR | — | Spec PR link |
| AC-01 | Given the example overlay, tag and recap, when parsed, then they pass; an unknown field, a wrong `period`, `verified` and `fallback` both true, or an English-less mode fails with a readable reason | Unit tests in `contracts.test.ts` | `agents/specs/examples/shot-cluster.md` rebuilt as an invented-name fixture | Test run |
| AC-02 | Given a stream with the wrong audience, a bad schema or an unknown kind mixed in, when ingested, then only valid, matching cards enter the store and the rest are counted | Unit tests on `insights-store` | Fixtures | Test run |
| AC-03 | Given a playhead, when cards arrive early, late, in another half, twice, or in a burst of five, then at most one is visible, at most two wait, expired and duplicate ones never show, a `high` card follows D-06, and full time clears all | Unit tests on the scheduler with an injected clock (fixed times, no sleeping) | Fixtures | Test run |
| AC-04 | Given the viewer's preferences, when the socket connects, then it asks for `match-<id>` plus the right audience group, a card with the same `seq` as a base envelope is kept, a reconnect or mode switch does not redisplay a shown card, and a failed snapshot leaves live cards working | Unit tests with a fake socket and `parseGroups` cases (valid and invalid audience names) | Fake `WebSocket` as in `socket.test.ts` | Test run |
| AC-05 | `PUT /api/preferences` stores a valid profile, `GET` returns it, an invalid body gets `400`, a missing cookie yields defaults | Route tests like `matches-route.test.ts` | — | Test run |
| AC-06 | Given each state (visible card, Verified, Template, text-only, English fallback, feed with 3 cards, tap reopens), the components render the expected text, roles and focus order | Component tests (the existing `live-match-view.test.ts` style) plus a keyboard pass | Fixtures | Test run; a note of the keyboard pass |
| AC-07 | The recap page shows the archive summary and, when a recap is present, its lines in the viewer's mode and language; otherwise the empty state; a bad id shows not-found | Component and page tests | Fixtures and a fake archive client | Test run |
| AC-08 | **Real connection.** On the local stack (generator → stats → agents → publisher → stand-in/Web PubSub), a browser in casual/English receives live cards, sees each for at most 6 s, never two at once, and the feed lists them; the same in analyst/English | Manual run at 20×, then written up like `PLAN_web_e2e-stats-run` | Arnav's M5 delivery; a running local stack | Run notes with match id, number of cards, counters |
| AC-09 | Shot map: given `heavy.shots`, then shots are drawn at their positions with xG-sized markers, and `window`/`highlight` apply | Unit and component tests; real run | **Azeem's `heavy.shots`** | **Blocked** until the field exists |

Checks that run on every milestone: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` in `web/`, and no
raw hex colours in `src/components`.
**Validation limits:** AC-08 proves only casual/analyst English against the real stack; club, player, other languages and
player tags are proven with fixtures only. Browser rendering is checked by tests plus one manual pass, not by an
automated visual diff. The 6-second and 300-second behaviours are logic-tested with an injected clock, not timed in real
time. The recap's real retrieval path is unproven until R-05 is decided.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M0 — Specs and confirmation | Spec PR (draft) with the answered sections, the §10 confirmation and the playhead and recap findings | Vedant | Azeem and Arnav answering R-03 | AC-00 | About half a day · 23 Oct |
| M1 — Contracts and pure logic | Schemas, preferences, scheduler and visuals pass their tests | Vedant | M0 text agreed enough to code against (D-01) | AC-01, AC-03 | About half a day · 24 Oct |
| M2 — Audience connection | Fake-socket tests show the right groups, `(group, seq)` dedupe, no redisplay; preferences route works | Vedant | M1; `web/realtime-routes` merged for the PR (not for the work) | AC-02, AC-04, AC-05 | About half a day · 24 Oct |
| M3 — Cards on the live screen | Controls, card, feed, key events chart on `/match/[id]` with fixtures, then real cards on the local stack | Vedant (Arnav delivers cards) | M2; Arnav's M5 for AC-08 | AC-06, AC-08 | About a day · 24–25 Oct |
| M4 — Recap page | `/match/[id]/recap` with summary, recap text or empty state | Vedant | M2; R-05 for more than the summary | AC-07 | About half a day · 25 Oct |
| M5 — Shot map | Shot map and `shot_map` cards use it | Vedant | **Azeem's `heavy.shots`** (unscheduled) | AC-09 | Not estimated until the field exists |

- **Project calendar check:** one full match end to end in English was due 20 Oct; every required feature is due **24 Oct
  (tomorrow)**; feature freeze 25–26 Oct; submission 27 Oct (IST). The estimates above add up to about three days, so
  **M0–M2 fit 24 Oct only if they run in parallel with the spec review, and M3–M4 land in the freeze window.** This does
  not fit the 24 Oct date as written; flagged in §14 (D-01, R-01). Estimates are not commitments.
- **First integration checkpoint:** AC-04 (mocked socket, fixtures) in M2; the real connection is AC-08 in M3, which
  needs Arnav's M5. Until then a mock proves rendering, not delivery.
- **Parallel work:** M1 pure logic and tests need only the agreed shapes; the spec text and the schemas can be written
  side by side; recap and cards share `preferences.ts` only.
- **Dependency-bound work:** AC-08 (Arnav's delivery), the recap beyond the summary (R-05), the shot map (Azeem).
- **Scope reduction if time runs short (cut in this order, minimum result stays intact):** M5 shot map; player tag
  chips; `AgentTrace` beyond the badge; club and player modes in the controls (leave the group names built and
  tested); the languages other than English in the controls; the commentary feed's tap-to-reopen; recap text (keep the
  summary page).

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `web/insight-cards` (stacked on `web/realtime-routes`). Small PRs in this order:
  (1) specs (M0); (2) the `contracts.ts` commit, alone; (3) the `pubsub-token.ts` commit, alone; (4) the rest of M1–M3;
  (5) recap; (6) shot map. PR 1 can open now; the code PRs wait for `web/realtime-routes` to merge (then merge `main`
  in, never rebase a branch others use).
- **Shared-file coordination:** `contracts.ts` is a hot file (own commit; Arnav told first, Azeem as the §10
  confirmer). `CONTRACTS.md`, `fixtures/`, `.github/`, `plans/REGISTRY.md` are not touched.
- **Conflict scan result:** see the table. Overlaps are resolved by order; none is an unresolved blocker for writing
  the plan or the specs. One is a hard order dependency for the code PRs (row 1).

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `web/src/lib/server/pubsub-token.ts`, `negotiate` route, `pubsub-token.test.ts`, `socket.ts`, `api.ts` (exist only on the unmerged branch) | `PLAN_web_realtime-routes`, branch `web/realtime-routes` (this branch's base) and `web/e2e-stats-run` | Vedant | **Order:** realtime-routes merges first; this plan's edits are small commits on top; merge `main` in afterwards | Pending (the base PR is not opened) |
| `web/src/lib/contracts.ts` (hot) | `web/realtime-routes`, `web/e2e-stats-run` (comment edits); `PLAN_web_stat-charts` (merged, #77) | Vedant | Own commit after the base merges; tell Arnav (producer of §6/§10) and Azeem | Pending |
| `web/specs/realtime.md`, `web/specs/screens.md` | `PLAN_web_realtime-routes` and `PLAN_web_e2e-stats-run` (§1, §3, §6, source-card wording), `PLAN_web_replay` (replay §1, §5), `PLAN_web_match-list` (picker) | Vedant | Different sections: this plan edits only `realtime.md` §4 (+ audience join, catch-up) and `screens.md` §1 recap, §2, §3; merge `main` before the spec PR | Pending |
| `web/specs/charts.md` | `PLAN_web_stat-charts` (merged) | Vedant | Different sections (§1 window/highlight, key events, shot map) | Pending |
| `web/src/components/live/LiveMatchView.tsx`, `MatchStreamProvider.tsx` | `PLAN_web_replay` (shares `Workspace`, frame), `web/e2e-stats-run` (`live-match-view.test.ts`, `SourceCard`), `PLAN_web_stat-charts` (merged) | Vedant | One slot in `LiveMatchView` (mount point); no change to `Workspace`'s props; re-check `replay-page` before M3 | Pending |
| `web/README.md` | `web/replay-page`, `web/e2e-stats-run` | Vedant | **Not edited** by this plan (docs go in the specs) | Resolved |
| `web/package.json`, `package-lock.json` | `web/e2e-stats-run`/`realtime-routes` (add `@azure/web-pubsub`) | Vedant | No new dependency here; lockfile never hand-merged | Resolved |
| `CONTRACTS.md` §10, §6, §7 groups | `PLAN_agents_insights-build` (F4 promotion, M5 delivery) | Arnav | Mirrored, not edited; any amendment is a separate contract PR before the dependent code | Pending (R-03) |
| `web/src/app/match/[id]/page.tsx` | None found | Vedant | Not edited (cards mount through `LiveMatchView`) | Resolved |
| `web/src/components/charts/ShotMap.tsx`, `KeyEvents.tsx`, `AgentTrace.tsx`, `MomentCard.tsx`, `CommentaryFeed.tsx`, `ViewerControls.tsx`, `recap/page.tsx`, `api/preferences/route.ts` | No other plan, branch or remote touches them (checked against every remote and local branch and `plans/active/`) | Vedant | — | Resolved |

**Scanned at `3353483` (`origin/main`) on 23 Oct 2026. Sources checked: plans ✓ · PRs not checked (`gh` is not signed in on
this machine; the branch scan stands in) · branches ✓ (every `origin` and `fork` remote and every local branch and
worktree, compared with `main` over `web/`, `CONTRACTS.md`, `fixtures/`, `.github/`, `plans/REGISTRY.md`) · hot files ✓.**
Remote branches that change `web/`: `web/e2e-stats-run`, `web/replay-page`, `vedant/web-app`, `fork/vedant/web-app`,
`fork/web/live-match-ui-setup` (the last three are older scaffolds already superseded on `main`).

- **Integration procedure:** run the local stack (generator at 20×, stats, agents publisher, Web PubSub stand-in),
  `npm run dev` in `web/`, open `/match/<id>`, pick a mode and language, watch cards and the feed; open `/recap`.
- **Configuration or setup changes:** none new; the existing server-side `OVERLAP_WEBPUBSUB_*` names are used.
- **Deployment or data changes:** not applicable (no data, no schema, no resource).
- **Documentation updates:** the three web specs (M0, M5); the `PLAN_agents_insights-build` AC-05 evidence line is
  Arnav's to update.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | The 24 Oct date does not fit the spec gate plus about three days of work (§12) | Features land in the freeze window or are cut | Arnav | D-01 and the cut list | M1–M4 timing |
| R-02 | Base branch `web/realtime-routes` is unmerged and 25 commits ahead of `main` | Code PRs cannot merge; conflicts if it changes again | Vedant, Arnav | Merge it first; M0 can go now | M2 PR |
| R-03 | Vedant's and Azeem's confirmation of `CONTRACTS.md` §10 is not on record | Schemas coded against an unconfirmed shape | Vedant (for web), Azeem | Record both in the M0 spec PR | M1 code |
| R-04 | Audience and base `seq` collide (§2) | Cards silently dropped | Vedant | D-02 (own store, `(group, seq)`), tested in AC-02/AC-04 | Handled |
| R-05 | No way for a late visitor to read the recap after full time | Recap page shows only the archive summary | Arnav | Options: persist and serve the recap with the insights snapshot; or put the recap in the archive. Fallback: summary plus recap received while the page is open | M4 (beyond the summary) |
| R-06 | `AgentTrace` has no steps or timings in any contract | Trace stays minimal (badge, `facts_checked`) | Arnav | Add a contract field if a full trace is wanted; otherwise minimal | Optional extension |
| R-07 | `heavy.shots` does not exist | No shot map; `shot_map` cards use `key_events` | Azeem | Agree the field in §7.4 / `publishing.md`, then M5 | M5 |
| R-08 | Preferences storage unnamed in the specs | A cookie profile may be rejected | Vedant, Arnav | D-07; fallback `localStorage` only | M2 |
| R-09 | Base playhead stands in for `match_state.source.match_ms` | Card shown or dropped up to about 5 match seconds off | Arnav | Confirm in M0; otherwise add the playhead to a base message | M1 |
| R-10 | Recap `data` shape comes from producer code, not the contract text | Schema rejects real recaps | Arnav | Compare in M0; amend one side | M4 |
| R-11 | AC-08 depends on Arnav's delivery and a working local stack | The real connection is unproven by 25 Oct | Arnav | Fixtures prove rendering until then; the plan says so | M3 sign-off |

**Decisions requested from Arnav or affected owners:**

1. **Arnav, D-01/R-01:** may M1–M3 code proceed on `web/insight-cards` while the spec PR is under review (recommended,
   with the code PRs merging only after the spec is agreed), or must code wait? It decides whether 24 Oct is reachable.
2. **Arnav, R-05:** how does a late visitor get the recap: with the insights snapshot, in the archive, or not at all
   for now? Recommended: serve it with the insights snapshot after full time.
3. **Azeem, R-03 and R-07:** confirm `CONTRACTS.md` §10, and say when `heavy.shots` (per-shot xG, position, outcome,
   team, `event_id`) can exist. Recommended: shape agreed in `publishing.md` §2 first.
4. **Vedant, D-05/D-07:** insights snapshot route out of the minimum (recommended), and a cookie profile for
   preferences (recommended).
5. **Vedant and Arnav, R-02:** open the `web/realtime-routes` PR now so this branch's PRs can follow.

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

### Questions for Arnav's coordinated review

1. Does this work support the agreed product flow and stay within its stated scope?
2. Do both sides of every handoff agree on data shape, meaning, timing, and failure behavior?
3. Are multiple contributors changing the same files or creating competing implementations?
4. Are there hidden blockers, circular dependencies, or decisions incorrectly presented as settled?
5. Can the approach be simplified while preserving the required behavior?
6. Do the acceptance checks demonstrate interoperability as well as isolated component behavior?

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Not reviewed yet | v0.1 | — | — | — |

**Implementation readiness:** Blocked by the spec gate (M0, AC-00), the §10 confirmation (R-03) and Arnav's answer to D-01.
**Relevant specification agreement:** pending (specs not yet written).
**Next action and owner:** open the M0 spec PR as a draft · Vedant, after a go. Waiting for **go**.

### Handover after implementation

**Pending implementation.**

- Implementation PR and commit: Pending implementation.
- Acceptance results: Pending implementation.
- Setup and integration instructions: Pending implementation.
- Differences from the agreed proposal: Pending implementation.
- Known limitations and follow-up owner: Pending implementation.
