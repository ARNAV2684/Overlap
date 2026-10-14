# Overlap — Team Technical Proposal Template

**A shared format for submitting component plans to Arnav before implementation**  
Template version: 1.1 · 14 October 2026 · Original template by Pranav; adapted for the `overlap-plan` skill (status header, conflict scan, project calendar)

## How to use this template

Each contributor should use this format to explain a coherent piece of work: its purpose, boundaries, approach, dependencies, and evidence of completion. Arnav can then compare proposals, coordinate changes across components, and use the same written context in an AI-assisted review session.

This is a proposed team template, not an approved technical design or an assignment of work.

- Copy this file and name it `PLAN_<area>_<short-description>.md`.
- Replace bracketed placeholders. Use short, specific answers; a small task does not need a long proposal.
- Keep every numbered section, but write **“Not applicable — [reason]”** when appropriate. Complete only the relevant prompts in Section 10.
- Use **Proposed**, **Agreed**, **Assumption**, and **Unresolved** deliberately. A suggestion or unanswered question is not an agreement.
- Link to the existing component specifications rather than repeating their detailed answers. One specification may govern several files; a separate plan for every file is unnecessary.
- Use small delivery milestones. Call them sprints if useful, but each must end in a demonstrable result with clear completion criteria.
- Mark blockers explicitly. A draft can be sent for discussion while questions remain; implementation readiness depends on resolving the questions that affect that work.

The repository requires the relevant specification to be agreed in a PR before its code is written. Changes to shared message formats also require agreement from both sides of the handoff. This proposal and any AI-assisted review support that process; they do not replace it. Nothing in this proposal authorises implementation: implementation starts only when the author says **go**, inside the file map in §8.

---

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | [Area and intended outcome] |
| Author / primary owner | [Name] |
| Collaborators and responsibilities | [Names and specific responsibilities] |
| Review coordinator | Arnav |
| Affected component owners | [People who produce or consume the affected data] |
| Proposal version and date | [Version · date] |
| Status | [Draft / Ready for review / Changes requested / Agreed for stated scope / In progress / Done] |
| Plan tier and file | Full · `plans/active/PLAN_<area>_<short-description>.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | [Branch · commit SHA] |
| Architecture box / work area | [Relevant component(s)] |
| Relevant issue, spec PR, or discussion | [Links, or not created yet] |

## 1. Purpose and intended outcome

Explain the work in plain language before describing its implementation.

- **Problem or need:** [What does the project need from this component?]
- **Proposed outcome:** [What observable behavior will exist when this work is complete?]
- **Benefit to viewers or teammates:** [What becomes possible, faster, clearer, or more reliable?]
- **Success statement:** [One sentence that can later be checked against evidence.]

Avoid vague outcomes such as “complete the backend” or “make it robust.” Describe what someone can observe or verify.

## 2. Current state and reference material

Separate what exists today from what the team intends to build.

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code or placeholder files | [Commit and paths] | [Implemented behavior or missing work] |
| Governing component specifications | [Links and status] | [Decisions already agreed or still unanswered] |
| Shared contracts | [CONTRACTS.md revision / sections] | [Interfaces this work relies on] |
| Architecture diagram or meeting decision | [Link / date] | [Relevant decision and who confirmed it] |

**Differences between references:** [Identify any disagreement between the diagram, specifications, and current code. State what needs clarification rather than choosing silently.]

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| [Specific behavior or deliverable] | [Adjacent work owned elsewhere or intentionally postponed] |

- **Minimum complete result:** [The smallest useful result that satisfies this proposal.]
- **Optional extension:** [Extra work only if the minimum result is complete. “None” is valid.]
- **Boundary with neighboring components:** [Where this component’s responsibility begins and ends.]

## 4. Ownership and dependencies

Name the people responsible for both sides of each connection. List shared-file ownership as well as service ownership.

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| [Component, resource, or shared file] | [Name] | [Contract, sample, endpoint, decision, or change] | [Confirmed / pending / blocking · milestone] | [Agreed fixture or mock, with its limitations; or blocked] |

**My owned deliverables:** [List.]  
**Shared deliverables:** [List and identify the coordinating owner.]

A mock enables parallel development; it does not prove that the real integration works.

## 5. Proposed flow

Explain one typical input from arrival to final output. Include a small diagram only if it improves understanding.

```text
[Producer or user action] -> [This component] -> [Consumer or visible result]
                                  |
                                  +-> [Storage or another path, if applicable]
```

- **Input arrives through:** [Source and mechanism.]
- **Processing performed here:** [What this component actually does.]
- **Output goes to:** [Consumer, storage, or UI.]
- **Execution relationship:** [What runs independently, what waits, and what runs on a schedule or trigger.]
- **State retained:** [What must survive between calls or restarts, and what is temporary.]

## 6. Technical approach and decision rationale

Explain the major choices without writing the implementation in advance.

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| [Choice affecting behavior, dependencies, reliability, or cost] | [Choice] | [Why it fits this scope] | [Alternative and why it is less suitable here] | [Proposed / agreed / unresolved · name] |

**Assumptions:** [List assumptions that could change the approach, with how they will be checked.]

Limit this section to meaningful decisions. Routine coding details belong in the component specification or code review.

## 7. Data contracts and compatibility

Explain how this proposal remains compatible with its producers and consumers.

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| [Message, API, document, function, or component props] | [Components] | [Shared schema/spec and sample] | [No / exact change] | [Names · pending or agreed with reference] |

For each applicable interface, clarify:

- Required fields, identifiers, types, units, and coordinate conventions.
- Time meaning, sequence scope, ordering, and duplicate handling.
- Validation and behavior for missing, invalid, unknown, or unsupported data.
- Compatibility with the existing format and behavior during a format change.
- A representative input and expected output, preferably in shared fixtures.

**Shared contract edits required:** [Exact sections, or “None.”]  
**Source of truth:** [Canonical schema/spec location.]

Avoid creating a private, incompatible version of a shared message just to unblock one component. Proposed changes should be visible to the affected owners.

## 8. File and specification map

Map the proposal to the repository’s existing questions and files. Include anticipated additions explicitly.

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| [Repository-relative path] | [Action] | [One sentence] | [Spec link, sections, and status] | [Names] |

This table defines the expected change area. Detailed answers belong in the linked specification. Update this map if the scope changes during implementation.

## 9. Failure handling and recovery

Describe relevant failures in terms of their effect and recovery. Avoid unsupported claims such as “no data loss” or “exactly once.”

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| [Relevant scenario] | [Explicit behavior] | [Retry, resume, rejection, fallback, or operator action] | [Visible impact] | [Test or demonstration] |

Consider only applicable cases: invalid input, duplicate or late data, disconnected services, timeouts, restarts, partial writes, missing configuration, or unavailable dependencies. Where retries apply, state their limit and what happens after exhaustion. Where state is saved, distinguish a saved reading position from saved business state.

## 10. Requirements specific to this work

Complete the applicable items; mark others not applicable with a reason. These prompts do not introduce new architectural requirements.

- **Performance and load:** [Expected workload; latency or throughput target; measurement start/end points; test conditions. Label targets as unmeasured until tested.]
- **Observability:** [What logs, identifiers, or measurements reveal success, failure, delay, and recovery?]
- **Azure resources and access:** [Resources used or changed, configuration owner, identities, minimum permissions, and environment differences.]
- **Cost:** [Usage assumptions, estimate source/date, cost driver, and control or shutdown responsibility. Do not assume credits are available.]
- **Security and data:** [Input validation, access boundaries, sensitive fields, retention where relevant, and secret handling. Never include credentials in the proposal.]
- **AI behavior:** [Evidence supplied, allowed claims, output validation, time/call limits, and behavior when a model fails or produces unsupported content.]
- **Frontend experience:** [Loading, empty, stale, and error states; reconnect behavior; accessibility; supported screen sizes where relevant.]
- **Synthetic data or calculations:** [Reproducibility, domain invariants, formulas, and permitted calibration sources.]

Follow the project’s existing rules for synthetic data, football IP, secrets, and evidence-grounded numerical claims.

## 11. Acceptance criteria and validation

Write acceptance criteria before implementation. Each criterion should state an observable result and how it will be demonstrated.

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given [input/condition], when [action], then [observable result] | [Focused test or reproducible check] | [Reference] | [Result, log, screenshot, or demo link] |

Cover the normal path, the most important relevant failures, and the real connection to a neighboring component. Use checks proportionate to the change; do not add tests merely to mirror implementation details.

**Validation limits:** [What will remain unverified, such as production scale or a dependency available only as a mock?]

## 12. Delivery milestones or short sprints

Choose a small number of milestones based on working outcomes. Dates and durations are estimates until agreed with the team.

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — [Outcome] | [What a reviewer can see working] | [Name] | [Dependency or none] | [Evidence needed] | [Estimate] |
| M2 — [Outcome] | [What a reviewer can see working] | [Name] | [Dependency or none] | [Evidence needed] | [Estimate] |

- **Project calendar check:** [Confirm the milestones fit the team calendar: one full match end to end in English by 20 Oct, every required feature by 24 Oct, feature freeze 25–26 Oct, submission 27 Oct (IST). Flag anything that does not fit.]
- **First integration checkpoint:** [Where this work first connects to another component; identify whether the connection is real or mocked.]
- **Parallel work:** [What can proceed independently using agreed contracts and fixtures.]
- **Dependency-bound work:** [What genuinely waits for another decision or implementation.]
- **Scope reduction if time runs short:** [Optional features that can be removed while preserving correctness and the minimum complete result.]

“Files written” alone is not a completion criterion. Include integration and repair time within the estimates.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** [Small, focused changes following the repository’s conventions.]
- **Shared-file coordination:** [Overlapping files, owners to notify, and intended order of changes.]
- **Conflict scan result:** [Paste the table from `checklists/conflict-scan.md`: every overlap with another active plan, open PR, remote branch or hot shared file, and how it is resolved. “No overlaps found on <date> at <commit>” is a valid result.]

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| [Path or CONTRACTS.md section] | [Link] | [Name] | [Action] | [Agreed / pending] |
- **Integration procedure:** [How someone else will connect and exercise the result.]
- **Configuration or setup changes:** [What teammates must know; use variable names, never secret values.]
- **Deployment or data changes, if applicable:** [Affected environment, sequencing, and how to reverse the change safely. Otherwise mark not applicable.]
- **Documentation updates:** [Specifications, contracts, setup instructions, or examples affected.]

If implementation requires changing an agreed interface or scope, update the proposal/specification and coordinate with affected owners. Resolving a textual merge conflict does not establish that the combined behavior is correct.

## 14. Risks and decisions needed from the team

Keep this focused on issues that could change scope, compatibility, effort, or demo reliability.

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | [Specific issue] | [Concrete consequence] | [Name] | [Action or decision needed] | [Milestone, interface, or none] |

**Decisions requested from Arnav or affected owners:**

1. [Decision, available options, author’s recommendation, and why it matters.]
2. [Delete if unnecessary.]

## 15. Review, agreement, and handover

### Author’s submission checklist

- [ ] The intended outcome and scope are clear.
- [ ] Current repository/spec references are identified.
- [ ] Ownership, dependencies, and shared files are named.
- [ ] Interface changes and representative examples are linked.
- [ ] Assumptions and unresolved decisions are visible.
- [ ] Applicable failure, access, cost, and operational concerns are addressed.
- [ ] Acceptance criteria and an early integration checkpoint are defined.
- [ ] Milestones describe working outcomes and realistic dependencies.
- [ ] No secret values or private credentials are included.

### Questions for Arnav’s coordinated review

Use these questions to compare this proposal against the other contributors’ plans:

1. Does this work support the agreed product flow and stay within its stated scope?
2. Do both sides of every handoff agree on data shape, meaning, timing, and failure behavior?
3. Are multiple contributors changing the same files or creating competing implementations?
4. Are there hidden blockers, circular dependencies, or decisions incorrectly presented as settled?
5. Can the approach be simplified while preserving the required behavior?
6. Do the acceptance checks demonstrate interoperability as well as isolated component behavior?

For an AI-assisted review (`overlap-plan review`), provide this proposal, the linked specifications/contracts, and the affected teammates’ current proposals. Ask it to distinguish **blocking incompatibilities**, **questions**, and **optional improvements**, with the affected sections or files. Keep final agreements visible in the team’s PRs or written decisions rather than only in a private session.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| [Arnav / affected owner] | [Version] | [Specific finding] | [Changes requested / agreed for stated scope / unresolved] | [Date · link] |

**Implementation readiness:** [Ready for the stated scope / blocked by specific decisions.]  
**Relevant specification agreement:** [PR/reference, or pending.]  
**Next action and owner:** [Specific action · name.]

### Handover after implementation

Leave this subsection marked **Pending implementation** during proposal review. Complete it when sharing the implemented result:

- Implementation PR and commit: [Links.]
- Acceptance results: [AC IDs, evidence, and failed or deferred checks.]
- Setup and integration instructions: [Link.]
- Differences from the agreed proposal: [Changes and agreement references.]
- Known limitations and follow-up owner: [Details.]

---

## Repository references

This template follows the repository’s documented specification-first workflow. Check the latest versions when preparing a proposal.

- [Contributing and review workflow](https://github.com/ARNAV2684/Overlap/blob/main/CONTRIBUTING.md)
- [Shared data contracts](https://github.com/ARNAV2684/Overlap/blob/main/CONTRACTS.md)
- [Pull request template](https://github.com/ARNAV2684/Overlap/blob/main/.github/pull_request_template.md)

The proposal explains the approach. Component specifications define detailed behavior. Milestones organize delivery. Validation provides evidence that the implementation works with the rest of Overlap.
