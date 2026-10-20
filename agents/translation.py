# translation.py — Translator adapter
#
# Purpose: translate checked English lines into es, hi and fr — words only
# Inputs:  English texts and a target language
# Outputs: translated texts, in the same order
# Spec:    agents/specs/agents.md §5; agents/specs/fact-checking.md §4
#
# Azure AI Translator in production (managed identity on Azure); a local fake for offline runs and tests. The
# translator agent (M4) re-checks every translated line against the English claims; this adapter only translates.

from __future__ import annotations

from typing import Any, Protocol

from config import LANGUAGES, Settings

TARGETS = tuple(lang for lang in LANGUAGES if lang != "en")


class TranslationError(RuntimeError):
    """The translator failed or returned something unusable; the caller uses the template or suppresses."""


class Translator(Protocol):
    async def translate(self, texts: list[str], to: str) -> list[str]: ...


def _check(texts: list[str], to: str) -> None:
    if to not in TARGETS:
        raise TranslationError(f"unsupported target language {to!r}")
    if not texts or any(not isinstance(t, str) or not t.strip() for t in texts):
        raise TranslationError("nothing to translate")


class FakeTranslator:
    """Offline stand-in: returns the English text marked with the language, so numbers and names are untouched.
    It proves the plumbing, never translation quality."""

    async def translate(self, texts: list[str], to: str) -> list[str]:
        _check(texts, to)
        return [f"[{to}] {t}" for t in texts]


class AzureTranslator:
    """Azure AI Translator (Text Translation)."""

    def __init__(self, endpoint: str, *, region: str | None = None, credential: Any = None, client: Any = None):
        if client is None:
            from azure.ai.translation.text.aio import TextTranslationClient
            if credential is None:
                from azure.identity.aio import DefaultAzureCredential
                credential = DefaultAzureCredential()
            client = TextTranslationClient(endpoint=endpoint, credential=credential, region=region or None)
        self.client = client

    async def translate(self, texts: list[str], to: str) -> list[str]:
        _check(texts, to)
        try:
            items = await self.client.translate(body=list(texts), to_language=[to], from_language="en")
        except Exception as e:                                # the service, network or credential failed
            raise TranslationError(f"translator failed for {to}") from e
        out = []
        for item in items or []:
            match = [t for t in (getattr(item, "translations", None) or []) if getattr(t, "language", None) == to]
            if len(match) != 1 or not isinstance(match[0].text, str) or not match[0].text.strip():
                raise TranslationError(f"translator returned no {to} text")
            out.append(match[0].text)
        if len(out) != len(texts):
            raise TranslationError(f"translator returned {len(out)} texts for {len(texts)}")
        return out


def translator(settings: Settings) -> Translator:
    if settings.translator == "azure":
        return AzureTranslator(settings.translator_endpoint, region=settings.translator_region or None)
    return FakeTranslator()
