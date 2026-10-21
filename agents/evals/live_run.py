# live_run.py — Report on one live match
#
# Purpose: after a local live run, what happened to every moment: jobs by final state, deliveries sent and expired,
#          model calls and their outcomes, recap and player tags, and latency from the moment being written to its
#          card being sent — model-backed and template moments apart
# Inputs:  the local Cosmos (moments, jobs and outboxes in `moments`; deliveries in `overlays`)
# Outputs: report.md and summary.json
# Spec:    agents/specs/evaluation.md §4; plans/active/PLAN_agents_insights-build_S7.md AC-07
#
#   uv run python -m evals.live_run --match SYN-0701 --out evals/results/live-SYN-0701
#
# Cosmos `_ts` is whole seconds; a send is service acceptance, not display.

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

from evals.latency import stats


async def collect(match_id: str) -> dict:
    from state import CosmosStore
    moments, overlays = CosmosStore.from_env(), CosmosStore.from_env(container="overlays")
    try:
        ms = {m["moment_id"]: m for m in await moments.moments(match_id)}
        jobs = {j["moment_id"]: j for j in await moments.of_kind(match_id, "insight_job")}
        deliveries = await overlays.of_kind(match_id, "audience_delivery")
        tags = await overlays.of_kind(match_id, "player_tag")
        state = await moments.match_state(match_id)
    finally:
        await moments.close()
        await overlays.close()
    first_sent: dict[str, int] = {}
    for d in deliveries:
        if d.get("state") == "sent" and d.get("envelope_kind") == "overlay":
            mid = "MO-" + d["overlay_id"][3:]
            first_sent[mid] = min(first_sent.get(mid, d["_ts"]), d["_ts"])
    calls = Counter()
    model_gaps, template_gaps = [], []
    for mid, job in jobs.items():
        outputs = job.get("stage_outputs") or {}
        for out in outputs.values():
            if isinstance(out, dict):
                for c in out.get("calls", []):
                    calls[f"{c['agent']}:{'ok' if c['ok'] else c.get('reason')}"] += 1
        if mid in first_sent and mid in ms:
            gap = first_sent[mid] - ms[mid]["_ts"]
            (model_gaps if (outputs.get("spotter") or {}).get("model") else template_gaps).append(gap)
    lines = Counter()
    for d in deliveries:
        lines[f"{d.get('envelope_kind') or 'overlay'}:{d['state']}"] += 1
    verified = Counter()
    for d in deliveries:
        if d.get("state") == "sent" and d.get("envelope_kind") == "overlay":
            verified["verified" if d["envelope"]["data"]["verified"] else "template"] += 1
    return {"match_id": match_id, "final_phase": (state or {}).get("phase"),
            "final_score": (state or {}).get("score"), "moments": len(ms),
            "moments_by_trigger": dict(Counter(m["evidence"]["trigger"] for m in ms.values())),
            "jobs_by_state": dict(Counter(j["state"] for j in jobs.values())),
            "terminal_reasons": dict(Counter((j.get("terminal_reason") or "").split(":")[0]
                                             for j in jobs.values() if j.get("terminal_reason"))),
            "model_jobs": sum(1 for j in jobs.values() if ((j.get("stage_outputs") or {}).get("spotter") or {})
                              .get("model")),
            "deliveries": dict(lines), "sent_cards": dict(verified), "player_tags": len(tags),
            "model_calls": dict(sorted(calls.items())),
            "latency_moment_to_send_s": {"all": stats(model_gaps + template_gaps), "model": stats(model_gaps),
                                         "template": stats(template_gaps)}}


def markdown(s: dict, settings_note: str) -> str:
    lat = s["latency_moment_to_send_s"]
    out = [f"# Live run — {s['match_id']}", "", settings_note, "",
           (f"Final: {s['final_phase']}, {s['final_score']}. Moments: {s['moments']} "
           f"({', '.join(f'{k} {v}' for k, v in sorted(s['moments_by_trigger'].items()))})."), "",
           "## Jobs", "", "| Final state | Count |", "|---|---|"]
    out += [f"| {k} | {v} |" for k, v in sorted(s["jobs_by_state"].items())]
    out += ["", f"Model-backed jobs: {s['model_jobs']}. Terminal reasons: {s['terminal_reasons'] or 'none'}.", "",
            "## Deliveries", "", "| Kind:state | Count |", "|---|---|"]
    out += [f"| {k} | {v} |" for k, v in sorted(s["deliveries"].items())]
    out += ["", f"Sent cards: {s['sent_cards']}. Player tags: {s['player_tags']}.", "",
            "## Model calls", "", "| Agent:outcome | Count |", "|---|---|"]
    out += [f"| {k} | {v} |" for k, v in s["model_calls"].items()] or ["| none | 0 |"]
    out += ["", "## Latency: moment written → card sent (wall seconds, Cosmos `_ts`)", "",
            "| Moments | n | p50 | p95 | max |", "|---|---|---|---|---|"]
    out += [f"| {k} | {v['n']} | {v['p50']} | {v['p95']} | {v['max']} |" for k, v in lat.items()]
    out += ["", "A send is the service accepting the envelope, not a browser displaying it.", ""]
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="live_run")
    ap.add_argument("--match", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--note", default="", help="how the run was set up (one line)")
    args = ap.parse_args(argv)
    summary = asyncio.run(collect(args.match))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    (args.out / "report.md").write_text(markdown(summary, args.note), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("jobs_by_state", "deliveries", "model_calls",
                                              "latency_moment_to_send_s")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
