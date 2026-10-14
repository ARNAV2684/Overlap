# PLAN_mock_live-viewer — live viewer for the Event Hubs emulator

| Field | Complete this |
|---|---|
| Change | Add `uv run mock watch`: a local page that reads both hubs (consumer group `$Default`) and shows a live pitch, scoreboard and clock, event feed, messages per second per hub, and `seq` warnings for every match |
| Why | The emulator has no UI; the team needs to see that data really flows through Event Hubs, not just through the mock |
| Author / owner | Arnav |
| Status | In progress (PR open) |
| Reviewed commit | main · b8d449d |
| Branch | `mock/live-viewer` |
| Governing spec | `CONTRACTS.md` v0 §1 (pitch frame, time), §2–§4 (messages); transport as in `mock/README.md` (provisional; `plans/active/PLAN_infra_event-hubs.md` D-01). No layer spec governs `mock/`. |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `mock/overlap_mock/viewer.py` | Add | Reads both hubs, keeps per-match state (setup, score, clock, recent events, latest frame, `seq` checks, rates), serves the page and pushes updates over a WebSocket |
| `mock/overlap_mock/viewer.html` | Add | The page: hub rates, one card per match with scoreboard, SVG pitch (pitch frame, no flips) and event feed |
| `mock/overlap_mock/cli.py` | Modify | New `watch` command |
| `mock/README.md` | Modify | How to run the viewer |
| `plans/active/PLAN_mock_live-viewer.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. Read-only consumer; uses `$Default` so it never moves the `stats`,
  `relay` or `archiver` checkpoints, and stores no checkpoints itself.
- **Conflict scan:** No overlaps found on 2026-10-14 at b8d449d. Sources checked: plans ✓
  (`PLAN_mock_live-feed` touches `mock/` but is merged; `PLAN_infra_event-hubs` is a local draft touching only
  `infra/specs/` and `CONTRACTS.md`) · PRs ✓ (none open) · branches ✓ (all merged) · hot files ✓ (none touched).
- **Done when:** with the mock streaming into a freshly started emulator, `uv run mock watch` shows all three matches
  moving on the pitch with the right score and clock, both hubs' rates, and no `seq` warning; a page screenshot is the
  evidence.
- **Risk:** at 20× the viewer adds read load on top of the emulator's throughput cap; it is meant for 1×–5×.
- **Handover:**
  - **Checked (14 Oct, local emulator, freshly restarted):** `uv run mock play --match all --speed 1 --hubs emulator`
    plus `uv run mock watch --hubs emulator`; the page at `http://localhost:8788/` showed all three matches moving on
    the pitch with team names, kit colours and shirt numbers, score and clock, events feed, both hubs' rates
    (≈ 15 tracking messages/s for three matches at 1×), and `seq OK` on every match. Restarting the viewer mid-match
    rebuilt teams, scores and `seq` from the events history with no warnings. `uv run mock validate --match SYN-9002`
    still passes.
  - **Not checked:** against a real Azure namespace (`--hubs azure`); at 20× (the emulator throttles there anyway).
  - **Differences from the plan:** none.
  - **Known limits:** read-only and temporary like the rest of `mock/`; the page needs the viewer process running.
