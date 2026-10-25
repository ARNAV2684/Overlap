"""One-off breakdown of SYN-3013 (26 Oct, Azure): cards sent and expired by language and mode, and the recap.

    cd agents && uv run python evals/results/live-SYN-3013/breakdown.py
"""

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from state import CosmosStore  # noqa: E402


async def main() -> None:
    overlays = CosmosStore.from_env(container="overlays")
    try:
        deliveries = await overlays.of_kind("SYN-3013", "audience_delivery")
        recaps = [d for d in deliveries if d.get("envelope_kind") == "recap"]
    finally:
        await overlays.close()
    by = Counter()
    for d in deliveries:
        if d.get("envelope_kind") != "overlay":
            continue
        group = d.get("group") or d.get("audience") or ""
        lang = next((p for p in ("hi", "es", "fr", "en") if f"-{p}" in str(group) or f".{p}" in str(group)), str(group)[:24])
        data = d.get("envelope", {}).get("data", {}) if isinstance(d.get("envelope"), dict) else {}
        source = "ai" if data.get("verified") and not data.get("fallback") else "template"
        by[(lang, d.get("state"), source)] += 1
    print(json.dumps({" ".join(map(str, k)): v for k, v in sorted(by.items())}, indent=1, ensure_ascii=False))
    if recaps:
        r = recaps[0]
        data = r.get("envelope", {}).get("data", {}) if isinstance(r.get("envelope"), dict) else {}
        print("recap keys:", sorted(data)[:20])
        print("recap source:", {k: data.get(k) for k in ("verified", "fallback", "source", "writer")})


asyncio.run(main())
