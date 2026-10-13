# Stats engine

Plain, deterministic code: no AI. It consumes ordered events, keeps the match state and publishes numbers, including
the **evidence packs** that are the only numbers the agents may cite.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/metrics.md`](specs/metrics.md) | The exact formula for every number: xG, pass difficulty, speeds, PPDA, press height, pressing grid, momentum, control ↔ chaos, rhythm, whole-match stats, small-sample handling | `xg.py`, `pass_difficulty.py`, `per_event.py`, `whole_match.py` |
| 2 | [`specs/windows.md`](specs/windows.md) | Rolling window lengths, how they cross half-time, which metrics are compared window against window | `rolling.py` |
| 3 | [`specs/triggers.md`](specs/triggers.md) | The rule and threshold for each moment trigger, how many moments per match, merging, priority | `triggers.py` |
| 4 | [`specs/evidence-packs.md`](specs/evidence-packs.md) | Which facts go into each trigger's evidence pack, key names, units, decimals, context | `evidence.py` |
| 5 | [`specs/publishing.md`](specs/publishing.md) | Snapshot contents and frequency, the stat panel payload, how a moment starts the agents exactly once | `publish.py`, `state.py` |

Starting definitions are in [`CONTRACTS.md` §8](../CONTRACTS.md#8-metric-definitions-stats-engine).

## Files

| File | Job |
|---|---|
| `consumer.py` | Reads ordered events from Event Hubs with checkpoints |
| `dedupe.py` | Drops any `seq` already applied |
| `state.py` | Score, clock, players and running totals |
| `xg.py` | Expected goals per shot |
| `pass_difficulty.py` | Difficulty rating per pass |
| `per_event.py` | Metrics attached to each event |
| `rolling.py` | 5 and 10 minute window metrics |
| `whole_match.py` | Totals, pass network, zones, distance, sprints |
| `triggers.py` | Flags moments worth explaining |
| `evidence.py` | Builds each moment's evidence pack |
| `publish.py` | Writes snapshots and moments; sends stat panels |
| `main.py` | Runs the service |
| `tests/` | Metrics, triggers, dedupe |
