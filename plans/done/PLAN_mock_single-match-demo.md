# PLAN_mock_single-match-demo

| Field | Complete this |
|---|---|
| Change | Restore and package the original single-match browser demo at 20× |
| Why | Make the existing local event timeline and pitch reproducible |
| Author / owner | Pranav |
| Status | Done (merged in PR #6) |
| Reviewed commit | main · b8d449d1bbd6c3f432e98ea0c9e895087e632bd0 |
| Branch | `mock/single-match-demo` |
| Governing spec | Merged `CONTRACTS.md` §2–§4 and §7; existing provisional mock web behavior documented in `mock/README.md`. This packages an existing temporary preview, not the production web app or screen relay. |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `mock/single-match-demo/index.html` | Add | Original single-match dashboard markup |
| `mock/single-match-demo/style.css` | Add | Original dashboard styling |
| `mock/single-match-demo/app.js` | Add | Original direct mock WebSocket client, timeline, inspector and pitch |
| `mock/single-match-demo/serve.py` | Add | Original loopback-only static asset server |
| `mock/single-match-demo/README.md` | Add | Portable setup, 20× commands, controls and limitations |
| `plans/active/PLAN_mock_single-match-demo.md` | Add | Scope and validation evidence |

- **Authorization:** Pranav approved the displayed original blue single-match viewer and explicitly requested publishing this setup in a pull request on 2026-10-14.
- **Contracts or hot shared files touched:** None. The existing producer and emulator configuration remain unchanged. No message shapes or dependencies are added.
- **Conflict scan:** At `b8d449d` on 2026-10-14, the active mock live-feed plan and all fetched origin branches have no matching paths. `origin/mock/live-viewer` changes different files; its viewer commits are excluded from this branch. The open-PR search returned no entries; PR #5 was checked directly and is closed without merging. Hot shared files: none touched. Sources checked: plans, PRs, branches and hot files.
- **Steps:** Copy the original four source assets unchanged; write portable instructions; check syntax and HTTP routes; view `SYN-9001` at 20× and check timeline, filtering, inspection, pause/resume and positions.
- **Done when:** Only the six listed files are added; source assets match the original local viewer; a browser receives changing match timestamps and data through the existing mock WebSocket; controls work; unknown static routes return 404.
- **Risk:** This preview bypasses Event Hubs. Its display does not validate the future relay, archiver or Azure deployment. Data comes from the existing temporary mock; it is synthetic and uncalibrated.
- **Handover:**
  - **Passed:** Fresh `uv sync --python 3.12` installed the existing mock dependencies into a separate `.venv`. Validated on macOS ARM64, Python 3.12.7, uv 0.13.1 and Chrome.
  - **Passed:** `uv run python -m overlap_mock.cli validate --match SYN-9001` completed in 11.5 seconds: 2,171 events, 29,977 frames, deterministic replay, score NBR 1–0 HBA.
  - **Passed:** `node --check mock/single-match-demo/app.js` and Python AST parsing. All four source assets are byte-for-byte identical to the original approved local viewer.
  - **Passed:** The packaged static server returned the exact four allowed assets with `Cache-Control: no-store`. Five unlisted paths (including source/config and traversal attempts) returned 404.
  - **Passed:** Live browser test with the packaged server and clean Python environment at 20×. Match clock, score, timeline and positions updated; snapshot history loaded; event/tracking/all filters, selected-message inspection and Follow latest worked. Pause held counters at 241 messages while the match clock advanced from 35:36 to 42:14; Resume caught up to 1,276 messages and 4,525 frames.
  - **Launch adjustment:** The existing installed `uv run mock` entry point raised `ModuleNotFoundError` in the fresh environment. The documented `uv run python -m overlap_mock.cli` invocation from `mock/` passes validation and launches the same producer. No shared packaging files were changed.
  - **Not checked:** Windows/Linux execution, Event Hubs readback, production Azure or complete message-delivery reliability. These are outside this direct preview's acceptance criteria.
  - **Setup:** Follow `mock/single-match-demo/README.md`. Ports 8787 and 8788 must be free; no Docker, Azure subscription or keys are required for the basic demo.
  - **Scope:** Six added files only. No production code, shared contracts, emulator settings, generated data, logs, environments or secrets are included.
  - **PR:** [#6 — Add single-match live browser demo at 20×](https://github.com/ARNAV2684/Overlap/pull/6). The plan remains active until review and merge.
