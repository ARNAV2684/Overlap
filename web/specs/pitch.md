# The 3D pitch

Owners: Arnav, Azeem. Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). Built in
`src/components/pitch3d/` (three.js 0.186, no other 3D library, no image or model files) and `src/lib/live/`.

## 1. The stage

`scene/stage.ts` owns the renderer, lights, camera and objects, and is driven imperatively every animation frame; React
never sees positions.

- **Grass and markings** (`scene/pitch.ts`): generated on canvases at 24 px per metre: 20 mowing stripes, soft clumps,
  per-pixel blade noise (also used as a bump map), a corner vignette; the markings drawn in metres on a second
  transparent layer. A darker apron, advertising boards with an accent strip, goals with nets, the stadium floor.
- **Light:** a floodlit night: sky/ground hemisphere light, a warm key light with shadows, two rim lights, ACES tone
  mapping.
- **Cameras:** Wide (46° above the near touchline), Close (follows the ball like a TV camera, kept inside the pitch)
  and Top (82°). Wide and Top are fitted on every resize: the distance is found by bisection so the whole pitch plus a
  margin fits, then the target is moved so the near and far touchlines have equal room. Wide drifts a few metres with
  the ball.
- **World axes:** X east (pitch x × 1.05 − 52.5), Z south (pitch y × 0.68 − 34), Y up.

### 1.2 Players and ball

`scene/figure.ts`: a stylised footballer from capsules and spheres (head, hair, neck, torso with the shirt number on the
back, arms, hands, shorts, legs, socks, boots), scaled ×1.8 so players read at full-pitch distance. Kits come from the
setup (shirt and socks in the primary colour, shorts in the secondary); goalkeepers get a contrasting kit; skin and
hair vary by player. A ring at the feet in the team's overlay colour, and an accent ring for a highlighted player.
Animation: the figure turns towards where it moves (towards the ball when standing); a run cycle whose stride follows
rendered ground travel, with stride length derived from movement speed, with lean, arm swing, knee bend and
bob; standing players breathe. The ball rotates with its rendered travel and rises with its tracked height.

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

## 5. Broadcast presentation (proposed for shared review)

Watch mode hides tactical surface overlays and their captions but retains camera selection and insight cards.
Analyse mode restores the existing story overlays. Mode changes do not restart the match. Procedural stadium tiers,
batched spectators, floodlight fixtures and visible netting supply context without real branding or external assets.
Lighting remains one shadow-casting key plus fill/rim lights. Positions and motion still come from tracking unchanged.

Player and turf presentation: scale reduced to 1.8; tapered shirts, exposed thighs/knees, boot and sock trim, soft contact shadows and toned-down identity rings. Turf has finer noise and subtle goalmouth wear. These are presentation details only, not simulated tackles or changes to recorded positions.

### Synchronized presentation timing
Ball and player translations retain the same interpolated tracking timestamp. The playhead cannot move backwards during ordinary rate correction. Gait phase advances by rendered ground distance and its stride length grows with movement speed; ball rotation follows its rendered displacement/radius. No extra position smoothing or fabricated possession attachment is applied. On pause, reset or period transition, no travel is accumulated. The close camera uses a shared exponential response for position and target, accelerated for fast playback. 20× remains accelerated footage; use 1× to judge lifelike pace. This procedural animation does not reproduce exact foot contacts or infer missing source tracking.
