# Single agent against the seven (D6)

17 moments of the fixture match SYN-1017 (of 21; skipped: {'suppressed': 4}), model `gpt-5-mini` (azure; reasoning `minimal`, 6.0 s per call, 15.0 s per moment), English. **Single agent:** the narrator alone — same model, prompt and two-batch split, no analyst context, no fact-checker, no rewrites, publishes what it writes. **Seven agents:** the full pipeline as deployed. Every published line is judged against the moment's evidence by the same deterministic code check.

| Measure | Single agent | Seven agents |
|---|---|---|
| Lines published | 109 (of 109 asked) | 109 |
| Lines with a wrong number (a value found nowhere in the evidence) | **0** (0.0%) | **0** |
| Lines with an unverified number (not tied to its fact at its value, order, unit and precision) | 63 (57.8%) | 0 |
| Lines with an unsupported claim (wording rules) | **2** (1.8%) | **0** |
| Lines the fact-checker's code check would refuse | 65 (59.6%) | 0 |
| Lines refused or rewritten | 0 (nothing checks) | 69 rewritten, 67 replaced by the checked stat line, 0 dropped |
| Published lines written by the model and verified | — | 42 |
| Model calls per moment | 2.0 | 6.76 |
| Latency per moment p50 / p95 (s) | 3.6 / 4.09 | 13.95 / 14.02 |

## Inside the pipeline

- The narrator's first draft, written *with* the analyst's interpretation (MCP context read for 17 moments, an interpretation for 17): 109 lines, 0 with a wrong number, 67 with an unverified number, 3 with an unsupported claim.
- Wrong values the single agent published: none
- Fact-checker, over all attempts: 126 code-check failures, 6 meaning-check failures; 69 lines sent back for a rewrite.
- Problem codes, single agent: `text_differs` 113, `unit_wrong` 76, `numbers_without_claims` 45, `unit_missing` 17, `too_long` 14, `spelled_number` 7, `score_not_from_facts` 6, `claims_without_numbers` 6, `too_precise` 4, `number_form` 4, `unknown_name` 3, `penalty_wording` 1
- Problem codes, seven agents (published): none

## Examples (single agent's line, then what the pipeline published for the same audience)

- **MO-1017-0001 goal · club:ORR** — single: “Orrinford Albion trail 0–1 after Malte Zimmermann’s goal from 12m; it was not a penalty.” (`claims_without_numbers, score_not_from_facts, score_not_from_facts, penalty_wording`); seven agents (stat line): “Kestlebury United score. 1–0.”
- **MO-1017-0019 shot_cluster · analyst** — single: “Orrinford Albion have registered 3 shots in the last 5 minutes, a concentrated 5‑minute window of pressure that raises their shot rate in this phase.” (`numbers_without_claims, cluster_inference`); seven agents (verified): “Orrinford Albion have produced 3 shots in the 5min window, increasing attacking frequency in that spell.”
- **MO-1017-0001 goal · analyst** — single: “Malte Zimmermann's 12m finish gave Kestlebury United a 1–0 lead; his shot carried 0.15 xG and is the team's 1st shot of the match.” (`text_differs:team_goals_match, unit_wrong:team_goals_match, text_differs:opponent_goals_match, text_differs:shot_distance_m, score_not_from_facts`); seven agents (stat line): “Goal for Kestlebury United: a 0.15 xG chance from 12 m. 1–0.”
- **MO-1017-0002 goal · club:ORR** — single: “Orrinford Albion trail 0–2 to Kestlebury United following Kwame Kone’s goal from 4m (shot xG 0.49).” (`score_not_from_facts, score_not_from_facts`); seven agents (stat line): “Kestlebury United score. 2–0.”
- **MO-1017-0003 momentum_swing · analyst** — single: “Kestlebury United’s weighted attacking share rose from 49% in the previous 10 minutes to 100% over the last 5 min, with 1 shot in that window — a clear swing in attacking control.” (`numbers_without_claims, text_differs:momentum_share_last_5min_pct, unit_missing:momentum_share_last_5min_pct, unit_wrong:momentum_share_last_5min_pct, text_differs:team_shots_last_5min, unit_wrong:team_shots_last_5min`); seven agents (verified): “Kestlebury United’s weighted attacking share rose from 49% to 100% while they registered 1 shot in the last 5 min; the shift indicates a short-phase swing in attacking control.”
- **MO-1017-0003 momentum_swing · club:KES** — single: “Kestlebury United have dominated the last 5 min: 100% share of weighted attacking actions, with 1 shot in that window.” (`text_differs:momentum_share_last_5min_pct, unit_missing:momentum_share_last_5min_pct, unit_wrong:momentum_share_last_5min_pct, text_differs:window_duration_min, unit_wrong:window_duration_min`); seven agents (stat line): “Kestlebury United have taken control of the game.”
- **MO-1017-0004 press_change · casual** — single: “Kestlebury United have dropped their press: 11 pressures in the last 5 minutes, but they're pressing less now.” (`text_differs:pressures_per_opp_pass_last_5min, unit_wrong:pressures_per_opp_pass_last_5min`); seven agents (stat line): “Kestlebury United are pressing less and letting the other side play.”
- **MO-1017-0004 press_change · analyst** — single: “Kestlebury United's pressing has eased: pressures per opponent pass fell from 1.07 (previous 10 min) to 0.55 in the last 5 min, with 11 pressures and an average defensive action height of 27 m over that 5-min window.” (`numbers_without_claims, text_differs:pressures_per_opp_pass_last_5min, unit_wrong:pressures_per_opp_pass_last_5min, text_differs:team_pressures_last_5min, too_precise:team_pressures_last_5min, text_differs:press_height_last_5min_m, unit_wrong:press_height_last_5min_m, text_differs:window_duration_min`); seven agents (stat line): “Kestlebury United are pressing less: 0.55 pressures per opponent pass, down from 1.07, and 0 high regains in the last 5 minutes.”
- **MO-1017-0004 press_change · player:KES-04** — single: “Yannick Koch saw the team's pressures ease: 11 pressures in the last 5 minutes and an average defensive action height of 27 m in that window.” (`text_differs:press_height_last_5min_m, unit_wrong:press_height_last_5min_m, text_differs:window_duration_min, unit_wrong:window_duration_min`); seven agents (stat line): “Yannick Koch: Kestlebury United are pressing less and letting the other side play.”
- **MO-1017-0004 press_change · player:KES-03** — single: “Sem Visser's side pressed less in the latest 5-minute spell: 11 team pressures and 0 ball wins in the opponent's half during that period.” (`spelled_number:half, text_differs:team_pressures_last_5min, text_differs:team_high_regains_last_5min, text_differs:window_duration_min`); seven agents (stat line): “Sem Visser: Kestlebury United are pressing less and letting the other side play.”

## What this does and does not show

The judge is code, not a model. A *wrong number* has a value that is no fact's value in the moment, so it is wrong whatever it meant (a lower bound: a right value in the wrong place is not counted there). An *unverified number* is one the fact-checker could not tie to its fact: it may be true, such as a score told from the trailing side (0–2) or a claim attached to the wrong fact, but nothing checked it, and the pipeline never publishes one. *Unsupported claims* are the wording rules the code can see (a red card's reason, a penalty called scored, pressure read into a shot cluster, possession in a momentum line, the rest of the do/don't table). The name rule (every capitalised word must be a name in the match) is counted only under refused, because it also catches ordinary openers such as "Press" or "Pressing". Meaning only a reader can judge is not counted for either arm, so the single agent's figures are a floor. Latency is measured from this machine to the Azure model (Sweden Central), so it includes the network; the deployed agents run in the same region as the model.

## Summary for docs/evaluation.md

On 17 moments run both ways with the deployed Azure model (`gpt-5-mini`), a single narrator agent published 109 lines: 0 with a number found nowhere in the evidence, 2 with an unsupported claim, and 65 that the fact-checker's code check would have refused. The seven-agent pipeline published 109 lines with 0, 0 and 0; 42 were the model's own lines verified by the fact-checker. The fact-checker sent 69 lines back for a rewrite and replaced 67 with the checked stat line, at 6.76 model calls per moment instead of 2.0 (p50 13.95 s against 3.6 s per moment).
