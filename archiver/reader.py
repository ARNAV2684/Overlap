"""Rebuilds a stored match in contract shapes (storage spec §3). Used by the read-back check and, later, by the web
app's replay route (which turns it into §7 envelopes).

    uv run python reader.py SYN-0505          # prints a summary of the stored match
"""

from __future__ import annotations

import json
import sys

from event_store import CosmosArchive
from tracking_chunks import BlobTracking


def read_match(cosmos: CosmosArchive, tracking: BlobTracking, match_id: str) -> dict | None:
    doc = cosmos.match(match_id)
    if doc is None:
        return None
    return {
        "match_id": match_id,
        "status": doc.get("status"),
        "setup": doc.get("setup"),
        "result": doc.get("result"),
        "events": cosmos.events(match_id),
        "frames": tracking.frames(match_id),
        "stats": cosmos.stats(match_id),
    }


def main(argv=None) -> int:
    match_id = (argv or sys.argv[1:])[0]
    m = read_match(CosmosArchive.from_env(), BlobTracking.from_env(), match_id)
    if m is None:
        print(f"{match_id}: not archived")
        return 1
    print(json.dumps({"match_id": match_id, "status": m["status"], "setup": bool(m["setup"]),
                      "result": m["result"], "events": len(m["events"]), "frames": len(m["frames"]),
                      "stats": len(m["stats"])}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
