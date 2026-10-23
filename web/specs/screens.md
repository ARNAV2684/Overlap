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

Competition and venue, match id, Live / Replay / Full time badge, the clock in big mono with the half, both clubs with
kit crests, and the score, which flashes on a goal. Under each team, its **score sheet**: scorers (⚽ name minute, with
"pen" for penalties) and cards (a small yellow or red card, "2nd yellow" for a second booking), in match order up to
what the pitch is showing; the newest rises in. Phones show the icons and minutes only.

### 2.2 The 3D pitch and the story

The pitch is specified in [`pitch.md`](pitch.md), its match events (cards above players, set-piece marks, the event
ticker, the goal celebration) in §5 there. Over it: the story caption, story chips (Auto, Territory, Team shape, Pass
network), the camera (Wide, Close, Top) and the Events switch. Auto lets the story director choose; a chip pins a
story. The caption is light glass (45 %) and folds to a one-line pill (`Territory · Territory tide 61%`) 5 s after
each new story, so the field stays visible; hovering, focusing or tapping it opens it again. On phones it sits under
the pitch and stays open.

### 2.3 The AI moment card

When a card is due (`realtime.md` §4) it rises over the pitch for its duration, as light glass (50 %) and compact so the
play shows through: the minute, "AI moment", the badge
(**Numbers verified** only when the fact-checker passed every number; **Template · checked** for template lines), the
chart it points to, and the text in the viewer's mode and language. The player the card is about gets a ring on the
pitch.

### 2.4 Replay controls

Over the pitch for replays: play / pause, 1× · 5× · 20×, a progress line and restart.

### 2.5 Analytics

**From `PLAN_web_football-revamp` S3** the analytics are five tabs, each answering one football question, with a
team toggle on the per-team visuals (no dropdowns):

| Tab | The question | Visuals ([`charts.md`](charts.md)) |
|---|---|---|
| **Story** | What happened | Momentum (§2), key events (§8) |
| **Attack** | Who created more | xG race (§11), shot map sized by xG (§4), attack by flank (§12) |
| **Possession** | How they moved the ball | Pass network (§7), zone dominance (§12), pass map (§6) |
| **Defence** | Where they pressed | Pressing zones with the press line (§9), team stats (§3) |
| **Players** | Who did the work | Tracking heatmap (§10), the match player table | A card in the feed opens the chart it refers to
(`visual.component`) and highlights its event; a heatmap card opens the Players tab.

### 2.6 Tracking heatmap

`components/match/TrackingHeatPanel.tsx`, a card under the pitch ([`charts.md`](charts.md) §10): a home/away switch,
a player picker (whole team or one player) and a period picker (all observed, either half, either half of extra time);
the heatmap with its legend; beside it on desktop the position samples and players observed, and "Defend → Attack".
A footer says it is built only from the tracking this page has received.

## 3. Your match (preferences)

`components/match/ViewerBar.tsx`, kept by `providers/PreferencesProvider.tsx` in this browser:

- **Mode:** Casual, Analyst, My club, Player focus.
- **Language:** English, Español, हिन्दी, Français.
- **Club** (picking one switches to My club) and **Follow** (picking a player switches to Player focus).

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
