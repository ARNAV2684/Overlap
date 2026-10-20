# Stats engine

Last verified: 2026-10-20 · main `75ca4ee` · S1 (#51), S2 (#53) and S3 (#54) merged; S3 moments built and replayed, not yet run against a live Cosmos.

## Purpose

Calculates deterministic metrics and spots moments for explanation.

## Ownership

Registry: Azeem (recorded in PR #52). See [registry](../../plans/REGISTRY.md) and [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md).

## Inputs and outputs

Specified in the stats spec PR (not yet built):

- **In:** both hubs as consumer group `stats`.
- **Out, stat panels:** once per match second as `kind=stats` on `match-events`; the relay forwards them and the archiver keeps them (CONTRACTS §7.4).
- **Out, match state:** the latest numbers in Cosmos `match_state` (§4.2).
- **Out, moments:** documents in Cosmos `moments` with evidence packs and frozen context (§5, §10.1–§10.2, used for every trigger).

See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`stats/consumer.py`](../../stats/consumer.py), [`stats/main.py`](../../stats/main.py), [`stats/publish.py`](../../stats/publish.py), [`stats/triggers.py`](../../stats/triggers.py), [`stats/evidence.py`](../../stats/evidence.py).

Specifications: [`stats/specs/metrics.md`](../../stats/specs/metrics.md), [`stats/specs/windows.md`](../../stats/specs/windows.md), [`stats/specs/triggers.md`](../../stats/specs/triggers.md), [`stats/specs/evidence-packs.md`](../../stats/specs/evidence-packs.md), [`stats/specs/publishing.md`](../../stats/specs/publishing.md); plan [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md).

## Status and evidence

Specifications agreed in #50.

**Built in stats S1:** ordering, match state, xG, pass difficulty, speeds, sprints and whole-match totals, the `main.py replay` runner, and the hub consumer (unit-tested with a fake client). 27 tests pass.

**Cross-checks on generated data:**
- **xG:** goals ÷ engine xG is 1.08 over 180 league matches.
- **PPDA:** equals the generator's answer key.
- **Possession:** 0.03 from the generator's internal ball-time, a definition difference.

**Built in stats S2:** rolling windows, stat panels every match second (with a heavy block of pass network, pressing grid, zones and momentum buckets every minute), `match_state`, and `main.py live`.

**Local stack checks (2026-10-20):**
- **A 20× match (SYN-0505):** all 5,981 panels reached a browser socket through the relay, identical to the replay, and were archived in Cosmos `stats`. Median 0.65 s from event to panel.
- **A run with the engine killed and restarted mid-match (SYN-0506):** no gap in panels.

**Built in stats S3:** triggers (goal, red card, penalty, big chance, shot cluster, momentum swing, press change, milestone; `sprint` deferred), evidence packs, and moment documents written once to Cosmos `live` / `moments` with stable ids `MO-<match>-<ordinal>`. `main.py replay --moments` lists them. How each agent role should use them: [`stats/agents-guide.md`](../../stats/agents-guide.md).

**S3 measurements (2026-10-20, replay):**
- **Volume, season S1:** 19.7 moments a match (median 19.5, range 10–33).
- **Recall, 20 surge matches against 20 controls:** a `momentum_swing` or `press_change` fires for the surging team within 15 minutes of onset in 15 of 20 matches, against 10 of 20 controls.
- **Pranav's reader:** the fixture's shot clusters (`MO-1017-0013`, `MO-1017-0019`) pass `mcp_server/schema.parse_moment` once `context.players` is removed. The fixture's KES cluster equals his `agents/specs/examples/shot-cluster.md` apart from the ordinal.

**Not running yet:** moments against a live Cosmos (create-once is tested with an in-memory store), the `sprint` trigger, and Azure. Do not infer more from README file lists.

Evidence / checks to inspect: [`stats/tests`](../../stats/tests), [`CONTRACTS.md`](../../CONTRACTS.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [environments](environments.md).

Downstream / consumers: [screen-relay](screen-relay.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Next:

- **Pranav (D-02):** his reader must accept `context.players`, the other trigger types and their fact keys, and 1–500 `event_ids`. The exact list is in [`stats/agents-guide.md`](../../stats/agents-guide.md) §5.
- **S4:** the same engine against Azure, once its infrastructure exists, including a live check of the moments container.

The MCP sample is not a working stats producer.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Azeem (team-reported; registry unassigned); see Ownership above | Runtime remains placeholders at the inspected main revision; producer implementation is required. | [Specification](../../stats/specs/evidence-packs.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### STATS-01

| Field | Value |
|---|---|
| Review/input needed from | Pranav |
| Request | Validate the first real moment against the MCP source validator, including immutable evidence, cursor and frozen context. |
| Connected component | [mcp](mcp.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | See canonical request MCP-01 below; a constructed sample alone does not close it. |
| Status | Partly evidenced (stats S3, branch `stats/moments`): real engine-written shot-cluster moments pass `parse_moment` with `context.players` removed; as written they fail on `players` (D-02). No reviewer acceptance recorded yet. |
| Decision evidence / due date | S3 plan AC-08 (part), [`PLAN_stats_engine_S3.md`](../../plans/done/PLAN_stats_engine_S3.md). MCP-01 itself is Pranav's record to update. |

Incoming handoff: [MCP-01](mcp.md#mcp-01) is the canonical consumer request. Update that record with evidence rather than maintaining a second acceptance status.

[Project map](README.md) · [Rebuild and verification](setup.md)
