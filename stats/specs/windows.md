# Rolling windows spec

> **Status: agreed.** Agreed in the spec PR for [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (M1).

Decides the time windows used for in-match comparisons.

## 1. Windows

- Which window lengths (5 and 10 minutes) and are they sliding or fixed buckets?
- How do windows behave across half-time and stoppage time (use `match_ms`)?

_Answer:_

- **Sliding windows of 5 and 10 minutes**, measured on `match_ms`. The window at time `t` holds events with
  `t − W < match_ms ≤ t` and `seq` up to the event being processed. They are evaluated on every event and on every
  panel tick (`publishing.md` §2).
- **Same period only.** A window never reaches back past its period's `PeriodStart`. Early in a period the window is
  shorter, and its true length is reported (`window_duration_min`). Anything that needs a full window waits until
  `period_ms ≥ W`. This is the same warm-up as the shot-cluster rule (`CONTRACTS.md` §10.1).
- **Stoppage time** is just more `match_ms` in the same period, so windows run through it. Half-time is not in
  `match_ms`, and the next period starts its windows afresh.
- **Fixed 5-minute buckets** (`period_ms // 300000`) are used only for the momentum chart (`metrics.md` §5).

| Window | Used for |
|---|---|
| Last 5 min | Shots, momentum share, press height, PPDA (recent) |
| Last 10 min | Panel values: PPDA, momentum share, press height; control ↔ chaos |
| The 10 min before the last 5 (`t − 15` to `t − 5` min) | The baseline for comparisons (§2) |

## 2. Comparisons

- Which metrics are compared window against window (momentum share, PPDA, press height, tempo)?

_Answer:_

A comparison sets the **last 5 minutes** against the **baseline**, the 10 minutes before that, in the same period. It
needs `period_ms ≥ 15 min`. Comparisons feed the `momentum_swing` and `press_change` triggers (`triggers.md`) and the
"up/down" arrows on panels.

| Metric | Change measured | Minimum sample (both windows) |
|---|---|---|
| Momentum share | percentage points, recent − baseline | 6 weighted points in the recent window |
| Pressing rate (pressures per opponent pass) | ratio, recent ÷ baseline | 20 opponent passes recent, 40 baseline |
| Press height | metres, recent − baseline (panels and facts only) | 8 actions in each window |
| PPDA | ratio, recent ÷ baseline (panels only) | 3 defensive actions in each window |
| Tempo (passes per minute) | ratio, recent ÷ baseline | 20 passes in the baseline |
| Shots | count in the recent window (no ratio) | — |

Why 5 against the previous 10: a change shows within about 5 minutes, and the longer baseline keeps one quiet spell
from looking like a swing. The generator's storylines ramp in over about 5 minutes and expect detection within 10
(`generator/specs/storylines.md` §4), which this fits.
