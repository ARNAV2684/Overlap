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
| `main.py` | Routes messages to each match (`Pipeline`); `replay` for recorded matches |
| `consumer.py` | Both hubs as consumer group `stats`, with checkpoints that only move past finished matches |
| `tests/` | Ordering, metrics, consumer, windows, panels, triggers, evidence, moments, and a replay of a generated match (`tests/fixtures/SYN-1017`) |

## Status

- **Built:**
  - S1: ordering, match state, xG, pass difficulty, speeds and sprints, whole-match totals, the replay runner and the hub consumer.
  - S2: rolling windows, stat panels every match second (heavy block every minute), `match_state`, and live mode.
  - S3: triggers, evidence packs and moment documents, written once to Cosmos `moments` with stable ids. `sprint`
    is deferred. Season S1 gives 19.7 moments a match. How the agents use them: [`agents-guide.md`](agents-guide.md).
- **Next:** S4, the Azure deployment, once its infrastructure exists.
- **Plan:** [`PLAN_stats_engine`](../plans/active/PLAN_stats_engine.md).

## Run

From `stats/`:

```bash
uv sync
uv run pytest
uv run python main.py replay tests/fixtures/SYN-1017          # one match: its numbers as JSON
uv run python main.py replay ../data/seasons/S1 --out s1.json # a whole generated season
uv run python main.py replay tests/fixtures/SYN-1017 --panels # the stat panels it would send
uv run python main.py replay tests/fixtures/SYN-1017 --moments # the moment documents it would write
```

**Live**, beside the local stack (`infra/specs/local-development.md` §5), with the settings from `infra/local/env.example`:

```bash
uv run python main.py live                                  # both hubs in; panels, match_state and moments out
uv run python tests/e2e_local.py --seed 505 --match 505     # the end-to-end check (add --restart-after 120)
```

A match folder holds `setup.json` and `events.ndjson` (or `.gz`), and optionally `tracking.ndjson.gz` for speeds, distance and sprints. The generator writes these with `cli.py play` or `cli.py season`.
