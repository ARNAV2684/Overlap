# Review round 1 — instructions

One file per agent. For each row fill `verdict`, a short `reason` and `score_1_5` (5 = exactly what a good broadcaster would say). Judge the line against the facts and names in the row only.

| File | Rows | Verdict |
|---|---|---|
| `analyst.csv` | 10 | accept / reject |
| `director.csv` | 7 | accept / reject |
| `narrator.csv` | 48 | accept / reject |
| `recap_writer.csv` | 48 | accept / reject |
| `spotter.csv` | 48 | keep / drop |

`verified = template` marks a labelled fallback line (no model wording). Round 1 runs on the local model or templates (plumbing); round 2 repeats this on the Azure model.
