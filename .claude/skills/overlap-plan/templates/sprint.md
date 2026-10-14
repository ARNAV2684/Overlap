# Overlap — Sprint Plan Template

Use this for **one milestone** of a plan that has already been agreed. Name the file
`PLAN_<area>_<short-description>_S<n>.md` and save it in `plans/active/`. Keep it to about one page.

| Field | Complete this |
|---|---|
| Sprint | [S<n> — outcome in a few words] |
| Parent plan | [Link to the agreed full plan · its version] |
| Milestone in parent plan | [M<n> and its AC IDs] |
| Author / owner | [Name — from the parent plan or `plans/REGISTRY.md`; never guessed] |
| Status | [Draft / Ready for review / Agreed / In progress / Done] |
| Reviewed branch and commit | [main · commit SHA] |
| Planned branch | [`<area>/<short-description>-s<n>`] |

## 1. Outcome

- **What will work at the end of this sprint:** [One or two sentences someone can check.]
- **Not in this sprint:** [What is deliberately left for later.]

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| [Agreed spec section, fixture, contract, earlier sprint, Azure resource] | [Link / owner] | [Yes / No — blocks which step] |

If a precondition is not ready, say whether the sprint can start against an agreed fixture or mock (and what that
mock does not prove), or whether it is blocked.

## 3. Files

Only these files may change in this sprint. Anything else needs the user's agreement and an update to this table.

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| [Repository-relative path] | [Action] | [One sentence] | [Spec link and section] |

## 4. Steps

1. [Small, ordered step with a visible result.]
2. [...]

## 5. Contracts and shared files

- **Contract changes:** [None, or the exact `CONTRACTS.md` section, producer and consumer owners, agreement status.]
- **Hot shared files touched:** [None, or the files and who has been told.]

## 6. Conflict scan

[Result from `checklists/conflict-scan.md`: overlaps with other active plans, open PRs and branches, and how each is
resolved. “No overlaps found on <date> at <commit>” is a valid result.]

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| [Parent AC ID or S<n>-AC-01] | [Observable result] | [Test or reproducible check] | [Pending implementation] |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| [Item] | [Effect] | [Name] | [Step or none] |

## 9. Handover

**Pending implementation.** After validation: PR link, acceptance results, differences from this plan, follow-ups.
