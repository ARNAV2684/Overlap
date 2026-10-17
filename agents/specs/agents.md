# Agents spec

> **Status: draft for review.** First shot-cluster slice only. Governs role modules and `config.py`.
> [S1](../../plans/active/PLAN_agents_ai-insights-mcp_S1.md) · [workflow](workflow.md).
> Pranav owns this proposal; role expansion needs a later specification.

## 1. Moment spotter

Deterministic admission policy for `shot_cluster`: validate source, respect stable identity, cooldown evidence,
expiry and workflow budgets. It does not re-detect the trigger or invent importance scores. Priority is normal.
Stats owns counting/detection; the spotter consumes its evidence.

## 2. Tactical analyst

Only `get_match_state`, scoped by [tools spec](../../mcp_server/specs/tools.md), at most two invocations including
one retry. The local workflow obtains and validates this context before a candidate request. The analyst may
describe repeated shooting attempts, never infer pressing, tactical intent, dominance, chance quality or a
prediction from a shot count alone. Candidate interpretation is bounded to 240 characters and audited, not
displayed directly. Analyst and narrator share one model request for this first slice.

## 3. Narrator

Produce exactly two §5.1 lines: `casual/en` <=140 characters and `analyst/en` <=220 characters, including spaces.
Each contains the count and the window duration as Arabic digits and two ordered claims. No player-focus mode.
Casual uses plain words; analyst states the same observation precisely, not extra invented statistics.
See [prompt rules](prompts.md) and [numeric checks](fact-checking.md).

## 4. Fact-checker

Deterministic coverage/value/unit checks first, separate semantic model verdict second. A semantic pass cannot
override numeric failure. Both variants must pass; otherwise bounded rewrites or a labelled template for both.
See [fact-checking](fact-checking.md).

## 5. Translator

Deferred. Only English is supported in this slice. Do not expose translation success from an English-only test.
Later language work must preserve facts and add independent numeric/semantic and language-quality checks.

## 6. Director

Deterministic mapping to contracts §10.3: normal-priority moment, English casual/analyst, no player tags,
`key_events` visual reference, evidence window/highlight and original observation time. Exactly one overlay
identity per moment, independently sequenced delivery to each audience. It must respect current playhead expiry
and the frontend's maximum 6-second wall-time display policy. No model-selected destinations, chart names or durations.

## 7. Recap writer

Deferred. Expired/late evidence is retained for audit; that does not implement a recap service. Storyline answer
keys never enter agent inputs, even when a future recap feature is added.

## 8. Model and resource decision

The merged roadmap's **evaluation candidate** remains GPT-5 mini through Microsoft Foundry. This is not a
confirmed regional deployment or model-quality result. One approved deployment can serve candidate and semantic
review roles; neither spotter nor director requires an additional model.

Keep Python workflow/MCP execution local initially. Before M3 record deployment name, exact model/version,
supported structured-response/tool features, authorised identity, regional availability/quota, rates and a
monetary limit. Verify and pin Agent Framework and provider SDK versions then. No fallback to an unapproved model
or service; no paid request from an ordinary unit test.

Cost estimate uses measured input/output/cached/reasoning token categories at the deployment's applicable prices,
including semantic checks and retries. Workflow caps in [workflow §3](workflow.md) are usage limits, not a currency
estimate or budget approval. Model access is disabled by default until D5 is agreed.

Official integration reference: [Agent Framework MCP tools](https://learn.microsoft.com/en-us/agent-framework/agents/tools/local-mcp-tools).
The local orchestrator executes tools and passes results to the model; a model deployment does not need to reach
the laptop directly.
