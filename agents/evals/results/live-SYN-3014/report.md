# Live run — SYN-3014

Azure, #113-#116 on main @109c071 (deadline 25 s, live window 10 min, recap allowance), 20x, 26 Oct

Final: full_time, {'home': 4, 'away': 1}. Moments: 35 (big_chance 4, connection 5, goal 5, head_to_head 3, milestone 2, momentum_swing 4, press_change 7, shot_cluster 3, workhorse 2).

## Jobs

| Final state | Count |
|---|---|
| expired | 9 |
| published | 14 |
| suppressed | 13 |

Model-backed jobs: 22. Terminal reasons: {'queue_overflow': 5, 'merge_into': 2, 'thinned': 1, 'stale': 5}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 210 |
| overlay:sent | 285 |
| player_tag:sent | 52 |
| recap:sent | 28 |

Sent cards: {'verified': 42, 'template': 243}. Player tags: 13.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:ok | 22 |
| fact_checker:ok | 41 |
| fact_checker:timeout | 1 |
| narrator:input_too_large | 3 |
| narrator:ok | 75 |
| narrator:timeout | 1 |
| recap_writer:timeout | 1 |
| spotter:ok | 18 |
| translator:deadline | 3 |
| translator:ok | 21 |
| translator:timeout | 11 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 13 | 26 | 46 | 46 |
| model | 13 | 26 | 46 | 46 |
| template | 0 | None | None | None |

A send is the service accepting the envelope, not a browser displaying it.
