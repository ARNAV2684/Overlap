# PLAN_docs_portal-text — Keep the portal submission text in the repository, filled with the 25 Oct results

| Field | Complete this |
|---|---|
| Change | `docs/submission.md`: the ready-to-paste portal text, updated with the 25 Oct results, and a source for every number |
| Why | 90-point plan B2–B4 and B11 (save a copy of every field's text in the repo); W3 and W4 merged on 25 Oct, so their markers can be filled |
| Author / owner | Arnav (requested this work, 25 Oct). Docs are "Unassigned (Arnav decides)" in `plans/REGISTRY.md` |
| Status | In progress — PR open for review |
| Reviewed commit | main · `1a60777` |
| Branch | `docs/portal-text` |
| Governing spec | Official Rules §4.4 (pitch: what, which Microsoft and Azure technologies, what it does, what problem) |

**Sprints**

| Sprint | What | Done when |
|---|---|---|
| S5.1 | The portal text as written on 25 Oct, in `docs/submission.md`, linked from `docs/README.md` | Unchanged copy committed |
| S5.2 | Fill: the model share of the four Azure runs, single vs multi-agent, the Foundry evaluation, the Hindi placeholders, tracing, tests, GitHub Copilot (kept, on the team's word) | Only the markers no one can fill yet remain: AI share of the next run, showcase replays, live windows, video URL |
| S5.3 | Source check rows for every new figure; word counts | Every figure matches its report |

**Files (the only files that may change):** `docs/submission.md` (add), `docs/README.md` (one row),
`plans/active/PLAN_docs_portal-text.md` (add).

- **Contracts or hot shared files touched:** none.
- **Conflict scan:** open PRs on 25 Oct at `1a60777`: #108, #109, #110. None changes `docs/submission.md` or
  `docs/README.md`; no overlap.
- **Done when:** CI is green; the four remaining markers are filled on 26–27 Oct before submitting.
- **Risk:** the text runs ahead of the site: it describes the 25 Oct runs, while the deployed site may change after the
  next redeploy. Re-run the source check before pasting.
- **Handover:** Pending review.
