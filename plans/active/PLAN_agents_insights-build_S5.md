# PLAN_agents_insights-build_S5 — delivery: publisher, audience groups, insights snapshot (M5)

| Field | Complete this |
|---|---|
| Sprint | S5 — the insights publisher (single sender per audience group, save before send, expiry, recovery), recaps and player tags on the wire, the stand-in's insights snapshot, a two-viewer live check |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M5 · AC-05 |
| Author / owner | Arnav |
| Status | Built and checked live; PR to open after M4 merges |
| Reviewed branch and commit | `agents/seven-agents` (M4) on main · 402c0b4 |
| Planned branch | `agents/delivery` (stacked on `agents/seven-agents` until M4 merges) |

## 1. Outcome

- **What will work at the end of this sprint:**
  - `agents/publisher.py` takes every outbox and, per audience group: checks the card against the playhead
    (`match_state.source.match_ms`, same period, at most 300,000 match ms after `show_at_ms`; full time ends moment
    cards); reserves the group's next `seq` and saves the delivery in one Cosmos transaction in `overlays`
    (`delivery:<group>:<overlay_id>`, `counter:<group>`); then sends the §7 envelope through Web PubSub (the stand-in
    locally); marks it sent. Late cards are expired without a number. The job ends `published`,
    `partially_expired` or `expired`.
  - Recovery: a failed send stays pending and is resent with the same `seq` and envelope; a crash after sending
    resends the identical envelope (browsers dedupe on `seq` per group).
  - Recaps go out as `kind = "recap"` envelopes at full time; player tags as `kind = "player_tag"` envelopes the
    first time a player's top speed or distance in `match_state` crosses its threshold, in every language group.
  - The stand-in serves `GET /api/match/<id>/insights/snapshot?mode=&lang=(&club=|&player=)`: the two newest live
    cards and the group's cursor; 400 / 404 / 503 as §10.4.
  - The local poller runs the publisher after the agents on every pass.
- **Not in this sprint:** card rendering (Vedant's web app); the Azure hosting of the publisher (a Functions
  registration in `function_app.py` and the `overlays` container in Bicep: M7).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Outboxes with per-audience overlay bodies, recap intents, player-tag detection | M4 | Built (PR open) |
| §10.4 / §10.6 delivery contract | #62 (merged; Vedant's and Azeem's review still to come) | Yes, provisional |
| Web PubSub stand-in with any group name | `infra/local/webpubsub_standin` | Yes |
| Cosmos emulator supports conditional transactional batches | Probe, 20 Oct: batch 200/201; stale ETag refused (409), counter unchanged | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `agents/publisher.py` | Add | Publisher, eligibility, Web PubSub sender | §10.4, §10.6 |
| `agents/state.py` | Modify | Transactional batch (memory and Cosmos); container choice; create `overlays` on the emulator | §10.4 |
| `agents/pyproject.toml` | Modify | `azure-messaging-webpubsubservice==1.3.0` (the relay's version; resolved from the local cache) | — |
| `functions/moment_trigger.py` | Modify | Publisher in the local poller (`--no-publish` to skip) | `moment-trigger.md` |
| `infra/local/webpubsub_standin/standin/insights.py`, `server.py` | Add / modify | Insights snapshot route (the query quotes `group`, a Cosmos SQL keyword) | §10.4, §10.6 |
| `agents/tests/test_publisher.py`, `test_insights_snapshot.py` | Add | Expiry, seq, recovery, partial expiry, recap, tags; snapshot | `evaluation.md` |
| `agents/check_delivery.py` | Add | Two-viewer protocol check during a live match | AC-05 |
| `infra/specs/local-development.md`, `agents/README.md`, `docs/knowledge/ai-insights.md`, this plan | Modify | Run order; status; handover | — |

## 4. Steps

1. Batch in the stores; publisher with tests.
2. Insights snapshot in the stand-in with tests.
3. Publisher in the poller; local run order documented.
4. Live run at 20× with the poller, stand-in, stats, archiver and two viewers (AC-05).

## 5. Contracts and shared files

- **Contract changes:** none (implements §10.4 / §10.6 as merged).
- **Hot shared files touched:** none (`function_app.py` waits for M7).

## 6. Conflict scan

Scanned on 2026-10-20: no open PR touches `agents/`, `functions/moment_trigger.py` or the stand-in.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-05a | Live cards are saved then sent once per group with `seq` 1, 2, …; early cards wait; late, previous-half and post-full-time cards expire unnumbered; unknown playhead sends nothing | `test_publisher.py` | Pass (12 tests): live, early, unknown playhead, three late cases, seq per group |
| AC-05b | A failed send is resent with the same `seq` and envelope; a crash after sending resends the identical envelope; mixed outcomes give `partially_expired` | `test_publisher.py` | Pass |
| AC-05c | The insights snapshot returns the two newest live cards and the cursor; validates mode, language and ids; 404 / 503 | `test_insights_snapshot.py` | Pass (4 tests); live: 404 unknown match, 200 with cursor, 400 missing club |
| AC-05d | During a 20× local live match, viewer A receives cards for its mode and language, its club and player tags for a followed player, in seq order; viewer B joining late catches up through the snapshot | `check_delivery.py` | Pass on SYN-0511 (CAL v DTN, 20×, provider off): A got 25 cards + recap in casual-en, analyst-es, club-DTN-fr; a player tag (Lorenzo Sartori, top speed 33.7 km/h) and 9 player cards in player-CAL-09 en and hi; every group in seq order, no duplicates. B joined at 45+ min: snapshot 200, cursor 12, cards 11–12, then 13–26 live, no gap. SYN-0510: 448 overlay, 28 recap and 16 tag deliveries sent; 19 jobs published, 3 suppressed, none expired |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| At 20× the live window is 15 wall seconds; slow local model calls expire cards | Model-backed cards expire locally; the live check uses templates (provider `off`) | — | No: expiry is the specified behaviour |
| Vedant's renderer for the new overlay fields | AC-05d checks what reaches a browser, not the card UI | Vedant / Arnav (R-05) | No |
| Azure hosting (Functions registration, `overlays` in Bicep) | Local only until M7 | Arnav (M7) | No |

## 9. Handover

- **Built:** `publisher.py` (eligibility against the `match_state` playhead; seq reserved with the delivery in one
  Cosmos transaction; save before send; expiry without a number; per-audience outcomes and the job's final state;
  recaps; player tags once per crossing in every language), store batch and container choice in `state.py`, the
  stand-in's insights snapshot, the publisher in the local poller (`--no-publish` to skip), `check_delivery.py`.
- **Checks:** agents 155 passed (publisher 12, snapshot 4), ruff clean. The emulator probe showed conditional
  transactional batches are atomic (stale ETag refused, counter unchanged). Live runs as in AC-05d.
- **Found and fixed during the live runs:** `group` is a Cosmos SQL keyword (the snapshot query failed with 400);
  the check script's receive timeout wasn't honoured (now `asyncio.wait_for`).
- **Dependency:** `azure-messaging-webpubsubservice==1.3.0`, the relay's version, resolved and installed from the
  local cache (no download).
- **Not done here:** card rendering (Vedant); Azure hosting (Functions registration and the `overlays` container in
  Bicep, M7). At 20× a card is live for about 15 wall seconds, so slow local model calls expire; the live checks
  used templates (provider `off`), as section 8 says.
- **Merge order:** after M4 (`agents/seven-agents`).
