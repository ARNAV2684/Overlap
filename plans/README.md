# Plans

Every piece of work in Overlap is planned before it is built, and every plan lives here so that everyone (and every
AI assistant) can see what everyone else is about to change. That is how we catch overlapping work **before** it
becomes a merge conflict.

Plans are written with the `overlap-plan` skill in [`.claude/skills/overlap-plan`](../.claude/skills/overlap-plan/SKILL.md)
(`/overlap-plan` in Claude Code, `$overlap-plan` in Codex).

## Folders

| Path | Holds |
|---|---|
| [`REGISTRY.md`](REGISTRY.md) | Who owns which layer, and the hot shared files that need special care |
| `active/` | Plans that are Draft, Ready for review, Agreed or In progress |
| `done/` | Plans whose work has merged |

## Naming

- Full or quick plan: `PLAN_<area>_<short-description>.md`, e.g. `PLAN_generator_world-builder.md`
- Sprint plan: `PLAN_<area>_<short-description>_S<n>.md`, e.g. `PLAN_generator_world-builder_S2.md`
- `<area>` is the top-level folder the work lives in: `generator`, `stats`, `archiver`, `agents`, `mcp_server`,
  `functions`, `web`, `infra`, `docs`, `scripts`, or `contracts` for `CONTRACTS.md` changes.

## Lifecycle

```
Draft ─▶ Ready for review ─▶ Agreed ─▶ In progress ─▶ Done (moved to done/)
              │
              └─▶ Changes requested ─▶ back to Draft
```

1. **Draft:** written with `/overlap-plan propose` (or `sprint`), conflict-scanned and self-checked.
2. **Ready for review:** committed to `plans/active/` in a small PR (or shared for review).
3. **Agreed:** the reviewer and the owners of anything the plan affects have agreed. The spec it depends on is merged.
4. **In progress:** the author said **go**; the work happens on its own branch, inside the plan's file map.
5. **Done:** validated with `/overlap-plan validate`, the PR merged, the plan moved to `done/`.

Keep a plan's status line up to date: the conflict scan reads it.
