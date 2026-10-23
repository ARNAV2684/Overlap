# main.py — Service entry point
#
# Purpose: route setups, events and frames to each match's ordering buffer and state; replay recorded matches
# Inputs:  hub messages (live) or recorded match folders (replay)
# Outputs: stat panels to match-events and match_state to Cosmos (live); numbers or panels as JSON (replay)
# Spec:    stats/specs/publishing.md
#
# Run from stats/:
#   uv run python main.py live                       # beside the local stack (infra/specs/local-development.md §5)
#   uv run python main.py replay <match folder | run folder> [--panels | --moments] [--out file.json]
#   uv run python main.py season <run folder> [--world world.json] [--hide CAL,DTN] --out season.json
# A match folder holds setup.json and events.ndjson (or .gz), and optionally tracking.ndjson.gz. A run folder from the
# generator's batch mode holds them under matches/<match_id>/.

from __future__ import annotations

import argparse
import gzip
import json
import logging
import sys
import threading
from collections.abc import Iterator
from pathlib import Path

import publish
import whole_match
from dedupe import ConflictError, Orderer
from state import MatchState

log = logging.getLogger("stats")


class Pipeline:
    """Every match's ordering buffer and state. Messages from both hubs come in through handle()."""

    def __init__(self, publisher: publish.Publisher | None = None, moments: publish.Moments | None = None):
        self.publisher = publisher
        self.moments = moments
        self.orderers: dict[str, Orderer] = {}
        self.states: dict[str, MatchState] = {}
        self.stopped: dict[str, str] = {}          # match_id -> reason processing stopped
        self.early: dict[str, list[dict]] = {}     # events that arrived before their match's setup

    def handle(self, kind: str, body: dict, received_at: float | None = None) -> None:
        if kind == "stats":
            return                                 # our own panels, read back from match-events
        match_id = body.get("match_id")
        if match_id in self.stopped:
            return
        if kind == "setup":
            if match_id not in self.states:
                self.states[match_id] = MatchState(body)
                self.orderers[match_id] = Orderer(match_id)
                for event in self.early.pop(match_id, []):
                    self._event(match_id, event, received_at)
        elif kind == "event":
            if match_id not in self.states:
                self.early.setdefault(match_id, []).append(body)   # CONTRACTS.md §1.4: setup comes first
            else:
                self._event(match_id, body, received_at)
        elif kind == "tracking":
            state = self.states.get(match_id)
            if state is not None:
                state.apply_frame(body)

    def _event(self, match_id: str, event: dict, received_at: float | None = None) -> None:
        try:
            ready = self.orderers[match_id].push(event)
        except ConflictError as err:
            self.stopped[match_id] = str(err)
            log.error("%s", err)
            return
        state = self.states[match_id]
        for e in ready:
            if self.publisher is not None:
                self.publisher.before(state, e, received_at)
            numbers = state.apply(e)
            if self.publisher is not None:
                self.publisher.after(state, e, received_at)
            if self.moments is not None:
                try:
                    self.moments.after(state, e, numbers)
                except publish.MomentConflict as err:
                    self.stopped[match_id] = str(err)
                    log.error("%s", err)
                    return
            if e["type"] == "PeriodEnd" and state.phase == "full_time":
                log.info("%s full time %s-%s", match_id, state.score["home"], state.score["away"])
                sender = self.publisher.sender if self.publisher else None
                if sender is not None and hasattr(sender, "latency_s"):
                    threading.Timer(5.0, log_latency, (sender, match_id)).start()   # once the queue has drained

    def finished(self, match_id: str) -> bool:
        """True once the match's full-time event has been applied (or the match was stopped)."""
        state = self.states.get(match_id)
        return match_id in self.stopped or (state is not None and state.phase == "full_time")

    def summary(self, match_id: str) -> dict:
        out = whole_match.summary(self.states[match_id])
        orderer = self.orderers[match_id]
        out["input"] = {"duplicates": orderer.duplicates, "waiting_after_gap": orderer.waiting,
                        "gap_at_seq": orderer.gap, "stopped": self.stopped.get(match_id)}
        return out


def log_latency(sender, match_id: str) -> None:
    lat = sorted(sender.latency_s.get(match_id, ()))
    if lat:
        log.info("%s: %d panels, event-to-panel median %.3f s, 95th %.3f s", match_id, len(lat), lat[len(lat) // 2],
                 lat[int(len(lat) * 0.95)])


# --- replay ------------------------------------------------------------------------------------------------------


def _lines(path: Path) -> Iterator[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def match_folders(folder: Path) -> list[Path]:
    """One match folder, or every match in a run folder."""
    if (folder / "setup.json").exists():
        return [folder]
    base = folder / "matches" if (folder / "matches").is_dir() else folder
    return sorted(p for p in base.iterdir() if (p / "setup.json").exists())


def event_lines(folder: Path) -> Iterator[dict]:
    events = folder / "events.ndjson"
    return _lines(events if events.exists() else folder / "events.ndjson.gz")


def play(folder: Path, publisher: publish.Publisher | None = None,
         moments: publish.Moments | None = None) -> tuple[Pipeline, str]:
    """Feeds a recorded match through the pipeline, events then frames; returns the pipeline and the match id."""
    pipeline = Pipeline(publisher, moments)
    setup = json.loads((folder / "setup.json").read_text(encoding="utf-8"))
    pipeline.handle("setup", setup)
    for event in event_lines(folder):
        pipeline.handle("event", event)
    tracking = folder / "tracking.ndjson.gz"
    if tracking.exists():
        for frame in _lines(tracking):
            pipeline.handle("tracking", frame)
    return pipeline, setup["match_id"]


def replay_match(folder: Path, publisher: publish.Publisher | None = None,
                 moments: publish.Moments | None = None) -> dict:
    """Feeds a recorded match through the pipeline and returns its numbers."""
    pipeline, match_id = play(folder, publisher, moments)
    return pipeline.summary(match_id)


def replay(folder: Path) -> dict[str, dict]:
    return {f.name: replay_match(f) for f in match_folders(folder)}


def replay_panels(folder: Path) -> dict[str, list[dict]]:
    """Every stat panel each recorded match produces, as the live engine would send them."""
    sender = publish.ListSender()
    for f in match_folders(folder):
        replay_match(f, publish.Publisher(sender))
    return sender.panels


def replay_moments(folder: Path) -> dict[str, list[dict]]:
    """Every moment document each recorded match produces, in ordinal order."""
    store = publish.DictMomentStore()
    for f in match_folders(folder):
        replay_match(f, moments=publish.Moments(store))
    out: dict[str, list[dict]] = {}
    for (match_id, _), doc in sorted(store.docs.items()):
        out.setdefault(match_id, []).append(doc)
    return out


def live() -> int:
    """Reads both hubs, sends panels and keeps match_state until Ctrl+C. Settings as in infra/local/env.example."""
    import time

    import consumer
    background = publish.Background(publish.HubSender.from_env(), publish.CosmosStateStore.from_env(), time.time)
    publisher = publish.Publisher(background, background)
    moments = publish.Moments(publish.CosmosMomentStore.from_env(), background,
                              lambda match_id: publisher.last_panel.get(match_id))
    pipeline = Pipeline(publisher, moments)
    runner = consumer.Runner(pipeline.handle, pipeline.finished)

    def progress() -> None:                                  # one line every 10 s, as the archiver does
        while True:
            time.sleep(10)
            with runner.lock:
                rows = [f"{m} seq {s.source_seq} {s.phase}" for m, s in sorted(pipeline.states.items())
                        if not pipeline.finished(m) or s.source_seq]
            log.info("progress: %s | panels queued %d, sent %s", "; ".join(rows[-4:]) or "no matches",
                     background.queued(), dict(sorted(background.sent.items())[-4:]))

    threading.Thread(target=progress, daemon=True, name="stats-progress").start()
    try:
        runner.run()
    except KeyboardInterrupt:
        pass
    finally:
        runner.stop()
        background.close()
    return 0


def numbers_json(numbers: dict) -> str:
    """The exact text written: the same matches always give the same bytes."""
    return json.dumps(numbers, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="stats", description="Overlap stats engine")
    sub = parser.add_subparsers(dest="command", required=True)
    rp = sub.add_parser("replay", help="compute the numbers of recorded matches")
    rp.add_argument("folder", type=Path, help="a match folder, or a run folder with matches/")
    rp.add_argument("--out", type=Path, help="write the JSON here instead of printing it")
    rp.add_argument("--panels", action="store_true", help="write the stat panels instead of the match totals")
    rp.add_argument("--moments", action="store_true", help="write the moment documents instead of the match totals")
    sub.add_parser("live", help="read both hubs, send stat panels and keep match_state")
    se = sub.add_parser("season", help="build the season document of a finished season run")
    se.add_argument("folder", type=Path, help="a season run folder (data/seasons/<run>)")
    se.add_argument("--world", type=Path, help="the saved world, for attributes, roles and style dials")
    se.add_argument("--hide", default="", help="team ids whose players get no season pages, comma separated")
    se.add_argument("--out", type=Path, required=True, help="where to write the season document")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)       # the SDKs log every HTTP call at INFO
    if args.command == "live":
        return live()
    if not args.folder.exists():
        print(f"error: no such folder {args.folder}", file=sys.stderr)
        return 1
    if args.command == "season":
        import season
        doc = season.build(args.folder, args.world, {t for t in args.hide.split(",") if t})
        season.write(doc, args.out)
        print(f"wrote {args.out}: {doc['built_from']['matches']} matches, {len(doc['players'])} players; "
              f"designed against measured: {doc['dna_correlations']}")
        return 0
    if args.moments:
        text = numbers_json(replay_moments(args.folder))
    else:
        text = numbers_json(replay_panels(args.folder) if args.panels else replay(args.folder))
    if args.out:
        args.out.write_bytes(text.encode("utf-8"))
        print(f"wrote {args.out}")
    else:
        sys.stdout.buffer.write(text.encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
