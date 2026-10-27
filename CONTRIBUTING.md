# Contributing

## Ground rules

- **Synthetic data only.** Never import, scrape or calibrate from real match data. Public aggregate statistics are
  fine, and each one is cited in [`CALIBRATION.md`](CALIBRATION.md).
- **No real football IP.** No real club names, crests, player names, venues or league branding in code, UI, data,
  screenshots or video. Every name and crest is invented.
- **Reference profiles are allowed.** A few clubs and players have their style and attributes hand-set to resemble
  real teams and players, so we can tell at a glance whether the pipeline's output makes sense. Their names, crests,
  venues and kit designs are still invented; kit colours may echo the real team's. The mapping from a reference
  profile to the real team or player is never committed to this repository. Ratings are set by hand, never copied
  from a game's ratings database. (Discussed with Arnav, 2026-10-15.)
- **No secrets in the repo.** It's public. Services use managed identity; anything sensitive lives in Azure Key
  Vault. `.env` files stay local.
- **Numbers come from code, words come from the agents.** Agents only cite numbers from a moment's evidence pack.
- **Commit your own work under your own name,** so everyone's contribution is visible.

## Plan before you build

Before implementing anything, plan it with the `overlap-plan` skill
([`.claude/skills/overlap-plan`](.claude/skills/overlap-plan/SKILL.md); `/overlap-plan` in Claude Code,
`$overlap-plan` in Codex):

1. **Plan:** `/overlap-plan propose <what>` (or `sprint <n> of <plan>`, or a quick plan for a small change). The
   plan lists exactly which files will change and checks them against everyone else's active plans, open PRs and
   branches.
2. **Review:** share the plan (saved in [`plans/active/`](plans/)); the owners of anything it affects agree.
3. **Go:** implementation starts only when the author says **go**, and stays inside the plan's file map.
4. **Validate:** `/overlap-plan validate` before opening the PR.

Layer owners and the hot shared files that need extra care are listed in [`plans/REGISTRY.md`](plans/REGISTRY.md).

## Spec first, then code

Every folder has a `specs/` folder of templates and comment-only placeholder files. For any piece of work:

1. Fill in the spec it follows (the placeholder's `Spec:` line names it) and get it agreed in a PR. The PR that
   agrees it sets the spec's status line to `> **Status: agreed.**`.
2. Only then write the code, replacing the placeholder's comments. Keep the `Spec:` line in the file's header: CI
   uses it to find the governing spec.
3. If the code needs something the spec doesn't say, update the spec in the same PR.

## Branches and pull requests

- `main` is always deployable. Nobody pushes to it directly.
- Branch names: `<area>/<short-description>`, e.g. `generator/match-engine`, `web/moment-card`, `docs/contracts`.
- Open a PR into `main`, fill in the template, and get at least one review before merging.
- Keep PRs small and focused: one layer or one feature at a time.
- A change to a message shape updates [`CONTRACTS.md`](CONTRACTS.md) in the same PR, and both sides of the
  hand-off agree before it merges.

## Checks on every PR

GitHub Actions runs these on every pull request into `main`. **Blocking** checks must pass before merging;
**warnings** appear on the PR but don't stop it.

| Check | What it looks at | Blocking? |
|---|---|---|
| **Policy** | AI-attribution lines (tool co-author trailers, "generated with" footers, session links) in commit messages, the PR title and description, and the branch name | Blocking |
| | Branch name `<area>/<short-description>`; the PR template filled in; every commit under its author's own GitHub noreply identity | Warning |
| **Private blocklist** | Terms that must never be public (kept in the repository secret `POLICY_BLOCKLIST`, never in the repo) in the PR text, commit messages, file paths and added lines. Matches are reported by number only | Blocking |
| **Secrets scan** | Keys, tokens and connection strings in the PR's commits (gitleaks) | Blocking |
| **Scope and spec gate** | Changed code whose governing spec isn't `agreed`; a PR with no plan in `plans/active/` | Warning |
| **Scope comment** | One bot comment on the PR, updated on every push: layers and hot shared files touched, owners to tell (from `plans/REGISTRY.md`), and other open PRs or active plans touching the same files | Information |
| **Python** | `ruff check` on changed `.py` files; `pytest` for each changed project with tests | Blocking |
| **Web** | Lint, typecheck and build, once `web/package.json` exists | Blocking |
| **Infra** | `bicep build` and `bicep lint` on changed `.bicep` files | Blocking |

To run the same checks locally before pushing (use `python` instead of `python3` on Windows):

```bash
python3 .github/scripts/pr_policy.py policy      # compares your branch with origin/main
python3 .github/scripts/pr_policy.py scope
uvx ruff@0.17.0 check <your .py files>
```

The blocklist secret is maintained by Arnav: one term per line, `meta:` in front of a term that only applies to
commit messages, PR text and branch names. Pull requests from forks can't read it, so their blocklist check is
skipped and a reviewer checks by hand.

## Commit messages

- Imperative mood and short: `Add possession model`, `Fix PPDA zone filter`.
- Explain the *why* in the body when it isn't obvious.

## Planned tooling

Adopted as each layer's code lands:

| Area | Tooling |
|---|---|
| Python (generator, stats, archiver, agents, MCP server, Functions) | Python 3.12, `uv` **0.13.4**, `ruff`, `pytest` |
| Web app | Next.js (App Router), TypeScript, Node 22 |
| Infrastructure | `azd` + Bicep |
| CI | GitHub Actions on every PR (see "Checks on every PR") |

### Lockfiles

Every project commits its lockfile, so laptops, CI and the Azure build install exactly the versions that were
tested: `uv.lock` in each Python project, `web/package-lock.json` for the web app.

- **One `uv` for everyone:** 0.13.4 (`uv self update 0.13.4`). Each `pyproject.toml` sets `required-version`, so an
  older `uv` refuses to run instead of rewriting a lockfile in an older format; CI pins the same version.
- **Changing dependencies:** edit `pyproject.toml`, run `uv lock` in that project, commit both files together. CI
  runs `uv sync --locked`, so a lockfile that doesn't match its `pyproject.toml` fails the pull request.
- **Web:** after changing `package.json`, run `npm install` and commit `package-lock.json`; CI uses `npm ci`.
- A lockfile written in an older format is upgraded the first time `uv lock` actually changes it; that's expected,
  once.
