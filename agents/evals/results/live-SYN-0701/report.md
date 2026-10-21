# Live run — SYN-0701

SYN-0701 at 20x, every service running (stand-in, relay, archiver, stats live, agents poller with the publisher, generator); phi-4-mini on Foundry Local with the spec limits (4 s per model call, 15 s per moment); fake translator. The relay was stuck on an old backlog in this run (no base stream); fixed for SYN-0702 with relay_runner.py --from-latest.

Final: full_time, {'home': 2, 'away': 0}. Moments: 17 (big_chance 1, goal 2, momentum_swing 7, press_change 4, shot_cluster 3).

## Jobs

| Final state | Count |
|---|---|
| expired | 5 |
| published | 9 |
| suppressed | 4 |

Model-backed jobs: 10. Terminal reasons: {'thinned': 3, 'merge_into': 1}.

## Deliveries

| Kind:state | Count |
|---|---|
| overlay:expired | 132 |
| overlay:sent | 200 |
| player_tag:sent | 20 |
| recap:sent | 24 |

Sent cards: {'template': 200}. Player tags: 5.

## Model calls

| Agent:outcome | Count |
|---|---|
| analyst:provider_error | 9 |
| analyst:timeout | 1 |
| narrator:provider_error | 9 |
| narrator:timeout | 1 |
| recap_writer:timeout | 1 |
| spotter:provider_error | 6 |
| spotter:timeout | 2 |

## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)

| Moments | n | p50 | p95 | max |
|---|---|---|---|---|
| all | 8 | 7 | 14 | 14 |
| model | 5 | 11 | 14 | 14 |
| template | 3 | 1 | 1 | 1 |

A send is the service accepting the envelope, not a browser displaying it.
