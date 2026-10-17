# PLAN_generator_reference-feet — sourced preferred feet for the reference clubs

| Field | Complete this |
|---|---|
| Change | Set every reference player's `preferred_foot` from public player profiles instead of estimates; 10 players change |
| Why | About half the feet in `reference_clubs.yaml` were guesses. Foot drives which side a player cuts in from and which foot he shoots with, so wrong feet weaken the reference clubs as an answer key |
| Author / owner | Azeem |
| Status | In progress |
| Reviewed commit | main · 3463497 |
| Branch | `generator/reference-feet` |
| Governing spec | `generator/specs/world.md` §3 (hidden traits) and §5, agreed in PR #8. No spec change: feet stay hand-set from public knowledge of each player |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `generator/reference_clubs.yaml` | Modify | `preferred_foot` for 10 players (SKH 42 both, SKH 37/56/61 left; AMH 32/11/21/26/36/50 left); `weak_foot` 4 for SKH 42, which is both-footed |
| `plans/active/PLAN_generator_reference-feet.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. `preferred_foot` stays inside the generator; the match setup is
  unchanged.
- **Source:** public player profiles (a club squad page for club A; player profile sites for club B and two club A
  players), looked up on 2026-10-15. Game rating databases were not used as the source of any value. Two players'
  sources disagree; the majority value is used. The real names and sources stay in Azeem's private notes, outside
  the repository.
- **Conflict scan:** No overlaps found on 2026-10-15 at 3463497. Sources checked: plans ✓ (no active plan changes
  `reference_clubs.yaml`) · PRs ✓ (none open) · branches ✓ (none touch `reference_clubs.yaml`) · hot files ✓ (none).
- **Done when:** the 10 feet are changed and nothing else in the YAML is; `pytest` passes (26 tests, including the
  private name check on Azeem's machine); `ruff` has nothing to check (no `.py` changes).
- **Risk:** a disputed foot is wrong; it only shifts that player's shooting and crossing side and is easy to correct.
- **Handover:**
  - **Checked:** the diff changes exactly the 10 players listed, nothing else in the YAML; `pytest` 26 passed with
    none skipped (the private name check ran). Feet now: SKH 15 right, 8 left, 2 both; AMH 17 right, 9 left.
  - **Not checked:** the two disputed feet beyond majority of sources.
