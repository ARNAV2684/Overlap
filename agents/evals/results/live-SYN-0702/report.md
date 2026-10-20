# Live run — SYN-0702

SYN-0702 at 20x, every service running (stand-in, relay, archiver, stats live, agents poller with the publisher, generator); phi-4-mini on Foundry Local with the spec limits (4 s per model call, 15 s per moment); fake translator.

Final: full_time, {'home': 2, 'away': 0}. Moments: 17 (big_chance 3, goal 2, momentum_swing 4, press_change 5, shot_cluster 3).

## Jobs

| Final state | Count |
|---|---|
| expired | 4 |
| published | 11 |
| suppressed | 3 |

Model-backed jobs: 10. Terminal reasons: {'merge_into': 1, 'thinned': 2}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 100 |
| overlay:sent | 264 |
| player_tag:sent | 32 |
| recap:sent | 24 |

Sent cards: {'template': 264}. Player tags: 8.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:provider_error | 3 |
| analyst:timeout | 7 |
| narrator:provider_error | 9 |
| narrator:timeout | 1 |
| recap_writer:timeout | 1 |
| spotter:provider_error | 4 |
| spotter:timeout | 4 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 10 | 8 | 13 | 13 |
| model | 6 | 10 | 13 | 13 |
| template | 4 | 1 | 2 | 2 |

A send is the service accepting the envelope, not a browser displaying it.
