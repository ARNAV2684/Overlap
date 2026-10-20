# Evaluation report — round 1

Bench: 24 generated matches (538 moments): six storylines on two seeds each, and the same clubs and seeds without the storyline as controls. Stats engine replay → the seven agents → independent re-check. Answer keys were used only here, never by an agent.

## Detection recall (independent labels from the event log)

| Trigger | Eligible | Detected | Extra | Recall |
|---|---|---|---|---|
| goal | 87 | 87 | 0 | 100.0% |
| red_card | 11 | 11 | 0 | 100.0% |
| penalty | 2 | 2 | 0 | 100.0% |
| milestone | 27 | 27 | 0 | 100.0% |
| shot_cluster | 68 | 68 | 0 | 100.0% |
| big_chance | not labelled | 52 | — | N/A |
| momentum_swing | not labelled | 136 | — | N/A |
| press_change | not labelled | 155 | — | N/A |

Big chance needs the xG model and momentum and pressing need the engine's own metrics, so they have no independent label (recall N/A); the storyline comparison below covers them.

## Storylines against controls

A storyline counts when the generator measured its effect in the data; it is caught when a moment that shows it fires for its team between its onset and its end (or full strength) plus the answer key's allowance. Caught: **5 of 6** storylines whose effect showed (of 12 configured); the same window in the control match fired in 4 of 6.

| Match | Storyline | Team | Caught | First moment | Control | Control fired |
|---|---|---|---|---|---|---|
| SYN-0601 | late_pressure_surge | CAL | yes | momentum_swing | SYN-0613 | yes |
| SYN-0602 | late_pressure_surge | KES | yes | press_change | SYN-0614 | yes |
| SYN-0603 | red_card | DTN | yes | red_card | SYN-0615 | no |
| SYN-0604 | red_card (effect not shown in the data; not counted) | ORR | no | — | SYN-0616 | no |
| SYN-0605 | star_night (effect not shown in the data; not counted) | CAL | yes | goal | SYN-0617 | yes |
| SYN-0606 | star_night (effect not shown in the data; not counted) | None | no | — | SYN-0618 | no |
| SYN-0607 | comeback | DTN | no | — | SYN-0619 | no |
| SYN-0608 | comeback | KES | yes | momentum_swing | SYN-0620 | yes |
| SYN-0609 | fading_legs | CAL | yes | momentum_swing | SYN-0621 | yes |
| SYN-0610 | fading_legs (effect not shown in the data; not counted) | KES | yes | momentum_swing | SYN-0622 | yes |
| SYN-0611 | low_block_resistance (effect not shown in the data; not counted) | DTN | yes | momentum_swing | SYN-0623 | yes |
| SYN-0612 | low_block_resistance (effect not shown in the data; not counted) | ORR | yes | big_chance | SYN-0624 | no |

## Numeric accuracy — Templates (provider off), all matches

- Published lines: 12236 (+ 604 recap lines); **wrong numbers: 0**
- Verified 0.0%, template 100.0%; moments suppressed 9.3% ({'merged': 50}); lines dropped for a language: 0

## Numeric accuracy — Local model (phi-4-mini), subset

- Published lines: 2996 (+ 144 recap lines); **wrong numbers: 0**
- Verified 0.1%, template 99.9%; moments suppressed 21.9% ({'thinned': 14, 'merged': 19}); lines dropped for a language: 0

## Local model runs on played matches (M4)

| Match | Lines | Verified | Wrong |
|---|---|---|---|
| SYN-0507 | 528 | 0 | 0 |
| SYN-0508 | 472 | 2 | 0 |
| SYN-0509 | 468 | 8 | 0 |
| SYN-1017 | 356 | 2 | 0 |

## Fault injection (code check)

33 labelled lines on real moments from 3 matches.

| Kind | Cases | Flagged | Code-checkable | Caught by code |
|---|---|---|---|---|
| valid | 12 | 0 | 12 | 0 |
| numeric | 11 | 11 | 11 | 11 |
| meaning | 10 | 9 | 9 | 9 |

False rejections of valid lines: **0**. Faults only the model meaning check can judge are listed below as code-blind.

| Kind | Fault | Caught | Problem | Line |
|---|---|---|---|---|
| numeric | wrong_value | yes | wrong_value:shot_xg | Goal for Calverholme Athletic: a 0.46 xG chance from 3 m. 1–0. |
| numeric | score_swapped | yes | score_not_from_facts, score_not_from_facts | Calverholme Athletic score. 0–1. |
| numeric | xg_as_percent | yes | wrong_value:shot_xg, text_differs:shot_xg, unit_wrong:shot_xg | Goal for Calverholme Athletic: a 46% chance. |
| numeric | missing_claim | yes | numbers_without_claims | Calverholme Athletic have taken 3 shots in the last 5 minutes. |
| numeric | number_word | yes | spelled_number:three | Calverholme Athletic have taken three shots in the last 5 minutes. |
| numeric | context_number | yes | numbers_without_claims | Calverholme Athletic have taken 3 shots in the last 5 minutes, 14 today. |
| numeric | duplicate_claim | yes | duplicate_claim, text_differs:shots_last_5min, unit_wrong:shots_last_5min | Calverholme Athletic have taken 3 shots in the last 5 minutes. |
| numeric | unknown_fact | yes | unknown_fact:shots_last_10min | Calverholme Athletic have taken 3 shots in the last 5 minutes. |
| numeric | down_to_wrong | yes | wrong_value:team_players_on_pitch, text_differs:team_players_on_pitch, down_to_wrong | Kestlebury United are down to 9. |
| numeric | percent_dropped | yes | unit_missing:momentum_share_last_5min_pct | Calverholme Athletic have taken over: 100 of the attacking actions in the last 5 minutes, up from 50%. |
| numeric | too_precise | yes | too_precise:shot_distance_m | Big chance for Calverholme Athletic: 0.25 xG from 5.0 m. |
| meaning | penalty_wording | yes | penalty_wording | Calverholme Athletic score from the spot. 1–0. |
| meaning | hat_trick_claim | yes | hat_trick_wrong | A hat-trick for Calverholme Athletic! 1–0. |
| meaning | cluster_dominance | yes | cluster_inference | Calverholme Athletic dominate: 3 shots in the last 5 minutes. |
| meaning | other_club | yes | unknown_name:Harbourside | Harbourside City have taken 3 shots in the last 5 minutes. |
| meaning | unsupported_tactic (code-blind) | no | — | Calverholme Athletic changed their shape and have taken 3 shots in the last 5 minutes. |
| meaning | card_reason | yes | red_card_reason | Kestlebury United are down to 10 after a second yellow. |
| meaning | possession | yes | momentum_possession | Calverholme Athletic have taken over: 100% of the possession in the last 5 minutes, up from 50%. |
| meaning | press_direction | yes | press_direction | Calverholme Athletic are pressing harder: 0.58 pressures per opponent pass, up from 1.00. |
| meaning | press_intent | yes | press_intent | Calverholme Athletic look tired and are pressing less: 0.58 pressures per opponent pass, down from 1.00. |
| meaning | xg_verdict | yes | xg_verdict, xg_verdict | Big chance for Calverholme Athletic: 0.25 xG from 5 m. He should have scored. |

## Latency

| Path | n | p50 s | p95 s | max s |
|---|---|---|---|---|
| Bench, template moments | 538 | 0.01 | 0.01 | 0.06 |
| Bench, model moments (local) | 18 | 87.17 | 197.46 | 197.46 |
| Played matches, model moments (local) | 16 | 120.81 | 1538.49 | 1538.49 |
| Live SYN-0510: moment written → card sent | 18 | 1 | 3 | 3 |
| Live SYN-0511: moment written → card sent | 25 | 1 | 3 | 4 |

Live figures use Cosmos `_ts` (whole seconds); a send is service acceptance, not display. Local model latency is a laptop GPU and far above the 8 s target; the target applies to the Azure model (M7).
