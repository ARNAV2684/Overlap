"""Recorded match files (PROVISIONAL format: the recorded-match format isn't agreed yet).

recorded/<match_id>/
  setup.json         the match setup (CONTRACTS.md §2)
  events.ndjson      one event per line (§3), in seq order
  tracking.ndjson.gz    one 5 Hz tracking frame per line (§4), gzipped (~30k frames)
  envelopes.ndjson.gz   what browsers receive (§7): status, event and positions envelopes, in order, gzipped
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from ..stream import EnvelopeBuilder, timeline


def _line(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


def record(result, out_dir: Path) -> Path:
    d = out_dir / result.setup["match_id"]
    d.mkdir(parents=True, exist_ok=True)
    (d / "setup.json").write_text(json.dumps(result.setup, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(d / "events.ndjson", "w", encoding="utf-8", newline="\n") as f:
        f.writelines(_line(e) for e in result.events)
    with gzip.open(d / "tracking.ndjson.gz", "wt", encoding="utf-8", newline="\n") as f:
        f.writelines(_line(fr) for fr in result.frames)
    builder = EnvelopeBuilder(result.setup)
    with gzip.open(d / "envelopes.ndjson.gz", "wt", encoding="utf-8", newline="\n") as f:
        for item in timeline(result):
            for _, env in builder.feed(item):
                f.write(_line(env))
        for _, env in builder.flush():
            f.write(_line(env))
    return d
