# Validate (after implementation, before the PR)

Run this when the implementation is finished. Report honestly: **passed**, **failed** or **not checked** for each
item. Do not open the PR while a required item has failed, unless the user explicitly decides to.

## 1. Scope

```bash
git fetch origin
git diff --name-only origin/main...HEAD
```

- [ ] Every changed file is in the plan's file map. List any that are not, and either get the user's agreement and
      update the file map, or revert the change.
- [ ] Nothing outside the file map was reformatted, renamed or tidied.
- [ ] Hot shared files were changed only in small, dedicated commits, and their owners were told.

## 2. Acceptance criteria

- [ ] Each acceptance criterion has evidence: a test result, a log, a screenshot or a reproducible check. Record it
      in the plan's evidence column.
- [ ] Criteria that could only be checked against a mock are marked as such.
- [ ] Failed or deferred criteria are listed, with why and what happens next.

## 3. Contracts and specs

- [ ] Every change to a shared message is in `CONTRACTS.md`, and the other side's owner has agreed.
- [ ] Any behaviour the spec did not describe has been added to the spec in this PR.
- [ ] Fixtures or examples affected by a contract change are updated.

## 4. Integration with the latest main

- [ ] `origin/main` has been merged into the branch (`git merge origin/main`), conflicts resolved, and the relevant
      checks re-run after the merge.
- [ ] The conflict scan has been re-run against the current `main` and open PRs; new overlaps are reported.
- [ ] Generated files (lockfiles, schemas, types) were regenerated, not hand-merged.

## 5. Project rules

- [ ] Synthetic data only; no real football IP; no mention of earlier projects; no secrets.
- [ ] Commit messages are plain and imperative, under the author's own git identity, with no AI mentions,
      co-author trailers or session links.

## 6. Handover

Fill in the plan's handover section (full §15, sprint §9, quick "Handover"): PR link, acceptance results, setup or
integration notes, differences from the agreed plan (with the agreement reference), known limitations and follow-ups.

After the PR is opened, re-read its description and remove any automatically added "generated with" footer. After it
merges, move the plan to `plans/done/` and set its status to **Done**.
