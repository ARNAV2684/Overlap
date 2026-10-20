# main.py — Service entry point
#
# Purpose: route setups, events and frames to each match's ordering buffer and state; replay recorded matches
# Inputs:  hub messages (live, stats S2) or recorded match folders (replay)
# Outputs: each match's numbers as JSON (replay)
# Spec:    stats/specs/publishing.md
#
# Run from stats/:
#   uv run python main.py replay <match folder | run folder> [--out numbers.json]
# A match folder holds setup.json and events.ndjson (or .gz), and optionally tracking.ndjson.gz. A run folder from the
# generator's batch mode holds them under matches/<match_id>/.

from __future__ import annotations

import argparse
import gzip
import json
import logging
import sys
from collections.abc import Iterator
from pathlib import Path

import whole_match
from dedupe import ConflictError, Orderer
from state import MatchState

log = logging.getLogger("stats")


class Pipeline:
    """Every match's ordering buffer and state. Messages from both hubs come in through handle()."""

    def __init__(self):
        self.orderers: dict[str, Orderer] = {}
        self.states: dict[str, MatchState] = {}
        self.stopped: dict[str, str] = {}          # match_id -> reason processing stopped
        self.early: dict[str, list[dict]] = {}     # events that arrived before their match's setup

    def handle(self, kind: str, body: dict) -> None:
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
                    self._event(match_id, event)
        elif kind == "event":
            if match_id not in self.states:
                self.early.setdefault(match_id, []).append(body)   # CONTRACTS.md §1.4: setup comes first
            else:
                self._event(match_id, body)
        elif kind == "tracking":
            state = self.states.get(match_id)
            if state is not None:
                state.apply_frame(body)

    def _event(self, match_id: str, event: dict) -> None:
        try:
            ready = self.orderers[match_id].push(event)
        except ConflictError as err:
            self.stopped[match_id] = str(err)
            log.error("%s", err)
            return
        state = self.states[match_id]
        for e in ready:
            state.apply(e)

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


def replay_match(folder: Path) -> dict:
    """Feeds a recorded match through the pipeline, events then frames, and returns its numbers."""
    pipeline = Pipeline()
    setup = json.loads((folder / "setup.json").read_text(encoding="utf-8"))
    pipeline.handle("setup", setup)
    events = folder / "events.ndjson"
    for event in _lines(events if events.exists() else folder / "events.ndjson.gz"):
        pipeline.handle("event", event)
    tracking = folder / "tracking.ndjson.gz"
    if tracking.exists():
        for frame in _lines(tracking):
            pipeline.handle("tracking", frame)
    return pipeline.summary(setup["match_id"])


def replay(folder: Path) -> dict[str, dict]:
    return {f.name: replay_match(f) for f in match_folders(folder)}


def numbers_json(numbers: dict) -> str:
    """The exact text written: the same matches always give the same bytes."""
    return json.dumps(numbers, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="stats", description="Overlap stats engine")
    sub = parser.add_subparsers(dest="command", required=True)
    rp = sub.add_parser("replay", help="compute the numbers of recorded matches")
    rp.add_argument("folder", type=Path, help="a match folder, or a run folder with matches/")
    rp.add_argument("--out", type=Path, help="write the JSON here instead of printing it")
    sub.add_parser("live", help="read the hubs and publish (stats S2)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if args.command == "live":
        print("live mode comes in stats S2 (stat panels); use replay for now", file=sys.stderr)
        return 2
    if not args.folder.exists():
        print(f"error: no such folder {args.folder}", file=sys.stderr)
        return 1
    text = numbers_json(replay(args.folder))
    if args.out:
        args.out.write_bytes(text.encode("utf-8"))
        print(f"wrote {args.out}")
    else:
        sys.stdout.buffer.write(text.encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
