"""Translator adapter, with a stubbed client; numbers sent as placeholders. Spec: agents/specs/agents.md §5,
fact-checking.md §4."""
import asyncio
import copy
import re
from types import SimpleNamespace

import pytest

from config import Settings
from evals import hindi_numbers
from evals.hindi_numbers import SlotSwapTranslator, reorder
from state import JobStore, MemoryStore
from translation import AzureTranslator, FakeTranslator, ProtectedNumbers, TranslationError, mask, translator, unmask
from workflow import Deps, process_moment

LINE = "Kestlebury United have taken 3 shots in the last 5 minutes."


def run(coro):
    return asyncio.run(coro)


def test_fake_keeps_the_text_and_marks_the_language():
    assert run(FakeTranslator().translate([LINE], "hi")) == [f"(hi) {LINE}"]


@pytest.mark.parametrize("to", ["en", "de", ""])
def test_unsupported_targets_rejected(to):
    with pytest.raises(TranslationError):
        run(FakeTranslator().translate([LINE], to))


def test_empty_input_rejected():
    with pytest.raises(TranslationError):
        run(FakeTranslator().translate(["  "], "es"))


class StubClient:
    def __init__(self, reply=None, fail=None):
        self.reply, self.fail, self.calls = reply, fail, []

    async def translate(self, body, to_language, from_language):
        self.calls.append((body, to_language, from_language))
        if self.fail:
            raise self.fail
        return self.reply


def item(lang, text):
    return SimpleNamespace(translations=[SimpleNamespace(language=lang, text=text)])


def test_azure_request_and_reply():
    stub = StubClient([item("es", "Kestlebury United ha realizado 3 tiros en los últimos 5 minutos.")])
    out = run(AzureTranslator("https://example", client=stub).translate([LINE], "es"))
    assert stub.calls == [([LINE], ["es"], "en")]
    assert out == ["Kestlebury United ha realizado 3 tiros en los últimos 5 minutos."]


def test_azure_reply_from_sdk_1_names_the_language_to():
    # azure-ai-translation-text 1.0 (API 3.0, what the custom-domain endpoint serves) calls the field `to`
    stub = StubClient([SimpleNamespace(translations=[SimpleNamespace(to="fr", text="Bonjour")])])
    assert run(AzureTranslator("https://example", client=stub).translate(["Hello"], "fr")) == ["Bonjour"]


@pytest.mark.parametrize("reply", [[], [item("fr", "x")], [item("es", " ")], [item("es", "a"), item("es", "b")]])
def test_azure_unusable_replies_fail(reply):
    with pytest.raises(TranslationError):
        run(AzureTranslator("https://example", client=StubClient(reply)).translate([LINE], "es"))


def test_azure_service_failure_is_a_translation_error():
    with pytest.raises(TranslationError, match="es"):
        run(AzureTranslator("https://example", client=StubClient(fail=OSError("down"))).translate([LINE], "es"))


def test_factory_defaults_to_fake_with_numbers_protected():
    t = translator(Settings())
    assert isinstance(t, ProtectedNumbers) and isinstance(t.inner, FakeTranslator)
    assert isinstance(translator(Settings(translator="azure", translator_endpoint="https://example")).inner,
                      AzureTranslator)


# --- numbers as placeholders (D7) ---------------------------------------------------------------------------------

@pytest.mark.parametrize("text,numbers", [
    ("Kestlebury United lead 1–0 after 3 minutes.", ["1–0", "3"]),
    ("0.8 xG from 11 m, 62% of the ball, his 23rd goal.", ["0.8 xG", "11", "62%", "23rd"]),
    ("Up from 0.77 to 1.35 pressures per pass.", ["0.77", "1.35"]),
    ("No numbers here.", []),
])
def test_mask_hides_every_number_and_unmask_restores_it(text, numbers):
    masked, values = mask(text)
    assert not re.search(r"\d", masked) and list(values.values()) == numbers
    assert unmask(masked, values) == text


def test_unmask_refuses_a_lost_doubled_or_foreign_placeholder():
    masked, values = mask("Kestlebury United lead 1–0 after 3 minutes.")
    a, b = sorted(values)
    assert unmask(masked.replace(a, ""), values) is None                    # lost
    assert unmask(masked.replace(b, f"{b} {b}"), values) is None            # doubled
    assert unmask(masked + " QZXZZ", values) is None                        # one it never sent
    assert unmask(masked.replace(a, a.lower()), values) is None             # mangled


def test_text_already_masked_passes_through_unchanged():
    masked, _ = mask("3 shots in 5 minutes.")
    assert mask(masked) == (masked, None) and unmask(masked, None) == masked


class Reordering:
    """A fake translator that puts the words in postposition order and records what it was sent."""

    def __init__(self):
        self.sent, self.keep = [], []

    async def translate(self, texts, to, keep=None):
        self.sent += texts
        self.keep = keep
        return [reorder(t) for t in texts]


def test_reordered_words_keep_each_number_on_its_own_phrase():
    inner = Reordering()
    out = run(ProtectedNumbers(inner).translate(["Kestlebury United lead 1–0 after 3 minutes."], "hi",
                                                keep=["Kestlebury United"]))
    assert out == ["after 3 minutes Kestlebury United lead 1–0."]
    assert not any(re.search(r"\d", t) for t in inner.sent)               # the translator never sees a digit
    assert inner.keep[0] == "Kestlebury United" and all(k.startswith("QZX") for k in inner.keep[1:])


def test_a_slot_swap_without_placeholders_moves_numbers_and_with_them_cannot():
    line = "Kestlebury United lead 1–0 after 3 minutes."
    raw = run(SlotSwapTranslator(1.0).translate([line], "hi"))[0]
    assert raw == "(hi) after 0 minutes Kestlebury United lead 3–1."      # the kind of thing Azure did
    assert run(ProtectedNumbers(SlotSwapTranslator(1.0)).translate([line], "hi")) == [
        "(hi) after 3 minutes Kestlebury United lead 1–0."]


def test_azure_pins_placeholders_with_the_dynamic_dictionary():
    stub = StubClient([item("hi", 'पिछले QZXAB मिनट में Kestlebury United के QZXAA शॉट')])
    out = run(ProtectedNumbers(AzureTranslator("https://example", client=stub)).translate([LINE], "hi",
                                                                                          keep=["Kestlebury United"]))
    body = stub.calls[0][0][0]
    assert '<mstrans:dictionary translation="QZXAA">QZXAA</mstrans:dictionary>' in body and "3" not in body
    assert out == ["पिछले 5 मिनट में Kestlebury United के 3 शॉट"]


def test_a_line_whose_placeholder_is_lost_is_none_and_the_rest_survive():
    class Loses:
        async def translate(self, texts, to, keep=None):
            return [re.sub(r"QZX[A-Z]{2}", "", t, count=1) if i == 0 else t for i, t in enumerate(texts)]
    out = run(ProtectedNumbers(Loses()).translate(["3 shots.", "5 minutes."], "hi"))
    assert out == [None, "5 minutes."]


def test_the_agents_never_publish_a_hindi_line_with_a_lost_number(moments):
    """A translator that always loses a placeholder of the analyst line: that line is dropped for Hindi (its
    template loses it too); English and the other Hindi lines are published, with every number in place."""
    cluster = copy.deepcopy(next(m for m in moments if m["id"] == "MO-1017-0013"))

    class LosesCasual:
        async def translate(self, texts, to, keep=None):
            return [re.sub(r"QZX[A-Z]{2}", "", t, count=1) if "the last" in t else t
                    for t in texts]

    store = MemoryStore()
    run(store.create({**cluster, "_ts": 0}))
    deps = Deps(store=store, jobs=JobStore(store), settings=Settings(languages=("en", "hi"), skip_stale=False),
                translator=ProtectedNumbers(LosesCasual()))
    assert run(process_moment(cluster, deps))["status"] == "delivery_pending"
    intent = run(store.read("SYN-1017", "outbox:MO-1017-0013"))[0]["intent"]
    en = [a for a in intent["audiences"] if a["lang"] == "en"]
    hi = [a for a in intent["audiences"] if a["lang"] == "hi"]
    assert intent["dropped"] == [{"id": "analyst", "lang": "hi"}]
    assert len(hi) == len(en) - 1 and {a["mode"] for a in hi} == {a["mode"] for a in en} - {"analyst"}
    assert all(not re.search(r"QZX", a["line"]["text"]) for a in hi)


def test_hindi_measurement_before_and_after(moments):
    s = hindi_numbers.run_all(moments, rates=(1.0,))
    row = s["rows"][0]
    assert row["lines_scrambled_before"] > 0
    assert row["before"]["hindi_dropped"] + row["before"]["wrong_hindi_published"] > 0
    assert row["after"]["hindi_dropped"] == 0 and row["after"]["wrong_hindi_published"] == 0
    assert row["after"]["digits_seen_by_translator"] == 0
    assert s["control_no_swap_protected"]["hindi_dropped"] == 0
    assert "| 100.0% |" in hindi_numbers.markdown(s)
