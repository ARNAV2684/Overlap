# Evaluation results

Two kinds of evidence: the **agents bench** (round 1), which runs generated matches through the stats engine and
the seven agents and re-checks every published line independently, and the **Azure runs** of 24 Oct (A8), which
played full matches through the deployed pipeline. Answer keys are used only by the bench, never by an agent.

How the bench works: [`agents/specs/evaluation.md`](../agents/specs/evaluation.md); code in
[`agents/evals/`](../agents/evals); full report:
[`agents/evals/results/round-1/report.md`](../agents/evals/results/round-1/report.md).

## Round 1 bench

24 generated matches with 538 moments: six storylines on two seeds each, and the same clubs and seeds without the
storyline as controls.

### Detection recall (labels taken independently from the event log)

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

Big chance, momentum and pressing depend on the engine's own models, so they have no independent label. Storylines
against controls cover them: 5 of the 6 storylines whose effect showed in the data were caught (the same window in
the control match fired in 4 of 6).

### Numeric accuracy

| Run | Published lines | Wrong numbers | Lines dropped for a language |
|---|---|---|---|
| Templates (model off), all 24 matches | 12,236 (+ 604 recap lines) | **0** | 0 |
| Local small model (phi-4-mini on Foundry Local), subset | 2,996 (+ 144 recap lines) | **0** | 0 |
| Local model on four played matches (SYN-0507, 0508, 0509, 1017) | 1,824 | **0** | — |

The bench runs offline with the stand-in translator (it marks the English text with the language), so it proves the
translation re-checks are wired, not translation quality; Azure AI Translator was exercised in the Azure runs.

### Fault injection (the fact-checker's code check)

33 labelled lines on real moments from 3 matches.

| Kind | Cases | Flagged | Caught by code |
|---|---|---|---|
| Valid lines | 12 | 0 | — |
| Numeric faults (wrong value, swapped score, xG as a percentage, a spelled number, an extra number, a duplicate or unknown claim, wrong unit or precision) | 11 | 11 | 11 |
| Meaning faults (penalty or hat-trick wording, a dominance claim, another club's name, card reason, possession vs momentum, press direction or intent, an xG verdict) | 10 | 9 | 9 |

**0 valid lines rejected.** The one meaning fault code cannot see (an unsupported tactical claim) is left to the
fact-checker's separate model check of meaning.

### Bench latency

| Path | n | p50 s | p95 s |
|---|---|---|---|
| Template moments | 538 | 0.01 | 0.01 |
| Live SYN-0510: moment written → card sent | 18 | 1 | 3 |
| Live SYN-0511: moment written → card sent | 25 | 1 | 3 |

Local model latency (a laptop GPU, 87 s p50) is far above the target and is not representative; the target applies
to the Azure model.

## Azure runs (A8, 24 Oct)

Full 20× matches SYN-3000 to SYN-3008, every service on Azure in Sweden Central
([`PLAN_infra_azure-pass`](../plans/active/PLAN_infra_azure-pass.md), handover).

| Measure | Result |
|---|---|
| Archives identical to their recordings | 9 of 9 |
| Every reader behind Event Hubs (SYN-3008) | 0 s p50, 1 s p95, 3 s worst |
| Function runs (SYN-3008) | 3,009, 0 failed |
| Full match at 20× | 6 min 40 s |
| Per match | 75 moments → about 17–20 cards, 1 recap, 12–15 player tags |
| SYN-3003 deliveries | 521 sent, 45 expired (8%) |
| Model tokens per match | about 75K |
| Cost of the whole day (estimate from list prices) | about $3 |

**Known gap.** Every card in these runs was a checked template (**Stat line · checked**), not a model line: a fresh
MCP process per job took 4–5 s and the narrator's single structured call 3–11 s on gpt-5-mini, and at 20× a card is
live for only 15 real seconds. An 8 s model timeout was tried and reverted (1 narrator call of 12 succeeded). The
fix on `main`: in-process MCP sessions and at most two parallel narrator calls
([`release-readiness.md`](release-readiness.md)). Hindi lines were often dropped on purpose (see
[`responsible-ai.md`](responsible-ai.md)).

## Live AI share (block A)

> **To be filled after the next Azure run** with the fixes deployed.

| Measure | Result |
|---|---|
| Match id(s) | _to be filled_ |
| Cards published | _to be filled_ |
| Share **AI · checked** (model line passed by the fact-checker) | _to be filled_ |
| Share **Stat line · checked** (template) | _to be filled_ |
| Lines rewritten by the fact-checker / refused | _to be filled_ |
| Moment written → card sent, p50 / p95 | _to be filled_ |
| Cards expired | _to be filled_ |
| Hindi lines dropped | _to be filled_ |
| Model tokens and cost per match | _to be filled_ |

## Line quality: Azure AI Evaluation

Published lines from one Azure match (SYN-3010, 25 Oct), scored by Azure AI Evaluation's evaluators on the Foundry
deployment (gpt-5-mini as the judge), each against the moment's evidence (facts, names, clock) and the audience it was
written for. Scores are 1–5; a line passes at 3 or above. Code:
[`agents/evals/foundry_quality.py`](../agents/evals/foundry_quality.py); full report:
[`foundry-1/`](../agents/evals/results/foundry-1/report.md).

| Metric | Lines | Mean | Pass rate |
|---|---|---|---|
| Groundedness | 59 (1 judge reply had no score) | 4.14 | 98.3% |
| Relevance | 60 | 3.10 | 91.7% |
| Fluency | 60 | 3.12 | 100% |

The sample is all 25 model-written lines of the match and 35 templates. Model lines: groundedness 4.20, relevance
2.92, fluency 3.20; templates: 4.09, 3.23, 3.06. Groundedness is what the fact-checker protects; relevance is the
weaker score, model lines a little below templates, and is where the narrator's prompt can still improve.

## Single vs multi-agent (W3)

[`agents/evals/single_vs_multi.py`](../agents/evals/single_vs_multi.py) runs the same 17 moments of the fixture
match SYN-1017 two ways on the deployed model (Azure OpenAI in Foundry, gpt-5-mini, minimal reasoning), with the
deployed limits (6 s per call, 15 s per moment). **Single agent:** the narrator alone, with the same model, prompt
and batching, but no analyst context, no fact-checker and no rewrites; it publishes what it writes. **Seven agents:**
the full pipeline. Every published English line is judged against the moment's evidence by the same code.

| Measure | Single agent | Seven agents |
|---|---|---|
| Lines published | 109 | 109 |
| Wrong numbers (a value the evidence never states) | 0 | 0 |
| Unverified numbers (not tied to their fact at its value, order, unit and precision) | 63 lines (58%) | 0 |
| Unsupported claims (do/don't wording rules) | 2 lines | 0 |
| Lines the fact-checker's code check would refuse | 65 (60%) | 0 |
| Lines refused or rewritten | 0, nothing checks | 69 rewritten; 67 replaced by the checked stat line; 0 dropped |
| Model's own lines published, verified | — | 42 |
| Model calls per moment | 2.0 | 6.8 |
| Latency per moment p50 / p95 | 3.6 s / 4.1 s | 14.0 s / 14.0 s |

What it shows: gpt-5-mini did not invent numbers here, but on its own it published 65 of 109 lines that no check
could tie to the evidence. It attached a value to the wrong fact, told a score from the trailing side, left out a
unit, ran past the length limit, or read pressure into a shot cluster ("piling on the pressure"). The pipeline
published none of those. The fact-checker sent 69 lines back for a rewrite and put the checked stat line in place of
the rest. The cost is about 3.4 times the model calls and a moment that takes its whole 15 s budget.

With relaxed limits (20 s per call, 60 s per moment) the fact-checker sent 127 lines back, published 38 verified
model lines and 71 stat lines, and still let nothing unchecked through. The single agent's refused share was 68%.
Latency was 16.2 s p50 against 3.6 s. Full reports:
[`single-vs-multi-azure/`](../agents/evals/results/single-vs-multi-azure/report.md),
[`single-vs-multi-azure-60s/`](../agents/evals/results/single-vs-multi-azure-60s/report.md). Latency was measured
from a developer machine to Sweden Central, so it includes the network. Meaning only a reader can judge is not
counted for either arm, so the single agent's figures are a floor. These runs (25 Oct) used the code check as it was
before the precision-leniency change (fact-checking.md §1.6: rounded measures, any order, small counts, `km`). The
wrong-number and unsupported-claim rows don't depend on it. The unverified and refused rows would be lower for the
single agent under §1.6. A re-run needs the gpt-5-mini deployment back: `python -m evals.single_vs_multi --fixture
--allow-paid`.

### Hindi numbers

Numbers no longer reach the translator. Each one goes as an opaque placeholder and is put back afterwards
([`agents/translation.py`](../agents/translation.py)). On the fixture match, with a simulated Hindi translator that
moves numbers between slots as Azure did, `main` before this change dropped 3, 9 and 19 of 130 Hindi lines and
published 3, 7 and 16 wrong ones (at swap shares of 25%, 50% and 100%). It also dropped 1 line with no swaps at all,
from a re-check bug with two facts of equal value. After the change: 0 dropped and 0 wrong at every share, and the
translator saw no digits
([`hindi-numbers/`](../agents/evals/results/hindi-numbers/report.md)). The real Azure drop rate is the block A row
above.
