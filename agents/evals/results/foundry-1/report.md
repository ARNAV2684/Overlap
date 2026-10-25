# Line quality — Azure AI Evaluation

Source: cosmos:SYN-3010. Judge: gpt-5-mini. Lines: 60. Created 2026-10-25T09:16:52Z.

Scores are 1–5 (5 best); a line passes at 3 or above. Groundedness is judged against the moment's evidence only (facts, names, clock).

| Metric | n | Mean | Pass rate | Errors |
|---|---|---|---|---|
| groundedness | 59 | 4.14 | 98.3% | 1 |
| relevance | 60 | 3.1 | 91.7% | 0 |
| fluency | 60 | 3.12 | 100.0% | 0 |

## By kind

| kind | n | groundedness | relevance | fluency |
|---|---|---|---|---|
| model | 25 | 4.2 | 2.92 | 3.2 |
| template | 35 | 4.09 | 3.23 | 3.06 |

## By trigger

| trigger | n | groundedness | relevance | fluency |
|---|---|---|---|---|
| big_chance | 6 | 4.0 | 3.17 | 3.0 |
| connection | 6 | 4.33 | 3.5 | 3.0 |
| goal | 12 | 4.33 | 3.08 | 3.08 |
| head_to_head | 12 | 4.17 | 2.83 | 3.33 |
| momentum_swing | 6 | 4.0 | 3.0 | 3.17 |
| press_change | 5 | 4.0 | 3.0 | 3.2 |
| shot_cluster | 7 | 4.0 | 2.71 | 3.0 |
| workhorse | 6 | 4.0 | 3.83 | 3.0 |

## By mode

| mode | n | groundedness | relevance | fluency |
|---|---|---|---|---|
| analyst | 15 | 4.0 | 3.13 | 3.13 |
| casual | 14 | 4.43 | 3.21 | 3.21 |
| club | 17 | 4.0 | 2.88 | 3.12 |
| player | 14 | 4.14 | 3.21 | 3.0 |
