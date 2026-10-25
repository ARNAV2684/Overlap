# hindi_numbers.py — Hindi drop rate, numbers sent raw against numbers sent as placeholders (D7)
#
# Purpose: measure how many Hindi lines are dropped (and how many wrong ones slip through) when the translator moves
#          numbers between slots, before and after the numbers are masked as placeholders (translation.py)
# Inputs:  the stats engine's fixture moments (SYN-1017); a simulated Hindi translator
# Outputs: <out>/summary.json and <out>/report.md
# Spec:    agents/specs/evaluation.md §7; agents/specs/fact-checking.md §4
#
#   uv run python -m evals.hindi_numbers --out evals/results/hindi-numbers
#
# Azure is paused and this must cost nothing, so the translator is simulated. It does what Azure AI Translator did to
# Hindi in the October runs: it changes the word order (postpositions: the "in ..." / "after ..." phrases move to the
# front) and, in a share of the lines with two or more numbers, moves the numbers between their slots ("1–0 after
# 3 minutes" -> "0–3 after 1 minute"). That share is unknown for Azure, so the report gives several. Only digits are
# moved; a placeholder has none, which is exactly why masking helps, so the "after" column measures the guard and the
# re-check, not Azure's real behaviour on placeholders. Every line still goes through the translator agent's re-check.

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import zlib
from pathlib import Path

from config import Settings
from state import JobStore, MemoryStore
from translation import TARGETS, FakeTranslator, ProtectedNumbers, Translator, _check
from workflow import Deps, process_moment

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "mcp_server" / "tests" / "data" / "SYN-1017-moments.json"
POSTPOSITIONS = {"in", "after", "with", "for", "of", "from", "since", "at", "on", "inside", "within", "by"}
DIGITS = re.compile(r"\d+(?:\.\d+)?")
RATES = (0.25, 0.5, 1.0)


def reorder(text: str) -> str:
    """Postposition word order: the trailing "in ..." / "after ..." phrases go first, the head clause last. Every
    word (and every placeholder) moves with its phrase; nothing is dropped or added."""
    end = text[-1] if text and text[-1] in ".!?" else ""
    words = (text[:-1] if end else text).split()
    chunks: list[list[str]] = [[]]
    for w in words:
        if w.lower() in POSTPOSITIONS and chunks[-1]:
            chunks.append([])
        chunks[-1].append(w)
    return " ".join(" ".join(c) for c in reversed(chunks)) + end


class SlotSwapTranslator:
    """A simulated Hindi translator: reorders words; in `rate` of the lines with two or more numbers it rotates the
    numbers one slot along. Deterministic per text. Records what it saw and which outputs it scrambled."""

    def __init__(self, rate: float, seed: int = 7):
        self.rate, self.seed = rate, seed
        self.scrambled: set[str] = set()
        self.digits_seen = 0

    async def translate(self, texts: list[str], to: str, keep: list[str] | None = None) -> list[str]:
        _check(texts, to)
        return [self._one(t, to) for t in texts]

    def _one(self, text: str, to: str) -> str:
        out = reorder(text)
        found = list(DIGITS.finditer(out))
        self.digits_seen += len(found)
        draw = zlib.crc32(f"{self.seed}|{to}|{text}".encode()) % 1000 / 1000
        if to == "hi" and len(found) >= 2 and draw < self.rate:
            values = [m.group() for m in found]
            values = values[-1:] + values[:-1]
            parts, last = [], 0
            for m, v in zip(found, values, strict=True):
                parts += [out[last:m.start()], v]
                last = m.end()
            out = "".join(parts) + out[last:]
            if values != [m.group() for m in found]:
                self.scrambled.add(f"({to}) {out}")
        return f"({to}) {out}"


async def measure(moments: list[dict], inner: Translator, *, protected: bool) -> dict:
    """Every fixture moment through the agents (templates, provider off) in English and Hindi."""
    settings = Settings(languages=("en", "hi"), skip_stale=False)
    store = MemoryStore()
    for i, m in enumerate(moments):
        await store.create({**m, "_ts": i})
    deps = Deps(store=store, jobs=JobStore(store), settings=settings,
                translator=ProtectedNumbers(inner) if protected else inner)
    english = hindi = dropped = wrong = 0
    for m in moments:
        result = await process_moment(m, deps)
        if result["status"] != "delivery_pending":
            continue
        intent = (await store.read(m["match_id"], f"outbox:{m['id']}"))[0]["intent"]
        english += sum(a["lang"] == "en" for a in intent["audiences"])
        hi = [a for a in intent["audiences"] if a["lang"] == "hi"]
        hindi += len(hi)
        dropped += sum(d["lang"] == "hi" for d in intent.get("dropped", []))
        scrambled = getattr(inner, "scrambled", set())
        wrong += sum(a["line"]["text"] in scrambled for a in hi)
    return {"english_lines": english, "hindi_lines": hindi, "hindi_dropped": dropped,
            "drop_rate": round(dropped / english, 4) if english else None, "wrong_hindi_published": wrong,
            "digits_seen_by_translator": getattr(inner, "digits_seen", None)}


def run_all(moments: list[dict], rates: tuple[float, ...] = RATES) -> dict:
    rows = []
    for rate in rates:
        before_t, after_t = SlotSwapTranslator(rate), SlotSwapTranslator(rate)
        before = asyncio.run(measure(moments, before_t, protected=False))
        after = asyncio.run(measure(moments, after_t, protected=True))
        rows.append({"swap_rate": rate, "lines_scrambled_before": len(before_t.scrambled),
                     "before": before, "after": after})
    control = asyncio.run(measure(moments, FakeTranslator(), protected=True))
    return {"moments": len(moments), "languages": ["en", "hi"], "targets_supported": list(TARGETS),
            "translator": "simulated (word order + numbers moved between slots); provider off: template lines",
            "rows": rows, "control_no_swap_protected": control}


def markdown(s: dict) -> str:
    def pct(x):
        return "N/A" if x is None else f"{x * 100:.1f}%"
    out = ["# Hindi numbers — raw numbers against placeholders (D7)", "",
           (f"{s['moments']} fixture moments (SYN-1017), every line through the seven agents with the provider off "
            "(template lines) in English and Hindi. The translator is **simulated**: it reorders words the way Hindi "
            "does and, in the stated share of lines with two or more numbers, moves the numbers between slots — what "
            "Azure AI Translator did in the October runs (\"1–0 after 3 minutes\" came back as \"0–3 after 1 "
            "minute\"). The share Azure does this at is unknown, so three are shown. No paid calls."), "",
           ("| Swap share | Hindi lines dropped, before | after | Wrong Hindi lines published, before | after | "
            "Digits the translator saw, after |"), "|---|---|---|---|---|---|"]
    for r in s["rows"]:
        b, a = r["before"], r["after"]
        out.append(f"| {pct(r['swap_rate'])} | {b['hindi_dropped']} of {b['english_lines']} "
                   f"({pct(b['drop_rate'])}) | {a['hindi_dropped']} of {a['english_lines']} ({pct(a['drop_rate'])}) "
                   f"| {b['wrong_hindi_published']} | {a['wrong_hindi_published']} | "
                   f"{a['digits_seen_by_translator']} |")
    c = s["control_no_swap_protected"]
    out += ["", (f"Control (no swaps, placeholders on): {c['hindi_dropped']} dropped of {c['english_lines']}, "
                 f"{c['wrong_hindi_published']} wrong."), "",
            ("**Before**, a moved number is caught by the re-check only when a unit gives it away (a minute count "
             "landing on a goal count); a swapped score with nothing else in the line, such as \"2–1\" turned into "
             "\"1–2\", has the same numbers in a different order and passes, so the wrong-lines column is the hole "
             "the drop rule could not close. **After**, the translator never sees a digit: each number goes as its "
             "own placeholder, comes back wherever the Hindi word order puts it, and is restored to exactly its "
             "value; a line whose placeholders don't all return exactly once is treated as untranslated (template, "
             "or dropped), never guessed. The re-check is unchanged and still runs on every restored line."), "",
            ("What this does not show: how often Azure keeps a placeholder intact. The placeholders are pinned with "
             "the dynamic dictionary like names, which Azure honours; the first Azure run after deploy should record "
             "the Hindi drop rate next to this table."), ""]
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hindi_numbers")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    moments = json.loads(FIXTURE.read_text(encoding="utf-8"))
    summary = run_all(moments)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    (args.out / "report.md").write_text(markdown(summary), encoding="utf-8")
    print(args.out / "report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
