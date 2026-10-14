# Plan checks

Run these on your own plan before presenting it, and on someone else's plan in `review` mode. Fix every failure (or
list it as a blocker) before asking for go.

## Consistency

- [ ] Every file in the file map appears in at least one milestone or step, and every milestone or step only touches
      files in the file map.
- [ ] Every interface in §7 (or "contract changes") names its producer **and** consumer owners and a contract section.
      Every proposed change to a shared message has a matching `CONTRACTS.md` edit in the file map.
- [ ] Every acceptance criterion belongs to a milestone, and every milestone has at least one acceptance criterion.
- [ ] At least one acceptance criterion exercises the **real** connection to a neighbouring layer (or the plan states
      clearly that only a mock is available and what that leaves unproven).
- [ ] Every dependency marked "blocking" appears in the risks or decisions table with a decision maker.
- [ ] The minimum complete result can be delivered without any "optional extension".

## Gates

- [ ] **Spec gate:** the governing spec for every code file is agreed on `main`; otherwise the plan is to write the
      spec.
- [ ] **Conflict scan:** done at the current `main` commit, with every overlap resolved or listed as a blocker.
- [ ] **Go gate:** the plan ends by asking for go and does not claim anything is implemented.

## People and status

- [ ] Every owner name comes from `plans/REGISTRY.md`, the parent plan, or the user. Unknown owners are written as
      "unassigned (Arnav decides)". No owner is invented.
- [ ] Proposed, Agreed, Assumption and Unresolved are used deliberately; nothing is marked Agreed without a visible
      record.
- [ ] No planned test is described as passed; the handover says "Pending implementation".

## Calendar

- [ ] Milestone estimates fit the team calendar (IST): one full match end to end in English by **20 Oct**; every
      required feature by **24 Oct**; feature freeze **25–26 Oct**; submission **27 Oct**.
- [ ] The plan says what to cut first if time runs short, without breaking the minimum complete result.

## Project rules

- [ ] Synthetic data only; no real clubs, players, crests or league branding anywhere in the plan or its examples.
- [ ] No mention of any earlier project; nothing imported from one.
- [ ] No secrets, keys or connection strings; configuration referred to by variable name only.
- [ ] Numbers shown to viewers come from code (the evidence pack), not from AI.
