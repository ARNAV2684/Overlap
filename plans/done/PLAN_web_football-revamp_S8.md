# PLAN_web_football-revamp_S8 — Live insights and the AI moments revamp

| Field | Complete this |
|---|---|
| Sprint | S8 — the live match screen points out who is winning their battle, which connections drive the game and who is doing the running, and the AI moments sit where the match is played |
| Parent plan | [`PLAN_web_football-revamp`](PLAN_web_football-revamp.md) · v0.2 (handed over to Arnav, 23 Oct) |
| Milestone in parent plan | M3 live-screen sweep, after [S7](PLAN_web_football-revamp_S7.md) |
| Author / owner | Arnav (web co-owner, `plans/REGISTRY.md`) |
| Status | Done — merged into `main` in #96 (25 Oct) |
| Reviewed branch and commit | main · `b18297f` (after #92) |
| Planned branch | `claude/gallant-noether-0jf0ql` (the branch this work session was given) |

## 1. Outcome

- **What will work at the end of this sprint**, in a live or replayed match:
  - **S8a AI moments revamp.** A commentary strip directly under the pitch shows the latest moment large and the
    ones before it beside it, so a moment is always in view without scrolling. The on-pitch card names what kind of
    moment it is (chance, goal or card, momentum, press, passing, movement). The commentary history moves up the side
    column (after the followed player) and is grouped by half. Moment markers sit on the replay progress line.
  - **S8b Honest labels.** A model-written line that passed the fact-checker reads **"AI · checked"**; a template
    line reads **"Stat line · checked"**, never "AI". The audit flagged template cards labelled as AI (§4.3 risk).
  - **S8c Head-to-head.** A battle card pairs each side's leading player in one role and compares the numbers that
    matter for that role: forwards (shots, xG, conversion, top shot speed), midfielders (passes, completion,
    progressive passes, pass distance), defenders (tackles won, interceptions, aerials won, duels won, clearances).
    It rotates between roles every 45 s until the viewer picks one.
  - **S8d Connections.** Each side's top three passing pairs, ranked by passes completed, progressive passes and
    passes that led to a shot, drawn on a small pitch at the pair's mean pass-start spots.
  - **S8e Engine room.** The top workers: distance and sprints from tracking, duels won, ball recoveries,
    interceptions and pressures, with the score's formula shown, not hidden.
  - **S8f Tempo.** Control vs chaos (passes per possession and possession changes per minute, last 5 minutes) and
    rhythm (passes per minute, last 5 minutes, against the match so far), so the How it works page's claim is true.
  - **S8g Player focus.** The tiles follow the player's role (the same sets as S8c), a row compares the player with
    their opposite number in the same role, and their last few actions are listed.
- **Not in this sprint:** Azure work (on hold); new fields from the stats engine or agents; new moment types for the
  agents to narrate (a later, cross-layer plan); drawing the connections on the 3D pitch.

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| S7 merged (header, dropdowns, flanks, my club) | main `b18297f` | Yes |
| Events carry `player_id`, `outcome`, `x`/`y`/`end_x`/`end_y`, `receiver_id`, `possession_id` | `CONTRACTS.md` §3 | Yes |
| Heavy block carries `players` (distance, sprints, top speed), `pass_network` and `shots` (xG) | `CONTRACTS.md` §8 | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `web/src/lib/live/live-insights.ts` | Add | Pure functions: player lines, role metrics, battles, connections, workhorses, tempo, moment kinds and labels | `web/specs/charts.md`; `CONTRACTS.md` §3, §6, §8 |
| `web/src/lib/__tests__/live-insights.test.ts` | Add | Unit tests for every function above | — |
| `web/src/components/match/MomentStrip.tsx` | Add | The commentary strip under the pitch | `web/specs/screens.md` §4 |
| `web/src/components/match/LiveInsights.tsx` | Add | Head-to-head, Connections, Engine room and Tempo cards | `web/specs/screens.md` §2 |
| `web/src/components/match/AiFeed.tsx` | Modify | Grouped by half, honest labels, moment kind | `web/specs/screens.md` §4 |
| `web/src/components/match/PitchOverlay.tsx` | Modify | On-pitch card: moment kind and honest label | `web/specs/screens.md` §2.3 |
| `web/src/components/match/ReplayBar.tsx` | Modify | Moment markers on the progress line | `web/specs/screens.md` §2.4 |
| `web/src/components/match/PlayerFocus.tsx` | Modify | Role-aware tiles, opposite number, last actions | `web/specs/screens.md` §3.2 |
| `web/src/components/match/MatchScreen.tsx` | Modify | New layout: strip and insights under the pitch, commentary at the top of the side column | `web/specs/screens.md` §2 |
| `web/src/app/how-it-works/page.tsx` | Modify | Say where control and rhythm are computed (the screen, from the event stream) | — |
| `web/specs/screens.md` | Modify | Record the new layout and cards | — |
| `plans/done/PLAN_web_football-revamp_S8.md` | Add | This plan | — |

## 4. Steps

1. `live-insights.ts` and its tests.
2. S8a and S8b (strip, labels, kinds, markers, layout).
3. S8c–S8f (`LiveInsights.tsx`).
4. S8g (Player focus).
5. How it works and `screens.md`.
6. Lint, typecheck, tests and build; check the screen in a browser at phone and desktop widths.

## 5. Contracts and shared files

No contract changes: everything is computed in the browser from fields already in `CONTRACTS.md`.
`web/src/lib/contracts.ts` (hot file) is read, not changed. Numbers on the new cards come from code, never from a
model, and the cards say they come from the event data.

## 6. Conflict scan

Scanned at `b18297f` on 24 Oct. Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `web/` | #95 (`infra/azure-wave2`) | Arnav | #95 touches only home, start-match and insights-snapshot files; no file overlaps | No overlap |

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S8-AC-01 | Given a template card, its label reads "Stat line", and only a verified, non-template card reads "AI" | Unit test on the label function | `live-insights.test.ts` › AI moment cards: passes |
| S8-AC-02 | Given events for both sides, the battle pairs each side's leader in a role and picks the leader of each row | Unit tests | `live-insights.test.ts` › battle (3 tests): pass |
| S8-AC-03 | Given completed passes, connections rank pairs by passes, progressive passes and passes that led to a shot | Unit tests | `live-insights.test.ts` › topConnections (3 tests): pass |
| S8-AC-04 | Given tracking and duel events, the engine room ranks by the stated formula and shows its parts | Unit tests | `live-insights.test.ts` › workhorses: passes |
| S8-AC-05 | Given the last 5 minutes of events, tempo gives passes per possession, possession changes and passes per minute | Unit tests | `live-insights.test.ts` › tempo (3 tests): pass |
| S8-AC-06 | The latest moment is visible under the pitch without scrolling at 1440 × 900 and 375 px wide | Browser check | Checked in Chromium on a replay of a generated match (KES v ORR, seed 7) with stat panels from `stats replay`: strip under the pitch at 1440 × 900 and 390 px wide |
| S8-AC-07 | Lint, typecheck, tests and build pass | `npm run lint`, `typecheck`, `test`, `build` | lint clean, typecheck clean, 563 passed / 2 skipped, `next build` compiled |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| The engine-room weights are a judgement call | Viewers may disagree with the ranking | Arnav | None: the formula is shown on the card |
| Whether the new insights become agent-narrated moment types | More marks, but touches stats, agents and contracts | Arnav | A later plan |

## 9. Handover

- **Built:** S8a–S8g as listed in §1, inside the file map. No contract, stats-engine or agent change.
- **How it was checked:** unit tests for every calculation (18 new tests); lint, typecheck, the full web suite and a
  production build; a browser check on a replay of a generated match served from the scratchpad (preview cards were
  made from the stats engine's moments, half marked as model lines and half as templates, to see both labels; none
  of that data is committed).
- **Found and fixed during the check:** the connections card did not refresh because the memory hands back the same
  events array as it grows; it now recomputes on every tick. A white kit colour hid the shirt number.
- **Not checked:** a live match through the local stack (no Docker daemon in the work session); Azure (on hold).
- **Follow-ups (not started, need Arnav's decision):** make the head-to-head, connections and engine-room swings
  moment types the agents narrate (stats, agents and contracts); draw the top connections on the 3D pitch.
