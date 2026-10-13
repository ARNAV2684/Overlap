# Contributing

## Ground rules

- **Synthetic data only.** Never import, scrape or calibrate from real match data. Public aggregate statistics are
  fine, and each one is cited in [`CALIBRATION.md`](CALIBRATION.md).
- **No real football IP.** No real club names, crests, player names or league branding in code, UI, data,
  screenshots or video. Everything is invented.
- **No secrets in the repo.** It's public. Services use managed identity; anything sensitive lives in Azure Key
  Vault. `.env` files stay local.
- **Numbers come from code, words come from the agents.** Agents only cite numbers from a moment's evidence pack.
- **Commit your own work under your own name,** so everyone's contribution is visible.

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
