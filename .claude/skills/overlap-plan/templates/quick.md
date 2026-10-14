# Overlap — Quick Plan Template

Use this for a **small, contained change in one layer** with no change to a shared contract. If any answer below
turns out to be "yes, a contract changes" or "more than one layer", switch to the full template. Name the file
`PLAN_<area>_<short-description>.md` and save it in `plans/active/`.

| Field | Complete this |
|---|---|
| Change | [What, in one line] |
| Why | [Problem or need, in one line] |
| Author / owner | [Name — from `plans/REGISTRY.md` or the user; never guessed] |
| Status | [Draft / Agreed / In progress / Done] |
| Reviewed commit | [main · commit SHA] |
| Branch | [`<area>/<short-description>`] |
| Governing spec | [Spec link and section, and whether it is agreed] |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| [Path] | [Action] | [One sentence] |

- **Contracts or hot shared files touched:** [None — or switch to the full template.]
- **Conflict scan:** [Overlaps found and their resolution, or “No overlaps found on <date> at <commit>”.]
- **Done when:** [Observable result and how it is checked.]
- **Risk:** [The one thing most likely to go wrong, or “none identified”.]
- **Handover:** Pending implementation.
