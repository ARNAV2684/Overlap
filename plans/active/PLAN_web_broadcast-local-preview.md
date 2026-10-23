# Local broadcast and tracking heatmap preview

| Field | Value |
|---|---|
| Change | Improve the match presentation and make tracking heat visible |
| Why | User wants a more professional match view, using the current viewer as benchmark |
| Author / owner | Pranav (local prototype); shared web owners remain Arnav and Azeem |
| Status | Implemented — user accepted local preview and authorized publication; team review pending |
| Reviewed commit | main 1c7510d |
| Branch | web/broadcast-local-preview |
| Governing specs | Existing merged web/specs/pitch.md, charts.md and screens.md; local additions below are proposed for team review |

## Files
All paths below are relative to the repository root.

| File | Change |
|---|---|
| plans/active/PLAN_web_broadcast-local-preview.md | Scope, evidence and handover |
| web/specs/pitch.md | Proposed local broadcast/stadium behaviour |
| web/specs/charts.md | Heat legend, selection and coverage limitations |
| web/src/components/pitch3d/scene/pitch.ts | Procedural stands, floodlight fixtures and net detail |
| web/src/components/pitch3d/scene/figure.ts | User-requested local follow-up: natural proportions, kit details, gait and contact shadows |
| web/src/components/pitch3d/scene/stage.ts | Lighting/framing and optional tactical overlays |
| web/src/lib/live/motion.ts | Synchronized rendered motion and monotonic playhead |
| web/src/lib/__tests__/motion.test.ts | Timing, pause and velocity regression checks |
| web/src/components/pitch3d/PitchStage.tsx | Forward presentation mode to renderer |
| web/src/components/match/MatchScreen.tsx | Broadcast shell, mode switch and prominent heat panel |
| web/src/components/match/ScoreHeader.tsx | Compact scoreboard styling |
| web/src/components/match/PitchOverlay.tsx | Keep camera controls in watch mode; hide tactical captions |
| web/src/components/match/TrackingHeatPanel.tsx | Team/player heat selection, observed sample coverage |
| web/src/components/charts/HeatMap.tsx | Continuous colour intensity, pitch markings and empty state |
| web/src/app/globals.css | Scoped broadcast styles |
| web/README.md | Teammate startup and visual review instructions |

## Boundaries
No new runtime dependencies, contract changes, backend changes, model calls or external assets. User authorized a branch push and review PR; main is not merged automatically.
Synthetic match data only. No invented coordinates or match statistics. This is a stylised 3D broadcast prototype,
not photorealistic match footage. Existing camera controls and analytical views remain available.

## Conflict scan
Refreshed all remote branches at main `1c7510d` on 23 October. No open PRs and no remote branch with an unmerged exact-file overlap. `PLAN_web_live-home.md` references pitch/charts specs: its implementation is already merged in #82, which is this change's baseline. Shared web owners remain Arnav and Azeem; their review is requested through the PR, not claimed as completed. No registry hot shared files changed. Sources checked: active plans, open PRs, remote branches and registry.

## Acceptance
- Live Azeem generator match renders moving players, correct team names, clock and score.
- Watch mode hides tactical field overlays; Analyse restores them without reconnecting.
- Heat panel selects either team or any of its players, uses existing period-normalised tracking grids, and shows an
  empty state for no observations. Intensity is normalised per selection, not a percentage or cross-team comparison.
- Coverage describes received samples, not a full-match claim. Replay reset follows existing memory reset behaviour.
- Typecheck, lint and relevant existing chart/motion tests pass; desktop and narrow browser views inspected.
- No source changes outside the file map. Baseline can be recovered from main 1c7510d.

## Risks
More scene geometry can cost GPU time. Use batched crowd geometry and static scenery, no extra shadow-casting lights.
Heatmaps reflect frames received in this browser; late-join snapshots do not guarantee full tracking history.

## Handover
User accepted the local visual and timing result and authorized publishing for team use on 23 October. Team merge approval is pending. Next-generated `web/AGENTS.md` remains local and is excluded from the PR.

### What ships
- Broadcast scoreboard, Watch/Analyse modes, procedural stadium, refined grass/nets and player models.
- Team/player/period tracking heatmap, with explicit observed-session coverage and relative-intensity legend.
- Shared player/ball tracking clock, monotonic playhead, distance-driven running/ball rotation and responsive close camera.
- No additional assets, packages, credentials or backend services.

### Teammate reproduction
See [web README](../../web/README.md#broadcast-viewer-and-tracking-heatmap). Pull this branch for review or main after merge, install locked frontend dependencies, and use the existing local stack and generator. Local matches SYN-2310/SYN-2311 and emulator databases are not in Git; each teammate uses their own live or archived match.

### Validation
Typecheck and lint passed. Focused motion/story checks: 21 tests passed. Earlier chart/heat checks: 37 tests passed before timing refinement. Chrome inspected both live Azeem generator playback at 20x and recorded SYN-2311 in Close at 1x. Team/player heat filtering and Watch/Analyse switching observed. Full suite/build and narrow-screen review are recorded below after publication checks.

### Limits
Stylised procedural figures, not photorealistic footage or exact foot-contact animation. Source tracking is preserved; this does not correct generator physics. Heat coverage includes only received samples. GPU performance and Windows rendering have not been benchmarked. 20x is accelerated playback; use 1x for natural movement. Cloud deployment is unchanged.

### Publication checks — 23 October
- Full frontend suite: 486 passed, 2 opt-in live integration tests skipped.
- Lint, typecheck and diff whitespace checks passed.
- Production build: `NEXT_PUBLIC_DEFAULT_MATCH_ID=SYN-9001 npm run build -- --webpack` passed. Default Turbopack build could not bind its local PostCSS worker port (EPERM), even after an elevated retry. CI retains the default builder; its result must be reviewed before merge.
- Desktop Chrome verified; a 390px viewport rendered without horizontal document overflow. This is a basic responsive check, not mobile GPU certification.
- Fresh main remains 1c7510d; no open PRs or unmerged exact-file branch overlap at publication.
