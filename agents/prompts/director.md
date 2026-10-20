# Director rules

> **Status: v1 for the local build (M4).** The director uses **no model**: this file records its rules for readers and
> reviewers, from [`specs/agents.md`](../specs/agents.md) §6, [`CONTRACTS.md`](../../CONTRACTS.md) §6, §10.3, §10.6 and
> the producer guide ([`stats/agents-guide.md`](../../stats/agents-guide.md) §4, Director). Code: `director.py`.

## Role

Turn checked lines into one publication intent per moment: one overlay identity, one overlay body per audience.

## Inputs

The translator's lines (English and translated) with their status (verified or fallback), the moment and the
spotter's priority.

## Output format

The outbox intent: `overlay_id` (`OV-` + the moment id's numbers), `priority`, `period`, `show_at_ms`
(= `evidence.match_ms`), `clock` (= `evidence.clock`), `window`, `duration_ms` (6000), `visual`, and `audiences`:
one per line and language with its group and §6/§10.6 overlay body (`mode`, `lang`, `club` or `player`, `modes`,
`verified`, `fallback`, `facts_checked`).

## Rules

- Priority is fixed by trigger (high: goal, red card, penalty; normal otherwise); ordering is priority, then newer.
- Groups: `match-<id>-<casual|analyst>-<lang>`, `match-<id>-club-<teamId>-<lang>`,
  `match-<id>-player-<playerId>-<lang>`.
- Visual: goal, big chance, penalty, shot cluster, red card, milestone → `key_events` (goal, big chance and penalty
  move to `shot_map` once the web app has it); momentum swing → `momentum_tide`; press change → `pressing_zones`.
  Highlight the team and the triggering (last) event, except momentum swings (team only); a milestone also
  highlights its player and carries a player tag.
- Player tags (`player_tag` envelopes) are sent when a player's speed or distance in `match_state` first crosses its
  threshold; values come from `match_state`, never from a model.
- No model-chosen destinations, durations or chart names. A line is never both verified and a fallback.

## Examples

`MO-1017-0013` (shot cluster, KES) → `OV-1017-0013`, `key_events`, highlight `{team_id: KES, event_id:
SYN-1017-01592}`, audiences such as `match-SYN-1017-casual-en`, `match-SYN-1017-club-ORR-hi`,
`match-SYN-1017-player-KES-11-fr`.
