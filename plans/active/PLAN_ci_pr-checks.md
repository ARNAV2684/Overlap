# PLAN_ci_pr-checks — GitHub Actions every pull request goes through

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | CI · automatic checks on every PR (team rules, scope and conflicts, code quality per layer, secrets), plus `main` protection so nothing merges without them |
| Author / primary owner | Arnav |
| Collaborators and responsibilities | None named; any split is Arnav's call |
| Review coordinator | Arnav |
| Affected component owners | Everyone who opens PRs: Azeem (generator), Vedant (web), Arnav and Pranav (Event Hubs), unassigned layers (Arnav decides). `.github/` and `CONTRIBUTING.md` are hot files owned by Arnav |
| Proposal version and date | v1.1 · 15 Oct 2026 (spec gate is a warning, per Arnav) |
| Status | In progress (go from Arnav, 15 Oct; M1 + M2) |
| Plan tier and file | Full · `plans/active/PLAN_ci_pr-checks.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 2d2d646 |
| Architecture box / work area | Repository tooling (`.github/`); touches no runtime layer |
| Relevant issue, spec PR, or discussion | Not created yet. Handoff §10.2 lists "CI" for 14–16 Oct; `CONTRIBUTING.md` "Planned tooling" says "GitHub Actions: lint, tests and build on every PR" |

## 1. Purpose and intended outcome

- **Problem or need:** five people and their AI assistants push in parallel. Today nothing checks a PR: the team rules
  (no AI mentions, own identity, no real names, no secrets, spec first, plan first) are enforced only by memory, and
  `main` is not protected (anyone can push to it directly).
- **Proposed outcome:** every PR into `main` runs a fixed set of checks; the required ones must pass and one approval
  is needed before merge; a bot comment tells the author which layers and hot files they touched and which other open
  PRs or active plans overlap.
- **Benefit to teammates:** mistakes are caught in minutes by a machine instead of in review or, worse, after
  submission (prize role verification, the public repo, the judges).
- **Success statement:** a PR that breaks a team rule or a layer's tests cannot be merged into `main`, and the author
  sees why in the PR.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current CI | main · 2d2d646 | None. `.github/` has only `pull_request_template.md`. `main` is **not protected** (GitHub API: "Branch not protected") |
| Team rules | `CONTRIBUTING.md`, `.claude/skills/overlap-plan/SKILL.md` rule 5 (incl. the reference-profiles rule from PR #7) | What the policy checks enforce |
| Spec status markers | 34 specs `> **Status: not started.**`, 1 `> **Status: draft for review.**` (`generator/specs/world.md`) | There is no "agreed" marker yet (D-03) |
| Placeholder headers | e.g. `generator/world.py`: `# Spec:    generator/specs/world.md` | Lets CI find each code file's governing spec |
| Python projects | `mock/pyproject.toml` only | Layers will add their own; CI must discover them |
| Web, infra | `web/` and `infra/*.bicep` are comment-only placeholders | Their checks run but have little to do until code lands |
| Ownership | `plans/REGISTRY.md` | Folder → layer → owner; hot files |

**Differences between references:** `CONTRIBUTING.md` says "at least one review before merging", but nothing enforces
it. The plans README area list has no area for repository tooling; this plan proposes `ci` (D-07).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Required PR checks: policy, scope, spec gate, secrets | Deploying to Azure from GitHub (needs OIDC and Azure; separate plan) |
| Per-layer quality checks, run only when that layer changes: Python (ruff + pytest + mock validation), web (lint, typecheck, build once `web/package.json` exists), infra (Bicep build/lint) | Agent evaluations in CI (cost money; manual trigger later) |
| A bot comment: layers touched, hot files, owners to tell (from `REGISTRY.md`), overlapping PRs and plans | `CODEOWNERS` (only if Arnav decides; D-05) |
| Documenting the checks in `CONTRIBUTING.md` | Moving plans to `done/` automatically (a bot commit on `main` would not be a human commit) |
| Protecting `main` (settings, done by Arnav or with his explicit OK) | Scheduled jobs (judges'-link uptime, nightly realism report): suggested in §14 |

- **Minimum complete result:** policy + secrets + Python checks required, `main` protected.
- **Optional extension:** the conflict comment, web and infra jobs, dependency review, CodeQL.
- **Boundary with neighbouring components:** CI never changes code, never pushes, never deploys. It reads the PR and
  reports. Layer owners decide what their tests contain.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| `.github/` (hot) | Arnav | New workflows and scripts | Pending · M1 | — |
| `CONTRIBUTING.md` (hot) | Arnav | Short "Checks on every PR" section | Pending · M1 | — |
| Repo secret `POLICY_BLOCKLIST` | Arnav (only he can create it) | The private word list for the name/term checks (D-02) | Pending · M1 | Check runs without it and says "blocklist not set" |
| Branch protection / ruleset on `main` | Arnav | Settings change (D-04) | Pending · M3 | Checks still run and report; just not enforced |
| Each layer's tests | Layer owners (Azeem, Vedant, Arnav/Pranav, unassigned) | They add tests; CI runs them | Ongoing | CI runs whatever exists |
| Open work in progress | Azeem's `generator/` work, Pranav's demo, everyone | Told before `main` protection turns on | Pending · M3 | — |

**My owned deliverables:** everything in §8 except the settings and the secret (Arnav applies those).
**Shared deliverables:** the `CONTRIBUTING.md` section (Arnav reviews).

## 5. Proposed flow

```text
PR opened / updated ──▶ pr-checks.yml (always)
                          ├─ policy      branch name, commit identity, no AI trailers/footers, PR template filled,
                          │              private blocklist (names, terms) on PR text, commits and added lines
                          ├─ secrets     gitleaks on the PR's commits
                          ├─ scope       changed files → layers, hot files, plan present, spec gate
                          └─ report      one bot comment (updated in place): layers, owners to tell (REGISTRY),
                                         overlapping open PRs and active plans
                     ──▶ python.yml (only if a Python project changed)  ruff + pytest; `mock validate` for mock/
                     ──▶ web.yml    (only if web/ changed and package.json exists)  lint, typecheck, build
                     ──▶ infra.yml  (only if infra/ or azure.yaml changed)  bicep build + lint
main protection ──▶ merge needs: required checks green + 1 approval + branch up to date with main
```

- **Input arrives through:** the `pull_request` event (never `pull_request_target`, so PR code never runs with write
  access).
- **Processing performed here:** read-only checks; one comment written with a token limited to `pull-requests: write`.
- **Output goes to:** check results on the PR, one bot comment.
- **Execution relationship:** jobs run in parallel; language jobs are skipped when their paths are untouched.
- **State retained:** none (the comment is found and updated by a hidden marker).

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Where the logic lives | A small Python script, `.github/scripts/pr_policy.py`, called by the workflow | Testable, readable, one place; standard library only | Inline bash in YAML (hard to read and test) | Proposed · Arnav |
| Words that must never appear | Kept in a repo **secret** `POLICY_BLOCKLIST`, never in the repo | The public repo must not name an earlier project, real clubs mapped to reference profiles, or AI tools. A word list in a workflow file would do exactly that | Hard-coded list (leaks the words); no check (relies on memory) | Proposed · D-02 |
| AI-attribution check | Commit messages, PR title and body, branch name: block lines that start `Co-authored-by:` naming a non-human address from the blocklist, "generated with" footers and session links | Rule 6a, without naming vendors in public | Block all `Co-authored-by` (would also block two humans pairing) | Proposed · D-02 |
| Identity check | Every commit's author is a GitHub noreply address or a collaborator's address; warn (not fail) if the author differs from the PR author | Prize role verification; pairing stays possible | Fail on mismatch (blocks pairing) | Proposed · D-01 |
| Spec gate | A changed code file whose `Spec:` header names a spec that is not `> **Status: agreed.**` on the PR head gets a **warning** | Makes the rule visible without blocking | Fail (blocking) | Agreed: warning (Arnav, 15 Oct) |
| Plan presence | Warn when a PR adds or changes no file in `plans/` and its branch area has no active plan | The workflow requires plans, but tiny fixes shouldn't be blocked | Fail (heavier) | Proposed · D-01 |
| Secrets scan | gitleaks (free for personal-account repos), pinned version | Catches keys before they're public | GitHub push protection alone (also recommended: D-04) | Proposed |
| Python | `uvx ruff check`, `uv run pytest` per project that has tests; `uv run mock validate` for `mock/` | Matches `CONTRIBUTING.md` tooling; no shared dependency file needed | One root project (conflicts across layers) | Proposed |
| Cost | Standard GitHub-hosted runners | Free and unlimited for public repositories | Self-hosted (pointless here) | Proposed |
| Merge rule | Ruleset on `main`: PR required, 1 approval, required checks, up to date, no force-push or deletion | Makes the checks matter | Checks only (advisory) | Proposed · D-04 |

**Assumptions:**
- A-01: the repo stays public (free Actions minutes, free gitleaks, free secret scanning). Checked: public.
- A-02: everyone works on branches in this repo, not forks (fork PRs can't read `POLICY_BLOCKLIST`; that job reports
  "skipped for forks").
- A-03: the current `mock/` code passes `ruff check` with default rules. **Not checked yet**; M2 fixes or configures it.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Message shapes (`CONTRACTS.md`) | All layers | `CONTRACTS.md` v0 | No | — |
| Spec status marker | Spec authors → CI spec gate | `> **Status: agreed.**` (new convention) | Yes: a convention, not a message shape | All spec authors · D-03 |
| Code file header `Spec:` line | Code authors → CI spec gate | Placeholder headers | Keep the line when replacing a placeholder | All code authors · D-03 |

**Shared contract edits required:** None. **Source of truth:** `CONTRIBUTING.md` for the conventions.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `.github/workflows/pr-checks.yml` | Add | Policy, secrets, scope + spec gate, report comment | This plan (no layer spec governs CI) | Arnav |
| `.github/workflows/python.yml` | Add | ruff + pytest per changed Python project; `mock validate` | This plan | Arnav |
| `.github/workflows/web.yml` | Add | Lint, typecheck, build once `web/package.json` exists; otherwise a no-op pass | This plan | Arnav · Vedant told |
| `.github/workflows/infra.yml` | Add | `bicep build` + `bicep lint` on changed `.bicep` files | This plan | Arnav · Pranav told |
| `.github/scripts/pr_policy.py` | Add | The policy, scope, spec-gate and report logic | This plan | Arnav |
| `.github/scripts/test_pr_policy.py` | Add | Unit tests for the script | This plan | Arnav |
| `CONTRIBUTING.md` | Modify (hot) | "Checks on every PR" section + the spec status and `Spec:` header conventions | — | Arnav |
| `plans/active/PLAN_ci_pr-checks.md` | Add | This plan | — | Arnav |
| `mock/` (ruff findings only) | Modify, only if A-03 fails, or add a ruff config there | Make the mock pass lint | — | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| A check is wrong (false positive) | PR blocked | Fix the script in a small PR; Arnav can bypass the ruleset in an emergency | One PR delayed | Unit tests with good and bad examples |
| `POLICY_BLOCKLIST` not set | Blocklist step passes with a visible "not configured" notice | Arnav sets the secret | None | Run once without the secret |
| PR from a fork | Secret-dependent step skipped with a notice | Reviewer checks by hand | None | Documented |
| GitHub Actions outage | Checks pending | Wait, or Arnav bypasses | Merges paused | — |
| Existing branches opened before the checks | Their next push runs the checks | Fix and push | Short delay for in-flight PRs | Team told before M3 |
| Third-party action compromised | — | Pin actions to exact versions; minimal permissions; `pull_request` only | — | Review of the YAML |

## 10. Requirements specific to this work

- **Performance and load:** policy and scope job under ~1 minute; language jobs only when their paths change. Unmeasured.
- **Observability:** each job writes a short summary to the run page; the bot comment summarises the PR.
- **Azure resources and access:** none.
- **Cost:** none expected (public repo, hosted runners).
- **Security and data:** `permissions:` set to read-only by default; `pull-requests: write` only on the comment job;
  no `pull_request_target`; the blocklist secret's values are masked in logs and never echoed.
- **AI behavior:** Not applicable — no model runs in CI.
- **Frontend experience:** Not applicable.
- **Synthetic data or calculations:** `mock validate` (and later the generator's invariant tests) runs on every change to
  those folders.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given a commit or PR text with an AI co-author trailer or a "generated with" footer, the policy check fails and names the commit | Unit tests (not a public test PR: that would put the very lines we ban into the public repo) | — | Test output |
| AC-02 | Given an added line containing a blocklisted term, the check fails and reports the term by number only | Unit tests; live once Arnav sets `POLICY_BLOCKLIST` | `POLICY_BLOCKLIST` set | Test output |
| AC-03 | Given a commit with a key-shaped string, the secrets check fails | gitleaks' own rules; this PR's run proves the job installs and scans (a fake key isn't committed publicly) | — | Run link |
| AC-04 | Given a PR changing `generator/world.py` while `generator/specs/world.md` is not agreed, the spec gate warns; with the spec marked agreed it is silent | Unit tests + dry run on PR #8's commits | D-03 | Test output |
| AC-05 | Given a clean PR touching only `mock/`, all required checks pass and the bot comment lists layer `mock`, no hot files, and any overlapping open PRs | This plan's own PR | — | Run link + comment |
| AC-06 | Given a PR that edits only `docs/`, the Python, web and infra jobs are skipped | Test PR | — | Run link |
| AC-07 | Given the ruleset is on, a PR without approval or with a failing required check cannot be merged, and a direct push to `main` is rejected | Try both | D-04 applied | Screenshots |

**Validation limits:** web and infra jobs only prove they run and skip correctly until real code exists in those folders.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Policy and scope checks | `pr-checks.yml` + script + tests running on the PR that adds them; `CONTRIBUTING.md` section | Arnav | D-01, D-02, D-03 | AC-01 – AC-05 | ½ day · 15–16 Oct |
| M2 — Layer checks | `python.yml`, `web.yml`, `infra.yml`; `mock/` passes | Arnav | M1 | AC-06 | ½ day · 16 Oct |
| M3 — Enforce on `main` | Ruleset on, team told, required checks selected | Arnav (settings) | M1, M2, D-04 | AC-07 | ½ hour · 16 Oct |

- **Project calendar check:** done by 16 Oct, before most layer code lands (20 Oct end-to-end milestone). Fits.
- **First integration checkpoint:** AC-05, this plan's own PR runs the checks on itself.
- **Parallel work:** nobody waits on this; their PRs just start getting checked.
- **Dependency-bound work:** M3 waits on the team being told.
- **Scope reduction if time runs short:** drop the conflict comment, web and infra jobs; keep policy, secrets, Python
  and `main` protection.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** one branch `ci/pr-checks`; `CONTRIBUTING.md` in its own commit (hot file).
- **Shared-file coordination:** `.github/` and `CONTRIBUTING.md` are Arnav's; Azeem, Vedant and Pranav told before M3
  because their open and next PRs will be checked.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `CONTRIBUTING.md` | none open (last changed by PR #7, merged) | Arnav | Dedicated commit | No overlap |
| `mock/` (only if ruff needs fixes) | `PLAN_mock_live-feed`, `PLAN_mock_single-match-demo` (merged; still in `active/`) | Arnav, Pranav | Tell Pranav if `mock/single-match-demo/serve.py` needs lint fixes | Pending |
| Spec gate behaviour | `PLAN_generator_world-builder` (in progress) | Azeem | Azeem marks `world.md` agreed before code; told before M3 | Pending |

Scanned at `2d2d646` on 2026-10-15. Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ (`mock/live-viewer`:
closed PR, not merging) · hot files ✓ (`.github/`, `CONTRIBUTING.md`).

- **Integration procedure:** merge; everyone's next push is checked; read the bot comment.
- **Configuration or setup changes:** repo secret `POLICY_BLOCKLIST` (name only here); ruleset on `main`.
- **Deployment or data changes:** settings only; reversible by turning the ruleset off.
- **Documentation updates:** `CONTRIBUTING.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | False positives block real work near deadlines | Frustration, bypasses | Arnav | Start plan-presence and identity checks as warnings | — |
| R-02 | Blocklist leaks through a log | Words become public | Arnav | Never print matches, only file and line | M1 |
| R-03 | Spec gate stalls everyone because specs aren't agreed | Code can't merge | Arnav | That is the rule working; specs must land first. Arnav can bypass for emergencies | Every layer's code |

**Decisions requested from Arnav:**

1. **D-01 Blocking vs warning.** Recommended blocking: AI attribution, blocklist, secrets, spec gate, tests. Warning:
   plan presence, identity mismatch, PR template completeness.
2. **D-02 Private blocklist.** Create repo secret `POLICY_BLOCKLIST` (one term per line): earlier project name, real
   names behind reference profiles, AI tool names and addresses, real data-source names. Only you set and edit it.
3. **D-03 "Agreed" marker.** A spec is agreed when its PR sets `> **Status: agreed.**`; code keeps its `Spec:` header.
4. **D-04 Protect `main`.** Ruleset: PR required, 1 approval, required checks, up to date with `main`, no force-push or
   deletion; you as the only bypass. Also turn on secret scanning push protection and Dependabot alerts (free). You
   apply these, or tell me explicitly and I apply them with `gh`.
5. **D-05 Reviewer routing.** The bot comment lists owners to tell from `REGISTRY.md` (informational). A `CODEOWNERS`
   file would auto-request reviews; only if you want it, with names you choose.
6. **D-06 Merge method.** Keep merge commits (each person's commits stay visible for role verification; recommended) or
   squash.
7. **D-07 Area name.** `ci` for repository tooling plans and branches.

**Suggested later (separate plans, not in this one):**
- **Deploy on merge** with `azd` and GitHub OIDC to Azure (no stored keys), behind a manual approval environment.
- **Judges'-link uptime check:** a scheduled job pinging the replay link until 10 Nov; opens an issue if it fails.
- **Nightly realism report:** once the generator lands, generate a season and compare with `CALIBRATION.md`.
- **Contract fixtures:** validate every file in `fixtures/` against `CONTRACTS.md` on change (`scripts/validate_fixtures.py`).
- **Agent evaluation on demand:** a manually triggered job that runs the fact-checker fault-injection eval (costs model calls).
- **Plan housekeeping reminder:** after a merge, a comment reminding the author to move the plan to `done/`.
- **Mock retirement:** once `generator/live.py` exists, a check that fails while `mock/` is still present.

## 15. Review, agreement, and handover

### Author’s submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked.
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Questions for Arnav’s coordinated review

1. Does this work support the agreed product flow and stay within its stated scope?
2. Do both sides of every handoff agree on data shape, meaning, timing, and failure behavior?
3. Are multiple contributors changing the same files or creating competing implementations?
4. Are there hidden blockers, circular dependencies, or decisions incorrectly presented as settled?
5. Can the approach be simplified while preserving the required behavior?
6. Do the acceptance checks demonstrate interoperability as well as isolated component behavior?

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Arnav | v1 | — | Pending | — |

**Decisions recorded (15 Oct, Arnav):** D-01 as in the check table, with the spec gate a warning; D-03 marker convention adopted; D-05 no `CODEOWNERS` (the comment lists owners); D-07 area `ci`. **Pending Arnav:** D-02 create the `POLICY_BLOCKLIST` secret; D-04 protect `main` (settings, not covered by this go); D-06 merge method.

**Implementation readiness:** M1 and M2 in progress; M3 waits for D-04.
**Relevant specification agreement:** not applicable (repository tooling).
**Next action and owner:** decide D-01 to D-07 · Arnav.

### Handover after implementation

Pending implementation.
