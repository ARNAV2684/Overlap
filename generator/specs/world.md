# World spec

> **Status: not started.** Write and agree this before coding `world.py`, `names.py` and `kits.py`.

Decides every club, player and team trait the simulation uses. Everything here is invented.

## 1. League and clubs

- How many clubs are in the league? What are they called and where are they based (invented cities)?
- Which fields does a club have (id, name, short name, city, venue, colours, formation, style)?
- How are three-letter club ids chosen, and how do we avoid clashes?

_Answer:_

## 2. Squads

- How many players per squad, and how many per position?
- Which positions exist (GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LM, RM, LW, RW, ST)?
- How are shirt numbers assigned? How are starting XIs and benches picked for a match?

_Answer:_

## 3. Player attributes

- What is the full attribute list (e.g. pace, acceleration, passing, vision, dribbling, finishing, tackling, positioning, aerial, stamina, composure, goalkeeping)?
- What range does each attribute use, and what does a value mean in football terms?
- Which attributes matter for which position, and how are they generated (distributions per position and per club strength)?
- Are there hidden traits (e.g. preferred foot, weak-foot quality, injury proneness, big-game temperament)?

_Answer:_

## 4. Club strength and style

- How is overall club strength set, and how big is the gap between the best and worst club?
- Which style parameters exist (press intensity, directness, width, tempo, defensive line height, build-up preference) and what range does each use?
- How does each style parameter change behaviour in the engine? (List the decisions it touches.)
- Which formations are allowed, and what are the anchor positions for each?

_Answer:_

## 5. Names

- Which name pools (countries or regions) are used, and in what mix?
- How do we guarantee no generated name matches a real well-known player or club?
- How do we avoid duplicate names within the league?

_Answer:_

## 6. Kits and colours

- How are primary and secondary colours generated?
- What are the rules so two clubs in one match are always distinguishable, and every colour is readable on dark and light backgrounds?

_Answer:_

## 7. Persistence

- Where is the world saved, so the same clubs and players are reused all season?
- How is the world versioned when attributes change (e.g. fatigue, form, injuries)?

_Answer:_
