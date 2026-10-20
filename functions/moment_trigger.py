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


def make_deps(store=None, settings=None):
    """Settings from the environment; the Cosmos store unless one is given; the model, budget and MCP context the
    settings ask for (provider `off`: templates only, no MCP)."""
    from config import Settings
    from runtime import agent_deps
    from state import CosmosStore
    settings = settings or Settings.from_env()
    return agent_deps(store or CosmosStore.from_env(), settings)


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
    """Local stand-in for the change feeds: read new moments every `interval_s` and process each once; when a
    match's final state says full time, run its recap once (agents.md §7)."""
    from workflow import process_recap
    seen: set[str] = set()
    matches: set[str] = {match_id} if match_id else set()
    recapped: set[str] = set()
    since_ts = 0
    totals: dict[str, int] = {}
    while True:
        docs = [d for d in await deps.store.moments(match_id, since_ts) if d["id"] not in seen]
        docs.sort(key=lambda d: (d["match_id"], d["id"]))
        for result in await handle_batch(docs, deps):
            totals[result["status"]] = totals.get(result["status"], 0) + 1
        for d in docs:
            seen.add(d["id"])
            matches.add(d["match_id"])
            since_ts = max(since_ts, d.get("_ts", 0))
        for m in sorted(matches - recapped):
            result = await process_recap(m, deps)
            if result["status"] != "not_full_time":
                recapped.add(m)
                log.info("recap %s: %s", m, result["status"])
                totals[f"recap_{result['status']}"] = totals.get(f"recap_{result['status']}", 0) + 1
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
