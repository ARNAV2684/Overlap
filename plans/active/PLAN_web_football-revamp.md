# PLAN_web_football-revamp — Show why, not just what: match, league, club and player views

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web app revamp: a football product for fans, analysts and scouts, built on our own synthetic league |
| Author / primary owner | Azeem |
| Collaborators and responsibilities | Arnav (web co-owner: review of every web PR; agents and MCP for the optional AI season notes). Pranav (3D pitch work in `PLAN_web_broadcast-local-preview`, kept as is) |
| Review coordinator | Arnav |
| Affected component owners | Arnav, Azeem (web, `web/src/lib/contracts.ts`); Azeem (stats engine: stat panel, new season aggregates); Arnav (agents, MCP `season` tool, Cosmos) |
| Proposal version and date | v0.2 · 23 Oct 2026 (v0.2: decisions taken, player figures and visual redesign added) |
| Status | In progress, handed over to Arnav 23 Oct (M1, M2 and most of M3 on `web/football-revamp`) |
| Plan tier and file | Full · `plans/active/PLAN_web_football-revamp.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · `0c73c59` (after #84) |
| Architecture box / work area | Expanded DFD layer 7 (web app) and layer 3 (stats engine), plus the layer 4 `season` container |
| Relevant issue, spec PR, or discussion | Not created yet. Builds on `PLAN_web_live-home` (built) |

## 1. Purpose and intended outcome

- **Problem or need:** the web app plays a match beautifully (3D pitch, story overlays, checked AI cards), but it
  stops at the final whistle of one match. A viewer can't ask the questions football people actually ask: *How does
  this team play? Who is really good, and why? Was that result deserved?* We hold a whole generated season (90
  matches, 10 clubs, 251 players with twelve attributes and designed team styles), and none of it is on screen.
- **Proposed outcome (the product):** one product, three lenses on the same numbers.

  | Lens | The question it answers | Where |
  |---|---|---|
  | **Fan** | What happened, and why did it matter? | Match centre story view, AI cards, match report |
  | **Analyst** | How do these teams play, and where is the game being won? | Match centre analysis tabs, league style map, club pages |
  | **Scout** | Who is good, at what, and is the output real or luck? | Player pages, compare, xG and expected-points tables |

  **The edge nobody else has:** we built the world, so we know the truth behind every number: each club's designed
  style (press intensity, line height, tempo, width, directness) and each player's twelve attributes. The product
  shows **designed against measured**: the stats engine reading a team's style and a player's ability back out of
  the events alone. For a general audience that's "Club DNA" and a "scout card". For judges, it's proof that the
  analytics work: they recover the hidden truth.
- **Benefit to viewers or teammates:** every screen answers a football question, every number comes from the stats
  engine, and the AI explains in plain words with checked numbers.
- **Success statement:** from the home page a viewer can watch a match, open either club's season page, open any
  player's scout page and compare two players. Every number shown traces to a stats-engine output, and the
  designed-against-measured view of the 10 clubs agrees in rank order for at least press height and pressing rate.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current web app | main `0c73c59`: `web/src/app/{page,match,replay,matches,how-it-works}`, `components/{home,match,charts,pitch3d,shell}` | Built: live/replay match screen with the 3D pitch, story director, AI cards and feed, analytics tabs (momentum, team stats, shot map, pass network, pressing, pass map, key events), tracking heatmap, matches list, recap, how-it-works. No league, club or player pages |
| Web specs | `web/specs/screens.md`, `charts.md`, `design-system.md`, `pitch.md`, `realtime.md` (written 24 Oct for `PLAN_web_live-home`) | Agreed for the current screens. Must be updated first for anything new (spec gate) |
| Stats engine | `stats/` (S1–S3 merged, #51 #53 #54) | Light panel every second; heavy block every minute (`momentum_buckets`, `pass_network`, `pressing_grid`, `zones`, `players`); `match_state`; moments. **No per-shot xG on screen** (`heavy.shots` is named as missing in `charts.md` §4 and `PLAN_web_live-home` §4) |
| Generated data | `generator/` world + `data/seasons/S1` (90 matches, gitignored, rebuilt from seeds) | Clubs with designed `style` dials and `formation`; players with `pos`, `role`, foot and twelve attributes; per-match events; league table |
| Shared contracts | `CONTRACTS.md` at `0c73c59`: §1.1 frames, §3 event, §7.2–§7.4 envelope and stat panel, §8 metrics | The stat panel shape is the stats engine's (§7.4) |
| Architecture | Expanded DFD (layers 3, 4, 7) | Cosmos `season` container ("milestones, totals") fed by batch mode's "season history". **Nothing produces it yet** |
| Other plans | `PLAN_agents_insights-build.md` R-07; `mcp_server/specs/tools.md` | "Season loader has no owner (Arnav decides)"; the MCP `season` tool stays unadvertised until a producer exists |

**Differences between references:**
1. **Season data.** The DFD has batch mode feeding a Cosmos `season` container. `generator/specs/live-and-batch.md`
   §3 says "a separate loader" reads the season files, owner undecided. This plan proposes that the stats engine
   computes the season aggregates (it already owns every metric), and asks Arnav to decide where they live (D-02,
   D-03).
2. **Calendar.** The team calendar has every required feature by 24 Oct, a feature freeze on 25–26 Oct and
   submission on 27 Oct. This plan starts on 23 Oct, so only its first sprints can land before the freeze (D-01).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Product shape and information architecture: home, match centre, league, club, player, compare | The 3D pitch engine itself (`pitch.md`, `pitch3d/`): kept and reused, not rebuilt |
| Match centre reorganised into a story view and analysis tabs (attack, possession, defence, players), with an xG race, shots sized by xG and attacking channels | New agents or prompts. The optional AI season notes (M6) reuse the existing agents through Arnav |
| **Cleaner 3D player figures** (Azeem, 23 Oct: the figures look like a video game): calmer proportions, materials and motion so the pitch reads as a broadcast graphic | The 3D stage, cameras and story overlays themselves |
| **Redesigned visuals** for the heatmaps, pass maps, shot maps and radar, replacing the dropdown-driven panels | — |
| Per-shot xG in the heavy block (`heavy.shots`) | Live season updates while matches play (the season view is built from finished matches) |
| Season aggregates computed by the stats engine from a season run: table by matchweek, team and player season stats, per-90s, percentiles by position group, expected points | Player match ratings (a 0–10 score needs its own spec and calibration; candidate for a later plan) |
| League, club and player pages and the compare tool | Accounts, saved favourites on a server (preferences stay in the browser) |
| Designed-against-measured views (Club DNA, scout card) | Real football data of any kind |

- **Minimum complete result:** M1–M3. Specs agreed, `heavy.shots` and the season aggregates produced, and the match
  centre revamped (xG race, shots by xG, attacking channels, defence and players tabs).
- **Optional extension:** M4 league and club pages; M5 player pages and compare; M6 AI season notes and Azure
  hosting of the season data. Each is useful on its own and can be cut from the end.
- **Boundary with neighbouring components:**
  - **Stats engine:** computes every number, including season aggregates.
  - **Web:** only lays out and draws them. No metric is computed in the browser except shaping data for charts.
  - **Agents:** only write words from evidence packs.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Web app (`web/`) | Arnav, Azeem | Review of the spec PR and each sprint PR | Pending · M1 | — |
| `web/src/lib/contracts.ts` (hot file) | Arnav, Azeem | Schemas for `heavy.shots` and the season document | Pending · M2 | Small dedicated commit |
| `CONTRACTS.md` §7.4 and a new §11 (hot file) | Azeem (producer), Arnav and Azeem (web consumer), Arnav (MCP consumer) | `heavy.shots`; season aggregates | Pending · M1 spec PR | — |
| Where season aggregates live (Cosmos `season` vs a file the web app serves) | Arnav decides (D-02) | Storage and the web's read path | **Blocking · M2** | Build against a local JSON file; the read path stays one function |
| Season producer ownership | Arnav decides (D-03; matches `PLAN_agents_insights-build` R-07) | Who runs the loader | **Blocking · M2** | Proposed: stats engine (Azeem) |
| MCP `season` tool | Arnav | Can read the same document later | Not needed by this plan | — |
| Agents (optional M6) | Arnav | Scout and club notes from season evidence packs | Optional · M6 | Template sentences with checked numbers |

**My owned deliverables:** stats `heavy.shots`, the season builder and its spec; the web specs and screens in this
plan (shared web ownership with Arnav).
**Shared deliverables:** `CONTRACTS.md` §7.4 and §11, `web/src/lib/contracts.ts` (Arnav and Azeem).

## 5. Proposed flow

```text
generator season run ─▶ stats/season.py (replays every match through the same pipeline)
   data/seasons/S1          │
                            ├─▶ season document (table by matchweek, teams, players, percentiles, xPts)
                            │      └─▶ store decided in D-02 ─▶ GET /api/season/<id> ─▶ league, club, player pages
                            │
live match ─▶ stats engine ─▶ stat panels (+ heavy.shots) ─▶ relay ─▶ match centre (xG race, shots by xG)
```

- **Input arrives through:** a finished season folder (season view); the live stat panels (match centre).
- **Processing performed here:** the stats engine replays each match with the existing pipeline, then sums and
  normalises. The web lays out what it receives.
- **Output goes to:** the season document (store per D-02) and the existing stat panels.
- **Execution relationship:** the season build is a one-off command per season (seconds: S1 replays in about 15 s).
  Live panels are unchanged apart from the new `shots` key once a minute.
- **State retained:** the season document is immutable per `season_id` and `world_version`. Rebuilding gives the
  same document.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Who computes season numbers | The stats engine, reusing its per-match pipeline (`stats/season.py`) | One definition of every metric; no second xG model in TypeScript; testable against the generator's own table | The web sums matches in the browser: duplicates metrics and loads 90 matches | Agreed (Azeem, 23 Oct) |
| Where the season document lives | **For submission:** a JSON file built by the stats engine and served by a web route. **Later:** the Cosmos `season` container from the DFD | Works locally and on Azure with no new infrastructure before the freeze | Cosmos now: needs a container, a loader, RBAC and infra changes in freeze week | Agreed (Azeem, 23 Oct) |
| Per-shot xG on screen | `heavy.shots` in the stat panel (every shot so far, team frame) | The match centre needs xG per shot for the xG race and shot sizes; numbers stay engine-made | Recompute xG in the browser: second model, drifts | Agreed (Azeem, 23 Oct) |
| Percentiles | Per-90 values among players of the same position group with at least 450 minutes, nearest-rank | Simple to explain on screen ("better than 80 % of midfielders") | Z-scores: harder for a general audience | Proposed |
| Expected points | Each match simulated from its shots' xG (independent shots, exact distribution), giving win, draw and loss probabilities | A "deserved table" is the clearest luck signal for fans and scouts | Poisson on team xG: simpler, less faithful to shot counts | Proposed |
| Designed against measured | Show each club's style dials next to the measured metric that reflects it, with both ranks among the 10 clubs. Players' attributes next to their per-90 output | It's our unique story: the analytics recover the hidden truth | Hide the designed values: loses the story | Agreed (Azeem, 23 Oct) |
| Match centre layout | Keep the 3D pitch and AI cards on top. Below it, four tabs replace the seven: **Attack** (xG race, shot map by xG, channels), **Possession** (pass network, pass map, territory), **Defence** (pressing grid, PPDA against press height, defensive actions), **Players** (match player table, tracking heatmap, physicals). Momentum and key events sit with the score as the story strip | Fewer, football-named tabs. Each answers one question | Keep seven tabs: harder to read | Proposed |
| What is removed | The separate Player focus side panel becomes a link to the player page. The standalone tracking heatmap card moves into the Players tab | Less clutter on the match screen | Keep both | Proposed |
| Look | Keep the design system (`design-system.md`). Add an attribute scale (management-game style coloured values), percentile bars, a radar, and a scout card layout | Data-dense but calm; consistent with what exists | New theme: time we don't have | Agreed (Azeem, 23 Oct) |
| Visual reference for the redesign (D-05) | Azeem's own design layouts on his account, read for layout and carried over in visual treatment (heatmap first), rebuilt in this repository's code and tokens, never naming their source | Azeem asked for it (23 Oct) | Design from this repository's system only | Agreed (Azeem); **blocked**, see D-05 |

**Assumptions:**
- Season S1 (90 matches, `world_version` 4) is the demo season. Checked: it replays in about 15 s with
  moments, so a full season build should take well under a minute.
- Player positions and roles come from the world. Check: the season document carries them from `setup.json`.
- The reference clubs stay internal (Arnav's 17 Oct flag). Whether S1, which includes them, is the demo season is
  D-04.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Stat panel heavy block | Stats → relay → web; archiver | `CONTRACTS.md` §7.4, `stats/specs/publishing.md` §2 | **Yes, additive:** `heavy.shots: {home: [...], away: [...]}` | Azeem, Arnav · pending (M1) |
| Season document | Stats → web (and later MCP `season`) | New `CONTRACTS.md` §11; new `stats/specs/season.md` | **Yes, new** | Azeem, Arnav · pending (M1) |
| `GET /api/season/<id>` and `/api/season/<id>/player/<pid>` | Web server → browser | `web/specs/realtime.md` new §7 | **Yes, new routes** | Arnav, Azeem · pending (M1) |

- **`heavy.shots` entry:**
  - **Fields:** `{event_id, player_id, period, match_ms, x, y, xg, outcome, situation, body_part}`.
  - **Frame and units:** team frame (`x` = 100 is the goal attacked). `xg` has 2 decimals. `outcome` is one of
    `goal`, `saved`, `missed`, `blocked` or `woodwork`.
  - **Contents and size:** every shot since kickoff, oldest first; about 25 a match, about 2 KB.
  - **Compatibility:** additive. Older panels without it make the web fall back to fixed-size dots.
- **Season document:**
  - **Identity:** one per `season_id`, with `world_version` and `built_from` (the run folder and its seed).
  - **Contents:**
    - `table` by matchweek;
    - `matches` (id, matchweek, teams, score, xG, xPts);
    - `teams` (season totals and per-match averages, designed `style` and measured counterparts, pressing grid,
      zones, goal timing in 15-minute buckets, shots with xG);
    - `players` (minutes, per-90s, shots with xG, pass and defensive counts, touch zones, percentiles within their
      position group, `pos`, `role`, `foot`, attributes).
  - **Missing values:** a value below its minimum sample is `null` with the field listed in `low_sample`, as in the
    stat panel.
  - **Size:** estimated at 1–3 MB, unmeasured.
- **Shared contract edits required:** `CONTRACTS.md` §7.4 (one key) and a new §11, in the M1 spec PR, agreed by
  Arnav.
- **Source of truth:** `CONTRACTS.md`; detail in `stats/specs/season.md` and `publishing.md` §2.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_web_football-revamp.md` (+ sprint plans `_S1`…) | Add | This plan | — | Azeem |
| `web/specs/screens.md` | Modify (M1) | New information architecture: match centre lenses and tabs, league, club, player, compare | Itself | Arnav, Azeem |
| `web/specs/charts.md` | Modify (M1) | New charts: xG race, shots by xG, attacking channels, PPDA against press height, style map, title race, deserved table, attribute panel, percentile bars, radar | Itself | Arnav, Azeem |
| `web/specs/design-system.md` | Modify (M1) | Attribute scale, percentile bar, radar, scout card | Itself | Arnav, Azeem |
| `web/specs/realtime.md` | Modify (M1) | New §7: season routes, caching, errors | Itself | Arnav, Azeem |
| `stats/specs/season.md` | Add (M1) | Every season number: definitions, minimum samples, percentiles, expected points, designed against measured | Itself | Azeem |
| `stats/specs/publishing.md`, `stats/specs/metrics.md` | Modify (M1) | `heavy.shots`; per-90 and percentile rules | Themselves | Azeem |
| `CONTRACTS.md` §7.4, new §11 | Modify (M1, dedicated commit) | `heavy.shots`; season document | Hot file: tell Arnav | Azeem, Arnav |
| `stats/whole_match.py` | Modify (M2) | `heavy.shots` (`shot_list`) | `publishing.md` §2 | Azeem |
| `stats/season.py`, `stats/main.py` | Add / modify (M2) | Season builder, `main.play` and the `season` command | `season.md` | Azeem |
| `stats/tests/test_season.py`, `stats/tests/test_publish.py` | Add / modify (M2) | Season totals equal the generator's table; `heavy.shots` shape | — | Azeem |
| `web/src/lib/contracts.ts` | Modify (M2, dedicated commit) | Schemas for `heavy.shots` and the season document | Hot file | Arnav, Azeem |
| `web/src/app/api/season/**` | Add (M2) | Season routes | `realtime.md` §7 | Arnav, Azeem |
| `web/src/lib/season.ts`, `web/src/lib/__tests__/season.test.ts` | Add (M2) | Season client and data shaping | `realtime.md` §7, `charts.md` | Arnav, Azeem |
| `web/data/season/season-S1.json` | Add (M2) | The built season document (committed build artefact, about 1 MB) | `season.md` | Azeem |
| `web/src/lib/server/season-store.ts`, `web/src/lib/server/season-route.ts` | Add (M2) | Read and check the document; shared route answers | `realtime.md` §7 | Arnav, Azeem |
| `web/src/components/pitch3d/scene/figure.ts` | Modify (M3) | Cleaner player figures | `pitch.md` | Arnav, Azeem |
| `web/src/components/match/{MatchScreen,AnalysisPanel,PlayerFocus,TrackingHeatPanel}.tsx` | Modify (M3) | Story strip and the four tabs; player focus becomes a link | `screens.md` §2 | Arnav, Azeem |
| `web/src/components/charts/{ShotMap,XgRace,Channels,PressVsLine,PlayerTable}.tsx`, `web/src/lib/live/charts.ts` | Modify / add (M3) | Match centre charts | `charts.md` | Arnav, Azeem |
| `web/src/app/league/**`, `web/src/app/club/[id]/**`, `web/src/components/season/**`, `components/charts/{StyleMap,TitleRace,DeservedTable,GoalTiming}.tsx` | Add (M4) | League and club pages | `screens.md`, `charts.md` | Arnav, Azeem |
| `web/src/app/player/[id]/**`, `web/src/app/compare/**`, `components/charts/{AttributePanel,PercentileBars,Radar}.tsx` | Add (M5) | Player scout page and compare | `screens.md`, `charts.md` | Arnav, Azeem |
| `web/src/components/shell/TopNav.tsx`, `web/src/components/home/HomeLive.tsx` | Modify (M4) | League link; league strip on home | `screens.md` §1 | Arnav, Azeem |
| `web/README.md`, `stats/README.md`, `docs/knowledge/stats-engine.md` | Modify (each sprint) | How to build and view the season | — | Azeem |
| Optional M6 (agents, Cosmos, infra) | Planned separately | AI season notes; `season` container | Arnav's plans | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Season document missing or unreadable | League, club and player pages say the season isn't built yet. Match centre unaffected | Run the season command | Season pages only | Route test (`503 season_unavailable`) |
| A player below the minutes threshold | Percentiles shown as "–" with "fewer than 450 minutes" | — | Player page | Unit test |
| A stat panel without `heavy.shots` (older engine or archive) | Fixed-size shot dots, no xG race | — | Match centre | Unit test with an old panel |
| Season built with a different `world_version` than the live world | Page shows the season's version; player links still resolve by `player_id` | Rebuild the season | Season pages | Unit test |
| Designed and measured disagree for a club | Shown as it is, with both ranks. No hiding | — | Club page | Review |

## 10. Requirements specific to this work

- **Performance and load:**
  - **Targets (unmeasured):** season document under 3 MB, served with `Cache-Control`. A season page renders under
    1 s locally after the first load.
  - **Budget:** `heavy.shots` adds about 2 KB a minute.
- **Observability:** the season route logs `season_id`, size and build time. Pages show the season's build date and
  `world_version`.
- **Azure resources and access:** none new for the file option (D-02). The Cosmos option needs a container and the
  web app's read role (Arnav).
- **Cost:** no model calls in M1–M5. M6 uses the existing agents budget.
- **Security and data:** read-only routes. `season_id` and `player_id` are validated against their patterns
  (`S\d+`, `[A-Z]{3}-\d{2}`).
- **AI behavior:** unchanged in M1–M5. M6 notes may cite only facts from a season evidence pack, checked by the
  existing fact-checker, with a template fallback.
- **Frontend experience:**
  - **States:** loading, empty and error states on every page.
  - **Layout and accessibility:** phone (375 px) and desktop; keyboard and screen reader for tables and charts
    (each chart has a data table or text alternative). Both themes.
- **Synthetic data or calculations:** the season build is reproducible from the run folder. Tests check that the
  table, goals and points equal the generator's `table.json` and `summary.json`.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | The spec PR (web specs, `season.md`, `publishing.md`, `CONTRACTS.md` §7.4 and §11) is merged with Arnav's approval | PR review | — | Pending implementation |
| AC-02 | Every heavy block has `shots` matching the match's shot events (count, ids, xG equal to the per-event numbers) | `test_publish.py` (CI) | `SYN-1017` | `test_publish.py::test_heavy_shots_match_the_light_panel`: counts, xG totals, order and goals agree on SYN-1017. Passes |
| AC-03 | The season document for S1 reproduces the generator's league table exactly (points, goals for and against, order) and every match score | `test_season.py` (CI on a small run; by hand on S1) | `data/seasons/S1` | On S1 the table (points, goals, order) and all 90 scores equal the generator's `table.json` and `fixtures.json`; `test_season.py` checks it when S1 is present. Passes |
| AC-04 | Building S1 twice gives a byte-identical document | By hand | S1 | `test_season.py::test_the_same_run_gives_the_same_bytes`. Passes |
| AC-05 | Designed against measured: across the 10 clubs, designed `press_height` against measured press height and designed `press_intensity` against measured pressing rate each have a rank correlation of at least 0.6 | Reported by the season command | S1 | S1: press intensity 0.90 and press height 0.98 (both at least 0.6). Passes. Also counter-attack 0.89, directness 0.53, width 0.28, set pieces -0.05, tempo -0.56, recorded in `season.md` §5 |
| AC-06 | The match centre shows the four tabs, an xG race whose final values equal the light panel's team xG, and shots sized by xG, on a live match through the local stack | Local stack run plus screenshots (real connection: stats → relay → web) | Local stack | Pending implementation |
| AC-07 | League page: table, deserved table (xPts), title race and style map; club page: Club DNA, where they press, chances, goal timing, squad | Local, desktop and phone, both themes | Season document | Pending implementation |
| AC-08 | Player page: scout card (attributes, role, foot), per-90 output with percentiles, radar, shot/pass/touch maps; compare shows two players side by side | Local, desktop and phone | Season document | Pending implementation |
| AC-09 | `npm run lint`, `typecheck`, `test`, `build`; stats `ruff` and `pytest` all pass | CI | — | So far: stats 70 tests and ruff clean; web 511 tests (2 opt-in skipped), lint, typecheck and `next build` clean |
| AC-10 | No number on a season page is computed in the browser beyond shaping (every value present in the season document) | Code review plus a test that renders from a fixture document | Fixture document | Pending implementation |

**Validation limits:** AC-05 measures a generated league only. Season pages on Azure depend on D-02. Expected points
assume independent shots.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Specs and contracts | One spec PR: the product's screens, charts and look; the season spec; `heavy.shots`; season routes | Azeem (Arnav reviews) | D-01–D-04 | AC-01 | ½ day · 23–24 Oct |
| M2 — The data | `heavy.shots` live; `python main.py season ../data/seasons/S1` builds the season document; web season route and schemas | Azeem | M1 | AC-02–AC-05, AC-09 | 1 day · 24 Oct |
| M3 — Match centre revamp | Story strip; Attack, Possession, Defence and Players tabs; xG race; shots by xG; channels | Azeem (Arnav reviews) | M2 | AC-06, AC-09 | 1 day · 25 Oct |
| M4 — League and club pages | League table, deserved table, title race, style map; Club DNA, pressing, chances, goal timing, squad | Azeem | M2 | AC-07, AC-10 | 1 day · 26 Oct |
| M5 — Player pages and compare | Scout card, percentiles, radar, maps; compare | Azeem | M2, M4 | AC-08, AC-10 | 1 day · after submission if allowed (D-01) |
| M6 — AI season notes and Azure (optional) | Scout and club notes from season evidence packs; season data on Azure | Arnav (agents, infra) with Azeem | M5, D-02 | Planned separately | After submission if allowed |

- **Project calendar check:** **This does not fit the calendar as written.** Every required feature is due 24 Oct,
  the freeze is 25–26 Oct and submission is 27 Oct, and today is 23 Oct.
  - **Minimum fit:** M1–M2 by 24 Oct and M3 in the freeze.
  - **M4–M6:** only if Arnav agrees to work through the freeze, or if the rules allow changes while the app stays
    live for judges until 10 Nov (D-01).
- **First integration checkpoint:** M2. `heavy.shots` through the real local stack (stats → relay → browser), and
  the season document through the real web route.
- **Parallel work:** M3 (match centre) and M4 (league and club) only share `contracts.ts` and can run in parallel
  after M2.
- **Dependency-bound work:** M2's storage choice (D-02), M6 (agents and infra).
- **Scope reduction if time runs short** (cut in this order): M6, then compare, then the player radar, then the
  title race and goal timing. The minimum is M1–M3.

## 13. Integration and change management

- **Proposed branch / PR boundaries:**
  - **M1:** `web/football-specs`, specs only.
  - **M2:** `stats/season` (stats) and `web/season-data` (route and schemas), with `contracts.ts` in a dedicated
    commit.
  - **M3:** `web/match-centre`.
  - **M4:** `web/league-club`.
  - **M5:** `web/player-scout`.
  - **One sprint plan per milestone**, `_S1`…`_S5`.
- **Shared-file coordination:** `CONTRACTS.md` and `web/src/lib/contracts.ts` (hot files) in small dedicated commits,
  Arnav told first. `MatchScreen.tsx` and `stage.ts` were last changed by Pranav's broadcast work (#83, #84). M3 edits
  `MatchScreen.tsx` only, not the 3D stage.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `web/specs/screens.md`, `charts.md`, `design-system.md`; `components/match/*`, `components/charts/*` | `PLAN_web_live-home.md` (built, active) | Arnav, Azeem | This plan continues it; that plan's "not done" items (`heavy.shots`) are taken over here | Pending (Arnav) |
| `MatchScreen.tsx`, `TrackingHeatPanel.tsx`, `charts.md` | `PLAN_web_broadcast-local-preview.md` (#83, #84 merged; plan still active) | Pranav | No open branch; build on main after #84. The 3D stage and pitch files are not touched | Agreed (no open work) |
| `CONTRACTS.md` §7.4; `web/src/lib/contracts.ts` | `PLAN_agents_insights-build.md` (reads §7.4); `PLAN_functions_screen-relay.md` (forwards panels unchanged) | Arnav | Additive key only; the relay forwards panels unchanged and the archiver stores them as they come | Pending (Arnav) |
| Cosmos `season` container; MCP `season` tool | `PLAN_agents_insights-build.md` R-07; `mcp_server/specs/tools.md` | Arnav | D-02, D-03. If the document shape is agreed in §11, the MCP tool can read it later | Pending (Arnav) |
| `stats/` | `PLAN_stats_engine.md` (S4 on Azure pending) | Azeem | Same owner; season work is a new milestone of this plan, S4 unchanged | Agreed |

**Scanned at `0c73c59` on 23 Oct 2026.** Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ (none touching
these files) · hot files ✓ (`CONTRACTS.md`, `web/src/lib/contracts.ts`).

- **Integration procedure:** build the season (`python main.py season ../data/seasons/S1 --out <path>`), point the
  web at it (variable named in M1), then `npm run dev`.
- **Configuration or setup changes:** one new server variable for the season document's location (name decided in
  M1). No secrets.
- **Deployment or data changes:** none before D-02.
- **Documentation updates:** web and stats READMEs, the knowledge note, `CONTRACTS.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| D-01 | Calendar: a revamp starting 23 Oct crosses the 24 Oct feature date and the 25–26 Oct freeze | Half-built screens at submission | Azeem (decided 23 Oct: the decisions are his) | Build in sprints; M1–M3 first | M3–M6 |
| D-02 | Where the season document lives: a file served by the web app, or Cosmos `season` | Season pages can't run on Azure | Azeem (decided 23 Oct) | A committed file served by the web app; Cosmos later | Resolved |
| D-03 | Who owns the season producer (`PLAN_agents_insights-build` R-07) | No season data | Azeem (decided 23 Oct) | The stats engine (Azeem) | Resolved |
| D-04 | The reference clubs (CAL, DTN) are internal fixtures (17 Oct flag), yet season S1 includes them, and CAL wins it (47 points) | A scout page showing hand-set attributes that echo real players | Azeem (decided 23 Oct) | Kept in the table and results; no club or player pages (`season.md` §6) | Resolved |
| D-05 | The visual reference is Azeem's own design work on his account. This session's safety check refused to unpack it (untrusted code integration) | The redesigned heatmap and maps can't follow that design yet | Azeem | Allow the read in his Claude Code permissions, or share screenshots or exported component code; otherwise design from this repository's system | M3 visuals |
| R-01 | Designed against measured disagrees for some style dials | The Club DNA story is weaker | Azeem | Show only dials with a measured counterpart and report the correlations honestly (AC-05) | M4 |
| R-02 | The season document grows past 3 MB | Slow first load | Azeem | Split into league and per-player routes (already planned) | M2 |

**Decisions requested from Arnav or affected owners:** D-01 to D-04 above. My recommendations: M1–M3 for submission,
a file for the season data, the stats engine as season producer, reference clubs kept out of player pages.

## 15. Review, agreement, and handover

### Author's submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked.
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| — | v0.1 | — | Not reviewed yet | — |

**Implementation readiness:** in progress. M1 and M2 done on `web/football-revamp`; M3 visuals wait on D-05.
**Relevant specification agreement:** pending (M1).
**Next action and owner:** Azeem's go, then the M1 spec PR for Arnav's review.

### Handover after implementation

**Handed over to Arnav on 23 Oct 2026** (Azeem's weekly usage limit), on branch `web/football-revamp`.

**Done:**
- **M1, specs:**
  - `stats/specs/season.md`; `publishing.md` §2 (`heavy.shots`);
  - `CONTRACTS.md` §7.4 and §11;
  - `web/specs/realtime.md` §7, `screens.md` §2.5 and §8–§11, `charts.md` §4 and §11–§14.
- **M2, data:**
  - `heavy.shots` in every heavy block (`stats/whole_match.py`).
  - `python main.py season`: the season document, on S1 equal to the generator's table, about 1 MB, committed at
    `web/data/season/season-S1.json`.
  - `/api/season/<id>`, `/team/<id>` and `/player/<id>`, with the web schemas.
  - AC-02 to AC-05 pass.
- **M3, match centre (partly):**
  - **Visual kit** (`web/src/components/viz/Viz.tsx`): card, near-black pitch, blue-ramp zone grid, legend, side
    panel, chips and toggle.
  - **Five analysis tabs:**
    - **Story:** momentum and key events.
    - **Attack:** xG race, shot map sized by xG, attack by flank.
    - **Possession:** pass network, zone dominance, pass map.
    - **Defence:** pressing zones with the press line, team stats.
    - **Players:** tracking heatmap and the match player table.
  - **Heatmap:** chips instead of dropdowns.
  - **Preview:** a development page at `/dev/viz` (404 in production) shows the visuals on the fixture's last
    panel without the local stack.
- **Checks:**
  - Stats: 70 tests, ruff clean.
  - Web: 520 tests (2 opt-in skipped), lint, typecheck and `next build` clean.

**Differences from this plan:**
- **Tabs:** five, not four. Story is a tab, not a strip under the score; `screens.md` §2.5 needs that correction.
- **New files not in §8:** `web/src/components/viz/Viz.tsx`, `charts/{XgRace,FlankAttack,ZoneDominance}.tsx`,
  `web/src/app/dev/viz/*`, `web/data/dev/preview-SYN-1017.json` and `web/src/lib/__tests__/analysis-charts.test.ts`.
- **Visual reference (D-05):** from browser screenshots of Azeem's own design layouts (the zone grids, the side
  panel, the title race, goal timing). The artifacts themselves could not be unpacked.

**Left to do, in order:**
1. **M3 check:** look at `/dev/viz` and one live or replayed match (`npm run dev`) in both themes and at phone
   width. The last fixes were not seen in a browser:
   - the toggle colours;
   - unique list keys;
   - the smaller ATTACK label on half pitches;
   - the xG race sentence using the match clock.
2. **M3 figures:** cleaner 3D players (`web/src/components/pitch3d/scene/figure.ts`). Azeem: they look like a video
   game; calmer proportions, materials and motion are wanted. Not started.
3. **M3 player focus:** `PlayerFocus.tsx` should become a link to the player page once M5 exists.
4. **M4, league and club pages:** `screens.md` §8–§9, `charts.md` §14. The data and routes are ready
   (`LeagueView`, `TeamView`). Your title-race and goal-timing designs fit them directly.
5. **M5, player and compare pages:** `screens.md` §10–§11 (`PlayerView` is ready).
6. **M6, optional:** AI season notes (agents) and the season document on Azure.
7. **Close-out:** AC-06 to AC-08 and AC-10 still need their evidence.

