# PLAN_generator_batch-mode — G6 batch seasons, repeat runs and the realism report

| Field | Complete this |
|---|---|
| Change | Add batch mode (full seasons and two-club repeat runs), the realism report (every sourced `CALIBRATION.md` row plus the Skyhaven vs Amberholt answer key), and the `season` and `report` commands |
| Why | Registry deliverable G6. The engine's tuning (M3 part 2) and AC-06 need many matches measured against `CALIBRATION.md` in one command |
| Author / owner | Azeem |
| Status | Done (merged in PR #24) |
| Reviewed commit | `generator/engine-balance` (PR #23, stacked on #20–#22) |
| Branch | `generator/batch-mode` |
| Governing spec | `generator/specs/live-and-batch.md` §3–§5, agreed in PR #18 |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `generator/batch.py` | Modify | Round-robin fixtures (circle method, seeded), repeat runs, suspensions between matches, season files in `data/seasons/<season_id>/` |
| `generator/realism_report.py` | Modify | Measures each `sourced` / `weak source` row of `CALIBRATION.md` and the answer key; writes `report.md` and charts |
| `generator/cli.py` | Modify | `season` and `report` commands |
| `generator/engine.py` | Modify | The match summary also carries top speed and distance per player (for the physical rows) |
| `generator/pyproject.toml` | Modify | `matplotlib` for the charts |
| `generator/tests/test_batch.py` | Add | Fixtures, suspensions, repeat runs, report rows |
| `plans/active/PLAN_generator_batch-mode.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. Season files are the generator's own; loading them into Cosmos DB
  is outside this plan (the spec says so).
- **Conflict scan:** No overlaps on 2026-10-17. Sources checked: plans ✓ (the engine and live-mode plans are Azeem's;
  this plan touches `engine.py` only to add summary fields) · PRs ✓ (#20–#23 are this stack) · branches ✓ · hot files ✓.
- **Done when:** `cli.py season --repeat 10` plays ten Skyhaven vs Amberholt matches and `cli.py report` writes a
  report with every sourced target, its measured value and pass or fail, plus the answer key; tests pass.
- **Risk:** a full 10-club season can't run until the world has its other 8 clubs (world M3); until then a season of
  the two reference clubs is a double round robin of two matches, and repeat runs do the work.
- **Handover:**
  - **Checked:** `cli.py season --repeat 12 --report` plays 12 Skyhaven vs Amberholt matches into
    `data/seasons/S1-repeat-SKH-AMH-12/` and writes `data/generated/reports/S1-repeat-SKH-AMH-12/report.md` with nine
    charts. Targets come straight from `CALIBRATION.md`: **10 of 16 measured targets pass** (yellow cards, match
    length, penalty xG, six-yard foot and header, 25 m xG, weak-foot shots and passes, sprint threshold, top speed,
    distance). Failing: goals 4.25 (2.7–3.3), shots 31.1 (25–28), conversion 13.7 % (10–12 %), passes 1,058 (820–950),
    completion 75.2 % (79–84 %), fouls 8.75 a team (9–14). Home/draw/away is marked not meaningful for a repeat run.
  - The report found two engine bugs, fixed in this branch: finishing skill was counted twice in the shot model (goals
    ran at 1.6× xG), and an indirect free kick could give a shot the non-contract situation `free_kick_indirect`.
  - `pytest` 80 passed (5 new); `ruff 0.17.0` clean.
  - **Not checked:** a full 10-club season (needs the other 8 clubs); suspensions are tested only through the code
    path a season takes, not in a long season.
