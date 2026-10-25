# safety.py — Content Safety screen for model lines
#
# Purpose: after the fact-checker has verified a model-written line, ask Azure AI Content Safety for its harm
#          severities (hate, self-harm, sexual, violence); a line at or above the reject level uses its template
# Inputs:  Settings (OVERLAP_CONTENT_SAFETY=azure, endpoint, reject level, timeout); the verified lines
# Outputs: per line id {ok, max_severity | reason}
# Spec:    agents/specs/observability.md §4
#
# Off by default. Managed identity on Azure (no key). Templates are never screened: they are our own wording. A
# screen that fails or times out counts as not passed (the template is used), so an unscreened model line is never
# shown while the screen is on.

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import telemetry
from config import Settings

CATEGORIES = ("Hate", "SelfHarm", "Sexual", "Violence")


@dataclass
class ContentSafety:
    client: Any                                     # azure.ai.contentsafety.aio.ContentSafetyClient (or a fake)
    reject_at: int = 4
    timeout_s: float = 1.5

    @classmethod
    def from_settings(cls, settings: Settings, *, credential: Any = None) -> ContentSafety:
        from azure.ai.contentsafety.aio import ContentSafetyClient
        if credential is None:
            from azure.identity.aio import DefaultAzureCredential
            credential = DefaultAzureCredential()
        return cls(ContentSafetyClient(settings.content_safety_endpoint, credential),
                   settings.content_safety_reject_at, settings.content_safety_timeout_s)

    async def check(self, text: str) -> dict:
        from azure.ai.contentsafety.models import AnalyzeTextOptions
        try:
            result = await asyncio.wait_for(
                self.client.analyze_text(AnalyzeTextOptions(text=text, categories=list(CATEGORIES))), self.timeout_s)
        except TimeoutError:
            return {"ok": False, "reason": "timeout"}
        except Exception as e:  # noqa: BLE001 — service, network or credential failure: not screened
            return {"ok": False, "reason": f"error:{type(e).__name__}"}
        severities = {_name(getattr(c, "category", "")): int(getattr(c, "severity", 0) or 0)
                      for c in getattr(result, "categories_analysis", None) or []}
        worst = max(severities.values(), default=0)
        out: dict = {"ok": worst < self.reject_at, "max_severity": worst}
        if not out["ok"]:
            out["categories"] = sorted(k for k, v in severities.items() if v >= self.reject_at)
        return out

    async def close(self) -> None:
        if hasattr(self.client, "close"):
            await self.client.close()


def _name(category: Any) -> str:
    """The SDK gives a TextCategory (a str enum) or a plain string; its value either way ("Violence")."""
    return str(getattr(category, "value", category))


async def screen(run: Any, verified: dict[str, dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    """The verified lines that pass the screen, and the screen's result per line id. No screen: all pass."""
    safety = getattr(run.deps, "safety", None)
    if safety is None or not verified:
        return verified, {}

    async def one(line_id: str, line: dict) -> tuple[str, dict]:
        with telemetry.safety_span(run.moment, line_id) as span:
            result = await safety.check(line["text"])
            span.set_attribute("overlap.ok", result["ok"])
            if "max_severity" in result:
                span.set_attribute("overlap.max_severity", result["max_severity"])
            if "reason" in result:
                span.set_attribute("overlap.reason", result["reason"])
        return line_id, result

    results = dict(await asyncio.gather(*(one(i, ln) for i, ln in verified.items())))
    return {i: ln for i, ln in verified.items() if results[i]["ok"]}, results
