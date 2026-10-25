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

## Single vs multi-agent (W3)

> **To be filled from the comparison bench** (`agents/evals/`): the same moments through the full seven-agent
> pipeline and through a single narrator with no analyst context, fact-checker or rewrites.

| Measure | Single agent | Seven agents |
|---|---|---|
| Wrong numbers | _to be filled_ | _to be filled_ |
| Unsupported claims | _to be filled_ | _to be filled_ |
| Lines refused or rewritten | _to be filled_ | _to be filled_ |
| Latency p50 / p95 | _to be filled_ | _to be filled_ |
