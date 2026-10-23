# Charts

Owners: Arnav, Azeem. Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). Built in
`src/components/charts/`, with the data shaped by pure functions in `src/lib/live/charts.ts` (tested in
`__tests__/charts-data.test.ts`). The earlier chart specs are kept in [`vedant-frontend/`](../../vedant-frontend/README.md).

## 1. Shared rules

- Pitch charts draw on `MiniPitch` (viewBox in metres, 105 × 68), always in the **team frame**: the team attacks left →
  right. Events already are (`CONTRACTS.md` §1.1); tracking-based heat is turned per period.
- Team colours go through `overlayColour()` (see `design-system.md` §2).
- A value sent as `null` (`low_sample`) shows "–", never 0.
- Every chart has an empty state, and is recomputed only when the match memory changes (about once a second).

## 2. Momentum

The stats engine's weighted momentum per 5-minute bucket (`CONTRACTS.md` §8), both halves side by side: home above the
line, away below, as smoothed (Catmull-Rom) tides with a gradient, the live bucket from the newest panel, and each goal
marked at its minute on the scorer's side.

## 3. Team stats

Split bars from the light panel: possession, xG, shots, on target, passes, pass accuracy, momentum share (10′), PPDA
(10′; lower is better) and press height (10′). The leading value is brighter.

## 4. Shot map

A team's shots on the attacking half, coloured by outcome, goals larger with a line to goal; the shot an AI card points
to pulses. Size is fixed until per-shot xG reaches the screen (`heavy.shots`, not in the contract yet).

## 5. Heatmap

Seconds per zone (21 × 14 grid) from tracking, smoothed and blurred, for the followed player or the whole team.

## 6. Pass map

Each pass as an arrow: completed in the team colour (brighter when progressive: ≥ 10 m forward into the opponent's
half), failed in grey, key passes (a shot followed) in the accent; with completed / progressive / key counts. The
followed player's, or the team's (newest 160).

## 7. Pass network

The heavy block's network for one team: each player at the mean spot they pass from (with their shirt number), links
for pairs with three or more completed passes, thicker and stronger for more.

## 8. Key events

Goals (with assist), penalties missed, cards and substitutions on a two-sided timeline: home left, away right, minute
in the middle; the event an AI card points to is highlighted.

## 9. Pressing

The heavy block's pressing grid (9 columns from the team's own goal × 6 rows from its left) as a heat grid with counts,
the press-height line, and the share of pressing actions in the opponent's half with the 10-minute PPDA.

## 10. Prominent tracking heat (proposed for shared review)

A panel below the pitch exposes team and player selection independently of insight preferences. It reuses heatGrid,
including its per-period direction correction and smoothing. A cool-to-warm legend means low to high relative
observed density; each selection is normalised to its own maximum, so colour is not an absolute cross-team measure.
The panel labels its observations explicitly: it only knows tracking delivered during this viewing session (including
any replayed frames). Never claim full-match coverage or total distance from this grid. No observations gives an
empty state. Team density includes all observed players, including substitutes while on the pitch.
