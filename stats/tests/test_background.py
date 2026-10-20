# test_background.py — Background publishing tests
#
# Purpose: check that the background worker sends panels in order, packs them into few batches, and writes only the
#          latest match_state per match
# Inputs:  fake hub sender and store
# Outputs: pass / fail
# Spec:    stats/specs/publishing.md §1–§2

from __future__ import annotations

import publish


class FakeHub:
    def __init__(self):
        self.batches: list[tuple[str, list[int]]] = []

    def send_many(self, match_id, panels):
        self.batches.append((match_id, [p["match_ms"] for p in panels]))
        return len(panels)

    def close(self):
        pass


def test_panels_go_out_in_order_and_state_is_coalesced():
    hub, store = FakeHub(), publish.DictStore()
    bg = publish.Background(hub, store, clock=lambda: 100.0)
    for ms in range(0, 50_000, 1000):
        bg.send("SYN-0001", {"match_ms": ms}, received_at=99.5)
        bg.upsert({"match_id": "SYN-0001", "id": "state", "match_ms": ms})
    bg.close()
    sent = [ms for match_id, batch in hub.batches for ms in batch if match_id == "SYN-0001"]
    assert sent == list(range(0, 50_000, 1000))
    assert len(hub.batches) < 50                                # packed, not one call per panel
    assert store.docs[("SYN-0001", "state")]["match_ms"] == 49_000
    assert store.writes < 50                                    # coalesced to the latest
    assert bg.latency_s["SYN-0001"] == [0.5] * 50
