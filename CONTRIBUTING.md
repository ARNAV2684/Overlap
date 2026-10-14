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

1. Fill in the spec it follows (the placeholder's `Spec:` line names it) and get it agreed in a PR.
2. Only then write the code, replacing the placeholder's comments.
3. If the code needs something the spec doesn't say, update the spec in the same PR.

## Branches and pull requests

- `main` is always deployable. Nobody pushes to it directly.
- Branch names: `<area>/<short-description>`, e.g. `generator/match-engine`, `web/moment-card`, `docs/contracts`.
- Open a PR into `main`, fill in the template, and get at least one review before merging.
- Keep PRs small and focused: one layer or one feature at a time.
- A change to a message shape updates [`CONTRACTS.md`](CONTRACTS.md) in the same PR, and both sides of the
  hand-off agree before it merges.

## Commit messages

- Imperative mood and short: `Add possession model`, `Fix PPDA zone filter`.
- Explain the *why* in the body when it isn't obvious.

## Planned tooling

Adopted as each layer's code lands:

| Area | Tooling |
|---|---|
| Python (generator, stats, archiver, agents, MCP server, Functions) | Python 3.12, `uv`, `ruff`, `pytest` |
| Web app | Next.js (App Router), TypeScript |
| Infrastructure | `azd` + Bicep |
| CI | GitHub Actions: lint, tests and build on every PR |
