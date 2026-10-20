# PLAN_agents_insights-build_S6 — evaluation bench and Azeem's review round 1 (M6)

| Field | Complete this |
|---|---|
| Sprint | S6 — a bench of generated matches through the stats engine and the seven agents; recall, storyline hits against controls, numeric accuracy, fault injection, latency; Azeem's review sheet and the gold-set importer and scorer |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M6 · AC-06 |
| Author / owner | Arnav (Azeem reviews) |
| Status | Built; PR open; Azeem's answers pending |
| Reviewed branch and commit | `agents/delivery` (M5, PR #69) on main · aca9573 (M4 merged) |
| Planned branch | `agents/evals` (stacked on `agents/delivery` until #69 merges) |

## 1. Outcome

- **What will work at the end of this sprint:**
  - **Bench data:** 24 generated matches — the six storylines on two seeds each (CAL v DTN, KES v ORR) and the same
    clubs and seeds without a storyline as controls — replayed by the stats engine into moments and final numbers.
  - **`evals/bench.py`:** every bench match through the seven agents in memory (templates with the model off; a
    model subset with a model-job cap), with an independent re-check of every published line.
  - **`evals/recall.py`:** independent labels rebuilt from the event log for goal, red card, missed penalty,
    milestone and shot cluster (no stats code); detection recall; storyline hits against controls with the answer
    keys kept in the evaluator only.
  - **`evals/numeric_accuracy.py`:** published lines, wrong numbers (must be 0), verified/template/suppressed rates.
  - **`evals/fault_injection.py`:** at least 30 labelled lines on real moments from at least three matches (valid,
    numeric faults, meaning faults), catch rate and false rejections; code-blind faults reported as such.
  - **`evals/latency.py`:** per moment through the agents (template and model), and moment written → card sent on
    live matches.
  - **`evals/review_sheet.py`, `evals/gold.py`:** Azeem's round-1 sheets (one CSV per agent, about 48 rows, spread
    across triggers), and the importer and scorer that turn his answers into a gold set re-scored on every change.
  - **`evals/report.py`:** the round-1 report (`evals/results/round-1/report.md`, `summary.json`).
- **Not in this sprint:** Azeem's answers themselves (his review time); round 2 on the Azure model (M7).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| The seven agents | M4 (#68) | Merged |
| Delivery and live matches for latency | M5 (#69) | Built (PR open) |
| Generator storylines and answer keys | `generator/storylines/` | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `agents/evals/*.py` | Add / modify | Bench, recall, numeric accuracy, fault injection, latency, review sheet, gold set, report | `evaluation.md` |
| `agents/evals/results/round-1/` | Add | Report and summary | `evaluation.md` §1–§4 |
| `agents/evals/review/round-1/` | Add | Azeem's sheets and instructions | `evaluation.md` §5 |
| `agents/analyst.py` | Modify | An optional MCP tool that reads inconsistently is skipped, not fatal (found by the bench) | `workflow.md` §4 |
| `agents/tests/test_evals.py`, `test_agents.py` | Add / modify | The eval code itself; the analyst fix | `evaluation.md` |
| `agents/README.md`, `docs/knowledge/ai-insights.md`, this plan | Modify | How to run; status; handover | — |

## 4. Steps

1. Generate the bench; replay; run the agents with templates over all 24 and with the local model over six.
2. Recall, numeric accuracy, fault injection, latency; the report.
3. Review sheets for Azeem; importer and scorer tested on a filled sample.

## 5. Contracts and shared files

- **Contract changes:** none. **Hot shared files touched:** none.

## 6. Conflict scan

Scanned on 2026-10-20: no open PR touches `agents/evals/`.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-06a | Detection recall per trigger from independent labels; storyline hits against controls; N/A for a zero denominator | `evals/recall.py`, report | Pass: 24 matches, 538 moments; recall 100% for goal 87/87, red card 11/11, penalty 2/2, milestone 27/27, shot cluster 68/68 (0 extra); big chance, momentum and pressing not independently labelled (N/A); storylines whose effect showed caught 5 of 6, controls fired 4 of 6 |
| AC-06b | Zero wrong numbers over the bench (templates and model subset), with verified, template and suppression rates reported | `evals/numeric_accuracy.py`, report | Pass: templates over 24 matches, 12,236 lines + 604 recap, 0 wrong; phi-4-mini over 6 matches, 2,996 lines + 144 recap, 0 wrong (verified 0.1%, template 99.9%, moments suppressed 21.9%: 19 merged, 14 thinned) |
| AC-06c | ≥ 30 labelled faults on real moments from ≥ 3 matches: every code-checkable fault caught, no valid line rejected | `evals/fault_injection.py`, report | Pass: 33 lines on real moments from 3 matches; numeric 11/11, meaning 9/9 code-checkable caught; 1 code-blind fault ("changed their shape") reported as model-only; 0 of 12 valid lines rejected |
| AC-06d | Latency p50/p95/max for template moments, model moments and live moment → send | `evals/latency.py`, report | Pass: template moments p50 0.01 s; local model moments p50 87 s, p95 197 s (bench); live moment written → card sent p50 1 s, p95 3–4 s (SYN-0510, SYN-0511). The 1,538 s maximum on played matches is a moment interrupted by the laptop sleeping |
| AC-06e | Review sheets for Azeem produced; his filled answers import into a gold set that re-scores a run | `evals/review_sheet.py`, `evals/gold.py`, `test_evals.py` | Sheets written (spotter 48, narrator 48, recap 48, analyst 10, director 7 rows); import and re-score tested on a filled sample; his answers pending his review |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Azeem's review time | Gold set waits for his answers | Azeem / Arnav | AC-06e's import of real answers |
| Local model quality and speed | Round 1 lines are mostly templates; round 2 on Azure | Arnav (M7) | No |

## 9. Handover

- **Built:** `evals/bench.py`, `recall.py`, `numeric_accuracy.py`, `fault_injection.py`, `latency.py`,
  `review_sheet.py`, `gold.py`, `report.py`; round-1 report and summary in `evals/results/round-1/`; Azeem's sheets
  and instructions in `evals/review/round-1/`. Agents tests: 165 passed, ruff clean.
- **Found and fixed by the bench:** (1) the analyst rejected a whole moment when an optional MCP tool couldn't read
  its document; now that tool is skipped (frozen context, scope and version errors still reject); (2) the model's
  HTTP client was never closed at the end of a run (`Models.close`).
- **Bench data:** `data/generated/bench/` (git-ignored), regenerated with `generator/cli.py play` (ids SYN-0601…0624,
  seeds 601…612, CAL v DTN and KES v ORR); answer keys are read only by `recall.py` and `report.py`.
- **Round 1 is plumbing:** on the local model nearly every line is a labelled template, so the sheets mostly show
  template wording, spotter decisions and the director's visuals; round 2 repeats the sheets on the Azure model (M7).
- **Next for Azeem:** fill `evals/review/round-1/*.csv` (verdict, reason, 1–5); then
  `uv run python -m evals.gold import` builds the gold set and `evals.gold score` re-scores every later run.
