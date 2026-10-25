# Single agent against the seven (D6)

17 moments of the fixture match SYN-1017 (of 21; skipped: {'suppressed': 4}), model `gpt-5-mini` (azure; reasoning `minimal`, 20.0 s per call, 60.0 s per moment), English. **Single agent:** the narrator alone — same model, prompt and two-batch split, no analyst context, no fact-checker, no rewrites, publishes what it writes. **Seven agents:** the full pipeline as deployed. Every published line is judged against the moment's evidence by the same deterministic code check.

| Measure | Single agent | Seven agents |
|---|---|---|
| Lines published | 109 (of 109 asked) | 109 |
| Lines with a wrong number (a value found nowhere in the evidence) | **0** (0.0%) | **0** |
| Lines with an unverified number (not tied to its fact at its value, order, unit and precision) | 73 (67.0%) | 0 |
| Lines with an unsupported claim (wording rules) | **1** (0.9%) | **0** |
| Lines the fact-checker's code check would refuse | 74 (67.9%) | 0 |
| Lines refused or rewritten | 0 (nothing checks) | 127 rewritten, 71 replaced by the checked stat line, 0 dropped |
| Published lines written by the model and verified | — | 38 |
| Model calls per moment | 2.0 | 6.88 |
| Latency per moment p50 / p95 (s) | 3.63 / 7.61 | 16.22 / 21.41 |

## Inside the pipeline

- The narrator's first draft, written *with* the analyst's interpretation (MCP context read for 17 moments, an interpretation for 17): 109 lines, 0 with a wrong number, 74 with an unverified number, 6 with an unsupported claim.
- Wrong values the single agent published: none
- Fact-checker, over all attempts: 187 code-check failures, 7 meaning-check failures; 127 lines sent back for a rewrite.
- Problem codes, single agent: `text_differs` 109, `unit_wrong` 80, `numbers_without_claims` 56, `unit_missing` 19, `too_long` 12, `score_not_from_facts` 11, `claims_without_numbers` 7, `number_form` 6, `spelled_number` 4, `unknown_name` 3, `too_precise` 2, `cluster_inference` 1
- Problem codes, seven agents (published): none

## Examples (single agent's line, then what the pipeline published for the same audience)

- **MO-1017-0019 shot_cluster · casual** — single: “Orrinford Albion are piling on the pressure: 3 shots in the last 5 minutes.” (`cluster_inference`); seven agents (verified): “Orrinford Albion keep coming: 3 shots in the last 5 minutes.”
- **MO-1017-0001 goal · analyst** — single: “Malte Zimmermann's 12m strike (0.15 xG) gives Kestlebury United a 1–0 lead; it's their first shot of the match and his first goal here.” (`spelled_number:first, numbers_without_claims, score_not_from_facts`); seven agents (stat line): “Goal for Kestlebury United: a 0.15 xG chance from 12 m. 1–0.”
- **MO-1017-0001 goal · player:KES-10** — single: “Malte Zimmermann has scored his first goal of the match, making it 1–0 for Kestlebury United; his shot came from 12m with 0.15 xG.” (`spelled_number:first, score_not_from_facts, text_differs:team_goals_match, score_not_from_facts`); seven agents (stat line): “Malte Zimmermann scores for Kestlebury United. 1–0.”
- **MO-1017-0001 goal · club:ORR** — single: “Orrinford Albion trail 0–1 after conceding to Malte Zimmermann, who scored from 12m (0.15 xG).” (`score_not_from_facts, score_not_from_facts`); seven agents (stat line): “Kestlebury United score. 1–0.”
- **MO-1017-0002 goal · casual** — single: “Kwame Kone puts Kestlebury United 2–0 up.” (`claims_without_numbers, text_differs:player_goals_match, score_not_from_facts, text_differs:team_goals_match`); seven agents (verified): “Kwame Kone makes it 2–0 for Kestlebury United with a close-range finish.”
- **MO-1017-0002 goal · club:ORR** — single: “Orrinford Albion trail 0–2 following Kwame Kone’s goal from 4 m (shot xG 0.49).” (`score_not_from_facts, score_not_from_facts`); seven agents (stat line): “Kestlebury United score. 2–0.”
- **MO-1017-0003 momentum_swing · club:KES** — single: “Kestlebury United have dominated the last 5 min: 100% share of weighted attacking actions, with 1 shot in that window.” (`text_differs:momentum_share_last_5min_pct, unit_missing:momentum_share_last_5min_pct, unit_wrong:momentum_share_last_5min_pct, text_differs:window_duration_min, unit_wrong:window_duration_min`); seven agents (stat line): “Kestlebury United have taken control of the game.”
- **MO-1017-0003 momentum_swing · club:ORR** — single: “Orrinford Albion have seen Kestlebury United take control in the last 5 min — Kestlebury with 100% of weighted attacking actions and 1 shot in that window.” (`text_differs:momentum_share_last_5min_pct, unit_missing:momentum_share_last_5min_pct, unit_wrong:momentum_share_last_5min_pct, text_differs:window_duration_min, unit_wrong:window_duration_min`); seven agents (stat line): “Kestlebury United have taken control of the game.”
- **MO-1017-0004 press_change · analyst** — single: “Kestlebury United’s pressing has eased: pressures per opponent pass fell from 1.07 to 0.55, with 11 team pressures and 0 high regains in the last 5 minutes at an average press height of 27m, so defensive actions are lower and deeper.” (`too_long, number_form:range, claims_without_numbers, text_differs:pressures_per_opp_pass_previous_10min, text_differs:pressures_per_opp_pass_last_5min, text_differs:team_pressures_last_5min, unit_wrong:team_pressures_last_5min, text_differs:team_high_regains_last_5min, unit_wrong:team_high_regains_last_5min`); seven agents (stat line): “Kestlebury United are pressing less: 0.55 pressures per opponent pass, down from 1.07, and 0 high regains in the last 5 minutes.”
- **MO-1017-0004 press_change · player:KES-04** — single: “Yannick Koch saw his side’s pressures per opponent pass drop to 0.55 in the last 5 minutes, with 11 team pressures and 0 high regains.” (`numbers_without_claims, text_differs:team_pressures_last_5min, unit_wrong:team_pressures_last_5min, text_differs:team_high_regains_last_5min`); seven agents (stat line): “Yannick Koch: Kestlebury United are pressing less and letting the other side play.”

## What this does and does not show

The judge is code, not a model. A *wrong number* has a value that is no fact's value in the moment, so it is wrong whatever it meant (a lower bound: a right value in the wrong place is not counted there). An *unverified number* is one the fact-checker could not tie to its fact: it may be true, such as a score told from the trailing side (0–2) or a claim attached to the wrong fact, but nothing checked it, and the pipeline never publishes one. *Unsupported claims* are the wording rules the code can see (a red card's reason, a penalty called scored, pressure read into a shot cluster, possession in a momentum line, the rest of the do/don't table). The name rule (every capitalised word must be a name in the match) is counted only under refused, because it also catches ordinary openers such as "Press" or "Pressing". Meaning only a reader can judge is not counted for either arm, so the single agent's figures are a floor. Latency is measured from this machine to the Azure model (Sweden Central), so it includes the network; the deployed agents run in the same region as the model.

## Summary for docs/evaluation.md

On 17 moments run both ways with the deployed Azure model (`gpt-5-mini`), a single narrator agent published 109 lines: 0 with a number found nowhere in the evidence, 1 with an unsupported claim, and 74 that the fact-checker's code check would have refused. The seven-agent pipeline published 109 lines with 0, 0 and 0; 38 were the model's own lines verified by the fact-checker. The fact-checker sent 127 lines back for a rewrite and replaced 71 with the checked stat line, at 6.88 model calls per moment instead of 2.0 (p50 16.22 s against 3.63 s per moment).
