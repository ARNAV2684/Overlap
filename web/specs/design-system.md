# Design system

Owners: Arnav, Azeem. Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). Built in
`src/app/globals.css` and `src/app/layout.tsx`. The earlier design system is kept in
[`vedant-frontend/`](../../vedant-frontend/README.md).

## 1. Look

Dark by default, a warm paper light theme, one coral accent. Words in Outfit, numbers and small labels in Geist Mono.
Quiet surfaces: cards are an almost invisible border and wash over the canvas; colour is kept for the accent, team
kits, live and the shot outcomes.

## 2. Tokens

CSS variables in `globals.css`, read through Tailwind (`bg-surface`, `text-ink/60`, `text-accent`, …). No component
hard-codes a colour except team kits, which come from the match setup.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#faf8f5` | `#141414` | Page |
| `surface` / `raised` | `#ffffff` / `#edeae3` | `#1e1e1f` / `#2c2c2e` | Selected controls, raised areas |
| `ink`, `ink-2`, `ink-3` | `#17151a`, `#6b6875`, `#9b98a3` | `#ffffff`, `#a0a0b8`, `#66667e` | Text, by importance |
| `accent` | `#ff4f38` | same | Brand, live, goals, the AI badge, focus rings |
| `live` | `#4ade80` | same | Live dot, verified badge, speed tags |
| `shot-*` | goal `#ff4f38`, saved `#4a90d9`, missed `#7a7a92`, blocked `#e8a838`, woodwork `#d4637a` | same | Shot map |

Team colours on the pitch and in charts go through `overlayColour()` (`components/pitch3d/scene/stage.ts`): the
primary kit colour lifted to a readable lightness and saturation, the secondary if the primary is grass-green or grey.

## 3. Type and labels

- Headings: Outfit 800–900, tight tracking. Body: Outfit 400–600.
- `.ov-eyebrow` (mono 10 px, 2 px tracking, uppercase) and `.ov-sub` (mono 9.5 px) for labels; numbers in mono with
  `tabular`.
- The wordmark is **over** in the accent and **lap** in ink.

## 4. Components and motion

- `.ov-card`: 14 px radius, hairline border, 2.5 % ink wash.
- Pitch overlays are dark glass (`#0e0e10` at 80–90 %, blurred) in both themes, because they sit on the grass.
- Motion: `ov-rise` for new cards and captions, `ov-flash-score` on a goal, `ov-pulse` on the live dot, `ov-fade` for
  labels that are positioned with `transform`. All switch off under `prefers-reduced-motion`.

## 5. Accessibility

- Visible focus: a 2 px accent outline on `:focus-visible`.
- Controls are real buttons, selects and radio groups with labels; the AI card is a polite live region.
- The 3D canvas has a text label, and a message when WebGL is off. Every number on the pitch is also in the panels.
- Both themes keep body text at 4.5:1 or better on its surface.
