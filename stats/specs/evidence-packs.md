# Evidence packs spec

> **Status: agreed.** Agreed in the spec PR for [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (M1).
> The pack's shape is `CONTRACTS.md` §5. The shot-cluster pack is `CONTRACTS.md` §10.1 unchanged.

Decides exactly which facts go into each moment's evidence pack.

A pack holds only facts computed from the event prefix that fired the trigger (`triggers.md`). A fact whose value is
missing or below its minimum sample (`metrics.md` §7) is **left out**, never sent as zero. Keys are unique within a
pack.

## 1. Facts per trigger

- For each trigger, which fact keys are included (with units and decimals)?

_Answer:_

"Team" is the moment's `team_id`. "Shot" is the triggering shot. Units follow §2. Every pack also has `window`,
`event_ids` and `player_ids` (`CONTRACTS.md` §5).

| Trigger | Facts (key · unit · decimals) | `window`, `event_ids` |
|---|---|---|
| `shot_cluster` | `shots_last_5min` · — · 0; `window_duration_min` · min · 0 | §10.1 exactly: the 5-minute window; all counted shots, ascending `seq` |
| `goal` | `shot_xg` · xG · 2; `shot_distance_m` · m · 0; `team_goals_match` · — · 0; `opponent_goals_match` · — · 0; `player_goals_match` · — · 0; `team_shots_match` · — · 0; plus `shot_is_penalty` (1 or 0) · — · 0 | From the shot's possession start to the shot; the possession's passes and the shot |
| `penalty` | `shot_xg` (0.78) · xG · 2; `team_goals_match` · — · 0; `opponent_goals_match` · — · 0 | The foul that gave the penalty, if present, and the shot |
| `big_chance` | `shot_xg` · xG · 2; `shot_distance_m` · m · 0; `team_shots_match` · — · 0; `team_xg_match` · xG · 2 | From the possession start to the shot |
| `red_card` | `team_players_on_pitch` · — · 0; `team_fouls_match` · — · 0; `team_cards_match` · — · 0 | The card and the foul it followed |
| `momentum_swing` | `momentum_share_last_5min_pct` · % · 0; `momentum_share_previous_10min_pct` · % · 0; `team_shots_last_5min` · — · 0; `window_duration_min` (5) · min · 0 | The last 5 minutes; the team's weighted actions in it |
| `press_change` | `pressures_per_opp_pass_last_5min` · — · 2; `pressures_per_opp_pass_previous_10min` · — · 2; `team_pressures_last_5min` · — · 0; `team_high_regains_last_5min` · — · 0; `window_duration_min` (5) · min · 0; plus `press_height_last_5min_m` · m · 0 when its sample allows | The last 5 minutes; the team's pressures in it (at most 20, the latest) |
| `sprint` | `player_top_speed_kmh` · km/h · 1; `player_sprints_match` · — · 0; `player_distance_km` · km · 2 | The 10 seconds before the frame; no events required |
| `milestone` | `player_goals_match` (2 or 3) · — · 0; `shot_xg` · xG · 2 | The goal |

**Rules:**
- A `goal` pack never claims a score that isn't a fact: the narrator may state "2–1" only from `team_goals_match`
  and `opponent_goals_match`.
- `shot_is_penalty` is a number (1 or 0) so the checker can verify it. Words like "from the spot" are
  checked against it.
- `press_change` carries its `direction` in the label (`higher` or `deeper`). The two rate facts let the narrator
  say how much it changed.

## 2. Naming

- Confirm the key naming rule (window and unit in the name) and list every key in use.

_Answer:_

**Rule** (`CONTRACTS.md` §5): snake_case `<subject>_<metric>_<window>_<unit>`. The window and unit parts are omitted
when not needed.

| Part | Values |
|---|---|
| Subject | `team_` (the moment's team), `opponent_`, `player_` (the moment's first player), `shot_` (the triggering shot); no prefix for the window itself |
| Window | `_last_5min`, `_previous_10min` (the 10 minutes before the last 5), `_match` (so far), `_since_<n>min` (from minute `n`) |
| Unit | `_pct`, `_m`, `_kmh`, `_km`, `_min`; counts and ratios have none; xG has none (the unit field says `xG`) |

**Every key in use:**

| Group | Keys |
|---|---|
| Shot | `shot_xg`, `shot_distance_m`, `shot_is_penalty` |
| Team, whole match | `team_goals_match`, `opponent_goals_match`, `team_shots_match`, `team_xg_match`, `team_fouls_match`, `team_cards_match`, `team_players_on_pitch` |
| Team, recent | `team_shots_last_5min`, `team_pressures_last_5min`, `team_high_regains_last_5min` |
| Windows and comparisons | `shots_last_5min`, `window_duration_min`, `momentum_share_last_5min_pct`, `momentum_share_previous_10min_pct`, `pressures_per_opp_pass_last_5min`, `pressures_per_opp_pass_previous_10min`, `press_height_last_5min_m` |
| Player | `player_goals_match`, `player_top_speed_kmh`, `player_sprints_match`, `player_distance_km` |

Labels are plain sentences that name the team or player, like the examples in `CONTRACTS.md` §5. They are for people
and the narrator, never parsed.

## 3. Context

- Which player and team context is attached (names, positions, season milestones)?

_Answer:_

The moment document's `context` (`CONTRACTS.md` §10.2) is captured at the same event prefix as the evidence:
`phase`, `score {home, away}` up to `source.event_seq`, and `teams {home, away: {team_id, name}}` from the setup.

It gains one field, **`players`**: for each id in `player_ids`, `{player_id, name, pos}` from the setup (for a
substitute: the bench entry). Names then come from data, not from the model. Like the rest of `context`, `players`
is **not citable**: positions and names are words, and numbers still come only from `facts`.

**Season milestones** (a player's 10th goal of the season, a club's run) are **deferred**. They need season state
that no component keeps yet (the Cosmos `season` loader has no owner). The `milestone` trigger is in-match only for
now.
