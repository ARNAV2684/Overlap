---
name: overlap-plan
description: "Plan, review, conflict-check and validate work in the Overlap repository before and after it is implemented. Use it whenever someone in the Overlap project asks to plan a component, a sprint or milestone, or a small change; to review someone's plan; to check for overlapping work or merge conflicts across the team; to implement an agreed plan after they say go; or to validate an implementation against its plan before opening a PR. Not for projects other than Overlap."
---

# overlap-plan — plan before you build

Overlap is built by several people in parallel, each with an AI assistant, in one repository. This skill keeps that
work from colliding. Every piece of work goes through the same loop:

```
plan  ─▶  conflict scan  ─▶  human reviews  ─▶  "go"  ─▶  implement inside the plan  ─▶  validate  ─▶  PR
```

Tell the user briefly that the Overlap planning workflow is being applied and which mode and tier you are using.

## The rules that always apply

### 1. The go gate
- Planning, reviewing and conflict-checking **never** authorise implementation.
- After presenting a plan, **stop** and end with: *"Waiting for **go**."*
- Answers to your clarifying questions are **not** a go. Only an explicit go (or clear equivalent such as
  "go ahead and implement this") starts implementation.
- If you are unsure what the user wants, ask. Do not guess and build.

### 2. The scope guard (during implementation)
- Change **only** the files listed in the plan's file map (§8 of the full template, the "Files" table of the sprint
  and quick templates).
- If you discover you need to change any other file, **stop**, explain why, and ask. If the user agrees, update the
  plan's file map first, then continue.
- Never reformat, rename or "tidy" files outside the file map, even if it seems harmless. That is how surprise merge
  conflicts happen.

### 3. Spec first
- Every folder has a `specs/` folder, and every placeholder file names its governing spec in its header.
- Before planning **code**, check that the governing spec has been agreed (merged to `main` with its questions
  answered). If it has not, the plan is to **write the spec** (and get it agreed in its own PR), not to write code.
- If the code needs something the spec does not say, the plan must include updating the spec in the same PR.

### 4. Shared contracts
- [`CONTRACTS.md`](../../../CONTRACTS.md) defines every message between layers. Never create a private,
  incompatible variant of a shared message to unblock yourself.
- Any change to a shared message names the producer **and** consumer owners (see
  [`plans/REGISTRY.md`](../../../plans/REGISTRY.md)) and is agreed by both before it merges.

### 5. Project rules (non-negotiable)
- **Synthetic data only.** Never use, import, scrape or calibrate from real match data. Public aggregate facts are
  allowed and are cited in `CALIBRATION.md`.
- **No real football IP:** no real club names, crests, player names or league branding in code, UI, data,
  screenshots or video. Everything is invented.
- **No earlier projects:** do not import code, data, names, palettes or architecture from any earlier project,
  and do not mention any earlier project in this repository.
- **Numbers come from code, words come from AI.** Agents may only cite numbers that exist in a moment's evidence
  pack.
- **No secrets** in code, plans, commits or PRs. Use managed identity and Key Vault; refer to configuration by
  variable name only.
- **Commits are made under the name of the person who did the work**, using their own git identity.
- **No AI mentions in commits or PRs.** Do not add `Co-Authored-By`, session links or "generated with" lines to
  commit messages, PR titles, PR descriptions, branch names or PR comments. Some tools append such a footer to PR
  descriptions or comments automatically: after creating or editing a PR or comment, re-read it and remove any such
  footer.
- **Do not assign work.** Owners come from `plans/REGISTRY.md` or from the user. Never invent or suggest who should do
  something; leave unknown owners as "unassigned (Arnav decides)".

### 6. Honesty about status
- Keep **Agreed**, **Proposed**, **Assumption** and **Unresolved** distinct. A suggestion is not a decision.
- A mock enables parallel work; it does not prove an integration works.
- Never present planned tests as passed or estimates as commitments. Never claim someone approved something without
  a visible record (a merged PR, a review comment, a written decision).

## Choose the mode

| Mode | Use when the user says… | What you produce |
|---|---|---|
| **propose** | "plan the world builder", "make a plan for X" | A new plan in the right tier, conflict-scanned and self-checked, saved to `plans/active/`, ending in the go gate |
| **sprint** | "make sprint 2", "plan the next milestone of PLAN_x" | A sprint plan for **one** milestone of an already agreed plan |
| **revise** | "update the plan with…" | The same plan, version bumped, with unchanged decisions preserved and a change note |
| **review** | "review this plan", "is this ready?" | Findings only, grouped as **Blocking**, **Questions**, **Optional**, with section or file references. Do not rewrite unless asked. |
| **conflict-check** | "check for conflicts", "who else is touching X?" | The conflict report from [`checklists/conflict-scan.md`](checklists/conflict-scan.md) across every active plan, open PR and branch |
| **implement** | "go" after a plan was presented | The implementation, strictly inside the file map, following the plan's milestones |
| **validate** | "validate", "ready for PR?" | The report from [`checklists/validate.md`](checklists/validate.md) and a filled-in handover section |

If the user only asks to load or explain the skill, do that without producing a plan. If they ask for a plan without
saying what it covers, ask which component or outcome.

## Choose the tier (for propose)

| Tier | Use for | Template |
|---|---|---|
| **Full** | A new component or a large piece of a layer; anything that changes a shared contract; anything spanning more than one layer | [`templates/full.md`](templates/full.md) |
| **Sprint** | One milestone of an agreed full plan | [`templates/sprint.md`](templates/sprint.md) |
| **Quick** | A small, contained change in one layer: a fix, a small feature, a test, a doc update. No contract change. | [`templates/quick.md`](templates/quick.md) |

When in doubt between two tiers, pick the larger one and keep the answers short. Read the chosen template in full
before filling it; never recreate it from memory.

## How to propose (and sprint)

1. **Ground yourself in the current repository.**
   - `git fetch` and work from the latest `main`. Record the commit you reviewed.
   - Read `plans/REGISTRY.md`, the relevant folder README, its `specs/` files, `CONTRACTS.md`, and every plan in
     `plans/active/` that touches the same layer or a neighbouring one.
   - Never describe current behaviour you have not checked. If something cannot be verified, say so and leave it open.
2. **Apply the spec gate** (rule 3). If the governing spec is not agreed, switch the plan to writing that spec.
3. **Fill the template** for the chosen tier. Link to specs instead of copying them. Use "Not applicable — reason"
   where justified. Leave implementation evidence and the handover as **Pending implementation**.
4. **Run the conflict scan** ([`checklists/conflict-scan.md`](checklists/conflict-scan.md)) and put its result in
   the plan.
5. **Run the plan checks** ([`checklists/plan-lint.md`](checklists/plan-lint.md)) and fix every failure before
   presenting.
6. **Save the plan** as `plans/active/PLAN_<area>_<short-description>.md` (sprints:
   `PLAN_<area>_<short-description>_S<n>.md`), with the status header filled in. Do not commit it unless the user asks.
7. **Present** a short summary: scope, files, contract changes, conflicts found, decisions needed from the user or
   other owners, and the first milestone. End with *"Waiting for **go**."*

## How to implement (after go)

1. Re-read the plan. Confirm the branch: `<area>/<short-description>` from a fresh `main`.
2. Set the plan's status to **In progress**.
3. Work milestone by milestone. Change only files in the file map (rule 2).
4. Keep shared-file edits (see `plans/REGISTRY.md` → hot files) in their own small commit, and tell the user who
   must be told about them.
5. Commit in small, focused commits with plain, imperative messages (rule 5: no AI mentions).
6. Before saying you are done, run **validate**.

## How to validate

Follow [`checklists/validate.md`](checklists/validate.md): compare the diff with the file map, check evidence for
every acceptance criterion, check contract and spec updates, re-run the conflict scan against `main`, and fill in the
handover. Report honestly what passed, what failed and what was not checked. When validation passes and the PR is
merged, move the plan to `plans/done/` with status **Done**.

## Git hygiene that prevents merge conflicts

- Branch from a fresh `main` for every plan or sprint; one plan per branch; one layer per PR where possible.
- Bring `main` into your branch at least daily (`git fetch && git merge origin/main`), and always before opening a PR.
- Keep PRs small. Open them early as drafts so others can see what you are touching.
- Never hand-merge generated files such as lockfiles: regenerate them with the tool that owns them.
- Hot shared files (listed in `plans/REGISTRY.md`) change only in small, dedicated commits, after telling their
  owners.
- Never rewrite history on a branch someone else is using (no force-push on shared branches).
- Resolving a textual conflict does not prove the combined behaviour is correct: re-run the affected checks.

## Invocation examples

Claude Code (`/overlap-plan`) and Codex (`$overlap-plan`) read the same skill:

- `/overlap-plan propose generator world builder from generator/specs/world.md`
- `/overlap-plan sprint 2 of plans/active/PLAN_generator_world-builder.md`
- `/overlap-plan quick fix: stat bars show NaN when there are no shots`
- `/overlap-plan review plans/active/PLAN_web_live-pitch.md`
- `/overlap-plan conflict-check`
- `go` (after a plan has been presented)
- `/overlap-plan validate`

Codex users who do not see the skill can copy this folder into their Codex skills directory.
