# Single-match live demo at 20×

The original single-match viewer: score, live event timeline, match elapsed time, browser receipt time, tracking frames, a pitch and a raw-message inspector. It displays `SYN-9001` (Northbridge FC vs Harbour Athletic).

```text
Existing synthetic mock at 20× → local WebSocket :8787 → browser viewer :8788
```

This is a direct preview of the temporary mock. It does not read Event Hubs or implement the screen relay. The page labels its source explicitly.

The viewer connects the way the real screen does (`CONTRACTS.md` §7): it calls `/negotiate`, opens the socket with the Web PubSub
subprotocol `json.webpubsub.azure.v1` and joins `match-SYN-9001`. So it works against the mock's `--web` stand-in today
and against `infra/local/webpubsub_standin/` fed by the screen relay later. It is retired once the web app's live screen works.

## Run locally

Prerequisites: Python 3.12+, uv and a current browser. Initial dependency installation needs internet. The basic demo needs no Docker, Azure subscription or API key.

Before the PR is merged, get its branch in a separate folder:

```bash
git clone --branch mock/single-match-demo https://github.com/ARNAV2684/Overlap.git Overlap-single-match-demo
cd Overlap-single-match-demo
```

If you already have the repository, fetch and check out `origin/mock/single-match-demo` on a local branch instead. Once merged, these files are also available on `main`.

In terminal 1, from the repository root:

```bash
cd mock
uv sync
uv run python -m overlap_mock.cli play --match SYN-9001 --speed 20 --hubs off --web --stdout events --linger-s 600
```

In terminal 2, from the repository root:

```bash
cd mock
uv run python single-match-demo/serve.py
```

Open **http://127.0.0.1:8788/**. Both terminals must remain running. Port 8787 is the data source; port 8788 is the visual page. Opening the snapshot endpoint on 8787 shows JSON, not this viewer.

Run these commands from `mock/`. The module invocation above also works when the installed `mock` command cannot find `overlap_mock` in a fresh environment. To validate the selected match, run `uv run python -m overlap_mock.cli validate --match SYN-9001` from the same folder.

Twenty match seconds pass per wall-clock second. A 90-minute match takes at least 4½ minutes; added time, mock breaks and processing make the full run roughly 5–6 minutes. After full time the source remains available for ten minutes because of `--linger-s 600`.

To also send the same data to an **already-running local Event Hubs emulator**, replace `--hubs off` with `--hubs emulator`. Use the existing [emulator instructions](../README.md#for-the-event-hubs-layer) first. The browser still reads the direct mock WebSocket, so it is not evidence of Event Hubs delivery.

## Controls and timestamps

- **Match events:** action events and match-state changes, newest received first.
- **Tracking:** individual frames from each positions bundle. Frames in the same bundle share the browser's receipt timestamp.
- **All data:** both categories in receive order.
- **Select a row:** freeze its exact payload in the inspector. **Follow latest** restores automatic inspection.
- **Pause feed:** freeze the timeline, counters and pitch. Reception and scoreboard continue. **Resume feed** catches the display up.
- **Match elapsed:** the source's `match_ms`, not a wall-clock estimate. Match and envelope sequence numbers have different meanings.
- **Received locally:** the browser's receipt time. Earlier snapshot messages say **History**, since their original arrival times are unknown.
- **Counters:** unique live messages, action events and frames since this connection; snapshot history is excluded. They reset on reconnect.
- **Pitch:** newest received tracking frame. Five frames arrive together about once per match second. The display refreshes at most four times per wall-clock second, so at 20× it intentionally skips intermediate pitch renders while retaining incoming frames in the rolling buffer.

## Stop, replay and troubleshooting

Press Ctrl+C in each terminal to stop only those two processes. To replay `SYN-9001`, run the same commands again and reload the page. Do not use `--loop` with this viewer: the mock assigns new match IDs, while this page intentionally follows only `SYN-9001`.

If the page says it cannot connect, check that terminal 1 is running with `--web` on port 8787. If a port is occupied, stop your previous demo process or use its existing page; do not kill unrelated processes. After the source has closed at full time, reload the page when starting a new run.

## Limits

All teams and players are fictional. The viewer is a rolling debug display, not an archive or reliability test. It keeps 600 event/state rows and 600 tracking frames and shows up to 120 rows for the active filter. Snapshot catch-up contains earlier event/status messages and only the latest positions bundle. Full tracking recovery, interpolation, production Web PubSub, stats, agents and overlays are outside this demo.

The static server binds only to `127.0.0.1:8788` and serves four allowlisted asset paths. The mock runs on localhost. Each teammate runs their own local processes; generated data, logs and Python environments are not shared through Git.
