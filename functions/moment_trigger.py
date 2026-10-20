# moment_trigger.py — Moment trigger
#
# Purpose: start the agent workflow for each new moment; one entry point for the local poller and the Azure
#          Cosmos change-feed Function (`moment_trigger` in function_app.py)
# Inputs:  moment documents from Cosmos `live/moments`
# Outputs: workflow runs (job and outbox documents)
# Spec:    functions/specs/moment-trigger.md; agents/specs/workflow.md
#
# Local (from agents/, which has the agents' dependencies):
#   uv run python ../functions/moment_trigger.py --match SYN-0508          # poll one match every second
#   uv run python ../functions/moment_trigger.py --once                    # one pass over every match, then stop
# Only `kind = "moment"` documents start a job; the workflow's own job, budget and outbox records never do.

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

AGENTS = Path(__file__).resolve().parents[1] / "agents"
if AGENTS.is_dir() and str(AGENTS) not in sys.path:
    sys.path.insert(0, str(AGENTS))

log = logging.getLogger("moment_trigger")


def make_deps(store=None):
    """Settings from the environment; the Cosmos store unless one is given."""
    from config import Settings
    from state import CosmosStore, JobStore
    from translation import translator
    from workflow import Deps
    settings = Settings.from_env()
    store = store or CosmosStore.from_env()
    return Deps(store=store, jobs=JobStore(store, deadline_s=settings.moment_deadline_s), settings=settings,
                translator=translator(settings))


async def handle_batch(docs: list[dict], deps=None) -> list[dict]:
    """Process a batch of documents in order (one running job at a time). Non-moments are ignored."""
    from workflow import process_moment
    own = deps is None
    deps = deps or make_deps()
    results = []
    try:
        for doc in docs:
            if not isinstance(doc, dict) or doc.get("kind") != "moment":
                continue
            result = await process_moment(doc, deps)
            log.info("%s: %s", doc.get("id"), result.get("status"))
            results.append(result)
    finally:
        if own:
            await deps.store.close()
    return results


async def poll(deps, match_id: str | None = None, interval_s: float = 1.0, once: bool = False) -> dict[str, int]:
    """Local stand-in for the change feed: read new moments every `interval_s` and process each once."""
    seen: set[str] = set()
    since_ts = 0
    totals: dict[str, int] = {}
    while True:
        docs = [d for d in await deps.store.moments(match_id, since_ts) if d["id"] not in seen]
        docs.sort(key=lambda d: (d["match_id"], d["id"]))
        for result in await handle_batch(docs, deps):
            totals[result["status"]] = totals.get(result["status"], 0) + 1
        for d in docs:
            seen.add(d["id"])
            since_ts = max(since_ts, d.get("_ts", 0))
        if once:
            return totals
        await asyncio.sleep(interval_s)


async def run(match_id: str | None, interval_s: float, once: bool) -> dict[str, int]:
    deps = make_deps()
    try:
        return await poll(deps, match_id, interval_s, once)
    finally:
        await deps.store.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="moment_trigger")
    ap.add_argument("--match", help="only this match (default: every match)")
    ap.add_argument("--once", action="store_true", help="one pass, then stop")
    ap.add_argument("--interval", type=float, default=1.0)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    for noisy in ("azure", "agent_framework"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    totals = asyncio.run(run(args.match, args.interval, args.once))
    log.info("totals %s", totals)
    return 0


if __name__ == "__main__":
    sys.exit(main())
