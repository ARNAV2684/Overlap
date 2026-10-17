# Shot-cluster review example

> **Status: draft for review.** Proposed §10 shapes, not approved fixtures or runtime outputs.
> [S1](../../../plans/active/PLAN_agents_ai-insights-mcp_S1.md) · [contracts](../../../CONTRACTS.md).
> The events are from Azeem's generator. The moment/tool/card examples below are constructed specification
> examples; no stats service, MCP client or AI model produced them.

## 1. Reproducible source

- Generator recording commit: `0a52e71de763af7b50044718714b379cb2151428` (PR #40 head).
- Reviewed main: `ba75f51412a9b019fdb689d9c604d03ab82533d2`; its generator tree is identical:
  `9f0b9de2fe4a77e0a8eef563a56e3bd66e9bfc18`.
- Generated clubs: KES / Kestlebury United home; ORR / Orrinford Albion away.
- Seed `1017`, match `SYN-1017`, season `S1`, no storylines, kickoff `2026-10-24T19:00:00Z`.
- Recorded `setup.json` SHA-256: `a7536c5173c8966f23c9b9d43716358eb0a9bf3da6dd3ac2ccd8886b0b0bcd5c`.
- Recorded `events.ndjson` SHA-256: `6d594aa5c0a3baca5ed379739d4eb6329d9716530a60d04ba25c564b916c0c39`.

Regenerate with the pinned generator revision and its pinned environment (generated recordings remain ignored):

```bash
cd generator
uv sync
uv run python cli.py play --home KES --away ORR --match-id SYN-1017 --seed 1017 --kickoff 2026-10-24T19:00:00Z
```

This command records a match; it starts no Event Hubs or Azure connection. This S1 review reads an existing recording;
it does not claim a fresh regeneration or a new live viewer test. Hash changes require an explained source/version
update. Do not silently replace this input with legacy mock output.

| Shot event | Event seq | Period | Match ms | Outcome |
|---|---:|---:|---:|---|
| SYN-1017-01477 | 1477 | 2 | 3930800 | missed |
| SYN-1017-01542 | 1542 | 2 | 4083400 | saved |
| SYN-1017-01592 | 1592 | 2 | 4174400 | goal |

The interval is `(3874400,4174400]`: exactly 300,000 ms. Filtering the contiguous prefix through event 1592
finds exactly these three KES shots, in period 2. Period time at the trigger is 1,234,200 ms, beyond warm-up.
The context score below is recomputed from that prefix; it is not read from the final match summary.
The example moment ordinal is illustrative; the future stats publisher owns its durable assignment.

## 2. Proposed immutable moment

```json
{
  "id": "MO-1017-0001",
  "moment_id": "MO-1017-0001",
  "match_id": "SYN-1017",
  "kind": "moment",
  "schema_version": 1,
  "evidence_version": 1,
  "evidence": {
    "moment_id": "MO-1017-0001",
    "match_id": "SYN-1017",
    "trigger": "shot_cluster",
    "period": 2,
    "match_ms": 4174400,
    "clock": "65:34",
    "team_id": "KES",
    "player_ids": [
      "KES-11",
      "KES-10",
      "KES-07"
    ],
    "event_ids": [
      "SYN-1017-01477",
      "SYN-1017-01542",
      "SYN-1017-01592"
    ],
    "window": {
      "from_ms": 3874400,
      "to_ms": 4174400
    },
    "facts": [
      {
        "key": "shots_last_5min",
        "value": 3,
        "decimals": 0,
        "label": "Kestlebury United shots in this five-minute window"
      },
      {
        "key": "window_duration_min",
        "value": 5,
        "unit": "min",
        "decimals": 0,
        "label": "Duration of the evidence window in minutes"
      }
    ]
  },
  "source": {
    "event_seq": 1592,
    "period": 2,
    "match_ms": 4174400
  },
  "context": {
    "phase": "live",
    "score": {
      "home": 3,
      "away": 0
    },
    "teams": {
      "home": {
        "team_id": "KES",
        "name": "Kestlebury United"
      },
      "away": {
        "team_id": "ORR",
        "name": "Orrinford Albion"
      }
    }
  }
}
```

## 3. Expected tool projection

This is application `structuredContent`. The real MCP transport adds content/isError framing. `source=fixture`
is intentional: it never claims a Cosmos read.

```json
{
  "status": "ok",
  "match_id": "SYN-1017",
  "moment_id": "MO-1017-0001",
  "evidence_version": 1,
  "as_of": {
    "event_seq": 1592,
    "period": 2,
    "match_ms": 4174400
  },
  "state": {
    "phase": "live",
    "score": {
      "home": 3,
      "away": 0
    },
    "teams": {
      "home": {
        "team_id": "KES",
        "name": "Kestlebury United"
      },
      "away": {
        "team_id": "ORR",
        "name": "Orrinford Albion"
      }
    }
  },
  "provenance": {
    "source": "fixture",
    "document_id": "MO-1017-0001"
  }
}
```

Expected domain failure for a missing source:

```json
{
  "status": "unavailable",
  "match_id": "SYN-1017",
  "moment_id": "MO-1017-0001",
  "evidence_version": 1,
  "reason": "not_found"
}
```

## 4. Candidate lines and checked envelope

The following lines are expected-valid review examples, **not evaluated model output**. Both include a duration
claim. The analyst line does not claim increased pressure or goal quality.

```json
[
  {
    "mode": "casual",
    "lang": "en",
    "text": "Kestlebury United have taken 3 shots in the last 5 minutes.",
    "claims": [
      {
        "key": "shots_last_5min",
        "value": 3
      },
      {
        "key": "window_duration_min",
        "value": 5
      }
    ]
  },
  {
    "mode": "analyst",
    "lang": "en",
    "text": "Kestlebury United recorded 3 attempts over the last 5 minutes.",
    "claims": [
      {
        "key": "shots_last_5min",
        "value": 3
      },
      {
        "key": "window_duration_min",
        "value": 5
      }
    ]
  }
]
```

Expected verified outcome *if* the future checks pass:

```json
{
  "seq": 1,
  "kind": "overlay",
  "match_id": "SYN-1017",
  "match_ms": 4174400,
  "clock": "65:34",
  "data": {
    "overlay_id": "OV-1017-0001",
    "match_id": "SYN-1017",
    "moment_id": "MO-1017-0001",
    "period": 2,
    "clock": "65:34",
    "show_at_ms": 4174400,
    "duration_ms": 6000,
    "priority": "normal",
    "kind": "moment",
    "modes": {
      "casual": {
        "en": "Kestlebury United have taken 3 shots in the last 5 minutes."
      },
      "analyst": {
        "en": "Kestlebury United recorded 3 attempts over the last 5 minutes."
      }
    },
    "visual": {
      "component": "key_events",
      "window_ms": [
        3874400,
        4174400
      ],
      "highlight": {
        "team_id": "KES",
        "event_id": "SYN-1017-01592"
      }
    },
    "player_tags": [],
    "verified": true,
    "fallback": false,
    "facts_checked": [
      "shots_last_5min",
      "window_duration_min"
    ]
  }
}
```

Send the same overlay body with separately assigned audience seq values to `match-SYN-1017-casual-en` and
`match-SYN-1017-analyst-en`. The `seq=1` above is illustrative, not the event seq or relay seq.

Expected fallback uses the casual template for both modes, with `verified=false` and `fallback=true`.
Its facts are still checked. A fallback must have a visible template label; invalid evidence produces no envelope.

## 5. Negative cases and expected results

Mutations below apply to the valid example. They are test specifications, not claims that a validator exists.

| Case | Mutation | Expected |
|---|---|---|
| Wrong number | Text/claim say 4 shots; fact remains 3 | Reject candidate; bounded rewrite/template |
| Missing duration claim | Text still says 5 minutes, only count claim remains | Reject numeric coverage |
| Wrong dimension | Claim 5 is used for goals instead of minutes | Reject units/meaning even though a number matches |
| Spelled numeral | Text uses “three” | Reject first-slice digit-only profile |
| Unsupported cause | Append “because their press forced the opponent back” | Semantic rejection; no supporting fact |
| Future context | Tool as_of event_seq 1593 for this moment | Reject context even if match_ms is equal |
| Wrong match | Tool returns SYN-1018 | Reject; no model input |
| Half-time crossing | Put a period-1 event in period-2 evidence | Reject evidence |
| Window boundary | Add a shot at exactly from_ms | It is excluded by the open lower bound |
| Duplicate shot | Repeat event 1542 | Count once; conflicting body fails the prefix |
| Missing fact / duplicate key | Drop duration or repeat count under the same key | Reject evidence, no fallback publication |
| Duplicate source | Re-deliver same document | Reuse job/overlay/group seq; no second visible card |
| Source conflict | Same moment ID, different fact values | Reject conflict, never overwrite immutable source |
| Expired | Base playhead >4474400, or period changes | Suppress live card |
| Model outage | No checked candidate before deadline | Checked labelled template if still eligible |
| Delivery ambiguity | Send succeeds, acknowledgement write fails | Retry same envelope; client dedupes |
| Speed change | Replay same source at 1x and 20x | Same facts; at most 6 wall seconds on screen; report different expiry rates |

A boundary-only unit fixture can add a synthetic shot at the lower bound; it must be labelled as a constructed
case rather than a changed version of the recorded source. Keep full recording hashes/provenance unchanged.

## 6. Approval and validation boundary

Azeem reviews source interpretation; stats owner agrees detection/evidence; Arnav agrees immutable storage,
publication and recovery; Vedant agrees card/period/duration/audience handling. No approvals are recorded here.
S1 checks JSON syntax, source arithmetic, links and consistency. Real protocol/model/storage/browser tests belong
to M2–M4, with the broader evaluation set in [evaluation](../evaluation.md).
