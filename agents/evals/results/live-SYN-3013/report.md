# Live run — SYN-3013

Azure, main @109c071 (#108-#112), 20x, 26 Oct

Final: full_time, {'home': 6, 'away': 0}. Moments: 39 (connection 8, goal 6, head_to_head 5, milestone 3, momentum_swing 7, press_change 5, shot_cluster 3, workhorse 2).

## Jobs

| Final state | Count |
|---|---|
| expired | 16 |
| published | 6 |
| suppressed | 18 |

Model-backed jobs: 21. Terminal reasons: {'stale': 10, 'merge_into': 3, 'queue_overflow': 2, 'thinned': 3}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 302 |
| overlay:sent | 118 |
| player_tag:sent | 56 |
| recap:sent | 28 |

Sent cards: {'verified': 18, 'template': 100}. Player tags: 14.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:ok | 21 |
| fact_checker:deadline | 2 |
| fact_checker:ok | 33 |
| fact_checker:timeout | 3 |
| narrator:ok | 67 |
| narrator:timeout | 10 |
| recap_writer:invalid_output | 1 |
| recap_writer:ok | 1 |
| spotter:ok | 16 |
| translator:deadline | 15 |
| translator:ok | 4 |
| translator:timeout | 14 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 5 | 20 | 35 | 35 |
| model | 5 | 20 | 35 | 35 |
| template | 0 | None | None | None |

A send is the service accepting the envelope, not a browser displaying it.
