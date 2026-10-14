# Conflict scan

Run this before presenting any plan (propose, sprint, revise), in `conflict-check` mode, and again in `validate`.
The goal is to find **overlapping work before anyone writes code**, not after a merge fails.

## 1. Get the latest picture

```bash
git fetch --all --prune
git log -1 --format='%h %s' origin/main        # record this commit in the result
```

## 2. Collect what everyone else is touching

Check all four sources. A source you could not check is reported as "not checked", never as "no conflicts".

| Source | How to read it | What to extract |
|---|---|---|
| **Active plans** | Every file in `plans/active/` except your own | Each plan's file map (full §8, sprint §3, quick "Files"), contract changes (full §7) and hot shared files |
| **Open pull requests** | `gh pr list --state open --json number,title,headRefName,author` and `gh pr diff <n> --name-only`, or the GitHub web UI / tools available to you | Files changed by each open PR |
| **Remote branches** | `git for-each-ref --format='%(refname:short)' refs/remotes/origin` then, for each branch other than `main` and your own, `git diff --name-only origin/main...<branch>` | Files changed on branches without a PR yet |
| **Hot shared files** | The list in `plans/REGISTRY.md` | Whether your plan touches any of them |

## 3. Compare

For every file and contract section in **your** file map, look for it in the sets above. Treat these as overlaps:

- The **same file** changed by another plan, PR or branch.
- The **same `CONTRACTS.md` section** (or the same message) changed by someone else, or a message you change that
  another active plan consumes or produces.
- **Generated files** (lockfiles, exported schemas, generated types) that both sides will regenerate.
- A file in **another layer's folder** (see the ownership table in `plans/REGISTRY.md`), even if nobody else is
  changing it right now.
- Any **hot shared file**.

## 4. Resolve each overlap (in the plan, before go)

Pick one, write it in the plan, and name the people involved:

| Situation | Resolution |
|---|---|
| Both need the same file for different reasons | **Order** the work (who merges first; the other merges `main` in afterwards), or **split** the file's change into a small shared PR that lands first |
| A shared contract changes | A dedicated contract PR that both producer and consumer owners agree, merged **before** either side's code |
| A file in another layer's folder | Ask that layer's owner; if they agree, keep the edit in its own small commit and tell them when it lands |
| A hot shared file | Small dedicated commit or PR, owners told in advance |
| Generated files | Never hand-merge; regenerate with the owning tool after merging `main` |

## 5. Report

Put this table in the plan (full §13, sprint §6, quick "Conflict scan"):

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| [Path or section] | [Link] | [Name from REGISTRY or the plan] | [Order / split / shared PR / ask owner] | [Agreed / pending] |

End with: **Scanned at `<commit>` on `<date>`. Sources checked: plans ✓ · PRs ✓ / not checked · branches ✓ · hot
files ✓.** An unresolved overlap on a file you must change is a **blocker**: say so in the summary before the go gate.
