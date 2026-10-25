# Stats engine → agents guide

What the stats engine hands the agents workflow, and how each agent role should use it. Written for Arnav (agents
flow and display) and Pranav (MCP reader). The rules behind every number are in [`specs/`](specs/); this page is
the practical summary.

**Built in stats S3.** All triggers except `sprint` (deferred, D-01). Numbers below are measured on generated
league season S1 (90 matches) and the fixture `tests/fixtures/SYN-1017` (KES v ORR), with
`python main.py replay <folder> --moments`.

## 1. What you get

| Feed | Where | When | Use it for |
|---|---|---|---|
| **Moments** | Cosmos `live` / `moments`, partition `/match_id`, `kind = "moment"` | Once per fired trigger, while its event is processed (before the match's next panel) | Starting the workflow (change feed). The only citable numbers are its `evidence.facts` |
| **Match state** | Cosmos `live` / `match_state`, `id = "state"` | Every 5 match seconds, at period edges, and right after each moment | "What are the numbers now": the analyst's `get_match_state`, a late-joining screen |
| **Stat panels** | `stats` envelopes on the live screen; archived in Cosmos `stats` as `stats-<match_ms, 9 digits>` | Every match second; heavy block every minute | Charts on screen; history for later MCP tools (compare periods, pressing, pass network) |

The engine writes only `kind = "moment"` documents to `moments` and never edits one. Your `insight_job` and
`insight_outbox` documents can live beside them (agents workflow spec §2); filter the change feed on
`kind = "moment"`.

**Ids are stable.** `MO-<match 4 digits>-<ordinal 4 digits>`, ordinals in processing order. A restart replays and
re-creates the same ids with identical content (a no-op). Different content under an existing id stops the match;
the old document stays. Dedupe by `moment_id` and you are safe.

## 2. A moment, field by field

The fixture's first shot cluster (`MO-1017-0013`), which equals Pranav's `agents/specs/examples/shot-cluster.md`
apart from the ordinal:

```json
{
  "id": "MO-1017-0013", "moment_id": "MO-1017-0013", "match_id": "SYN-1017", "kind": "moment",
  "schema_version": 1, "evidence_version": 1,
  "evidence": {
    "moment_id": "MO-1017-0013", "match_id": "SYN-1017", "trigger": "shot_cluster",
    "period": 2, "match_ms": 4174400, "clock": "65:34", "team_id": "KES",
    "player_ids": ["KES-11", "KES-10", "KES-07"],
    "event_ids": ["SYN-1017-01477", "SYN-1017-01542", "SYN-1017-01592"],
    "window": {"from_ms": 3874400, "to_ms": 4174400},
    "facts": [
      {"key": "shots_last_5min", "value": 3, "decimals": 0, "label": "Kestlebury United shots in this five-minute window"},
      {"key": "window_duration_min", "value": 5, "unit": "min", "decimals": 0, "label": "Duration of the evidence window in minutes"}
    ]
  },
  "source": {"event_seq": 1592, "period": 2, "match_ms": 4174400},
  "context": {
    "phase": "live", "score": {"home": 3, "away": 0},
    "teams": {"home": {"team_id": "KES", "name": "Kestlebury United"}, "away": {"team_id": "ORR", "name": "Orrinford Albion"}},
    "players": [{"player_id": "KES-11", "name": "…", "pos": "RW"}, "…"]
  }
}
```

| Field | Meaning | Citable? |
|---|---|---|
| `evidence.facts` | The numbers. `value` is already rounded to `decimals`. `unit` is absent when there is none (never `null`) | **Yes, only these** |
| `evidence.trigger`, `team_id`, `player_ids` | What happened and who it is about. `player_ids` are in first-appearance order | Names via `context` |
| `evidence.event_ids` | Ascending by `seq`, always **ending with the triggering event** | No (for highlights) |
| `evidence.window` | The span the facts describe, in `match_ms`. `to_ms` = the moment's `match_ms` | No (for the visual) |
| `evidence.clock` | The broadcast clock, e.g. `65:34`, `45+0:05`, `90+5:46` | No (display only) |
| `source` | The last event the evidence was computed from (= the triggering event) | No |
| `context.score` | Score **after** the triggering event (a goal moment shows the new score) | No; use the goal pack's score facts |
| `context.players` | `{player_id, name, pos}` for every `player_ids` entry. **New field (D-02)** | Names and positions only |

A fact is **left out**, never sent as zero, when its sample is too small (today only `press_height_last_5min_m`
can be missing).

## 3. Triggers at a glance

Volume is per match on season S1 (19.7 in all; median 19.5, range 10–33).

| Trigger | Priority | Cooldown | Per match | Facts (key · unit · decimals) | In football terms |
|---|---|---|---|---|---|
| `goal` | high | none | 2.86 | `shot_xg` · xG · 2; `shot_distance_m` · m · 0; `team_goals_match`, `opponent_goals_match`, `player_goals_match`, `team_shots_match` · 0; `shot_is_penalty` (1/0) · 0 | A goal; the build-up passes are in `event_ids` |
| `red_card` | high | none | 0.49 | `team_players_on_pitch`, `team_fouls_match`, `team_cards_match` · 0 | A sending-off; the team is the **carded** team |
| `penalty` | high | none | 0.06 | `shot_xg` (0.78) · xG · 2; `team_goals_match`, `opponent_goals_match` · 0 | A **missed or saved** penalty (a scored one is a `goal` with `shot_is_penalty = 1`) |
| `big_chance` | normal | none | 1.61 | `shot_xg` · xG · 2; `shot_distance_m` · m · 0; `team_shots_match` · 0; `team_xg_match` · xG · 2 | A chance worth ≥ 0.20 xG that wasn't scored |
| `shot_cluster` | normal | 5 min per team per period | 2.59 | `shots_last_5min` · 0; `window_duration_min` · min · 0 | 3+ shots by one team inside 5 minutes |
| `momentum_swing` | normal | 10 min per team per period | 5.52 | `momentum_share_last_5min_pct` · % · 0; `momentum_share_previous_10min_pct` · % · 0; `team_shots_last_5min` · 0; `window_duration_min` · min · 0 | The team's share of weighted attacking actions jumped ≥ 25 points to ≥ 60 % |
| `press_change` | normal | 10 min per team per period | 6.04 | `pressures_per_opp_pass_last_5min` · 2; `pressures_per_opp_pass_previous_10min` · 2; `team_pressures_last_5min`, `team_high_regains_last_5min` · 0; `window_duration_min` · min · 0; optional `press_height_last_5min_m` · m · 0 | The team presses ≥ 1.5× more (label says "pressing more") or ≤ 1/1.5 as much ("pressing less") |
| `milestone` | normal | none | 0.57 | `player_goals_match` (2 or 3) · 0; `shot_xg` · xG · 2 | A player's 2nd or 3rd goal |
| `head_to_head` | normal | 15 min per role per period | 4–5 | Three `player_<m>_match` / `rival_<m>_match` pairs for the role (`evidence-packs.md` §1) | One player is clearly winning their battle with their opposite number in the same role; the **rival is the second `player_ids` entry, on the other team** |
| `connection` | normal | 20 min per team per period | 4–8 | `pair_passes_last_15min`, `pair_progressive_passes_last_15min`, `pair_final_third_passes_last_15min`, `pair_shot_moves_last_15min` · 0 | A new passing partnership is driving the team over the last 15 minutes |
| `workhorse` | normal | 15 min per period | 1–2 | `player_duels_won_match`, `player_recoveries_match`, `player_pressures_match`, `player_interceptions_match` · 0; with tracking `player_distance_km` · km · 1, `player_sprints_match` · 0 | A new hardest worker: running, duels, recoveries |
| `sprint` | low | — | 0 | Deferred (D-01) | — |

Priority isn't stored in the document; look it up by `trigger` from this table (`specs/triggers.md` §3).

**One event can fire several moments, in this order:** goal, red card, penalty, big chance, shot cluster, momentum
swing, press change, milestone, head-to-head, connection, workhorse. Per-match counts for the last three are from three
generated matches, not season S1. Nothing is merged: a goal that is also a cluster's third shot gives `goal` and
`shot_cluster` with the same last `event_id` (the fixture's `MO-1017-0012` and `MO-1017-0013`). Merging for the
screen is the spotter's call.

## 4. Role by role

### Moment spotter

- **Admit everything `high`** (about 3.4 a match). That leaves room under the proposed 12 admitted jobs a match
  (workflow spec §3) for about 8 of the ~16 normal ones.
- **Same event, several moments:** show the highest priority one; the others can feed the same card's analyst line
  (a goal plus its `shot_cluster`, a goal plus its `milestone`).
- **`momentum_swing` and `press_change` are the bulk** (about 11.5 a match together). They often come in pairs for
  the same team a few minutes apart (the fixture's 16:39 and 16:56). Keep one per team per 10 minutes across the two
  types if the budget is tight.
- Don't re-detect or re-score: the engine already applied the warm-ups (no cluster before 5:00 of a period, no
  comparison trigger before 15:00) and cooldowns.
- **What the comparison triggers catch:** with a pressure surge on one team from about the 55th minute, a
  `momentum_swing` or `press_change` fires for that team within 15 minutes in 15 of 20 matches, and in 10 of 20
  without the surge. Within 10 minutes: 7 of 20 against 2 of 20. So these are real signals, but ordinary matches
  produce them too. Treat them as "worth a line", not "the turning point".

### Tactical analyst

- `get_match_state` returns the latest `match_state`: `source {event_seq, match_ms}`, `phase`, `period`, `clock`,
  `score`, `panel` (the latest light panel: possession, shots, xG, passes, PPDA, pressing rate, momentum share,
  press height, last 10 minutes), `totals` per team and `players` per player (`specs/publishing.md` §1–§2).
- It is "now", not history. A moment is older than `match_state` by up to a few seconds of match time; compare
  `source.event_seq` with the moment's `source.event_seq` and don't describe numbers past the moment as its cause.
- History (for the deferred compare-periods, pressing and pass-network tools) is in the archived panels in Cosmos
  `stats`, one per match second, `heavy` every minute.
- The analyst's interpretation may use `match_state` for context, but the public line still cites only the
  moment's facts.

### Narrator

Cite only `evidence.facts`; write values exactly as rounded (`0.15`, not `0.2` or `15%`). Example numbers in the
table are illustrative unless they come from the fixture. Use the names in
`context.teams` and `context.players`. Football wording that the facts support:

| Trigger | Do | Don't |
|---|---|---|
| `goal` | "<scorer> scores, a 0.15 xG chance from 12 m. 1–0 Kestlebury." (score from `team_goals_match` / `opponent_goals_match`) | Call a low-xG goal "a tap-in", or a 0.6 xG one "a wonder goal" |
| `red_card` | "Orrinford are down to 10." | Guess the reason for the card |
| `penalty` | "Penalty missed/saved." (the outcome is the trigger itself) | Call it a goal; the scored ones are `goal` moments |
| `big_chance` | "A big chance: 0.31 xG from 9 m. Their 6th shot of the match." | "Should have scored" (xG isn't a verdict) |
| `shot_cluster` | "Kestlebury United have taken 3 shots in the last 5 minutes." | Infer pressure, dominance or a likely goal (Pranav's checker rejects these) |
| `momentum_swing` | "Kestlebury have taken over: 100% of the attacking actions in the last 5 minutes, up from 49%." | Say "possession" (momentum counts weighted attacking actions, not the ball) |
| `press_change` (more) | "Orrinford are pressing harder: 1.10 pressures per opponent pass, up from 0.60." | "High press" unless `press_height_last_5min_m` is present and high |
| `press_change` (less) | "Kestlebury are pressing less: 0.55 pressures per opponent pass, down from 1.07." | "Tired" or "parking the bus" (intent and fitness aren't facts) |
| `milestone` | "His 2nd of the match." | "Hat-trick" unless `player_goals_match` is 3 |

The direction of `press_change` is in the first fact's label ("pressing more" / "pressing less"); the two rate facts
give the size of the change.

### Fact-checker

- **Claim → fact:** every number in a line maps to one `facts[].key`. Keys are unique in a pack.
- **Values:** compare at the fact's `decimals` (half-up). Integers have `decimals = 0` and arrive as integers.
- **Units:** `xG` (no `%`), `m`, `min`, `%`. A percentage fact's `value` is already 0–100.
- **Score:** only from `team_goals_match` / `opponent_goals_match` (goal and penalty packs). `context.score` is not
  citable, as Pranav's spec already says.
- **Names and positions** from `context.players` are words, not facts.
- **0/1 flags:** `shot_is_penalty`; "from the spot" needs 1.

### Director

`show_at_ms = evidence.match_ms`, `clock = evidence.clock`, `period = evidence.period`, highlight
`team_id` and the **last** `event_id` (the triggering event), `window_ms = [window.from_ms, window.to_ms]`.
Suggested visual per trigger (`CONTRACTS.md` §6 components):

| Trigger | Visual | Highlight |
|---|---|---|
| `goal`, `big_chance`, `penalty` | `shot_map` (or `key_events` until it exists) | The shot (last `event_id`) |
| `shot_cluster` | `key_events` now (§10.3); `shot_map` later | All `event_ids` are the shots |
| `momentum_swing` | `momentum_tide` | `team_id`, the window. The triggering event can be the other team's (any event can tip the share), so don't highlight it as this team's action |
| `press_change` | `pressing_zones` | `team_id`, the window; `event_ids` are its latest pressures (≤ 20) |
| `red_card` | `stat_bars` or `key_events` | The card (last `event_id`); the foul before it is the first one when present |
| `milestone` | `key_events` with a player tag | `player_ids[0]` |

Ordering is by priority, then newer first (`specs/triggers.md` §3). Whether a `high` card may replace a visible
`normal` one is your and Vedant's call; §10.3 currently allows one visible card.

### Translator

Translate words only. Keep every number, key and unit exactly as in English and the claims list unchanged; the
checker runs again on each language. Team and player names stay as in `context`.

### Recap writer

All the match's moments are in `moments` (query `kind = "moment"` for the `match_id`, ordered by `id`), plus the
final `match_state` (written at the last `PeriodEnd`) for totals and per-player numbers. Storyline answer keys
(`summary.json` in generated data) must never reach it.

## 5. What Pranav's reader must accept (D-02)

Pranav's strict schema (`mcp_server/schema.py`) accepts the fixture's shot clusters **only with `context.players`
removed** (checked: `MO-1017-0013` and `MO-1017-0019` pass that way, and fail as written). To read every moment the
engine writes, it needs to accept:

1. `context.players`: a list of `{player_id, name, pos}`.
2. `trigger` values `goal`, `red_card`, `penalty`, `big_chance`, `momentum_swing`, `press_change`, `milestone`
   (and later `sprint`).
3. The fact keys in §3, with `decimals` 0 or 2, an optional `unit` (`xG`, `m`, `min`, `%`), 2–7 facts per pack.
4. `event_ids` with 1–500 entries, not just ≥ 3. On season S1: milestone always 1, momentum swing 1–9, goal 1–36
   (a goal straight from a turnover has only the shot), big chance 1–25, press change 3–21, red card and penalty 2.
5. **The fixture cluster's id is `MO-1017-0013`, not `MO-1017-0001`.** Ordinals count every moment of the match
   (`specs/publishing.md` §3), and twelve come before it. His sample `mcp_server/samples/MO-1017-0001.json` and the
   tests that read it keep working as a constructed sample, but a real engine run produces `0013`.

Until then, only `shot_cluster` moments with `players` stripped can pass his reader.

## 6. Running it yourself

From `stats/`:

```bash
python main.py replay tests/fixtures/SYN-1017 --moments              # the 21 moments of KES v ORR
python main.py replay ../data/seasons/S1 --moments --out moments.json # every moment of a season
```

Live, `python main.py live` writes them to the local Cosmos emulator beside the stat panels and `match_state`.
