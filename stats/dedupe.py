# dedupe.py — Dedupe and order
#
# Purpose: hand a match's events on in seq order, each exactly once; never guess past a gap
# Inputs:  events as they arrive (at least once, possibly out of order across redeliveries)
# Outputs: unique, contiguous events in seq order
# Spec:    stats/specs/publishing.md (input); CONTRACTS.md §1.3

from __future__ import annotations

import hashlib
import json


class ConflictError(ValueError):
    """Two different bodies arrived for the same seq of one match. Processing that match must stop."""


def body_hash(event: dict) -> str:
    return hashlib.sha256(json.dumps(event, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class Orderer:
    """One match's events in, the contiguous prefix out. seq starts at 1 (CONTRACTS.md §1.3)."""

    def __init__(self, match_id: str):
        self.match_id = match_id
        self.next_seq = 1
        self.applied: dict[int, str] = {}      # seq -> body hash, to tell a duplicate from a conflict
        self.pending: dict[int, dict] = {}     # events after a gap, waiting for it to fill
        self.duplicates = 0

    def push(self, event: dict) -> list[dict]:
        """Returns the events that are now ready, in order (possibly none)."""
        seq = event["seq"]
        digest = body_hash(event)
        known = self.applied.get(seq) or (body_hash(self.pending[seq]) if seq in self.pending else None)
        if known is not None:
            if known != digest:
                raise ConflictError(f"{self.match_id}: seq {seq} arrived with a different body")
            self.duplicates += 1
            return []
        self.pending[seq] = event
        ready = []
        while self.next_seq in self.pending:
            e = self.pending.pop(self.next_seq)
            self.applied[self.next_seq] = body_hash(e)
            ready.append(e)
            self.next_seq += 1
        return ready

    @property
    def waiting(self) -> int:
        """Events held back behind a gap."""
        return len(self.pending)

    @property
    def gap(self) -> int | None:
        """The missing seq that holds everything back, or None."""
        return self.next_seq if self.pending else None
