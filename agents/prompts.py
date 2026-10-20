# prompts.py — Prompt files
#
# Purpose: load each agent's prompt (agents/prompts/<agent>.md) as its instructions, and give its version
# Inputs:  the prompt files
# Outputs: instruction text; a short content hash recorded on every job with the model used
# Spec:    agents/specs/prompts.md §1, §3

from __future__ import annotations

import hashlib
from functools import cache
from pathlib import Path

PROMPTS = Path(__file__).resolve().parent / "prompts"
AGENTS = ("spotter", "analyst", "narrator", "fact_checker", "translator", "director", "recap_writer")


@cache
def instructions(agent: str) -> str:
    """The prompt without its status note (the `>` lines at the top are for readers, not the model)."""
    if agent not in AGENTS:
        raise KeyError(agent)
    lines = (PROMPTS / f"{agent}.md").read_text(encoding="utf-8").splitlines()
    return "\n".join(ln for ln in lines if not ln.startswith(">")).strip()


@cache
def version(agent: str) -> str:
    return hashlib.sha256(instructions(agent).encode("utf-8")).hexdigest()[:12]
