# PLAN_docs_reference-profiles — allow reference profiles modelled on real teams

| Field | Complete this |
|---|---|
| Change | Reword the "no real football IP" rule so some clubs and players can be **reference profiles**: invented names and crests, with style and attributes hand-set to resemble real teams and players |
| Why | A club that plays like a well-known real team gives the whole pipeline an answer key: if the stats, agents or charts describe it wrongly, the team notices at once |
| Author / owner | Azeem |
| Status | In progress. Discussed with Arnav on 2026-10-15 (verbal); his review of this PR is the written record |
| Reviewed commit | main · 38a8038 |
| Branch | `docs/reference-profiles` |
| Governing spec | Not applicable — project rules, not a component spec. `generator/specs/world.md` §5 is updated separately in the world spec PR |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `CONTRIBUTING.md` | Modify | "No real football IP" ground rule allows reference profiles, keeps real names, crests, venues and branding banned, keeps the real-to-invented mapping out of the repo, and bans copying a game's ratings database |
| `README.md` | Modify | Data section mentions reference profiles |
| `.claude/skills/overlap-plan/SKILL.md` | Modify | Rule 5 "No real football IP" matches the new `CONTRIBUTING.md` wording |
| `generator/README.md` | Modify | Intro says names are invented and some clubs are reference profiles |
| `plans/active/PLAN_docs_reference-profiles.md` | Add | This plan |

- **Contracts or hot shared files touched:** No message shapes change. Hot shared files: `CONTRIBUTING.md` and
  `README.md` (tell Arnav) and `.claude/skills/` (tell Arnav and Pranav). Resolution: this small, dedicated docs-only
  PR, with Arnav as reviewer and Pranav told before it merges. Unchanged on purpose: `CONTRACTS.md`, `fixtures/` and
  the PR template still describe invented names only, which stays true; the plan-lint and validate checklists already
  say "no real clubs, players or crests", which also stays true.
- **Conflict scan:** No overlaps found on 2026-10-15 at 38a8038. Sources checked: plans ✓ (`PLAN_mock_live-feed`,
  `PLAN_mock_single-match-demo` touch only `mock/`) · PRs ✓ (none open) · branches ✓ (`mock/live-viewer` touches only
  `mock/` and its own plan; the rest are merged) · hot files: `CONTRIBUTING.md`, `README.md`, `.claude/skills/` (see
  above).
- **Done when:** the four docs say the same thing about reference profiles, no other file changes, and Arnav approves
  the PR.
- **Risk:** a reference profile drifts too close to the real thing (a near-identical name, a crest or the exact
  kit design). Every reference club and player is reviewed in the world spec PR.
- **Handover:**
  - **Checked:** the diff against `main` touches exactly the five files in the file map; the four docs use the same
    wording (invented names, crests, venues and kit designs; kit colours may echo the real team's; mapping never
    committed; no copied ratings).
  - **Not checked yet:** Arnav's review; Pranav told about the `.claude/skills/` change.
  - **Next:** the world spec PR (`generator/specs/world.md`), starting with two reference clubs and their full squads.
