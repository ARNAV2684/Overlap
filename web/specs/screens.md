# Screens

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
one column; the story chips and caption move under the pitch.

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

Tabs under the pitch, specified in [`charts.md`](charts.md): Momentum, Team stats, Shot map, Pass network, Pressing,
Heatmap, Pass map, Key events. Per-team charts have a home/away switch. A card in the feed opens the chart it refers
to (`visual.component`) and highlights its event.

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
