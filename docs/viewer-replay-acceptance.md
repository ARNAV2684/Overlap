# Local viewer and replay acceptance — 24 October 2026

## Scope and source

Working branch: `web/viewer-replay-acceptance`, based on `074440c` (PR #97).
Results cover that commit plus the viewer/replay changes on this branch. They do not prove Azure deployment,
Foundry generation, production latency or every browser/device. No cloud service was activated.

This milestone uses Azeem's current generator, Event Hubs, screen relay, stats engine, Cosmos, archiver,
Blob storage and Web PubSub stand-in. It does not use the old mock simulator. Invented CAL/DTN clubs are
used instead of the reference-club fixtures. Generated recordings and service logs remain local.

## What changed

- A socket that never completes its connected handshake times out after 10 seconds and retries.
- Refused or unanswered group joins retry instead of reporting a successful connection.
- Failed snapshot catch-up reconnects with backoff, so the viewer can recover setup and history.
- Connection cleanup cancels pending join/handshake timers and invalidates obsolete callbacks.
- Replay HTTP responses use `no-store`: a completed events stream can coexist with tracking/stats
  still being archived. Reloading must not reuse an hour-old incomplete chunk.
- An opt-in acceptance check exercises two independent real socket/store clients, a forced disconnect,
  late joining, full time, a fresh snapshot and every replay chunk against an independent recording.

No generator, relay, archiver or shared message shape changed.

## Reproduce

Follow [local development](../infra/specs/local-development.md) and [web setup](../web/README.md).
Start Event Hubs, Cosmos and Blob emulators, the relay, archiver, stats engine, PubSub stand-in and web app.
Use isolated test storage/database and a fresh match ID; do not stop or reset another teammate's services.
The local stack configuration and permissions must be working before starting this check.

From `web`, with its documented environment loaded:

```sh
QA_VIEWER=1 QA_APP_URL=http://127.0.0.1:3000 QA_MATCH=SYN-8425 QA_RECORDING=/absolute/path/to/Overlap/data/generated/matches/SYN-8425 npm test -- viewer-acceptance.qa
```

Then immediately, from `generator` in its environment:

```sh
python cli.py live --home CAL --away DTN --seed 8425 --first-match 8425 --hubs emulator --speed 20 --record
```

The test waits up to two minutes for initial events, ten minutes for full time, and four minutes for
archive readback to reach the recording's counts. Counts alone are not a pass: content and ordering are
compared afterwards, and unexpected/rejected records fail. Sender exit status must also be checked.
The archive wait measures eventual local convergence, **not immediate replay readiness**.

For independent archive verification, from `archiver` in its environment:

```sh
python tests/check_archive.py SYN-8425 --timeout 120
```

For web regression, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack`.
The API tests require permission to bind localhost sockets. The opt-in integration files are skipped
by default; a green unit suite alone does not establish real transport success.

## Observed evidence

- First match `SYN-8424`, seed 8424, 20x: CAL 4–1 DTN. The independent archive checker passed
  **2,360 events and 30,902 tracking frames**, exact content equality and final score.
- The first combined acceptance run reached both clients' full time and passed event equality, but
  failed tracking equality while the archive was still receiving data. This failure is retained as a finding.
- During Chrome late joining, a snapshot timeout left team setup absent while tracking advanced.
  The catch-up retry fix addresses that reproduced failure; its regression test verifies recovery.
- Second match `SYN-8425`, seed 8425, 20x: CAL 1–0 DTN. **The combined acceptance test passed**
  in 261.99 seconds, including both clients, one forced disconnect, late joining, final snapshot/stats
  convergence, and all **99 replay chunks** with **2,473 events and 29,172 frames** matching the recording.
  The successful client test joined this run in progress after an initial test-harness failure: it had
  tried to close an obsolete socket from a pre-setup retry. The harness now targets the first client's
  current open socket. This is not presented as a successful initial kick-off test.
- The second independent archive checker also passed exact event/frame equality and the 1–0 result.
  Both generator logs reached `finished`; the second reported 31,646 published messages.
  The QA duration includes live waiting and archive reads; it is not a measured production latency.
- Regression: **557 passed, 4 intentionally skipped**. Typecheck, lint and the webpack production build passed.
  One initial sandboxed regression attempt could not bind localhost (`EPERM`); rerunning with local
  socket permission passed. A sandboxed integration attempt similarly could not receive events and
  was restarted with local endpoint access; it is not counted as successful evidence.
- Chrome replay rendered the generated clubs, players, pitch, score and stat panels. Keyboard-operated
  pause, resume, 20x speed selection and restart to a 0–0 first-half replay were observed. Two real clients were tested headlessly;
  this is not evidence of two rendered browser windows or mobile coverage.

## Remaining boundaries

1. **Archive completion is not signalled.** Full time is an event-stream state, not proof that tracking
   and stats are fully stored. `no-store` permits a fresh request to see new records; it does not make
   the player automatically revisit already-loaded chunks. A durable completion/watermark contract
   between archiver and replay is a separate cross-component follow-up, owned/reviewed through the registry.
2. Arbitrary timeline seeking is not exposed by the current player; it was not tested or added here.
3. No Foundry/AI agents ran in this milestone, so insight-card generation is not covered.
4. Cloud Web PubSub, Azure identities, deployment and cloud load remain unverified by this local run.
5. This branch builds on PR #97. Any later PR must make that dependency explicit and avoid duplicating
   its changes; nothing in this milestone was pushed or merged.

## Machine-only run details

This laptop used web port 3018, PubSub 8791, existing Event Hubs 5673 and Cosmos 8081, and a disposable
Azurite instance on loopback 10041. The database was `viewer_acceptance_8424`. The helper changed only
local transport endpoints and used the repository's public emulator settings. No credentials belong here.
Logs and launch metadata: `/tmp/overlap-viewer-acceptance/`; recordings: ignored `data/generated/matches/`.
Temporary services must be stopped by their recorded process IDs/container name only. Existing services
and other databases are outside cleanup scope.

## Handover status

Local implementation and the bounded viewer/replay acceptance are complete. Archive readiness at the instant
of full time remains explicitly unresolved above. Review these changes independently of PR #97's runtime fixes.
Publication authorized after local validation. The PR is stacked on `fix/local-release-readiness` (#97), which remains open. No merge or cloud deployment is included.

After validation the test relay, archiver, stats and PubSub processes were stopped. The test web server on
3018 and loopback-only Azurite container `overlap-viewer-acceptance-storage` remain running for replay review;
they use the existing Cosmos emulator. Stop those two after review; do not stop the pre-existing emulators.
Pre-existing developer services and the original checkout were not changed.
