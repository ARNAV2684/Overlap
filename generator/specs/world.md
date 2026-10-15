# World spec

> **Status: agreed.** Agreed in PR #8 (2026-10-14). Plan:
> [`PLAN_generator_world-builder`](../../plans/active/PLAN_generator_world-builder.md). Reference profiles rule:
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md) (PR #7). Kept in step with `world.py`, `names.py` and `kits.py`.

Decides every club, player and team trait the simulation uses. Every name, crest and venue is invented. A few clubs
are **reference profiles**: their style and attributes are hand-set to resemble real teams and players, so we can
tell whether the pipeline's output makes sense. The real team or player behind a profile is never written in this
repository.

**Delivery order:** two reference clubs with full squads first (enough for every layer to test on one fixture), then
the rest of the league.

## 1. League and clubs

- How many clubs are in the league? What are they called and where are they based (invented cities)?
- Which fields does a club have (id, name, short name, city, venue, colours, formation, style)?
- How are three-letter club ids chosen, and how do we avoid clashes?

_Answer:_

**Size.** Season 1 starts with **2 reference clubs** (A and B). The full league is **10 clubs**: the 2 reference
clubs plus 8 invented clubs generated from the season seed. Ten gives an 18-matchweek double round robin, enough for
season aggregates, while keeping batch runs quick. The fixture list belongs to
[`live-and-batch.md`](live-and-batch.md) §3.

**Reference clubs.**

| Club | Style it resembles | Formation | Status |
|---|---|---|---|
| A | Elite possession side: patient short build-up, very high press and defensive line, wide in possession, dominates the ball | 4-3-3 | Proposed |
| B | Mid-table second-tier-level side: compact mid-to-low block, more direct, quick to counter, presses in bursts rather than all match | 4-2-3-1 | Proposed (style confirmed by Azeem, 2026-10-15) |

The two must differ on at least three style parameters by 0.3 or more, so the contrast shows up in possession, PPDA,
press height and pass length.

**Club fields** (world file; the match setup carries the subset in [`CONTRACTS.md`](../../CONTRACTS.md) §2):

| Field | Type | Notes |
|---|---|---|
| `team_id` | 3 capital letters | See ids below |
| `name` / `short_name` | string | e.g. "Northbridge FC" / "Northbridge" (example only) |
| `city` | string | Invented |
| `venue` | `{ name, city }` | Invented |
| `colours` | `{ home: {primary, secondary}, away: {primary, secondary} }` | See §6; the setup sends the pair being worn |
| `formation` | one of §4's list | |
| `style` | §4 parameters | Contract three plus internal three |
| `strength` | number | Derived, never hand-set (§4) |
| `reference` | bool | True for reference profiles; never says which real team |
| `squad` | list of players | §2 |
| `default_xi` | 11 players, goalkeeper first, in formation slot order (shirt numbers in the YAML, player ids in the saved world) | §2 |

**Ids.** Hand-chosen for reference clubs, derived from the name for generated clubs (first letters of each word, then
consonants of the main word). Every id must be unique in the world, must not be one of the mock's ids (`NBR`, `HBA`,
`IVC`, `SMW`, `LKR`, `GWA`) while `mock/` exists, and must not be a well-known real club's abbreviation (checked in
review). The build fails on a clash.

## 2. Squads

- How many players per squad, and how many per position?
- Which positions exist (GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LM, RM, LW, RW, ST)?
- How are shirt numbers assigned? How are starting XIs and benches picked for a match?

_Answer:_

**Size and shape.** 25 players: 3 GK, 9 defenders, 8 midfielders, 5 forwards. Reference clubs may follow their real
team's shape between 22 and 28 players, with at least 2 goalkeepers. Every slot in the club's formation must be
playable (primary or secondary position) by at least 2 squad players, so losing one starter never leaves a slot
empty; the build fails otherwise.

**Positions.** The fourteen in the question: `GK`, `CB`, `LB`, `RB`, `LWB`, `RWB`, `DM`, `CM`, `AM`, `LM`, `RM`,
`LW`, `RW`, `ST`. Each player has one primary position and up to two secondary positions (never the primary
again). A player in a secondary position plays with a small penalty set in the engine spec. In the match setup,
`pos` is the slot a starter plays in this match, and a substitute's primary position.

**Shirt numbers.** 1–99, unique within a club (player ids are `TEAM-NN`, so a shirt is also the id). Reference clubs
use hand-set numbers. Generated clubs try the usual numbers for the position (1 for a goalkeeper, 9 for a striker),
then the next free number.

**Starting XI and bench.** Each club has a `default_xi`. A match uses it unless a player is unavailable (suspended,
later injured); the replacement is the best-rated available player whose primary or secondary position matches the
slot. The bench is **9** players, including exactly one goalkeeper, picked as the best remaining player for each of
GK, CB, full-back, DM/CM, CM/AM, winger, ST (by primary position), then filled to nine with the best remaining
outfield players. A group with nobody left is skipped. "Best" means highest `overall`, then lowest shirt number. A
setup lineup is 11 players, goalkeeper first, in the formation's slot order.

## 3. Player attributes

- What is the full attribute list (e.g. pace, acceleration, passing, vision, dribbling, finishing, tackling, positioning, aerial, stamina, composure, goalkeeping)?
- What range does each attribute use, and what does a value mean in football terms?
- Which attributes matter for which position, and how are they generated (distributions per position and per club strength)?
- Are there hidden traits (e.g. preferred foot, weak-foot quality, injury proneness, big-game temperament)?

_Answer:_

**Scale.** Every attribute is 1–99: 40 = weak for this league, 60 = solid regular, 75 = very good, 85 = elite,
92+ = the best in the world at it. Reference players use the whole scale; a world-class striker's finishing can be 95.

**Attributes.** The world holds twelve. The first six are the ones the match setup sends (`CONTRACTS.md` §2), with the
same names; the other six stay inside the generator, so no contract change is needed.

| Attribute | In setup | Meaning |
|---|---|---|
| `pace` | ✓ | Top running speed |
| `passing` | ✓ | Pass accuracy and weight |
| `dribbling` | ✓ | Beating a player, close control |
| `finishing` | ✓ | Shot accuracy and power from good positions |
| `tackling` | ✓ | Winning the ball cleanly |
| `stamina` | ✓ | How slowly the player tires |
| `acceleration` | | How fast top speed is reached |
| `vision` | | Seeing and choosing progressive or through passes |
| `positioning` | | Being in the right place (defensive shape or attacking runs) |
| `aerial` | | Heading and winning high balls |
| `composure` | | Keeping quality under pressure and in big moments |
| `goalkeeping` | | Shot stopping, handling and claiming (outfield players 20 or less; the build fails otherwise) |

**Hidden traits.** `preferred_foot` (`left`, `right`, `both`; default `right`) and `weak_foot` (1–5; default 3).
Injury proneness and big-game temperament are left out for now; `composure` covers pressure.

**Which attributes matter where.** A player's `overall` is the plain mean of the four main attributes for their primary
position, used for strength, replacements and bench picking. The engine spec decides how each attribute changes actions.

| Position group | Main attributes |
|---|---|
| GK | goalkeeping, positioning, composure, passing |
| CB | tackling, aerial, positioning, composure |
| Full-backs and wing-backs | pace, stamina, tackling, passing |
| DM | tackling, positioning, passing, stamina |
| CM | passing, vision, stamina, composure |
| AM | vision, passing, dribbling, finishing |
| Wide midfielders and wingers | pace, acceleration, dribbling, passing |
| ST | finishing, positioning, composure, pace |

**How they are set.**
- **Reference players:** hand-set by judgement from public knowledge of the player each one resembles. Never copied
  from a game's ratings database.
- **Generated players:** each attribute is drawn from a normal distribution around a per-position archetype mean,
  shifted by the club's target level, with standard deviation 6, rounded and clipped to 1–99. Archetype means live in
  `world.py`, next to the code that uses them.

## 4. Club strength and style

- How is overall club strength set, and how big is the gap between the best and worst club?
- Which style parameters exist (press intensity, directness, width, tempo, defensive line height, build-up preference) and what range does each use?
- How does each style parameter change behaviour in the engine? (List the decisions it touches.)
- Which formations are allowed, and what are the anchor positions for each?

_Answer:_

**Strength.** `strength` = the mean `overall` of the club's default XI, derived and never hand-set. Generated clubs
get a target level spread evenly between about 68 and 80. Reference club A should come out near the top (about 84);
the best-to-worst gap is therefore about 16 points of XI average.

**Style parameters** (all 0–1):

| Parameter | In setup | 0 means | 1 means | Engine decisions it touches (confirmed in `engine.md` / `actions.md`) |
|---|---|---|---|---|
| `press_intensity` | ✓ | Sits off | Presses every pass | Pressure and tackle attempts out of possession, PPDA, fouls |
| `directness` | ✓ | Short, patient | Long, forward early | Pass choice and length, through balls, carries |
| `width` | ✓ | Narrow | Hugs the touchlines | Attacking anchor spread, crosses, switches of play |
| `tempo` | | Slow recycling | Quick passing | Time per action, passes per minute |
| `line_height` | | Deep block | High line | Defensive anchors, offsides, balls in behind, high regains |
| `build_up_short` | | Goalkeeper goes long | Plays out from the back | Goal kicks and first pass out from defence |

Reference club A (proposed): `press_intensity` 0.85, `directness` 0.20, `width` 0.75, `tempo` 0.60, `line_height`
0.85, `build_up_short` 0.90.

Reference club B (proposed): `press_intensity` 0.45, `directness` 0.60, `width` 0.55, `tempo` 0.50, `line_height`
0.40, `build_up_short` 0.45, with a squad strength of about 72. It differs from A by 0.3 or more on press intensity,
directness, line height and build-up, and is clearly weaker, so A vs B should show A dominating the ball and
territory while B's chances come from counters and set pieces.

**Formations.** `4-3-3`, `4-2-3-1`, `4-4-2`, `4-1-4-1`, `3-4-3`, `5-3-2` (the six the mock already uses, so screens
built against the mock keep working). Each formation's slot order (goalkeeper first) and position labels live in
`world.py`. Anchor positions on the pitch, and how they shift, belong to [`movement.md`](movement.md) §1.

## 5. Names

- Which name pools (countries or regions) are used, and in what mix?
- How do we guarantee no generated name matches a real well-known player or club?
- How do we avoid duplicate names within the league?

_Answer:_

**Reference players.** Names are written by hand and invented. A name must not be recognisable as the player it is
modelled on: it shares no surname with them and is at least 4 edits away from their full name. The mapping from each
reference player to the real player lives only in `generator/reference_map.private.yaml`, which is gitignored and
never committed. A test reads it when it is present and checks the edit distance; without it, that test is skipped.

**Generated players** (with the invented clubs, milestone M3)**.** First and last names come from separate regional pools: British and Irish, Iberian and Latin
American, French, West African, Central and Eastern European, Nordic, Italian, Dutch and German, and Middle Eastern
and South Asian. Mix per club: about 50% from one or two home regions and 50% from the rest, picked with the season
seed.

**Avoiding real names.** First and last names are drawn separately, so most pairs are new. From milestone M3, a
local denylist (`generator/name_denylist.private.txt`, gitignored) of well-known real full names is checked at build
time when it is present. Club names are an invented city plus a common suffix (FC, Athletic, Rovers, United, Albion, Town) and are
reviewed by hand in the PR that adds them.

**No duplicates.** Full names are unique across the whole world; surnames are unique within a club. The build fails
on a duplicate, never silently renames.

## 6. Kits and colours

- How are primary and secondary colours generated?
- What are the rules so two clubs in one match are always distinguishable, and every colour is readable on dark and light backgrounds?

_Answer:_

**Colours.** Every club has a home and an away pair, each a `primary` and `secondary` 6-digit hex. Reference clubs'
colours are hand-picked and may echo the real team's colours (for example a light blue), but kit designs and crests
stay invented. Generated clubs get primaries spread around the colour wheel from the season seed, with a light or dark
secondary.

**Readable on dark and light backgrounds.** Within each pair, primary and secondary differ by a WCAG contrast ratio of
at least **3:1**, so one of the two always stands out on any background. The web app draws a player dot as the
primary with a secondary outline.

**Distinguishable in a match.** The home club wears home colours. If the two primaries are closer than **ΔE2000 = 20**,
the away club wears its away pair. The build fails if a club's home and away pairs both clash with any other club's
home pair. The pair being worn is what the match setup sends.

The web app's own contrast rules for club theming belong to Vedant's [`design-system.md`](../../web/specs/design-system.md)
§2; this section is only the generator's guarantee about the colours it sends.

## 7. Persistence

- Where is the world saved, so the same clubs and players are reused all season?
- How is the world versioned when attributes change (e.g. fatigue, form, injuries)?

_Answer:_

**Sources in the repo.** `generator/reference_clubs.yaml` holds the hand-authored reference clubs. Generated clubs
come from code and the season seed.

**The saved world.** `data/generated/world/<season_id>.json` (for example `S1.json`), holding `world_version`,
`season_id`, `seed` and every club with its full squad and all twelve attributes. It is gitignored and rebuilt from
the YAML and seed; the same inputs always give a byte-identical file. Every match in a season reads the same file.
Each club also records its derived `strength` and each player their `overall`. `python world.py` (from `generator/`)
builds and saves it; the command line comes with `cli.py`.

**Versioning.** `world_version` is an integer, bumped whenever the YAML or the generation rules change. A match setup
records the `season_id` and `seed`, so any match can be replayed from the same world. Fatigue is per match (engine
spec). Form and injuries across a season are season state, not world data, and belong to
[`live-and-batch.md`](live-and-batch.md) §3; the world file never changes during a season.
