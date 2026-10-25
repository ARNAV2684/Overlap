# Live run — SYN-3010

Azure, 20×, main @b1826d8 with agents/foundry-observability (tracing on), 25 Oct

Final: full_time, {'home': 4, 'away': 0}. Moments: 31 (big_chance 2, connection 4, goal 4, head_to_head 3, milestone 2, momentum_swing 4, press_change 7, shot_cluster 2, workhorse 3).

## Jobs

| Final state | Count |
|---|---|
| expired | 10 |
| published | 8 |
| suppressed | 14 |

Model-backed jobs: 12. Terminal reasons: {'queue_overflow': 3, 'stale': 7, 'thinned': 3, 'merge_into': 1}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 206 |
| overlay:sent | 167 |
| player_tag:sent | 56 |
| recap:sent | 24 |

Sent cards: {'verified': 9, 'template': 158}. Player tags: 14.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:ok | 12 |
| fact_checker:ok | 18 |
| fact_checker:timeout | 1 |
| narrator:ok | 33 |
| narrator:timeout | 9 |
| recap_writer:timeout | 1 |
| spotter:ok | 8 |
| translator:deadline | 18 |
| translator:timeout | 3 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 7 | 8 | 24 | 24 |
| model | 2 | 16 | 24 | 24 |
| template | 5 | 3 | 11 | 11 |

A send is the service accepting the envelope, not a browser displaying it.
