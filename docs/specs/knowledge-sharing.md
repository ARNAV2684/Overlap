# Shared knowledge notes and automatic graph publishing

Status: Proposed for review, 19 October 2026. No workflow or hosted site is enabled by this specification.

Plan: [shared knowledge publishing](../../plans/active/PLAN_docs_knowledge-sharing.md).
Predecessor: [knowledge map](knowledge-map.md), agreed in #46; implementation [#47](https://github.com/ARNAV2684/Overlap/pull/47) remains draft at this review.

## 1. Outcome and authority

Teammates should find a component's purpose, implementation, recorded responsibility, work evidence, required inputs, downstream impact and review requests in the repository itself. A shared static graph is a view of that recorded knowledge. It cannot discover private work or decide that a handoff is accepted.

This proposal explicitly extends the predecessor's manual-only generation policy. After agreement and a separate implementation PR, trusted main commits trigger graph regeneration and publishing. Local generation remains supported. Contracts, component specs and plans/REGISTRY.md retain their existing authority. No runtime message or application dependency changes.

## 2. Component-note collaboration contract

Preserve all existing eleven note fields. Add a work table with: responsible person; assignment basis (registry, user-reported, unresolved); scoped work item; state; source revision; plan/PR/test evidence; last verified date. Describe evidenced work, never infer who is actively working from a commit author alone. A stale or missing record is labelled unknown, not automatically completed.

For each required review/input, use a stable component-prefixed ID and one canonical section in the requesting note. Include requester/component, requested reviewer/provider, exact question or deliverable, reason/blocked outcome, relevant interface/spec, status, acceptance evidence, decision URL/date and optional agreed deadline. Valid states: proposed, requested, changes-requested, accepted, delivered, verified, superseded. Initially proposed; requested requires an actual request record. Accepted requires an attributable decision. Delivery and integration verification are separate. A merged PR does not close every request it mentions.

Other notes backlink to that canonical section, not duplicate its mutable status. The overview gives a person-to-component index and links to outstanding coordination items. Unknown owners remain unassigned (Arnav decides); automation never edits the registry. Each person updates affected notes with their component PR. Reviewers check factual changes as part of that PR.

Example: Pranav's MCP needs Azeem's real moments/evidence/frozen-context producer and Arnav's storage interface. Vedant's input concerns the downstream insight card and reconnect interface, not the first MCP point read itself. Preserve the chain stats → moments → MCP/workflow → delivery → frontend; never add a fictitious frontend → MCP runtime dependency to show a people-review edge.

## 3. What updates automatically

After a push to main (including merges), CI checks out that exact revision and rebuilds from tracked allowed inputs. No path filter initially: any main change can alter source evidence. Manual dispatch is allowed for main only. No deployment on pull_request or pull_request_target. Optional PR validation is read-only and separate from publication.

Automation extracts code relationships, explicit Markdown citations, component links and recorded handoff references; it does not rewrite human prose, assign tasks, scrape chats or invoke models. Runtime dependencies, code relationships and coordination/review edges must have distinct types/legend. Proposed reviews remain proposed in the exported view. The existing eleven-box view stays simple; coordination details are accessible from node links to the exact-revision note.

The hosted graph updates automatically. A teammate's local clone updates through their own git pull; no auto-pull, forced merge, global assistant hook or background daemon. Existing assistants may read checked-in notes after pulling, but no promise of automatic assistant-context loading is made. Generated outputs remain ignored and do not get committed by CI.

## 4. Build and distribution

Extract the previously reviewed manual recipe into a repository helper governed by this spec. Pin Graphify 0.9.92, Python 3.12 and resolved dependencies; validate on CI Linux before claiming it works there. Reuse the existing source allowlist and exclusions. Resolve tracked paths against the checkout, reject symlinks/outside-root paths, and never package the intermediate input/ source copy, credentials, environment files, recordings, databases or logs.

Produce a static landing page, eleven-component graph, full graph, report, portable provenance and a downloadable bundle. Landing page shows commit, generation time, build-run link, extraction mode, source-note verification dates and links to notes at that commit. Provenance records input paths/hashes and clean/dirty state using repository-relative paths, not laptop paths. Publish only an explicit output allowlist from a staging directory. No arbitrary source text is executed while building or viewing. Escape untrusted node labels/HTML; test script-like labels and links. Validate any bundled visualization dependency/licence; otherwise document a pinned external dependency and loading-error behaviour.

Two publication outputs:

1. Actions artifact named with the source SHA, retention seven days. A successful artifact is useful even if Pages is unavailable. Download requires GitHub sign-in/read access. This is a downloadable snapshot, not a hosted browser URL.
2. Pages deployment to one stable URL after the maintainer enables GitHub Actions as the Pages source and confirms it does not replace an existing site. The repo was visibly Public on 19 October. Do not publish a private/internal checkout under this public policy; fail closed if visibility changes. Pages access/settings were not available to the author's account (404); availability and existing site remain unverified. No account upgrade, billing setting, repository visibility change or custom domain is authorised.

No new paid service or provider keys. Use standard hosted runners only; bounded jobs (15-minute build, five-minute deployment) and concurrency cancellation. Monitor actual usage/quotas; don't claim zero usage or silently upgrade. If hosting is unavailable, report artifact-only delivery and preserve the outstanding hosted-site criterion.

## 5. Permissions and consistency

Build job gets contents:read only. Checkout credentials are not persisted. Deployment gets only required pages:write/id-token:write plus read access and uses the github-pages environment restricted to main. Pin third-party actions to reviewed full commit SHAs. No PR writes, issue comments, PAT, model key or user-token requirement.

Deploy only after a successful validated build of current main. Before deployment recheck main's SHA and skip obsolete builds; use a shared concurrency group so an older run cannot overwrite a newer completed release. A build/deploy failure must leave the previous successful Pages deployment intact and make the failure visible in Actions. The landing page always states the deployed SHA and links to latest source/build status; do not label yesterday's graph current simply because it loads. A newer source commit can be recognised without live client-side polling.

GitHub publication is not an application deployment. Removing/disable the documentation workflow and reverting docs tooling must leave the match pipeline untouched. Maintainer may redeploy the last verified artifact; never force-push generated branches as recovery.

## 6. Acceptance

- Eleven notes contain work and coordination sections, evidence/status and resolving cross-links; no invented ownership, approval or deadlines.
- Starting at MCP, a teammate finds Azeem's required producer document, Arnav's storage decision and Vedant's downstream card review, with each request's canonical evidence and unresolved status.
- A merged trusted-main change produces an artifact and, once Pages is enabled, a shared working component/full graph with matching SHA and provenance. Browser search, note links, project subpath assets and component navigation are exercised.
- Deliberately excluded tracked dummy secrets/runtime files and symlink paths do not enter extraction or artifacts; script-like labels cannot execute.
- Stale builds, failed generation, invalid handoff references and unavailable Pages fail visibly without replacing the prior valid site. Artifact-only results do not count as hosted completion.
- New clone + documented setup can build locally; hosted graph requires no teammate installation. Linux CI and browser checks get actual evidence. Existing macOS/Windows gaps remain explicit until exercised.
- A changed component with an unchanged note triggers a review warning using an explicit folder-to-note map; warn only (not automatic prose rewriting or an application merge blocker). Resolution is a note update or reviewer explanation.

## 7. Sequence and review decisions

First finish/review #47's readable notes and accept this separate specification. Then implement the mapped helper/tests, documentation update and isolated workflow commit. Arnav reviews shared .github/ changes, Pages configuration and note ownership. Component owners review their own content. The user authorised preparing this follow-up; no independent team approval is claimed.

This documentation feature must not delay the match demo. If time is short, keep current notes/manual graph and defer hosted publication; mark incomplete rather than calling a ZIP a live site.

## References checked 19 October 2026

- [Pages custom workflows and required permissions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Pages visibility and publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Artifact download access and retention](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).
