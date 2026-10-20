# state.py — Shared job state
#
# Purpose: the durable records every agent shares for one moment: the job (claim, lease, stage outputs, outcome),
#          the per-match model budget, and the outbox
# Inputs:  moment documents; stage outputs
# Outputs: job, budget and outbox documents in Cosmos `live/moments`, beside the stats engine's moments
# Spec:    agents/specs/workflow.md §2–§4
#
# The stats engine writes only `kind = "moment"` and never edits it. Ours are `insight_job`, `insight_budget` and
# `insight_outbox`, in the same match partition, so a job, its budget and its outbox share the partition key. Every
# update is an ETag-conditional replace: a worker that lost its lease can't overwrite the new holder's work.

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

JOB, BUDGET, OUTBOX = "insight_job", "insight_budget", "insight_outbox"
STATES = ("pending", "running", "delivery_pending", "published", "partially_expired", "expired", "rejected",
          "suppressed", "failed")
TERMINAL = frozenset({"published", "partially_expired", "expired", "rejected", "suppressed", "failed"})
SYSTEM_FIELDS = ("_rid", "_self", "_etag", "_attachments", "_ts")


class PreconditionFailed(Exception):
    """The document changed since it was read (ETag mismatch)."""


class SourceConflict(Exception):
    """A moment id was seen before with different content: terminal, never overwritten."""


class LeaseLost(Exception):
    """Another worker holds this job now; stop without committing."""


def clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in SYSTEM_FIELDS}


def source_hash(moment: dict) -> str:
    """UTF-8 JSON, sorted keys, compact separators, no NaN, Cosmos fields excluded (workflow.md §2)."""
    body = json.dumps(clean(moment), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


# --- stores -------------------------------------------------------------------------------------------------------

class Store(Protocol):
    async def create(self, doc: dict) -> bool: ...                              # False when the id exists
    async def read(self, match_id: str, doc_id: str) -> tuple[dict, str] | None: ...
    async def replace(self, doc: dict, etag: str) -> str: ...                  # raises PreconditionFailed
    async def moments(self, match_id: str | None = None, since_ts: int = 0) -> list[dict]: ...
    async def of_kind(self, match_id: str, kind: str) -> list[dict]: ...      # one partition, one document kind
    async def match_state(self, match_id: str) -> dict | None: ...           # live/match_state `state` (§4.2)
    async def batch(self, match_id: str, ops: list[tuple]) -> None: ...      # all or nothing; PreconditionFailed


class MemoryStore:
    """In-memory store with the same create-once and ETag rules (tests, offline runs)."""

    def __init__(self):
        self.docs: dict[tuple[str, str], tuple[dict, str]] = {}
        self.states: dict[str, dict] = {}                      # match_id -> match_state document
        self.version = 0

    def _etag(self) -> str:
        self.version += 1
        return f'"{self.version}"'

    async def close(self) -> None:
        pass

    async def create(self, doc: dict) -> bool:
        key = (doc["match_id"], doc["id"])
        if key in self.docs:
            return False
        etag = self._etag()
        self.docs[key] = (json.loads(json.dumps({**doc, "_ts": self.version})), etag)
        return True

    async def read(self, match_id: str, doc_id: str) -> tuple[dict, str] | None:
        found = self.docs.get((match_id, doc_id))
        return (json.loads(json.dumps(found[0])), found[1]) if found else None

    async def replace(self, doc: dict, etag: str) -> str:
        key = (doc["match_id"], doc["id"])
        if key not in self.docs or self.docs[key][1] != etag:
            raise PreconditionFailed(doc["id"])
        new = self._etag()
        self.docs[key] = (json.loads(json.dumps({**doc, "_ts": self.version})), new)
        return new

    async def batch(self, match_id: str, ops: list[tuple]) -> None:
        """One partition, all or nothing: ("create", doc) fails if the id exists, ("replace", doc, etag) if the
        ETag moved (Cosmos transactional batch)."""
        for op in ops:
            key = (match_id, op[1]["id"])
            if (op[0] == "create" and key in self.docs) or (op[0] == "replace" and (
                    key not in self.docs or self.docs[key][1] != op[2])):
                raise PreconditionFailed(op[1]["id"])
        for op in ops:
            self.docs[(match_id, op[1]["id"])] = (json.loads(json.dumps({**op[1], "_ts": self.version})),
                                                  self._etag())

    async def moments(self, match_id: str | None = None, since_ts: int = 0) -> list[dict]:
        return [json.loads(json.dumps(d)) for (m, _), (d, _) in sorted(self.docs.items())
                if d.get("kind") == "moment" and (match_id is None or m == match_id) and d.get("_ts", 0) >= since_ts]

    async def of_kind(self, match_id: str, kind: str) -> list[dict]:
        return [json.loads(json.dumps(d)) for (m, _), (d, _) in sorted(self.docs.items())
                if m == match_id and d.get("kind") == kind]

    async def match_state(self, match_id: str) -> dict | None:
        doc = self.states.get(match_id)
        return json.loads(json.dumps(doc)) if doc is not None else None


class CosmosStore:
    """Cosmos `live/moments` (partition `/match_id`). Key only for the local emulator; managed identity on Azure."""

    def __init__(self, container: Any, closers: tuple = (), states: Any = None):
        self.container = container
        self.states = states                                   # live/match_state, read only
        self._closers = closers

    @classmethod
    def from_env(cls, env: dict | None = None, container: str = "moments") -> CosmosStore:
        import os

        from azure.cosmos.aio import CosmosClient
        env = os.environ if env is None else env
        endpoint, key = env["OVERLAP_COSMOS_ENDPOINT"], env.get("OVERLAP_COSMOS_KEY")
        if key:
            client, closers = CosmosClient(endpoint, credential=key), ()
        else:
            from azure.identity.aio import DefaultAzureCredential
            credential = DefaultAzureCredential()
            client, closers = CosmosClient(endpoint, credential=credential), (credential,)
        db = client.get_database_client(env.get("OVERLAP_COSMOS_DATABASE", "live"))
        store = cls(db.get_container_client(container), (client, *closers), db.get_container_client("match_state"))
        store.database, store.local = db, bool(key)
        return store

    async def create_if_local(self) -> None:
        """Local emulator only (key auth): create this container as Bicep does on Azure (partition /match_id)."""
        if getattr(self, "local", False):
            from azure.cosmos import PartitionKey
            await self.database.create_container_if_not_exists(self.container.id,
                                                               partition_key=PartitionKey("/match_id"))

    async def close(self) -> None:
        """Close the client (and credential) this store opened."""
        for closer in self._closers:
            await closer.close()

    async def create(self, doc: dict) -> bool:
        from azure.cosmos.exceptions import CosmosResourceExistsError
        try:
            await self.container.create_item(doc)
            return True
        except CosmosResourceExistsError:
            return False

    async def read(self, match_id: str, doc_id: str) -> tuple[dict, str] | None:
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        try:
            doc = await self.container.read_item(doc_id, partition_key=match_id)
        except CosmosResourceNotFoundError:
            return None
        return doc, doc["_etag"]

    async def replace(self, doc: dict, etag: str) -> str:
        from azure.core import MatchConditions
        from azure.cosmos.exceptions import CosmosAccessConditionFailedError
        try:
            new = await self.container.replace_item(doc["id"], clean(doc), etag=etag,
                                                    match_condition=MatchConditions.IfNotModified)
        except CosmosAccessConditionFailedError as e:
            raise PreconditionFailed(doc["id"]) from e
        return new["_etag"]

    async def moments(self, match_id: str | None = None, since_ts: int = 0) -> list[dict]:
        query = "SELECT * FROM c WHERE c.kind = 'moment' AND c._ts >= @ts"
        params = [{"name": "@ts", "value": since_ts}]
        items = self.container.query_items(query, parameters=params, partition_key=match_id) if match_id \
            else self.container.query_items(query, parameters=params)
        return [d async for d in items]

    async def batch(self, match_id: str, ops: list[tuple]) -> None:
        from azure.cosmos.exceptions import CosmosBatchOperationError
        cosmos_ops = [("create", (op[1],)) if op[0] == "create" else
                      ("replace", (op[1]["id"], clean(op[1])), {"if_match_etag": op[2]}) for op in ops]
        try:
            await self.container.execute_item_batch(cosmos_ops, partition_key=match_id)
        except CosmosBatchOperationError as e:
            raise PreconditionFailed(ops[0][1]["id"]) from e

    async def of_kind(self, match_id: str, kind: str) -> list[dict]:
        items = self.container.query_items("SELECT * FROM c WHERE c.kind = @kind",
                                           parameters=[{"name": "@kind", "value": kind}], partition_key=match_id)
        return [d async for d in items]

    async def match_state(self, match_id: str) -> dict | None:
        from azure.cosmos.exceptions import CosmosResourceNotFoundError
        if self.states is None:
            return None
        try:
            return await self.states.read_item("state", partition_key=match_id)
        except CosmosResourceNotFoundError:
            return None


# --- jobs ---------------------------------------------------------------------------------------------------------

@dataclass
class Job:
    doc: dict
    etag: str

    @property
    def moment_id(self) -> str:
        return self.doc["moment_id"]

    @property
    def match_id(self) -> str:
        return self.doc["match_id"]

    @property
    def stage_outputs(self) -> dict:
        return self.doc["stage_outputs"]


class JobStore:
    """Claim once, lease, save stage outputs, finish. Times are wall-clock seconds (never mixed with match_ms)."""

    def __init__(self, store: Store, *, lease_s: float = 6.0, deadline_s: float = 15.0,
                 clock: Callable[[], float] = time.time):
        self.store, self.lease_s, self.deadline_s, self.clock = store, lease_s, deadline_s, clock

    async def claim(self, moment: dict, worker: str) -> Job | None:
        """The job for this moment with this worker's lease, or None when it's finished or leased elsewhere.
        Raises SourceConflict when the same moment id arrives with different content."""
        now = self.clock()
        h = source_hash(moment)
        doc = {"id": f"job:{moment['moment_id']}", "match_id": moment["match_id"], "kind": JOB,
               "moment_id": moment["moment_id"], "schema_version": moment["schema_version"],
               "evidence_version": moment["evidence_version"], "source_hash": h, "state": "pending",
               "first_seen_utc": now, "deadline_utc": now + self.deadline_s, "lease_owner": None,
               "lease_until": 0.0, "lease_generation": 0, "stage": None, "stage_outputs": {},
               "attempts": 0, "terminal_reason": None, "publication_id": None}
        await self.store.create(doc)
        found = await self.store.read(moment["match_id"], doc["id"])
        if found is None:
            return None
        current, etag = found
        if current["source_hash"] != h:
            raise SourceConflict(moment["moment_id"])
        if current["state"] in TERMINAL:
            return None
        if current["lease_owner"] not in (None, worker) and current["lease_until"] > now:
            return None
        current.update(lease_owner=worker, lease_until=now + self.lease_s,
                       lease_generation=current["lease_generation"] + 1, attempts=current["attempts"] + 1,
                       state="running" if current["state"] == "pending" else current["state"])
        try:
            etag = await self.store.replace(current, etag)
        except PreconditionFailed:
            return None                                       # another worker won the race
        return Job(current, etag)

    async def save(self, job: Job, **changes: Any) -> Job:
        """Commit changes under this worker's lease (renewing it); LeaseLost if another worker took over."""
        doc = {**job.doc, **changes, "lease_until": self.clock() + self.lease_s}
        try:
            job.etag = await self.store.replace(doc, job.etag)
        except PreconditionFailed as e:
            raise LeaseLost(job.moment_id) from e
        job.doc = doc
        return job

    async def save_stage(self, job: Job, stage: str, output: Any) -> Job:
        return await self.save(job, stage=stage, stage_outputs={**job.stage_outputs, stage: output})

    async def finish(self, job: Job, state: str, reason: str | None = None, **extra: Any) -> Job:
        if state not in STATES:
            raise ValueError(state)
        return await self.save(job, state=state, terminal_reason=reason, lease_owner=None, lease_until=0.0, **extra)

    def past_deadline(self, job: Job) -> bool:
        return self.clock() > job.doc["deadline_utc"]


# --- outbox -------------------------------------------------------------------------------------------------------

async def write_outbox(store: Store, job: Job, intent: dict) -> bool:
    """Create the publication intent once. An identical repeat is fine; different content is a conflict."""
    doc = {"id": f"outbox:{job.moment_id}", "match_id": job.match_id, "kind": OUTBOX, "moment_id": job.moment_id,
           "source_hash": job.doc["source_hash"], "state": "pending", "intent": intent}
    if await store.create(doc):
        return True
    found = await store.read(job.match_id, doc["id"])
    if found is None or {k: v for k, v in clean(found[0]).items()} != doc:
        raise SourceConflict(f"outbox:{job.moment_id}")
    return False


# --- durable per-match budget -------------------------------------------------------------------------------------

@dataclass
class DurableReservation:
    match_id: str
    moment_id: str
    tokens: int
    settled: bool = False


class DurableBudget:
    """The per-match model budget in Cosmos (`budget:<match_id>`), reserved before each call with ETag retries.
    Same rules as models.Budget: unknown usage keeps the reservation."""

    def __init__(self, store: Store, *, max_calls_per_moment: int, max_calls_per_match: int,
                 max_tokens_per_match: int, reserve_tokens: int, retries: int = 5):
        self.store = store
        self.limits = (max_calls_per_moment, max_calls_per_match, max_tokens_per_match)
        self.reserve_tokens, self.retries = reserve_tokens, retries

    @classmethod
    def from_settings(cls, store: Store, s: Any) -> DurableBudget:
        return cls(store, max_calls_per_moment=s.max_calls_per_moment, max_calls_per_match=s.max_calls_per_match,
                   max_tokens_per_match=s.max_tokens_per_match,
                   reserve_tokens=s.max_input_tokens + s.max_output_tokens)

    async def _update(self, match_id: str, change: Callable[[dict], None]) -> None:
        doc_id = f"budget:{match_id}"
        for _ in range(self.retries):
            found = await self.store.read(match_id, doc_id)
            if found is None:
                await self.store.create({"id": doc_id, "match_id": match_id, "kind": BUDGET, "calls": 0,
                                         "tokens": 0, "calls_by_moment": {}})
                continue
            doc, etag = found
            change(doc)
            try:
                await self.store.replace(doc, etag)
                return
            except PreconditionFailed:
                continue
        raise PreconditionFailed(doc_id)

    async def reserve(self, match_id: str, moment_id: str) -> DurableReservation:
        from models import BudgetExceeded
        per_moment, per_match, max_tokens = self.limits

        def change(doc: dict) -> None:
            if doc["calls_by_moment"].get(moment_id, 0) >= per_moment:
                raise BudgetExceeded(f"{moment_id}: {per_moment} model calls already used")
            if doc["calls"] >= per_match:
                raise BudgetExceeded(f"{match_id}: {per_match} model calls already used")
            if doc["tokens"] + self.reserve_tokens > max_tokens:
                raise BudgetExceeded(f"{match_id}: token budget of {max_tokens} reached")
            doc["calls_by_moment"][moment_id] = doc["calls_by_moment"].get(moment_id, 0) + 1
            doc["calls"] += 1
            doc["tokens"] += self.reserve_tokens

        await self._update(match_id, change)
        return DurableReservation(match_id, moment_id, self.reserve_tokens)

    async def claim_model_job(self, match_id: str, moment_id: str, *, high: bool, max_jobs: int,
                              reserve: int) -> bool:
        """A model-job slot for this moment (idempotent). Normal moments leave `reserve` slots for high ones."""
        got: dict[str, bool] = {}

        def change(doc: dict) -> None:
            jobs = doc.setdefault("model_jobs", [])
            if moment_id in jobs:
                got["ok"] = True
                return
            got["ok"] = len(jobs) < (max_jobs if high else max_jobs - reserve)
            if got["ok"]:
                jobs.append(moment_id)

        await self._update(match_id, change)
        return got["ok"]

    async def model_jobs_used(self, match_id: str) -> int:
        found = await self.store.read(match_id, f"budget:{match_id}")
        return len(found[0].get("model_jobs", [])) if found else 0

    async def settle(self, r: DurableReservation, used_tokens: int | None) -> None:
        if r.settled:
            return
        r.settled = True
        if used_tokens is None or used_tokens < 0:
            return

        def change(doc: dict) -> None:
            doc["tokens"] += used_tokens - r.tokens

        await self._update(r.match_id, change)
