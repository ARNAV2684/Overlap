# Responsible AI

Overlap puts model-written sentences in front of viewers in real time. These are the rules that keep them true,
honestly labelled and cheap, and where each one lives in the code.

## Synthetic data only

- Every club, player, league and match is invented by our generator ([`generator/`](../generator)). No real clubs,
  players, leagues, logos or broadcast material.
- A few clubs are *reference profiles*: invented names and crests whose style is hand-set to resemble a real team, so
  we can check the output makes sense. The mapping to the real team is never committed
  ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- Calibration targets come from public aggregate statistics, each cited in [`CALIBRATION.md`](../CALIBRATION.md).

## Numbers come from code, words from the model

- The stats engine computes every number and puts the ones a moment may cite in its **evidence pack**
  ([`stats/specs/evidence-packs.md`](../stats/specs/evidence-packs.md)). An agent may only quote numbers from that
  pack, each as a claim naming the fact it cites.
- The analyst reads context through read-only MCP tools bound to one match and moment, and writes its interpretation
  without numbers.
- The screen never computes a card's key number: it finds it in the checked sentence.

## The fact-checker and the template fallback

[`agents/fact_checker.py`](../agents/fact_checker.py), spec
[`agents/specs/fact-checking.md`](../agents/specs/fact-checking.md):

1. **Code check of every number:** value, unit, precision, the score, spelled-out numbers, numbers without a claim,
   duplicate or unknown claims, and names that are not in the match.
2. **Separate model check of meaning:** for example a penalty called open play, a hat-trick that is not one,
   "dominating" from a shot cluster, a reason for a red card the data does not give. A meaning pass can never
   override a numeric failure.
3. **At most two rewrites:** a failing line goes back to the narrator with the problems found.
4. **Then the template:** the line's checked template, filled from the evidence pack in code
   ([`agents/fallbacks.py`](../agents/fallbacks.py)) and put through the same code check.

Any model failure (timeout, error, budget, invalid output) falls back to the template for that step only. With the
model off, every card is a checked template, so the product works without any model.

Measured: 0 wrong numbers in 12,236 published lines, and every injected numeric fault caught with no valid line
rejected ([`evaluation.md`](evaluation.md)).

## Honest labels

- **AI · checked** appears only on a line a model wrote and the fact-checker passed.
- **Stat line · checked** marks a template. Templates are never called AI.
- Anything else is labelled **Unchecked** rather than passed off as either
  ([`web/src/lib/live/live-insights.ts`](../web/src/lib/live/live-insights.ts), `cardSource`; `CONTRACTS.md` §6: a
  line is never both verified and a fallback).
- The live insight cards (head-to-head, connections, engine room, tempo) say they are worked out in the browser from
  the events, and the engine room prints its formula.
- Each job records the prompt version and the model that wrote its lines ([`agents/prompts/`](../agents/prompts)).
- A card that arrives too late for its moment expires instead of showing out of context.

## Traced, scored and screened

- **Every agent run is traced** in Application Insights, one trace per card, with no prompt, payload or line text on
  any span ([`agents/specs/observability.md`](../agents/specs/observability.md)).
- **Published lines are scored** by Azure AI Evaluation: groundedness 98.3% on 60 lines of an Azure match
  ([`evaluation.md`](evaluation.md#line-quality-azure-ai-evaluation)).
- **Content safety is ready but off:** with `OVERLAP_CONTENT_SAFETY=azure`, Azure AI Content Safety screens each
  verified model line, and a flagged line, a failed screen or a timeout falls back to the template
  ([`agents/safety.py`](../agents/safety.py)). It needs a Content Safety resource, which is not deployed; the lines
  are short, factual and built from invented clubs and players.

## Translation, and the Hindi drop rule

[`agents/translator.py`](../agents/translator.py), [`agents/translation.py`](../agents/translation.py):

- Azure AI Translator translates the checked English lines into Spanish, Hindi and French; club and player names are
  protected so they come back as written.
- Every translated line is checked again in code against the English claims, after normalising the locale's number
  format. A verified line also needs a model check of the translation's meaning to stay **AI · checked**.
- A translation that changes a number is refused. The line falls back to its translated template, checked the same
  way, or is **dropped for that language**. English is never dropped because another language failed.
- In the Azure runs Translator sometimes reordered numbers in Hindi ("1–0 after 3 minutes" came back as "0–3 after 1
  minute"); those lines were dropped on purpose rather than shown wrong. A swap that keeps the same numbers in another
  order with no unit to give it away (a score `2–1` turned into `1–2`) could pass the code check, so numbers no longer
  reach the translator at all: each goes as an opaque placeholder pinned like a name and is put back afterwards, and a
  line whose placeholders don't all come back exactly once is refused. On a simulated Hindi translator that moves
  numbers this way, wrong Hindi lines went from up to 16 of 130 to 0, and drops from up to 19 to 0
  ([`agents/evals/results/hindi-numbers/`](../agents/evals/results/hindi-numbers/report.md)).

## No personal data

- No accounts or sign-in. Viewer preferences (mode, language, club, player) stay in the browser.
- Browsers get a receive-only Web PubSub connection, valid 10 minutes, for their own match's groups.
- No prompts or model outputs include personal data: the only people in the system are invented players.
- No secrets: every service signs in with a managed identity, keys are off, and CI scans every pull request for
  secrets ([`infra/specs/security.md`](../infra/specs/security.md)).

## Cost caps and budgets

- **Per moment and per match:** every model call goes through `ModelGate` ([`agents/models.py`](../agents/models.py))
  with limits on calls per moment (12), calls per match (120), tokens per match (400K), model jobs per match (12),
  input and output tokens per call, and a per-call timeout. Over a limit, the step uses its template.
- **A breaker** switches to templates when the provider keeps failing.
- **Only flagged moments** reach the agents (about 75 a match), never every event; low-priority comparison moments
  are thinned when the budget is tight.
- **The model deployment** has a small tokens-per-minute limit and a $25 budget with alerts at 50, 80 and 100 %; at
  100 % the deployment is removed and the site keeps working on templates.
- **The subscription** has budget alerts at every $25 up to $200; live matches start only from a rate-limited button,
  and the whole live pipeline is deleted between test windows ([`infra/specs/costs.md`](../infra/specs/costs.md)).
