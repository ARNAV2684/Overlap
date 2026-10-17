# PLAN_generator_calibration-sources — public sources for the calibration targets

| Field | Complete this |
|---|---|
| Change | Fill `CALIBRATION.md` with public sources for the targets the engine specs use, mark each row's source quality, and add the shot, physical and conditions targets |
| Why | `CALIBRATION.md` says no target is used for tuning without a public source; the engine's smoke check (M5 of `PLAN_generator_match-engine`) needs them |
| Author / owner | Azeem |
| Status | Done (merged in PR #16). Follow-up: the rows still marked "needs source" in `CALIBRATION.md` |
| Reviewed commit | main · 75b7cba |
| Branch | `generator/calibration-sources` |
| Governing spec | `generator/specs/actions.md` §4 and §6, `engine.md` §4 and §9, `movement.md` §4 (in PR #15). `CALIBRATION.md` itself has no spec |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `CALIBRATION.md` | Modify | Sourced targets for goals, shots, conversion, passes, pass completion, cards, home/draw/away, match length; xG anchors (penalty 0.78, six-yard foot and header, headers overall, long range, weak foot); sprint threshold, top speed, distance; conditions with judgement calls labelled. A status per row: `sourced`, `weak source`, `needs source`, `ok` |
| `plans/active/PLAN_generator_calibration-sources.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. `CALIBRATION.md` is Azeem's (registry: Layer 1). Penalty xG moves
  from about 0.76 to the sourced 0.78 here; `CONTRACTS.md` §8 follows in the conditions contract PR.
- **Conflict scan:** No overlaps found on 2026-10-16 at 75b7cba. Sources checked: plans ✓ (`PLAN_generator_match-engine`
  names `CALIBRATION.md` for M5 only; this plan is its sourcing step) · PRs ✓ (#14 and #15 don't touch it) · branches ✓ ·
  hot files ✓ (none).
- **Done when:** every target the engine specs name has a row with a public link or an honest `needs source`; no
  match-level real data is used; the links open.
- **Risk:** a source is a mid-season or partial figure. Each row says what the source covers, and weak ones are
  marked `weak source`.
- **Handover:**
  - **Checked:** every target named in the engine specs (PR #15) has a row; 18 target rows sourced or weakly sourced with links,
    4 marked `needs source` (short-pass completion, offsides, two xG anchor points), plus 4 conditions rows; no match-level data used.
  - **Not checked:** that every link still opens; to verify in review.
