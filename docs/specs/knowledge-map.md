# Shared knowledge map

Status: Proposed — M1 specification; not yet agreed on main.

Governing plan: [Graphify knowledge map](../../plans/active/PLAN_docs_graphify-knowledge-map.md).

## Purpose and authority

Give teammates a readable, revision-aware explanation of each architecture box and its dependencies. Graphify-Labs is a development tool, outside the runtime pipeline and separate from the product MCP server.

Authority remains with [CONTRACTS.md](../../CONTRACTS.md) for messages, component specifications for intended behaviour, [the registry](../../plans/REGISTRY.md) for ownership, and source plus recorded checks for implementation evidence. Notes link to these sources; they do not supersede them. Assistant-generated conclusions require review. An inferred edge is not an agreed interface or proof of integration.

## Notes

Under `docs/knowledge/`, create `README.md`, `setup.md`, and these component notes in M2:

- `generator.md`
- `event-hubs.md`
- `screen-relay.md`
- `archiver.md`
- `stats-engine.md`
- `storage.md`
- `ai-insights.md`
- `mcp.md`
- `web-pubsub.md`
- `frontend.md`
- `environments.md`

Every component note must contain purpose, registry ownership, separately labelled team-reported assignments, inputs and outputs, contract links, source entrypoints, implementation status, test evidence, upstream and downstream note links, next work, and last-verified commit/date. Status distinguishes implemented, tested, proposed, blocked and unavailable; absence of a test record means unverified, not failed or passed.

The overview traces live screen delivery, archival/replay, and stats-to-insights separately. Storage and deployment notes connect to their producers and consumers. Shared files are linked rather than copied. Missing owners remain unassigned; only Arnav updates the registry.

Open-PR implementations are a separate section with PR and head revision, never described as merged behaviour. Historical plans are labelled historical. PR #45 is initially a reference for local Cosmos/MCP work, not proof of hosted model execution or live card delivery.

## Index boundary

Generate manually from a clean, selected repository revision by default. Include tracked application source, specifications, contracts, current component READMEs and reviewed knowledge notes. Explicitly exclude historical and active plan directories from automatic extraction: notes link the appropriate current plans for readers. This avoids indexing abandoned proposals as current implementation.

Exclude environment files (including examples), credentials, local settings, certificates, recordings, generated data, logs, database contents, caches, dependency folders, worktrees, Git internals, binary media and generated graph output. Do not scan the user's home folder, chat attachments, other projects or live services. Apply these exclusions before semantic processing, not only to final output. Review the effective input list before a model reads documents. Unsupported source types are listed as coverage gaps, never silently claimed as indexed.

## Tool and execution policy

Use https://github.com/Graphify-Labs/graphify and a separate development-tool environment. In M2 validate one release, then pin the exact working version and document commands verified against that release. Do not use an unpinned latest install in the handoff. This M1 specification does not claim any release or command has been tested.

Code extraction is local. Documentation semantic processing uses existing Codex/Claude access only and may consume subscription quota. No new API keys, paid services, Graphify Cloud, automatic billing fallback or model-enabled CI. If existing assistant access cannot perform extraction, stop and record the limitation; do not switch providers silently.

Do not install global assistant hooks or alter assistant configuration automatically. Use the existing assistant session with reviewed instructions. Preserve Graphify's extracted/inferred labels; human-reviewed notes supply component-level facts and links where code extraction cannot establish cross-service relationships. Do not invent runtime edges to make a graph look complete.

## Artifacts and reproducibility

Keep generated `graphify-out/` artifacts ignored: interactive HTML, graph JSON, report, caches and provenance. The setup guide must state the actual validated paths. Commit notes and reviewed setup/configuration only. No generated graph file is hand-merged.

Record source commit, dirty-worktree status, UTC generation time, Graphify version, effective input paths and the extraction mode with each output. Also record hashes for included source files when generating from a dirty tree. A dirty build is explicitly a local preview, not a release snapshot. Compare commit and source hashes before reuse; changed inputs mark output stale and require regeneration. The HTML/report should be accompanied by this provenance even if the selected Graphify version requires a documented sidecar rather than native metadata.

Same-version extraction on the same inputs must expose the same intended source scope. Model-generated prose and graph ordering need not be byte-identical. A failed generation must not be presented as a refreshed successful graph; keep the last valid output clearly labelled with its previous revision.

## Team workflow

A component author updates its note in the same PR when interfaces, dependencies, readiness or setup change. Component owners review facts; Arnav coordinates documentation ownership and shared changes. After pulling merged changes, each teammate regenerates locally. Git does not transfer their installed tools or running services.

M1 changes only this specification and its plan. After specification agreement, M2 adds notes, validated setup instructions/configuration under `docs/knowledge/`, updates `docs/architecture.md` and `docs/README.md`, and adds necessary output exclusions to `.gitignore`. No changes to runtime source, contracts, registry, CI or assistant settings. Any executable helper would require a separately mapped implementation proposal rather than an unlisted script.

## Acceptance and handover

M1: reviewable boundaries, complete note fields, explicit authority, exclusions, provenance and tests; relative document links resolve.

M2: all eleven notes exist and have bidirectional dependency links, source and evidence references; live, archive and insights paths are independently traceable. Current main and open PR work are distinguishable. Graphify output opens interactively, permits searching a component/source concept, and retains extraction provenance. Unsupported parsing or omitted semantic relationships are reported.

M3: reproduce on macOS and Windows, recording OS, exact tool version, source revision, commands, output paths and results. Test with no Azure credentials or new API keys. Check the input manifest and generated artifacts for excluded paths/content; introduce an excluded dummy file and confirm it never enters extraction. Change an included source in an isolated scratch copy and verify staleness detection. Delete generated output and verify tracked source/notes are unchanged. Test quota/provider failure without fallback. No Windows pass may be claimed without an actual Windows run.

Runtime integrations are not exercised by this documentation milestone. A graph path is not an end-to-end application test. M3 remains pending if a second OS is unavailable.

## Rollback and scope limits

Remove the isolated tool environment and ignored artifacts to undo local setup. Revert documentation changes normally if required. No application migration or service restart is involved. Hosted sharing, custom dashboards, automatic CI refresh and assistant hooks are deferred. Prioritise readable notes over optional visual enrichment when time is short.
