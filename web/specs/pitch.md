# The 3D pitch

> **Status: agreed.** Owners Arnav and Azeem; merged for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md) and extended for
> [`PLAN_web_football-revamp`](../../plans/active/PLAN_web_football-revamp.md) (agreed by Azeem, 23 Oct 2026).

Owners: Arnav, Azeem. Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). Built in
`src/components/pitch3d/` (three.js 0.186, no other 3D library, no image or model files) and `src/lib/live/`.

## 1. The stage

`scene/stage.ts` owns the renderer, lights, camera and objects, and is driven imperatively every animation frame; React
never sees positions.

- **Grass and markings** (`scene/pitch.ts`): generated on canvases at 24 px per metre: 20 mowing stripes, soft clumps,
  per-pixel blade noise (also used as a bump map), a corner vignette; the markings drawn in metres on a second
  transparent layer, with flatter bumps and worn patches in front of each goal mouth. A darker apron, advertising
  boards with an accent strip, the stadium floor and four slim floodlight masts at the corners (no stands or crowd).
- **Goals:** round white posts and crossbar with rounded joints, grey back stanchions and ground bars, and a net of
  real cords (a sagging grid over the roof, back and sides) with a faint fill behind it. On a goal the net bulges with
  a ripple and lights up.
- **Light:** a floodlit night: sky/ground hemisphere light, a warm key light with shadows, two rim lights, ACES tone
  mapping.
- **Cameras:** Wide (56° above the near touchline), Close (follows the ball like a TV camera, kept inside the pitch)
  and Top (82°). Wide and Top are fitted on every resize: the distance is found by bisection so the whole pitch plus a
  margin fits, then the target is moved so the near and far touchlines have equal room. Wide drifts a few metres with
  the ball.
- **World axes:** X east (pitch x × 1.05 − 52.5), Z south (pitch y × 0.68 − 34), Y up.

### 1.2 Players and ball

`scene/figure.ts`: a stylised footballer (a shaped torso with shirt panels, trim and the number on the back, head with
nose and hair, neck, arms, hands, shorts, bare thighs, socks with cuffs, rounded boots in a colour), scaled ×2.4 so
players read at full-pitch distance, with a soft contact shadow under each. Kits come from the
setup (shirt and socks in the primary colour, shorts in the secondary); goalkeepers get a contrasting kit; skin and
hair vary by player. A ring at the feet in the team's overlay colour, and an accent ring for a highlighted player.
Animation: the figure turns towards where it moves (towards the ball when standing); a run cycle that steps by the
ground the figure covers on screen (`renderedTravel` in `motion.ts`, so it matches the drawn movement at any speed),
capped at 3.6 steps a second so 20× never strobes; lean, arm swing, knee bend and bob come from the tracked speed;
standing players breathe. The ball is described in §6.

**Watch / Analyse** (the switch above the pitch, Analyse by default): Watch is the clean pitch, without the story
director's overlays (tint, block, lines, links, lane, markers) and its caption and chips; match events, cards, labels
and the ball's trail still show. Analyse adds the story.

Labels (`PitchStage.tsx`, HTML projected from 3D): a **speed tag** when a player passes 31 km/h (name, shirt and the
peak speed of the burst; at most two at once, 14 s cooldown per player), the followed player's name, and the line
markers of the shape story.

## 2. Smooth motion

`lib/live/motion.ts`. Tracking arrives at 5 Hz in bundles of about one match second, so ~20 bundles a second at 20×.
The playhead runs `LAG_WALL_MS` (450 ms of wall time) behind the newest frame and advances at a rate learned from
arrivals, so 1×, 5×, 20×, replay and live all play smoothly without being told the speed. Positions are interpolated
between the two frames around the playhead; periods never blend. When frames stop (pause, end, dropped connection)
the playhead plays on to the newest frame and stops. A frame far behind the newest means a restart: start again.

## 3. Match memory

`lib/live/match-memory.ts`, fed by `store.onEnvelope` (every applied envelope, before the display flush): every
event (deduped by id), the goals, the newest and newest heavy stat panel, and once a match second: the ball, each
team's shape (mean depth, defensive line = mean of the four deepest outfield players, width, length; metres from its
own goal) and per-player heat. A new pre-match status (a replay restart) clears the play and keeps the setup.

## 4. The story director

`lib/live/story.ts`, re-run twice a second; a new story replaces the current one after it holds for 1.5 s and the
current one has been up 4.5 s, except a goal, which switches at once.

| Story | When (Auto) | On the pitch | Caption |
|---|---|---|---|
| **Team shape** (protect) | Within 5 match minutes of a goal, same half | The scoring team's formation lines linked back to front (each line left to right, each player to the nearest in the next line), a tint over its block, the defensive line now (solid) and before the goal (dashed) | "X drop deeper / push up / hold their shape", the line's change in metres from the 3 minutes before the goal to the last 45 s |
| **Pass network** (attack) | A team has the ball in its final third ≥ 45 % of the last 25 s, or ≥ 66 % momentum share with possession | The stats engine's passing links (≥ 3 completed passes) drawn between the players' live positions, thicker for more; rings sized by passes; an animated chevron band down the lane it attacks | "X attack down the left/centre/right", the lane's share of the team's final-third actions in the last 6 minutes |
| **Territory** | Otherwise | Both teams' colours meeting at a wavy front, where the ball has lived (exponentially weighted over 3 minutes) | Each team's share of time with the ball in the other's half |

Every number shown is computed from tracking, events or the stat panel; nothing is invented.

**Calm palette (24 Oct):** the team shape and pass network lines, rings, block tint and lane band are drawn in the
visual kit's blue (`--color-viz-focus`, `#3b8ef0`) at reduced strength, and the pass network shows its 24 strongest
links only; the caption names the team. The territory tide keeps both teams' colours, faint at all times (opacity 0.1)
and fuller (0.36) only while territory is the story.

## 5. Match events on the field

Built 24 Oct (`lib/live/match-events.ts`, `components/pitch3d/scene/effects.ts`, `PitchStage.tsx`). This is the visual
layer of what happens in the match; the agents' commentary is separate (`realtime.md` §4).

- **Which events:** goals (a `Shot` with `goal`), cards (`Card`: yellow, second yellow, red), corners (`Corner`),
  throw-ins, free kicks and goal kicks (the restart `Pass` carries `throw_in`, `free_kick` or `goal_kick` in its
  qualifiers), offsides (`Offside`) and fouls (`Foul`). The match memory keeps them as field events in arrival order.
- **When they fire:** once, when the smooth playhead crosses the event's `match_ms` between two frames, so they stay
  in sync with the picture at any speed or frame rate. A page that drew no frame for 3 s, a catch-up snapshot (only the
  last 15 match seconds count on the first frame) and a replay that jumps back never fire a backlog.
- **Cards above players:** from the cards up to the playhead, each booked player carries a small card (1.0 × 1.38 m)
  above their head, always facing the camera: it pops in big and bouncing, then rides along small. Yellow stays for
  the match; a red (or second yellow) shows until the player leaves the pitch. A booked player's name or speed tag
  sits above the card.
- **Marks and labels:** corners and throw-ins pulse a ring at the spot in the team colour; free kicks, fouls and cards
  a white or card-coloured ring; offsides flash a line across the pitch at the attacker's position; goal kicks light up
  the six-yard box. Each gets a short label at the spot (2.2 s).
- **Event ticker:** one quiet line at the top of the pitch for 3.2 s, for example `41′ Corner · Calverholme Athletic`,
  `19′ Yellow card · Vik`. The **Events** chip turns marks, labels and the ticker off (goals and cards always show).
- **Goal celebration (2.9 s):** the camera pushes quickly towards the goal and back; confetti in the scoring team's
  colours bursts from the goal mouth; the net bulges and lights up; **GOAL** sweeps across the pitch in the team's
  colours with a shine, with the scorer, minute and new score. Under reduced motion the camera and confetti are
  skipped.

## 6. The ball in 3D

`lib/live/ball-flight.ts` (pure), drawn by `scene/stage.ts`. Only what the data contains is drawn in the air: real
tracked heights and shot events; nothing is invented.

- **Tracked ball:** a smooth Catmull-Rom path through the 5 Hz tracked ball, heights included (tracking carries real
  heights for lofted balls, up to about 10 m), never below the grass and flat when both frames are on the ground. A
  jump over 18 m between two frames (a kick-off after a goal, a restart) is a reset: the ball holds, then appears at the
  new spot, instead of flying across the pitch. Periods never blend; a replay that jumps back starts again.
- **Shots:** tracking draws a shot flat in one or two frames, so a shot is flown from its event instead: from the
  shooter (head height for a header) to the exact point it crossed the goal line (`goal_mouth_y` across the mouth,
  `goal_mouth_z` in metres), at `shot_speed_kmh`, with a lift that grows with distance and height. It ends by its
  outcome: a goal goes on into the net and rests there until the kick-off; a miss carries on past the line; a save
  drops at the keeper; a blocked shot stops a few metres out and is knocked aside; a shot off the woodwork comes back
  into play. A shot fires like the other events (when the playhead crosses it, never as a backlog).
- **Trail:** a short fading trail while the ball is in the air: in the shot map's outcome colour for a shot, white for
  a lofted ball (above 0.8 m).
- **Spin and shadow:** the ball rolls about the axis across its travel by the distance it covers (a reset is not
  rolled). Its shadow stays on the grass and grows and fades as it climbs.
