# translation.py — Translator adapter
#
# Purpose: translate checked English lines into es, hi and fr — words only
# Inputs:  English texts and a target language
# Outputs: translated texts, in the same order
# Spec:    agents/specs/agents.md §5; agents/specs/fact-checking.md §4
#
# Azure AI Translator in production (managed identity on Azure); a local fake for offline runs and tests. The
# translator agent (M4) re-checks every translated line against the English claims; this adapter only translates.
#
# Numbers never reach the translator: each number (a score like 1–0, a decimal, a percentage, an ordinal, an xG
# figure) is swapped for an opaque placeholder with no digits, pinned by the dynamic dictionary like a name, and put
# back afterwards. On Azure, Hindi moved numbers between slots ("1–0 after 3 minutes" came back as "0–3 after 1
# minute"); a placeholder carries its own value wherever the sentence puts it. A line whose placeholders don't all
# come back exactly once is unusable for that language (None), never guessed.

from __future__ import annotations

import re
from typing import Any, Protocol

from config import LANGUAGES, Settings

TARGETS = tuple(lang for lang in LANGUAGES if lang != "en")
NUMBER = re.compile(r"(?<![\w.])\d+(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?(?:(?:st|nd|rd|th)\b|\s?%|\s?xG\b)?")
PLACEHOLDER = re.compile(r"QZX[A-Z]{2}")
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


class TranslationError(RuntimeError):
    """The translator failed or returned something unusable; the caller uses the template or suppresses."""


class Translator(Protocol):
    async def translate(self, texts: list[str], to: str, keep: list[str] | None = None) -> list[str | None]: ...


def mask(text: str) -> tuple[str, dict[str, str] | None]:
    """The text with every number replaced by its own placeholder (QZXAA, QZXAB, ...), and placeholder -> number.
    A text that already contains the placeholder pattern (masked once already), or has more numbers than
    placeholders, is left as is (None)."""
    found = list(NUMBER.finditer(text))
    if PLACEHOLDER.search(text) or len(found) > len(LETTERS) ** 2:
        return text, None
    values: dict[str, str] = {}
    out, last = [], 0
    for i, m in enumerate(found):
        token = f"QZX{LETTERS[i // len(LETTERS)]}{LETTERS[i % len(LETTERS)]}"
        values[token] = m.group()
        out += [text[last:m.start()], token]
        last = m.end()
    return "".join(out) + text[last:], values


def unmask(text: str, values: dict[str, str] | None) -> str | None:
    """The translated text with its numbers back, or None unless every placeholder came back exactly once and no
    other appeared. A text that was left as is comes back as it is."""
    if values is None:
        return text
    got = PLACEHOLDER.findall(text)
    if sorted(got) != sorted(values):
        return None
    return PLACEHOLDER.sub(lambda m: values[m.group()], text)


def protect(text: str, keep: list[str]) -> str:
    """Mark names so Azure AI Translator leaves them as written (dynamic dictionary, longest name first)."""
    for name in sorted({k for k in keep if k}, key=len, reverse=True):
        if name in text:
            safe = name.replace('"', "")
            text = text.replace(name, f'<mstrans:dictionary translation="{safe}">{safe}</mstrans:dictionary>')
    return text


def _check(texts: list[str], to: str) -> None:
    if to not in TARGETS:
        raise TranslationError(f"unsupported target language {to!r}")
    if not texts or any(not isinstance(t, str) or not t.strip() for t in texts):
        raise TranslationError("nothing to translate")


class FakeTranslator:
    """Offline stand-in: returns the English text marked with the language, so numbers and names are untouched.
    It proves the plumbing, never translation quality."""

    async def translate(self, texts: list[str], to: str, keep: list[str] | None = None) -> list[str]:
        _check(texts, to)
        return [f"({to}) {t}" for t in texts]


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

    async def translate(self, texts: list[str], to: str, keep: list[str] | None = None) -> list[str]:
        _check(texts, to)
        body = [protect(t, keep or []) for t in texts]
        try:
            items = await self.client.translate(body=body, to_language=[to], from_language="en")
        except Exception as e:                                # the service, network or credential failed
            raise TranslationError(f"translator failed for {to}") from e
        out = []
        for item in items or []:
            # SDK 1.0 names the target language `to`; 2.0 named it `language`
            match = [t for t in (getattr(item, "translations", None) or [])
                     if (getattr(t, "to", None) or getattr(t, "language", None)) == to]
            if len(match) != 1 or not isinstance(match[0].text, str) or not match[0].text.strip():
                raise TranslationError(f"translator returned no {to} text")
            out.append(match[0].text)
        if len(out) != len(texts):
            raise TranslationError(f"translator returned {len(out)} texts for {len(texts)}")
        return out


class ProtectedNumbers:
    """Any translator, with the numbers masked on the way in and restored on the way out. The placeholders join the
    names to keep, so Azure AI Translator pins them with the dynamic dictionary. A line that comes back without its
    placeholders exactly once is None: the caller treats it as not translated (template, or dropped)."""

    def __init__(self, inner: Translator):
        self.inner = inner

    async def translate(self, texts: list[str], to: str, keep: list[str] | None = None) -> list[str | None]:
        masked = [mask(t) for t in texts]
        tokens = sorted({tok for _, values in masked for tok in values or {}})
        out = await self.inner.translate([t for t, _ in masked], to, keep=[*(keep or []), *tokens])
        return [None if t is None else unmask(t, values) for t, (_, values) in zip(out, masked, strict=True)]


def translator(settings: Settings) -> Translator:
    if settings.translator == "azure":
        return ProtectedNumbers(AzureTranslator(settings.translator_endpoint,
                                                region=settings.translator_region or None))
    return ProtectedNumbers(FakeTranslator())
