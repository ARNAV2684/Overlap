# Viewer and replay acceptance

Status: Local implementation and bounded acceptance complete; cloud validation and immediate archive readiness not claimed. User authorized implementation on 24 October 2026.
Branch: web/viewer-replay-acceptance, based on 074440c (PR #97); main b18297f is an ancestor.
Registry owners: web Arnav/Azeem; relay/archiver Arnav; generator/stats Azeem. No owner approval claimed.

## Outcome
Prove a viewer can join, recover after disconnect, finish, and read the same match from the archive.
Use the repository generator and local services; no legacy mock data, Azure activation, paid calls or merges.

## Sources and boundaries
Existing CONTRACTS.md sections 4 and 7 and web/specs/realtime.md govern the messages and replay.
Existing stream.qa and replay.qa tests are the starting point. Existing implemented specifications remain
unchanged except for explicit connection failure handling, non-cacheable replay responses and acceptance instructions in realtime.md.
No shared message changes. No changes to generator, relay, stats or archive data formats.

## File map
- web/src/lib/socket.ts: bounded handshake, failed subscription recovery and catch-up lifecycle.
- web/src/lib/__tests__/socket.test.ts: reproduce and cover connection failures.
- web/src/lib/__tests__/viewer-acceptance.qa.test.ts: opt-in real socket/reconnect and replay/source check.
- web/src/app/api/replay/[id]/route.ts and replay-route.test.ts: prevent HTTP caching of still-growing archive chunks, discovered in the real run.
- web/specs/realtime.md: recovery behavior and acceptance boundary.
- web/README.md: reproducible acceptance command.
- docs/viewer-replay-acceptance.md: evidence and manual browser checklist.
- This plan: scope and handover.
Machine-specific launchers, logs and generated match data remain ignored/outside tracked source.

## Steps
1. Reproduce connection stalls and refused subscription behavior; implement bounded recovery.
2. Add a local-only opt-in check using two independent socket/store clients, a forced disconnect,
   a fresh full-time snapshot, and every archive replay chunk compared to the generator recording.
3. Run focused and regression checks; exercise the real local stack if available and record exact results.
4. Inspect the browser for live/replay behavior; explicitly distinguish browser evidence from headless store checks.

## Acceptance
- Silent handshake retries within a bounded interval; refused joins never claim successful streaming.
- Replaced connections cannot apply delayed snapshot callbacks or messages.
- Two independent clients converge to full-time score and stats after one reconnects.
- Replay events and tracking content equal the independently recorded generator output; failures/timeouts fail.
- Local tests do not use cloud credentials or call start-match. Actual Azure/browser checks are labelled separately.

## Conflict scan
Remote refresh before publication: main b18297f remains an ancestor; #95, #96 and #97 remain open.
This branch includes the `infra/azure-wave1` base and #97 local fixes; it does not claim to include all of #95 (`infra/azure-wave2`).
PR review base: `fix/local-release-readiness` at 074440c. Retarget after its parent work merges, then recheck the diff.
PR #96 changes MatchScreen, MatchExperience, ReplayBar and insight presentation; none of its changed files overlap this PR. Combined behavior still needs regression checks when integrated.
web/specs/realtime.md and web/README.md overlap #97 (already in this base); no extra changes to its implementation.
Historical web/relay/archive plans overlap responsibilities; this milestone validates their existing interfaces.

## Risks and handover
Local emulator latency is not Azure latency. No proof from fixtures is presented as real transport evidence.
Full-match results, exact commands, source revision, failures and manual checks: [acceptance evidence](../../docs/viewer-replay-acceptance.md).
557 regression tests passed (4 opt-in skips), plus a real two-client/replay acceptance pass and two independent archive checks.
Typecheck, lint and production build passed. Immediate archive completion needs a separate producer/consumer contract; no private message shape was introduced.
The user authorized committing, pushing and opening this PR after validation. No merge or deployment is authorized.
