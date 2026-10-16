# recording.py — Recorded matches
#
# Purpose: write a played match to disk in the recorded-match layout, and read it back
# Inputs:  a MatchResult and the world version it was played with
# Outputs: <out>/<match_id>/setup.json, events.ndjson, tracking.ndjson.gz, summary.json
# Spec:    generator/specs/live-and-batch.md §2
#
# The layout is the mock's (minus the screen relay's envelopes), so replay readers built on it keep working.

from __future__ import annotations

import gzip
import json
from pathlib import Path

from state import MatchResult

MATCHES_DIR = Path(__file__).resolve().parents[1] / "data" / "generated" / "matches"


def _line(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


def save(result: MatchResult, out_dir: Path = MATCHES_DIR, world_version: int | None = None) -> Path:
    d = out_dir / result.setup["match_id"]
    d.mkdir(parents=True, exist_ok=True)
    (d / "setup.json").write_text(json.dumps(result.setup, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (d / "events.ndjson").open("w", encoding="utf-8", newline="\n") as fh:
        fh.writelines(_line(e) for e in result.events)
    with gzip.open(d / "tracking.ndjson.gz", "wt", encoding="utf-8", newline="\n") as fh:
        fh.writelines(_line(f) for f in result.frames)
    summary = dict(result.summary, world_version=world_version)
    (d / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return d


def load(d: Path) -> MatchResult:
    setup = json.loads((d / "setup.json").read_text(encoding="utf-8"))
    events = [json.loads(line) for line in (d / "events.ndjson").read_text(encoding="utf-8").splitlines() if line]
    with gzip.open(d / "tracking.ndjson.gz", "rt", encoding="utf-8") as fh:
        frames = [json.loads(line) for line in fh if line.strip()]
    summary = json.loads((d / "summary.json").read_text(encoding="utf-8"))
    return MatchResult(setup, events, frames, summary["score"], setup.get("conditions", {}), summary)
