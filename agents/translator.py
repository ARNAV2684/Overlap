# translator.py — Translator
#
# Purpose: turn the checked English lines into es, hi and fr — words only — and re-check every translated line
# Inputs:  the fact-checker's English lines and their status; names to keep untranslated
# Outputs: {lines: [...en and translated lines], status: {"<id>|<lang>": {verified, fallback}}, dropped: [...]}
# Spec:    agents/specs/agents.md §5; agents/specs/fact-checking.md §4; agents/specs/prompts.md (translator.md)
#
# The translation itself is Azure AI Translator (a local fake offline). Each translated line keeps the English claims
# unchanged and passes the code check after locale normalisation; a verified English line also needs the model's
# post-translation check for its language to stay verified. A failed line gets its translated template (also
# checked) or is dropped for that language; English is never dropped because another language failed.

from __future__ import annotations

import asyncio

from pydantic import BaseModel, Field

from fact_checker import LineVerdict, core, evidence_view, names_of, numeric_check
from models import ModelFailed
from runtime import RunState
from translation import TranslationError


class LanguageVerdict(BaseModel):
    passed: bool = Field(alias="pass")
    lines: list[LineVerdict]


async def _translate(run: RunState, lines: list[dict], lang: str) -> list[dict] | None:
    if not lines:
        return []
    try:
        texts = await run.deps.translator.translate([ln["text"] for ln in lines], lang, keep=names_of(run.moment))
    except TranslationError:
        return None
    return [{**ln, "lang": lang, "text": t} for ln, t in zip(lines, texts, strict=True)]


async def _check_language(run: RunState, lang: str, pairs: list[tuple[dict, dict]]) -> dict | None:
    """The model's post-translation verdict per line id for one language, or None (then nothing stays verified)."""
    if not pairs:
        return {}
    payload = {"moment": evidence_view(run.moment), "lang": lang,
               "lines": [{"id": en["id"], "english": en["text"], "translation": tr["text"], "claims": en["claims"]}
                         for en, tr in pairs]}
    try:
        verdict = await run.ask("translator", payload, LanguageVerdict)
    except ModelFailed:
        return None
    got = {v.id: v for v in verdict.lines}
    return got if set(got) == {en["id"] for en, _ in pairs} else None


async def run(run: RunState) -> dict:
    m, s = run.moment, run.deps.settings
    checked = run.output("fact_checker")
    english = [core(ln) for ln in checked["lines"]]
    status = {f"{i}|en": st for i, st in checked["status"].items() if "dropped" not in st}
    lines, dropped = list(english), []
    names = names_of(m)

    async def one_language(lang: str) -> tuple[dict[str, tuple[dict, dict]], list[dict]]:
        """The final (line, status) per line id for one language, and the line ids dropped for it."""
        lost: list[dict] = []
        translated = await _translate(run, english, lang)
        good: dict[str, dict] = {}
        if translated is not None:
            for en, tr in zip(english, translated, strict=True):
                if not numeric_check(tr, m, english=en, names=names):
                    good[en["id"]] = tr
        model_pairs = [(en, good[en["id"]]) for en in english
                       if en["id"] in good and checked["status"][en["id"]]["verified"]]
        verdicts = await _check_language(run, lang, model_pairs)
        final: dict[str, tuple[dict, dict]] = {}
        for en in english:
            i, tr = en["id"], good.get(en["id"])
            if tr is None:
                continue
            if checked["status"][i]["verified"]:
                if verdicts is not None and verdicts[i].passed:
                    final[i] = (tr, {"verified": True, "fallback": False})
            else:
                final[i] = (tr, {"verified": False, "fallback": True})   # a template translated and re-checked
        missing = [en for en in english if en["id"] not in final]
        if missing:
            from fact_checker import _template
            from fallbacks import template_line
            templates = [core(_template(m, en["id"], template_line)) for en in missing]
            for tmpl, tr in zip(templates, await _translate(run, templates, lang) or [None] * len(templates),
                                strict=True):
                if tr is not None and not numeric_check(tmpl, m) and not numeric_check(tr, m, english=tmpl,
                                                                                      names=names):
                    final[tmpl["id"]] = (tr, {"verified": False, "fallback": True})
                else:
                    lost.append({"id": tmpl["id"], "lang": lang})
        return final, lost

    # The languages are independent, so they run side by side (one after another cost a second or two per job at
    # 20x, where a card's whole live window is 15 s); the lines are put back in the configured language order
    others = [lang for lang in s.languages if lang != "en"]
    for lang, (final, lost) in zip(others, await asyncio.gather(*(one_language(lang) for lang in others)), strict=True):
        dropped.extend(lost)
        for en in english:
            if en["id"] in final:
                tr, st = final[en["id"]]
                lines.append(tr)
                status[f"{en['id']}|{lang}"] = st
    return {"lines": lines, "status": status, "dropped": dropped}
