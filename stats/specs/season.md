# Season spec

> **Status: agreed** (Azeem, 23 Oct 2026, for [`PLAN_web_football-revamp`](../../plans/active/PLAN_web_football-revamp.md)).
> Governs `stats/season.py` and the season document in [`CONTRACTS.md`](../../CONTRACTS.md) §11.

Decides every number on the league, club and player pages. The season is built from a finished season run of the
generator (`data/seasons/<run>/`). Each match goes through the same pipeline as a live match (`main.play`), so a
season total is the sum of what viewers saw during the matches. Only matches that reached full time count.

```bash
python main.py season ../data/seasons/S1 --world ../data/generated/world/S1.json --out ../web/data/season/season-S1.json
```

The same run and world give the same bytes (`tests/test_season.py`).

## 1. Matches

- **Per match:** `score`, team `xg` (the engine's xG, `metrics.md` §1, summed over the shots), `win_probability` and
  `xpts`.
- **Win, draw and loss probabilities:** each team's goal count is treated as the sum of independent shots, each
  scoring with its xG. The exact distribution is computed (Poisson-binomial), and P(win) is the chance one team
  scores more than the other.
- **Expected points:** `xpts = 3 × P(win) + P(draw)`. A team's season `xpts` is the sum; `xpts_position` ranks it.
  This is the "deserved table".
- **Limit:** shots are not independent in reality (a rebound follows a save). The model ignores that, as most public
  expected-points tables do.

## 2. Table

- **Points:** 3 for a win, 1 for a draw.
- **Order:** points, then goal difference, then goals for, then team id. This equals the generator's `table.json`
  (checked on S1).
- **Per team:** `position_by_matchweek` and `points_by_matchweek` (cumulative) for the title race, and `form` (the
  last five results, oldest first).

## 3. Team season values

Summed over the season, then computed once, with the stats engine's definitions (`metrics.md`). They are not
averages of per-match values.

| Key | Definition |
|---|---|
| `possession_pct` | The team's share of possession time |
| `pressures_per_opp_pass` | `Pressure` events ÷ opponent passes (`metrics.md` §4) |
| `ppda` | Opponent passes in their own 60 % ÷ our tackles, interceptions and fouls there (`metrics.md` §4) |
| `press_height_m` | Mean distance from our own goal of our defensive actions, in metres |
| `pass_completion_pct` | Completed ÷ attempted passes |
| `wide_touch_pct` | Share of touches in the left and right thirds of the pitch's width (zones channels 0 and 2) |
| `forward_pass_m` | Mean forward distance of completed passes that go forward, in metres |
| `passes_per_possession_min` | Passes ÷ minutes of possession |
| `counter_shot_pct` | Share of shots with `situation = counter` |
| `set_piece_shot_pct` | Share of shots from corners, free kicks and throw-ins |

Also kept:
- **Per-match averages** (`per_match`) of shots for and against, xG for and against, passes, pressures, high
  regains, fouls and yellow cards.
- **Grids:** the season pressing grid (9 × 6) and touch zones (3 × 6), in the team's frame.
- **Goal timing:** goals for and against by 15-minute bucket (0–15, 15–30, 30–45+, 45–60, 60–75, 75–90+, where
  stoppage time joins its half's last bucket).
- **Shots:** every shot for and against, with its xG, outcome and situation.

## 4. Players

- **Minutes:** from coming on to going off (substitution or red card), as `metrics.md` §6. Appearances and starts are
  also counted.
- **Totals:** goals, assists, shots, on target, xG, **npxG** (xG without penalties), key passes, passes, completed,
  progressive passes, take-ons and completed take-ons, tackles, interceptions, pressures, fouls and cards.
- **Per 90:** `90 × total ÷ minutes` for goals, npxG, shots, assists, key passes, passes, progressive passes,
  completed take-ons, tackles, interceptions, pressures and fouls.
- **Rates, with their minimum sample** (`null` below it):

  | Rate | Minimum sample |
  |---|---|
  | `pass_completion_pct` | 100 passes |
  | `take_on_success_pct` | 10 take-ons |
  | `shot_accuracy_pct` | 10 shots |
- **Position groups:** goalkeepers (GK), centre backs (CB), full backs (LB, RB, LWB, RWB), midfielders (DM, CM, AM,
  LM, RM) and attackers (LW, RW, ST), from the player's listed position.
- **Percentiles:**
  - **Who counts:** players with at least **450 minutes** in a group of at least 5 such players.
  - **Value:** the share of the group at or below the player's value, nearest rank, 0–100.
  - **Which values:** only those on the group's radar.

    | Group | Radar |
    |---|---|
    | Goalkeepers | passes, pass completion, progressive passes |
    | Centre backs | tackles, interceptions, pressures, passes, pass completion, progressive passes |
    | Full backs | tackles, interceptions, progressive passes, key passes, completed take-ons, pressures |
    | Midfielders | passes, pass completion, progressive passes, key passes, tackles, pressures, npxG |
    | Attackers | goals, npxG, shots, key passes, completed take-ons, pressures, assists |

  - **Below 450 minutes:** `percentiles` is `null` and `low_sample` is true. Pages say so and never show a guess.
- **Maps:** every shot (team frame, with xG), touch zones and defensive-action zones (tackles, interceptions,
  recoveries, pressures and clearances), 3 × 6 in the team's frame.
- **From the world** (when `--world` is given): role, preferred and weak foot, overall and all twelve attributes.
  Without it, the six attributes of the match setup.

## 5. Designed against measured

Each club's designed style dial (from the world) is shown next to the season value that should follow it, with both
ranks among the 10 clubs:

| Dial | Measured by |
|---|---|
| `press_intensity` | `pressures_per_opp_pass` |
| `press_height` | `press_height_m` |
| `width` | `wide_touch_pct` |
| `directness` | `forward_pass_m` |
| `tempo` | `passes_per_possession_min` |
| `counter_attack` | `counter_shot_pct` |
| `set_piece_focus` | `set_piece_shot_pct` |

`dna_correlations` gives the rank correlation (Spearman) of each pair across the clubs, so a page can say how well a
measure tracks the design. **On S1:**

| Dial | Rank correlation |
|---|---|
| press intensity | 0.90 |
| press height | 0.98 |
| counter-attack | 0.89 |
| directness | 0.53 |
| width | 0.28 |
| set-piece focus | −0.05 |
| tempo | −0.56 |

So pressing, press height and counters are recovered from the events, while width, set pieces and tempo are not.
- **Tempo:** quicker sides move the ball forward in fewer passes, so passes per possession minute falls.
- **Showing it honestly:** pages show every pair with its correlation, and call a dial "read from the data" only at
  0.6 or more.

## 6. Reference clubs

The two reference clubs (`reference: true` in the world, today CAL and DTN) are internal test fixtures.
- **In the document:** they stay in the table and the results, and in every league comparison.
- **Left out:** their players are not in `players`, and they get no club or player page. `hidden_teams` lists them.
- **Hiding more clubs:** `--hide` adds others.
