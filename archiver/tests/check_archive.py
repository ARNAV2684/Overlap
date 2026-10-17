"""Round-trip check of the archive flow (plan AC-02): a match recorded by the generator (`cli.py live --record`) and
archived by the archiver reads back identical.

    uv run python tests/check_archive.py SYN-0505 [--timeout 300]

Waits until the archive has caught up (all recorded events and frames stored, status finished), then compares the
setup, every event, every frame and the final score with the recording.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archiver"))

from event_store import CosmosArchive
from reader import read_match
from tracking_chunks import BlobTracking


def recording(match_id: str):
    d = ROOT / "data" / "generated" / "matches" / match_id
    setup = json.loads((d / "setup.json").read_text(encoding="utf-8"))
    events = [json.loads(x) for x in (d / "events.ndjson").read_text(encoding="utf-8").splitlines() if x]
    with gzip.open(d / "tracking.ndjson.gz", "rt", encoding="utf-8") as f:
        frames = [json.loads(x) for x in f if x.strip()]
    summary = json.loads((d / "summary.json").read_text(encoding="utf-8"))
    return setup, events, frames, summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("match_id")
    ap.add_argument("--timeout", type=float, default=300)
    args = ap.parse_args()
    setup, events, frames, summary = recording(args.match_id)
    cosmos, tracking = CosmosArchive.from_env(), BlobTracking.from_env()
    deadline = time.monotonic() + args.timeout
    while True:
        stored = read_match(cosmos, tracking, args.match_id)
        done = stored and stored["status"] == "finished" and len(stored["events"]) >= len(events) \
            and len(stored["frames"]) >= len(frames)
        if done or time.monotonic() > deadline:
            break
        have = (len(stored["events"]), len(stored["frames"])) if stored else (0, 0)
        print(f"waiting: {have[0]}/{len(events)} events, {have[1]}/{len(frames)} frames stored")
        time.sleep(10)
    problems = []
    if stored is None:
        problems.append("match not archived")
    else:
        if stored["setup"] != setup:
            problems.append("setup differs")
        if stored["events"] != events:
            problems.append(f"events differ: stored {len(stored['events'])}, recorded {len(events)}")
        if stored["frames"] != frames:
            problems.append(f"frames differ: stored {len(stored['frames'])}, recorded {len(frames)}")
        if stored["status"] != "finished":
            problems.append(f"status {stored['status']}")
        elif stored["result"]["score"] != summary["score"]:
            problems.append(f"score {stored['result']['score']} != recorded {summary['score']}")
    print(json.dumps({"match_id": args.match_id, "recorded": {"events": len(events), "frames": len(frames),
                                                               "score": summary["score"]},
                      "stored": None if stored is None else {"events": len(stored["events"]),
                                                              "frames": len(stored["frames"]),
                                                              "status": stored["status"],
                                                              "result": stored["result"]},
                      "problems": problems}, indent=2))
    print("OK: the archived match reads back identical to the recording" if not problems else "FAILED")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
