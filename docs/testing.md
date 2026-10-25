# Judge's guide: how to test Overlap

No sign-in, no install: everything runs in the browser.

## 1. Open the link

https://ca-overlap-web.agreeablestone-46edcfef.swedencentral.azurecontainerapps.io

- The first visit may take **about 10 s**: between test windows the web app scales to zero and wakes on the first
  request. Reload once if the page is still blank.
- The home page opens on a live match if one is playing; otherwise it plays a **replay** at 5× (one of our showcase
  matches) and says so. On a first visit a short panel above the pitch explains what you are seeing; **Got it** hides
  it.
- The top navigation has **Live**, **Matches**, **League**, **How it works** and a light/dark switch.

## 2. Watch a replay

Open **Matches** and pick a finished match, then **Watch replay** (or open `/replay/<match id>` directly).

- Recommended: **SYN-3003**, a full match played on Azure on 24 Oct
  (`/replay/SYN-3003`). _A showcase replay from the next Azure run will replace this recommendation._
- Replay controls over the pitch: play and pause, **1× · 5× · 20×**, a progress line with a mark for each moment,
  and restart.
- **Watch / Analyse** above the pitch: Analyse (the default) adds the story caption and chips (territory tide, team
  shape after a goal, pass network); Watch shows only the match.

## 3. Make it yours: mode, language, club, player

The **Your match** panel has four mode buttons (Casual, Analyst, My club, Player focus) and three pickers
(Language, Club, Follow). Each change switches the AI cards at once, because every combination reads its own stream
of cards.

| Try | What changes |
|---|---|
| **Mode → Casual** | A different screen for any fan: the clean pitch, short plain lines with at most one number, each insight card as one sentence, three live numbers (xG, possession, shots on target), and the analysis behind **Show the numbers** |
| **Mode → Analyst** | The data screen: the story overlays on the pitch, the same moment with the tactical numbers (xG, pressures per pass, momentum share), a ✓ chip for each fact the fact-checker verified, every live number and the analysis open |
| **Club** → pick one of the two clubs (switches to **My club**) | The moment told from that club's side |
| **Follow** → pick a player (switches to **Player focus**) | Lines about that player, a Player focus panel (distance, top speed, sprints, role numbers against their opposite number, last actions), a ring and name tag on the pitch, and the heatmap and pass map switch to them |
| **Language → हिन्दी**, Español or Français | The same cards translated, names kept, numbers unchanged |

My club or Player focus without a club or player of this match shows casual cards, and the panel says so. Preferences stay in your
browser only.

## 4. Read the cards

**AI moment card.** When a moment is due, a card rises over the pitch: the minute, the kind of moment (big moment,
chance, momentum, press, passing, movement, numbers, head-to-head, connection, engine room), a badge, the line with
its key number picked out, and a chart chip that opens the chart it refers to.

The badge says who wrote the line:

| Badge | Meaning |
|---|---|
| **AI · checked** | Written by the narrator agent (gpt-5-mini) and passed by the fact-checker: every number matched the evidence in code and a separate model call judged the meaning |
| **Stat line · checked** | A template line filled from the evidence and checked in code. Used when the agents' own line did not arrive in time or did not pass the fact-checker. Never called AI |

In the Azure replays so far most cards are **Stat line · checked** (5–16% were model-written in the 25 Oct runs); see
[`evaluation.md`](evaluation.md#live-ai-share-on-azure-25-oct).

**Live commentary** (under the pitch): the card on screen now, large, with the three before it. In a replay, cards
stay hidden until the playhead reaches them.

**Live insights** (under the commentary), worked out in the browser from the events, each saying so:
**Head-to-head** (each side's leading forward, midfielder or defender, compared on that role's numbers),
**Connections** (a team's top three passing pairs drawn on a small pitch), **Engine room** (the top four workers, with
the formula printed), **Tempo** (control or chaos, turnovers a minute, rhythm over the last 5 minutes).

**AI feed** (side column): every card your audience received, grouped by half, with a count of how many the agents
wrote, and the recap on top at full time.

## 5. Recap, league, club and player pages

- **Recap:** `/match/<id>/recap` (or **Recap** on Matches): the final score, the recap writer's story of the match,
  and every moment on a timeline, in your mode and language.
- **League:** the season table with expected points, the title race, how every club plays, and the leaders.
- **Club:** click a club for its season: how it plays (designed against measured), where it presses, its chances for
  and against, when its goals come, its squad.
- **Player:** a scout card (role, foot, attributes, per-90 output against the position group, maps); its
  **Compare** chip puts two players side by side.
- **How it works:** the pipeline, the seven agents and what each pitch story means.

## 6. Live matches

The live pipeline (Event Hubs, Functions, stats engine, generator, model) runs only in announced test windows to
keep costs down. **Live windows: to be announced.**

During a window the home page shows **Start a live match**: it starts a full synthetic match on Azure at 20× (about
7 minutes). One match runs at a time and each visitor can start 3 an hour; if one is already playing, the home page
switches to it. Cards appear a few seconds after their moment.

## 7. Everything is synthetic

Every club, player, league and match is invented by our generator. There is no real football data, and no personal
data is collected.
