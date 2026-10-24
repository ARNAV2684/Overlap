# PLAN_web_football-revamp_S7 — Live screen fixes: header, dropdowns, attack arrows, flanks, my-club view

| Field | Complete this |
|---|---|
| Sprint | S7 — the live match screen reads right: clean team names and score sheet, site-styled dropdowns, attack arrows towards goal, attack by flank you can see, and a my-club view |
| Parent plan | [`PLAN_web_football-revamp`](PLAN_web_football-revamp.md) · v0.2 (handed over to Arnav, 23 Oct) |
| Milestone in parent plan | M3 live-screen sweep (§15 "Left to do" and the 24 Oct polish session) |
| Author / owner | Arnav (web co-owner, `plans/REGISTRY.md`) |
| Status | In progress — implemented and validated locally; PR not opened yet |
| Reviewed branch and commit | main · `22ceb8a` (after #90) |
| Planned branch | `web/live-screen-s7` |

## 1. Outcome

- **What will work at the end of this sprint:** four small parts, each checked in a live 20× match on the local stack:
  - **S7a Score header:** both team names stacked the same way; the score sheet groups a player's goals
    (`Sartori 6′ 45′ 90′`) and shows red cards only.
  - **S7b Dropdowns:** the viewer bar's Language, Club and Follow pickers become a site-styled dropdown (dark and light
    themes), never the browser's white list.
  - **S7c Attack:** the lane arrows point towards the goal being attacked, for both teams and both halves; attack by
    flank is visible on the pitch, in the folded caption, and in the live rail.
  - **S7d My club:** with a favourite club chosen, the per-team analysis (pass network, shot map, flank, pressing,
    heatmap, pass map) shows that club only, and the pitch's team stories follow it.
- **Not in this sprint:** Azure work (on hold); new stats from the engine; season pages.

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| #90 merged (polish, tide, card, header) | main `22ceb8a` | Yes |
| Local stack for the live check | Docker emulators, stand-in, relay, archiver, stats, poller (running) | Yes |
| Arnav's go | This plan | Yes — go given in the session that implemented it (23 Oct) |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `web/src/components/match/ScoreHeader.tsx` | Modify | Team names on two stacked lines for both teams (first word, then the rest), mirrored; grouped score sheet | `screens.md` §2.1 |
| `web/src/lib/live/match-events.ts` | Modify | `scoreSheet`: one entry per player and kind with all minutes; no yellow cards (a second yellow appears as red) | `screens.md` §2.1, `pitch.md` §5 |
| `web/src/lib/__tests__/match-events.test.ts` | Modify | Grouping and red-only cases | — |
| `web/src/components/ui/Select.tsx` | Add | Site-styled dropdown: button + listbox, keyboard (arrows, Enter, Escape, type to jump), click outside closes, ARIA listbox, theme tokens | `design-system.md` |
| `web/src/components/match/ViewerBar.tsx` | Modify | Use `Select` for Language, Club, Follow | `screens.md` §3 |
| `web/src/app/globals.css` | Modify | `color-scheme` on form controls as a fallback for any native control left | `design-system.md` |
| `web/src/components/pitch3d/scene/overlays.ts` | Modify | Lane band chevrons bent the right way (tip towards goal); flank lane stripes with labels | `pitch.md` §4 |
| `web/src/components/pitch3d/scene/stage.ts` | Modify | Draw the three flank lanes during the attack story; pass the club preference to the story | `pitch.md` §4 |
| `web/src/components/pitch3d/PitchStage.tsx` | Modify | Flank share labels at the attacking third | `pitch.md` §4 |
| `web/src/lib/live/story.ts` | Modify | `directStory` takes a preferred side: with a favourite club, attack and team-shape stories follow that club; flank shares for both teams | `pitch.md` §4 |
| `web/src/lib/__tests__/story.test.ts` | Modify | Preferred-side and flank cases | — |
| `web/src/providers/MatchExperience.tsx` | Modify | Hand the favourite club to the story director | `screens.md` §2.2 |
| `web/src/components/match/PitchOverlay.tsx` | Modify | Folded caption pill keeps a mini three-lane flank bar | `screens.md` §2.2 |
| `web/src/components/match/LiveRail.tsx` | Modify | "Attack by flank" row for both teams (last few minutes) | `screens.md` §2.7 |
| `web/src/components/match/AnalysisPanel.tsx` | Modify | My-club mode: per-team visuals locked to the favourite club, team toggle replaced by a "Your club" badge | `screens.md` §2.5 |
| `web/src/components/match/TrackingHeatPanel.tsx` | Modify (added during implementation) | My-club mode: the heatmap's team is the favourite club, with the Your club badge in place of its team toggle (the heatmap is named in the S7d outcome but its toggle lives in this file) | `screens.md` §2.5–§2.6 |
| `web/src/lib/__tests__/live-screen-controls.test.ts` | Add (added during implementation) | `Select` keyboard helpers and ARIA markup, the header's name split, the folded pill's flank bar | — |
| `web/specs/screens.md`, `web/specs/pitch.md` | Modify | Describe the above | Themselves |
| `plans/active/PLAN_web_football-revamp_S7.md` | Add | This plan | — |

## 4. Steps

1. **S7a** `scoreSheet` grouping + red only, with tests; stacked names in the header.
2. **S7b** `Select` component; swap the three viewer-bar pickers; check both themes, keyboard and phone width.
3. **S7c** Fix the chevron direction (the arrow's arms are drawn ahead of its tip today, so every arrow points back);
   check home and away in both halves. Add the flank lanes on the pitch, the flank bar in the folded pill, the rail row.
4. **S7d** Preferred side through the story director and the analysis panel; tests.
5. Lint, typecheck, all tests, production build; one live 20× match with a league club followed as favourite;
   screenshots of each part.

## 5. Contracts and shared files

- **Contract changes:** none (no message shapes; screen-only).
- **Hot shared files touched:** none (`web/src/lib/contracts.ts` unchanged).

## 6. Conflict scan

Scanned at `22ceb8a` on 24 Oct 2026. Open PRs: none touching `web/`. Active plans naming these files:
`PLAN_web_live-home` and `PLAN_web_broadcast-local-preview` (both built and merged; same owner set). No overlaps.
Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S7-AC-01 | A player who scores at 6′ and 45′ shows once: `Name 6′ 45′`; a yellow card is not in the header; a red card is | Unit test + live screenshot | Passed. `match-events.test.ts` grouping and red-only cases. Live SYN-9002 at 20×: the header showed `Castellano 16′`, `Salvesen 28′` with a red card and `Norland 42′ pen`, and no yellow cards while yellows were on the pitch |
| S7-AC-02 | Both team names sit on two stacked lines, mirrored | Screenshot, desktop and phone | Passed. Live screenshots on desktop (1280 px, `Ironvale` / `City` mirrored with `Saltmarsh` / `Wanderers`) and phone (390 px, light; crest above the name, `Larkspur` / `Rangers` mirrored with `Greywater` / `Albion`); `splitTeamName` unit test |
| S7-AC-03 | The Language, Club and Follow pickers open a site-styled list in dark and light themes, and work with the keyboard | Screenshot + keyboard check | Passed. Screenshots of all three lists open in dark (desktop) and light (phone); keyboard in the live page: ↓ ↓ ↓ Enter chose the away club and closed the list, typing jumped in Follow and Escape kept `Nobody`; unit tests for the key handling, type-ahead and ARIA markup |
| S7-AC-04 | In the attack story the arrows point at the goal being attacked, for home and away, in both halves | Live screenshots of both teams | Passed. Top camera, attack story pinned, SYN-9002: first half, Ironvale's chevrons point east and Saltmarsh's west; second half (79′ and 81′), Saltmarsh east and Ironvale west, each tip towards the goal attacked and moving towards it; lane labels sit on each team's own left and right |
| S7-AC-05 | Attack by flank is visible without opening anything: lane shares on the pitch, in the folded pill, and in the rail | Live screenshot | Passed. The same screenshots show the three lit lanes with their share labels, the rail's Attack by flank row for both teams, and (SYN-9003) the folded pill with its L/C/R bar |
| S7-AC-06 | With a favourite club, the per-team analysis shows only that club and the pitch's team stories follow it | Unit test + live screenshot | Passed. `story.test.ts` favourite-club cases (attack, pinned stories, goals). Live with Saltmarsh chosen by keyboard: the shot map, flank chart, pressing chart, heatmap and player table showed Saltmarsh only under a `Your club · SMW` badge, and Team stats kept both teams with `SMW · your club`; with Larkspur chosen, the pinned attack story stayed on Larkspur |
| S7-AC-07 | Lint, typecheck, all web tests and the production build pass | Commands | Passed. `npm run lint`, `npm run typecheck`, `npx vitest run` (545 passed, 2 skipped) and `npm run build` in `web/` |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| "Parallel" team names read as two stacked lines (first word, then the rest) for both teams, mirrored | If you meant one line each, S7a's layout changes | Arnav | S7a step 1 |
| My club: the side-by-side Team stats card is a comparison by nature; proposed to keep both columns there with your club highlighted, and show only your club everywhere else | If you want the opponent hidden there too, that card becomes your club's numbers only | Arnav | S7d |
| Yellow cards stay on the pitch (card above the player) and in Key events; only the header drops them | — | Arnav | none |

## 9. Handover

- **Branch and PR:** implemented on `claude/sleepy-mccarthy-io70uk` (the session's branch; the plan named
  `web/live-screen-s7`) from main `22ceb8a`, in five commits, one per part plus the specs. No PR opened yet.
- **Acceptance:** all seven criteria passed (§7). The live check ran without Docker: the mock's Web PubSub stand-in
  (`uv run mock play --match SYN-9002 --speed 20 --web`) fed the built app (`next start`), and the browser's
  snapshot call was routed to the stand-in's snapshot because the app's snapshot route needs the screen relay's Cosmos.
  No stats engine was running, so the stat panels (xG, possession, pass network links, Team stats bars) were empty in
  those screenshots; everything S7 adds is computed from events and tracking, and was visible.
- **Differences from the plan:**
  - Two files added to the file map (§3): `TrackingHeatPanel.tsx` (the heatmap is in the S7d outcome but its team
    toggle lives there; it takes the club and the badge as props) and a new test file,
    `live-screen-controls.test.ts`.
  - The club preference reaches the story director through `MatchExperience` (new `myClub` on the experience), not
    through `stage.ts`: the stage only draws the story it is given.
  - The rail counts the flanks at the picture's playhead rather than the latest stat panel's time, so a replay never
    shows minutes still to come and the row works before the first panel.
- **Decisions taken as proposed in §8:** two stacked lines for names; Team stats keeps both columns with the club
  picked out (the opponent's bars faded); yellow cards stay on the pitch and in Key events.
- **Known limitations and follow-ups:** a lane's share label can sit under the open caption card at the bottom-left
  of the pitch; "favourite club" is the Club preference whatever the mode, so a viewer who keeps a club and switches to
  Casual still gets my-club analysis (clear the club to see both teams). Arnav decides whether either needs changing.
