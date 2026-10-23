# Charts

> **Status: agreed.** Owners Arnav and Azeem; merged for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md) and extended for
> [`PLAN_web_football-revamp`](../../plans/active/PLAN_web_football-revamp.md) (agreed by Azeem, 23 Oct 2026).

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

A team's shots on the attacking half, coloured by outcome, goals with a line to goal; the shot an AI card points to
pulses. **Size by xG** (area proportional to xG) from `heavy.shots` (`CONTRACTS.md` §7.4); panels without it keep
fixed sizes.

## 5. Heatmap

Seconds per zone (21 × 14 grid) from tracking, smoothed and blurred, for one player or the whole team, on a dark pitch
from blue (low) to red (high), with a legend. Shown in the tracking heatmap panel (§10), not as a tab.

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

## 10. Tracking heatmap panel

A panel below the pitch (`screens.md` §2.6) with its own team, player and period selection, independent of the
viewer's preferences. It reuses heatGrid,
including its per-period direction correction and smoothing. A cool-to-warm legend means low to high relative
observed density; each selection is normalised to its own maximum, so colour is not an absolute cross-team measure.
The panel labels its observations explicitly: it only knows tracking delivered during this viewing session (including
any replayed frames). Never claim full-match coverage or total distance from this grid. No observations gives an
empty state. Team density includes all observed players, including substitutes while on the pitch.

## 11. xG race (revamp S3)

Cumulative xG for both teams against the match minute, as two step lines from `heavy.shots`, with each goal marked
on its team's line. The end values equal the light panel's team xG.

## 12. Attacking channels (revamp S3)

The share of each team's touches in the attacking half down its left, centre and right (zones channels 0–2, columns
3–5), as three bars per team. Read from the heavy block's `zones`.

## 13. PPDA against press height (revamp S3; league style map S4)

A dot per team (the two teams in a match, or all clubs in the season): press height across, pressing rate or PPDA up.

## 14. Season charts (revamp S4–S5)

- **Deserved table, title race, goal timing:** from the season document.
- **Radar:** the group's radar values as percentiles, 0–100 on every spoke, the group median as a ring.
- **Percentile bars:** a bar per value, its percentile as the length, the per-90 value written on it.
- **Attribute panel:** the twelve attributes in four groups. Each value is coloured on a five-step scale
  (≤ 40, 41–55, 56–70, 71–85, 86+).

**Look:** follows `design-system.md`. The visual treatment of the maps, heatmaps and radar is being redesigned in
the revamp (plan D-05). These sections fix what each chart shows, not its styling.
