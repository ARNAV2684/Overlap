# Evaluation spec

> **Status: agreed for the build** (Arnav, layer 5 owner, 20 Oct 2026). Governs `evals/*.py`. Plan:
> [`PLAN_agents_insights-build`](../../plans/active/PLAN_agents_insights-build.md). Extends the first slice (#44) to
> all eight triggers, seven agents, four modes and four languages. All runtime results below are **required future
> checks**, not tests passed by this document.

## 1. Recall and provenance

Pin generator commit/tree, seed, clubs, match ID, kickoff, storyline inputs and hashes of source setup/events.
Use Azeem's generated clubs; [the worked example](examples/shot-cluster.md) is derived from one real generator
recording, not the legacy mock and not a running stats service.

Inputs are real generated matches: a league season (`generator` batch mode), the storyline runs (each of the six
storylines on several seeds) and the same seeds without storylines as controls, turned into moments with
`stats/main.py replay … --moments`. Build an independent labelled set from the ordered event log using the agreed
trigger rules (`stats/specs/triggers.md`), including warm-ups, interval boundaries and cooldowns. Report separately: eligible moments, detected moments, admitted model
jobs, verified cards, template cards, suppressed/expired cards and displayed cards. Detection recall is detected /
eligible; displayed coverage is displayed / eligible. A zero denominator is N/A, never 100%.

Generator storyline keys can help label later scenarios but must remain in the evaluator only. Do not feed answer
keys to tools/models or claim that detecting a configured storyline proves general tactical understanding.

## 2. Numeric accuracy and failure cases

Before M3 acceptance use at least 30 labelled inputs: ten valid clusters from at least three generated matches,
ten numeric/schema faults and ten unsupported-meaning/context faults. The single documentation example is not
this dataset. Include same-valued count/duration, interval boundary, wrong match, later-event same timestamp,
half-time, duplicate source conflicts and budget/time failures.

Hard requirement: no incorrect numeric or unsupported claims published in the agreed evaluation set. Record
false rejections and template/suppression rates, so suppressing everything cannot masquerade as useful accuracy.
Test real MCP initialise/list/call separately from direct tool functions. Fixture results say `fixture`; store
integration must point-read an actual agreed local store with the same bounded source.

Recovery tests: duplicate/concurrent notification, crash after claim, source retry, crash after outbox save,
partial audience sends, ambiguous send retry, restart beyond deadline. Exactly-once external calls are not an
acceptance claim. No fake browser/inspector success substitutes for an actual rendered insight.

## 3. Quality

Review both English variants blind to generator answer keys. Judge factual support, readable wording, whether
the line adds a useful observation, and whether the fallback label is visible. Proposed rubric 1–5; median >=4
for supported/readable output, with no unsupported published claim in the reviewed set. Owners agree examples
and thresholds before M3; a judge/model score is not a guarantee.

Foundry groundedness/fluency evaluation is an optional diagnostic, not a required paid dependency for M1/M2.
If used in M3, record evaluator version, deployment, cost and calibration against human judgments. It cannot
override deterministic rejection. No deployment/evaluator choice is approved by this spec draft.

## 4. Latency, speed and spending

Instrument source publication, first durable job observation, tool call, model calls, validation, outbox commit,
service send and actual card-render acknowledgement. Use wall clocks for elapsed durations; document clock skew
when endpoints are on different machines. Report queue delay separately. SDK send success is not display latency.

Measure p50/p95/max and sample size; report verified, fallback and suppressed outcomes separately.
Proposed ready-overlay p95 target <=8 wall seconds; absolute workflow deadline 15 seconds. Both are unmeasured.
At 1x and 20x replay the same recording: evidence identities/counts stay equal; visible coverage may differ because
latency/expiry is wall-time-sensitive. Report that difference instead of changing observation timestamps.

Log calls and all provider-metered token categories, including retries and reasoning where billed. Test budget
exhaustion without paid calls; then measure actual rates/usage only after D5 approval. Reserved unknown spend
after a failed request is not assumed free.

M4 passes only with the actual stats producer -> MCP/workflow -> delivery -> Vedant's real card, plus the failure
checks. Running old screen/archiver tests proves those components, not this new insight path.

## 5. Azeem's review and the gold set (human in the loop)

Azeem reviews agent behaviour with football judgement, per agent, on real moments from the evaluation matches.

- **Review sheet** (generated by `evals/review_sheet.py`): one row per moment per agent — trigger, facts, names, the
  agent's decision or lines per mode and language — with columns for keep/drop (spotter) or accept/reject (lines),
  a reason, and a score 1–5. About 40–50 rows per agent per round; two rounds (local model for plumbing, then the
  Azure model).
- **What his answers become:** rules and examples in the agent's prompt file, and a **gold set** (moment, expected
  decision or acceptable wording, reason) that is re-scored automatically on every prompt or model change.
- **Report per round:** spotter agreement with his keep/drop, line acceptance rate and median score per mode and
  language, numeric errors (must be zero), template and suppression rates, and the changes made from his answers.
- Answer keys still never reach any agent input; Azeem sees them only where they help him judge recall.

## Release timing audit
Completed stage outputs retain monotonic `duration_ms`, excluding queue wait, save_stage and publication.
Model call audits include successful and handled-failure invocation duration (including internal retries).
Resuming a completed stage keeps its original timing; missing historical measurements are not zero latency.
`python -m evals.latency jobs.json` summarizes these local exported job documents. Model-call success is not
proof that its words passed checking or reached the browser. Compare stdio and embedded using the same fixture,
separately reporting first-call import cost and later calls; cloud Cosmos/model performance needs its own test.

## 6. Single agent against the seven (D6)

`evals/single_vs_multi.py` runs the same moments two ways and writes `evals/results/single-vs-multi-<run>/`:

- **Seven agents:** the full pipeline (spotter → analyst over MCP → narrator → fact-checker with up to two rewrites
  → translator → director), as deployed.
- **Single agent:** the narrator alone, with the same model, prompt and two-batch split
  (`narrator.draft`), but no analyst interpretation, no fact-checker and no rewrites. It publishes what it writes.

Both arms run on the moments the pipeline admitted with the model (merged and suppressed moments are skipped and
counted). English only, because the single agent writes English only (translation is §7). Each published line is
judged against the moment's evidence by code:

- **Wrong number:** a value that is no fact's value in the moment: wrong whatever it meant (a lower bound).
- **Unverified number:** the fact-checker's code check could not tie a number to its fact at its value, order, unit
  and precision (`numeric_check`, as `run_match.recheck` does on outboxes). It may be true (a score told from the
  trailing side, a claim attached to the wrong fact), but nothing checked it; the pipeline never publishes one.
- **Unsupported claim:** the do/don't wording rules, penalty and direction wording. (The name rule refuses
  ordinary capitalised openers too, such as "Press", so it counts only under refused.)
- **Refused:** any problem the code check sees (the above, plus length, markup and internal ids).

Also reported: the pipeline's first draft (with the analyst's interpretation), code and meaning rejections, rewrites,
template and dropped lines, verified model lines, model calls per moment and latency p50/p95. Meaning faults only a
model or a person can judge are not counted for either arm, so the single agent's figures are a floor.

Runs: the deployed model (Azure OpenAI in Foundry, gpt-5-mini, minimal reasoning) with the deployed limits (6 s per
call, 15 s per moment) and with relaxed limits (20 s, 60 s) to show the fact-checker's loop when it has time; and a
local model (Foundry Local, phi-4-mini) as a free, repeatable reference. Azure calls are billed, so the bench refuses
`OVERLAP_MODEL_PROVIDER=azure` unless `--allow-paid` is given. Inputs: the fixture match SYN-1017 with its MCP
fixture files, or recorded bench matches (`--matches`, needs the stats engine's environment); `--from-rows` rebuilds
a report from a saved `moments.json`. Budgets and the breaker are opened wide for the run, so neither arm is turned
into templates by a budget; Azure latency is measured from the developer machine and includes the network.
The recorded Azure runs (25 Oct) predate the precision leniency in fact-checking.md §1.6, so their unverified and
refused counts for the single agent are higher than a re-run would give; the wrong-number and unsupported rows
do not depend on it.

## 7. Hindi numbers (D7)

`evals/hindi_numbers.py` writes `evals/results/hindi-numbers/`. Every fixture moment goes through the agents with the
provider off (template lines) in English and Hindi, with a **simulated** Hindi translator: it changes the word order
(postpositions move to the front) and, in a stated share of lines with two or more numbers, moves the numbers between
slots, as Azure AI Translator did in October. The share is unknown for Azure, so 25%, 50% and 100% are reported, each
with numbers sent raw (before) and as placeholders (after, `translation.ProtectedNumbers`). Reported per share:
Hindi lines dropped, wrong Hindi lines that passed the re-check (a swapped score such as `2–1` → `1–2` keeps the same
numbers in another order), and digits the translator saw (must be 0 after). A control run without swaps must drop
nothing. The simulation measures the guard and the re-check, not how often Azure keeps a placeholder; the first Azure
run after deploy records the real Hindi drop rate beside it.
