"""Translator adapter, with a stubbed client. Spec: agents/specs/agents.md §5, fact-checking.md §4."""
import asyncio
from types import SimpleNamespace

import pytest

from config import Settings
from translation import AzureTranslator, FakeTranslator, TranslationError, translator

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


@pytest.mark.parametrize("reply", [[], [item("fr", "x")], [item("es", " ")], [item("es", "a"), item("es", "b")]])
def test_azure_unusable_replies_fail(reply):
    with pytest.raises(TranslationError):
        run(AzureTranslator("https://example", client=StubClient(reply)).translate([LINE], "es"))


def test_azure_service_failure_is_a_translation_error():
    with pytest.raises(TranslationError, match="es"):
        run(AzureTranslator("https://example", client=StubClient(fail=OSError("down"))).translate([LINE], "es"))


def test_factory_defaults_to_fake():
    assert isinstance(translator(Settings()), FakeTranslator)
