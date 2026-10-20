# Moment triggers spec

> **Status: agreed.** Agreed in the spec PR for [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (M1).
> The shot-cluster rule is `CONTRACTS.md` §10.1 unchanged.

Decides when a moment is flagged for the agents.

Triggers run on the contiguous, de-duplicated event prefix of a match in `seq` order (`CONTRACTS.md` §10.1 step 1).
They use only §3 events, §4 frames and the metrics in [`metrics.md`](metrics.md). Each fired trigger becomes one
moment document (`publishing.md` §3) with its evidence pack (`evidence-packs.md`).

## 1. Trigger rules

- Exact rule and threshold for each trigger (goal, red card, penalty, big chance, shot cluster, momentum swing, press change, sprint, milestone).

_Answer:_

`t` is the triggering event's `match_ms`. "Team" is the team the moment is about.

| Trigger | Fires on | Rule | Cooldown |
|---|---|---|---|
| `goal` | `Shot` with `shot_outcome = goal` | Every goal | None |
| `red_card` | `Card` with `card = red` or `second_yellow` | Every sending-off; the team is the carded player's | None |
| `penalty` | `Shot` with `situation = penalty` that is not a goal | Every missed or saved penalty (a scored one is a `goal`, with a penalty fact) | None |
| `big_chance` | Non-penalty `Shot` that is not a goal | Its xG ≥ 0.20 | None |
| `shot_cluster` | `Shot` | `CONTRACTS.md` §10.1 exactly: 3 or more of the team's shots with `t − 5 min < match_ms ≤ t` in the same period; needs `period_ms ≥ 5 min` | 5 min per team per period, reset each period |
| `momentum_swing` | Any event | The team's momentum share rose by ≥ 25 points (recent 5 min vs the 10 before, `windows.md` §2) **and** is now ≥ 60 %, with ≥ 6 weighted points in the recent window; needs `period_ms ≥ 15 min` | 10 min per team per period |
| `press_change` | Any `Pressure`, `Tackle`, `Interception`, `Foul` or `BallRecovery` of the team | The team's pressing rate (pressures per opponent pass, `metrics.md` §4) is ≥ 1.5 × the baseline (`higher`) or ≤ 1 ÷ 1.5 of it (`deeper`), with ≥ 20 opponent passes in the recent window and ≥ 40 in the baseline; needs `period_ms ≥ 15 min` | 10 min per team per period |
| `sprint` | A tracking frame | **Deferred (stats S3, D-01): not fired yet.** When built: a player reaches ≥ 34.0 km/h, the highest speed in the match so far, after the 10th minute | 15 min per match |
| `milestone` | `Shot` with `shot_outcome = goal` | The scorer's 2nd or 3rd goal of the match | None |

**Notes:**
- **Direction.** `press_change` has a `direction`: `higher` (pressing more) or `deeper` (pressing less). It is named
  in the evidence label (`evidence-packs.md`). Press height and PPDA were tried first, on 90 generated matches. Press
  height alone fired at almost every cooldown, because it follows where play is, not pressing intent. Requiring
  both press height and PPDA almost never fired, because the two often disagree (`metrics.md` §4). Only a team's own rise counts for
  `momentum_swing`. The other team's fall shows up as this team's rise only if this team clears 60 %.
- **No look-ahead.** A trigger never uses an event after the one it fires on. `sprint` uses frames up to its frame.
- **Replays without tracking** don't fire `sprint`. Until it is built (stats S3, D-01) no run fires it.
- **Warm-ups** match the windows: no comparison trigger fires in the first 15 minutes of a period, and no shot cluster
  in the first 5. A 10-minute warm-up was tried and rejected: the first minutes after half-time look like swings, and
  matches without a storyline then fired as often as matches with one.
- **How well a storyline is caught.** Measured on 20 generated Wexmoor v Kestlebury matches with `late_pressure_surge`
  on Wexmoor, against the same 20 seeds without it:
  - **Within 10 minutes of onset** (the storyline's `detect_within_min`): `momentum_swing` or `press_change` fires for
    Wexmoor in 7 of 20 matches, against 2 of 20 without the storyline.
  - **Within 15 minutes:** 15 of 20, against 9 of 20.
  - **Built engine (stats S3, `replay --moments`):** 7 of 20 against 2 of 20 within 10 minutes; 15 of 20 against 10 of
    20 within 15 minutes (11 by `press_change`, 4 by `momentum_swing`; first one 3–14 minutes after onset). Plan AC-09
    (≥ 70 % and clearly more than the controls) passes. Half the controls also fire within 15 minutes of the same
    minute, because pressing and momentum change in ordinary matches too.

  The surge raises pressing by about 1.3–1.4×. A 5-minute window holds about 25 opponent passes, so the measure is
  only good to about ±15 %, and a lower threshold catches more surges but fires as often without them (1.35×: 18 of 20
  against 12 of 20).

## 2. Volume

- How many moments per match are we aiming for (about 30–60)?
- How are duplicate or overlapping triggers merged?

_Answer:_

- **Target: 15–35 moments per match**, which the spotter agent filters further. Measured with these rules on the 90
  matches of generated league season S1 (events only, so no sprints): **19.9 a match** (10–34). By type: goal 2.86,
  shot cluster 2.59, big chance 1.61, momentum swing 5.66, press change 6.07, milestone 0.57, red card 0.49,
  penalty 0.06. With tracking, sprints add about 1. The test is that a league season averages within the target
  (plan AC-10).
- **Built engine (stats S3, `replay --moments` on season S1):** **19.7 a match**, median 19.5, range 10–33; 73 of 90
  matches fall inside 15–35 and none above. By type: press change 6.04, momentum swing 5.52, goal 2.86, shot cluster
  2.59, big chance 1.61, milestone 0.57, red card 0.49, penalty 0.06. AC-10 passes.
- **No merging across trigger types.** A goal that is also a cluster's third shot gives two moments, `goal` and
  `shot_cluster`. That keeps each trigger's identity stable (`CONTRACTS.md` §10.1 step 5) and leaves the choice of
  what to say to the spotter.
- **Repeats of one type** are limited by the cooldowns above. Within a cooldown a qualifying event is ignored, not
  queued.
- **Identity:** a moment's logical identity is `(match_id, trigger, period, team_id, triggering event_id)`. For
  `sprint` the triggering frame's `match_ms` is used, plus the player.

## 3. Priority

- How is a trigger's priority set before the spotter sees it?

_Answer:_

Priority is fixed by trigger type and **not stored** in the moment document, so §10.2's document shape stays as it
is. The spotter and director look it up by `trigger`:

| Priority | Triggers |
|---|---|
| `high` | `goal`, `red_card`, `penalty` |
| `normal` | `big_chance`, `shot_cluster`, `momentum_swing`, `press_change`, `milestone` |
| `low` | `sprint` |

Within one priority, the newer moment comes first.
