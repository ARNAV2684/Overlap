# Screens

> **Status: agreed.** Owners Arnav and Azeem; merged for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md) and extended for
> [`PLAN_web_football-revamp`](../../plans/active/PLAN_web_football-revamp.md) (agreed by Azeem, 23 Oct 2026).

Owners: Arnav, Azeem. Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). The
earlier screens are kept in [`vedant-frontend/`](../../vedant-frontend/README.md).

## 1. Home `/`

Opens on a match being played (`components/home/HomeLive.tsx`):

1. The newest **live** match whose clock is moving between polls of `/api/matches` (every 8 s); among several, the
   highest match number.
2. A live match that sends no frame for 9 s is marked quiet (the generator stopped mid-match) and skipped.
3. With nothing live: a **replay** of the newest finished match at 5×, with a line saying so. A match that kicks off
   later takes over.

Above the screen: the wordmark, the tagline and chips for the other matches. The top navigation (`components/shell/
TopNav.tsx`) has Live, Matches, How it works and the theme switch on every page.

## 2. Match screen (`/match/<id>` live or replay, `/replay/<id>` replay; and the home page)

`components/match/MatchScreen.tsx`. Desktop: the pitch column and a 380 px side column, analytics underneath. Phones:
one column; the story chips and caption move under the pitch. Above the pitch, "Match centre" (Live or Recorded
tracking) and the **Watch / Analyse** switch (`pitch.md` §1.2); Analyse is the default, and Watch hides the story
caption and chips. The tracking heatmap (§2.6) is in the Players tab.

### 2.1 Score header

A clean broadcast scoreboard (24 Oct): competition, venue and match id on one line with the Live / Replay / Full time
badge; both clubs with kit crests either side of the score, which flashes on a goal; under the score the clock in mono
with the half, and a **momentum sparkline** (one bar per 5-minute bucket, home above the line, away below, from the
stat panels' momentum buckets). Each club's name sits on **two stacked lines**, the first word and then the rest
(`Northbridge` / `FC`), the same way for both teams and mirrored about the score: the home name reads from its crest,
the away name towards its crest; each line truncates rather than wrapping (S7). On phones the crest sits above the
name. Under each team, its **score sheet**: scorers and red cards only (`scoreSheet`, `lib/live/match-events.ts`).
One line per player and kind with every minute, in the order each player first appears: `⚽ Sartori 6′ 45′ 90′`, with
"pen" after a penalty's minute; a red card shows a small red card, and a second yellow shows as a red card with
"2nd yellow". Yellow cards are left out here: they stay on the pitch (the card above the player) and in Key events.
Up to what the pitch is showing; the line that just changed rises in. Phones show the icons and minutes only.

### 2.2 The 3D pitch and the story

The pitch is specified in [`pitch.md`](pitch.md), its match events (cards above players, set-piece marks, the event
ticker, the goal celebration) in §5 there. Over it: the story caption, story chips (Auto, Territory, Team shape, Pass
network), the camera (Wide, Close, Top) and the Events switch. Auto lets the story director choose; a chip pins a
story. The caption is light glass (45 %) and folds to a one-line pill (`Territory · Territory tide 61%`) 5 s after
each new story, so the field stays visible; hovering, focusing or tapping it opens it again. On phones it sits under
the pitch and stays open. In the attack story the folded pill keeps a **mini flank bar**: three small lanes (L, C, R
as the team faces the goal), each filled to its share of the attack, the main lane in the focus blue; the open card
shows the full flank strip (share, shots and xG per lane).

With a **favourite club** (§3) the story director follows that club (`directStory(…, preferred)`,
`lib/live/story.ts`): only its goals start a team-shape story and only its attacks start an attack story, and a
pinned Team shape or Pass network is about it. Territory still shows both teams.

### 2.3 The AI moment card

When a card is due (`realtime.md` §4) it rises over the pitch for its duration, as light glass and compact so the play
shows through. In the visual kit's style (24 Oct): the minute and "AI moment", the badge (**Numbers verified** only
when the fact-checker passed every number; **Template · checked** for template lines), the sentence in the viewer's
mode and language with its **key number** picked out in the focus blue and repeated big beside it, and a small **chart
chip** naming the chart it points to; the chip opens that chart's analysis tab below. The key number is found in the
sentence (`keyNumber`, `lib/live/insights.ts`); it is never computed by the screen. The player the card is about gets
a ring on the pitch.

### 2.4 Replay controls

Over the pitch for replays: play / pause, 1× · 5× · 20×, a progress line and restart.

### 2.5 Analytics

**From `PLAN_web_football-revamp` S3** the analytics are five tabs, each answering one football question, with a
team toggle on the per-team visuals (no dropdowns). **My-club mode (S7):** with a favourite club of this match, the
per-team visuals (shot map, attack by flank, pass network, pass map, pressing zones, the tracking heatmap and the
player table) show that club only, and a **Your club · NBR** badge takes the team toggle's place. The comparisons
keep both teams: the xG race, momentum, zone dominance, and the side-by-side Team stats card, where the club is
picked out (named "your club" above the bars, the opponent's bars faded).

| Tab | The question | Visuals ([`charts.md`](charts.md)) |
|---|---|---|
| **Story** | What happened | Momentum (§2), key events (§8) |
| **Attack** | Who created more | xG race (§11), shot map sized by xG (§4), attack by flank (§12) |
| **Possession** | How they moved the ball | Pass network (§7), zone dominance (§12), pass map (§6) |
| **Defence** | Where they pressed | Pressing zones with the press line (§9), team stats (§3) |
| **Players** | Who did the work | Tracking heatmap (§10), the match player table | A card in the feed opens the chart it refers to
(`visual.component`) and highlights its event; a heatmap card opens the Players tab.

### 2.6 Tracking heatmap

`components/match/TrackingHeatPanel.tsx`, a card under the pitch ([`charts.md`](charts.md) §10): a home/away switch
(the Your club badge in my-club mode, §2.5),
a player picker (whole team or one player) and a period picker (all observed, either half, either half of extra time);
the heatmap with its legend; beside it on desktop the position samples and players observed, and "Defend → Attack".
A footer says it is built only from the tracking this page has received.

### 2.7 Live numbers rail

`components/match/LiveRail.tsx`, in the side column under the viewer bar: both teams' xG as big mono numbers with
their shots, a mini xG race from `heavy.shots` (goals as dots), and split bars for possession, shots on target, pass
accuracy, momentum share, PPDA and press height (the last three over 10 minutes). The side that leads a row is
brighter; for PPDA, lower leads. It updates with every stat panel (once a match second) and shows "–" for values
sent as null. Last, **Attack by flank** for both teams (S7): each lane's share (left, mid, right as each team faces
the goal it attacks) of the team's final-third actions over the last 6 minutes (`flankShares`, `lib/live/story.ts`),
counted at the picture's playhead, the main lane tinted in the team's colour; "–" while a team has fewer than 4 such
actions.

## 3. Your match (preferences)

`components/match/ViewerBar.tsx`, kept by `providers/PreferencesProvider.tsx` in this browser:

- **Mode:** Casual, Analyst, My club, Player focus.
- **Language:** English, Español, हिन्दी, Français.
- **Club** (picking one switches to My club) and **Follow** (picking a player switches to Player focus).

The three pickers are the site's own dropdown (`components/ui/Select.tsx`, S7), never the browser's list: a button
showing the choice and a themed list (dark and light), Follow's players grouped under their club. It is an ARIA
select-only combobox: ↓/↑ open and move, Home/End and Page Up/Down jump, Enter or Space choose, Escape and Tab close,
typing letters jumps to the next option that starts with them, and a click outside closes. The list stays within the
screen at phone width (Follow's opens towards the left edge). `globals.css` sets `color-scheme` on form controls as a
fallback for any native control left.

Changing any of them switches the AI cards to that audience at once. Club or player modes without a club or player of
this match fall back to casual, and the bar says so.

### 3.2 Player focus

`PlayerFocus.tsx`, when a player is followed: distance, top speed and sprints (stats engine, from tracking), passes and
accuracy, shots and goals, take-ons won. The player gets a ring and a name tag on the pitch, and the heatmap and pass
map switch to them.

## 4. AI feed

`AiFeed.tsx`: every card the audience received, newest first, with its minute, priority dot, badge and a link to its
chart; the full-time recap on top when it arrives (in a replay, at full time); the publisher's player tags. Empty
state: the agents are watching, and what makes a card.

## 5. Matches `/matches`

Every archived match, live first: clubs, score, clock or Full time, and Watch live / Watch replay / Recap.

## 6. Recap `/match/<id>/recap`

The final score, the agents' recap and every moment of the match on a timeline, in the viewer's mode (casual or
analyst) and language, from the insights history (`realtime.md` §4).

## 7. How it works `/how-it-works`

The pipeline in six steps, the seven agents, and what each pitch story means.

## 8. League `/league` (revamp S4, built)

From `GET /api/season/<id>` (`realtime.md` §7). Every number is from the season document.
- **Table:** position, played, won, drawn, lost, goals, goal difference, points, form, and **expected points** next
  to points with the gap ("deserved table"). The reference clubs are in the table without a link.
- **Title race:** points by matchweek for every club, the leader's line strongest.
- **Style map:** every club as a dot on press height (across) against pressing rate (up), in its colours: who presses
  high, who sits deep.
- **Leaders:** goals, npxG, assists, key passes, with links to the player pages.

## 9. Club `/club/<teamId>` (revamp S4)

From `GET /api/season/<id>/team/<teamId>`.
- **Header:** crest colours, name, formation, table line and form.
- **Club DNA:** each designed style dial beside the measured season value that follows it, with both ranks among the
  10 clubs. A dial is called "read from the data" only where `dna_correlations` is 0.6 or more; the others say the
  measure doesn't track it yet.
- **Where they press:** the season pressing grid. **Where they play:** touch zones.
- **Chances:** shots for and against on two half-pitches sized by xG, with xG for and against per match.
- **When goals come:** goals for and against by 15-minute bucket.
- **Squad:** players by minutes, with position, role, goals, assists and npxG, linking to their pages.

## 10. Player `/player/<playerId>` (revamp S5)

From `GET /api/season/<id>/player/<playerId>`.
- **Scout card:** name, club, position, role, foot (and weak-foot quality), overall, and the twelve attributes on a
  1–100 scale, grouped as physical (pace, acceleration, stamina), technical (passing, dribbling, finishing,
  tackling, aerial), mental (vision, positioning, composure) and goalkeeping.
- **Output:** minutes, appearances and starts. The group's radar with percentiles, and a bar per value with the
  player's per 90 against the group median.
  - **Under 450 minutes:** the percentiles are replaced by "not enough minutes yet".
- **Maps:** season shots sized by xG, touch zones, defensive-action zones.
- **Designed against measured:** an attribute beside its output where they pair up (finishing ↔ goals − npxG,
  passing ↔ pass completion, dribbling ↔ take-on success).
- **Compare** opens §11 with this player on the left.

## 11. Compare `/compare?a=<playerId>&b=<playerId>` (revamp S5)

Two players of any group side by side: scout cards, both on one radar (the first player's group), per 90 bars and
percentiles. The picker lists the first player's peers.
