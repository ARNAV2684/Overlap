# PLAN_plans_generator-deliverables — record the generator layer's deliverables in the registry

| Field | Complete this |
|---|---|
| Change | Add a `Deliverables` section to `plans/REGISTRY.md` and record Azeem's deliverables: the whole synthetic generator layer (G1–G6), not only the world builder |
| Why | Teammates' assistants read `REGISTRY.md` as the source of truth; with only a world-builder plan on record, the generator work was read as "build `world.py`" |
| Author / owner | Arnav (assignment); Azeem is the owner recorded |
| Status | In progress (go from Arnav, 16 Oct: push and merge) |
| Reviewed commit | main · 3dd329c |
| Branch | `plans/generator-deliverables` |
| Governing spec | Not applicable — ownership record, not a component spec |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `plans/REGISTRY.md` | Modify (hot, Arnav only) | New `Deliverables` section; Azeem's block G1–G6 plus tests/calibration and the done-when line |
| `plans/active/PLAN_plans_generator-deliverables.md` | Add | This plan |

- **Contracts or hot shared files touched:** `plans/REGISTRY.md` (Arnav edits owners; this records his assignment).
  No layer owner changes; no other person's deliverables are written here.
- **Conflict scan:** No overlaps found on 2026-10-16 at 3dd329c. Sources checked: plans ✓ (`PLAN_generator_world-builder`
  and `PLAN_generator_reference-feet` touch `generator/`, not `REGISTRY.md`) · PRs ✓ (none open) · branches ✓ · hot
  files ✓ (`REGISTRY.md` only).
- **Done when:** `REGISTRY.md` on `main` lists G1–G6 for Azeem with files and specs that exist on `main`.
- **Risk:** the diagram labels box 1 "AZEEM + VEDANT"; whether Vedant shares box 1 is unconfirmed, so nothing about it
  is written until Arnav says.
- **Handover:** Pending implementation.
