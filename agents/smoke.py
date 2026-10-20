# smoke.py — One model call through the configured provider
#
# Purpose: prove the model switch works (local Foundry Local now, Azure later) with a single short call
# Inputs:  settings from the environment (config.py)
# Outputs: the reply and timing on stdout; exit code 0 on success, 1 on any failure (with a clear reason)
# Spec:    agents/specs/agents.md §8
#
#   uv run python smoke.py
# Uses no match data and cites nothing; it only checks that the provider answers.

from __future__ import annotations

import asyncio
import sys
import time

from config import Settings, SettingsError
from models import BudgetExceeded, ModelDisabled, ModelGate, ModelTimeout, chat_client


async def main() -> int:
    try:
        settings = Settings.from_env()
        client = chat_client(settings)
    except (SettingsError, ModelDisabled) as e:
        print(f"FAIL: {e}")
        return 1
    from agent_framework import Agent
    agent = Agent(client, "Reply with exactly the word: ready", name="smoke")
    gate = ModelGate(settings)
    start = time.perf_counter()
    try:
        response = await gate.run(agent, "Are you ready?", match_id="SMOKE", moment_id="SMOKE",
                                  timeout_s=max(settings.request_timeout_s, 60.0))
    except (ModelTimeout, BudgetExceeded) as e:
        print(f"FAIL: {e}")
        return 1
    except Exception as e:  # noqa: BLE001 — any provider failure (network, auth, model) is a smoke FAIL
        print(f"FAIL: {settings.provider} provider call failed: {type(e).__name__}")
        return 1
    text = (response.text or "").strip()
    print(f"provider={settings.provider} model={settings.model_name} seconds={time.perf_counter() - start:.1f}")
    print(f"reply: {text[:200]!r}")
    if not text:
        print("FAIL: empty reply")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
