# Calibration

The generator is tuned so its output matches **public, aggregate** real-football statistics. Every target below must
cite a public source before it's used for tuning. No match-level real data is used anywhere, not even for
calibration.

**How to use this file:**
1. Add or update a target with its public source (a link plus what it says).
2. Generate a synthetic season, run the realism report and record the measured value.
3. Mark the row `ok` when the measured value is inside the target range; otherwise tune and repeat.

| Metric | Target range | Public source | Measured (synthetic season) | Status |
|---|---|---|---|---|
| Goals per match | ~2.6–2.8 | _needs source_ | — | proposed |
| Passes per team per match | 350–600 | _needs source_ | — | proposed |
| Short-pass completion | ~88–90% | _needs source_ | — | proposed |
| Shots per team per match | _tbd_ | _needs source_ | — | proposed |
| Fouls per team per match | 9–14 | _needs source_ | — | proposed |
| Yellow cards per match | _tbd_ | _needs source_ | — | proposed |
| Penalty xG | ~0.76 | _needs source_ | — | proposed |
| xG of a central shot from ~12 m | ~0.3 | _needs source_ | — | proposed |
| Sprint threshold | ~25 km/h | _needs source_ | — | proposed |
| Top sprint speed | 33–36 km/h | _needs source_ | — | proposed |
| Distance covered, central midfielder | ~10–12 km | _needs source_ | — | proposed |
| Home win / draw / away win share | _tbd_ | _needs source_ | — | proposed |

## Realism report

The generator's batch mode will produce a report comparing each measured value with its target range, with
charts. A link to the latest report goes here.
