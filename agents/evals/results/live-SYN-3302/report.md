# Live run — SYN-3302

Azure main f8e455a, CAL v ORR seed 20, 20x

Final: full_time, {'home': 4, 'away': 1}. Moments: 30 (big_chance 1, connection 3, goal 5, head_to_head 3, milestone 1, momentum_swing 5, penalty 1, press_change 7, red_card 1, shot_cluster 2, workhorse 1).

## Jobs

| Final state | Count |
|---|---|
| expired | 14 |
| published | 8 |
| suppressed | 9 |

Model-backed jobs: 21. Terminal reasons: {'queue_overflow': 3, 'merge_into': 2, 'stale': 4}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 297 |
| overlay:sent | 125 |
| player_tag:sent | 56 |
| recap:sent | 28 |

Sent cards: {'verified': 10, 'template': 115}. Player tags: 14.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:ok | 21 |
| fact_checker:ok | 44 |
| fact_checker:timeout | 1 |
| narrator:input_too_large | 3 |
| narrator:ok | 71 |
| narrator:timeout | 2 |
| recap_writer:ok | 3 |
| spotter:ok | 14 |
| translator:deadline | 5 |
| translator:ok | 32 |
| translator:timeout | 5 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 7 | 26 | 31 | 31 |
| model | 7 | 26 | 31 | 31 |
| template | 0 | None | None | None |

A send is the service accepting the envelope, not a browser displaying it.
