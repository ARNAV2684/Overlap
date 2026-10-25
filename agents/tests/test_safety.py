"""The optional Content Safety screen (agents/specs/observability.md §4): off by default; a flagged, failed or slow
screen sends the line to its template. A fake client stands in for Azure AI Content Safety."""
import asyncio
import copy
from types import SimpleNamespace

import pytest

import workflow as W
from config import Settings, SettingsError
from safety import ContentSafety
from state import JobStore, MemoryStore
from tests.fakes import FakeContext, ScriptedModels
from translation import FakeTranslator

MODEL = Settings(provider="local", local_base_url="http://localhost:1", local_model="fake")


class FakeClient:
    """Answers with fixed severities per category; `flag` picks the texts that get a high one."""

    def __init__(self, flag=lambda text: False, severity=4, error=None, delay=0.0):
        self.flag, self.severity, self.error, self.delay = flag, severity, error, delay
        self.texts: list[str] = []
        self.closed = False

    async def analyze_text(self, options):
        self.texts.append(options["text"])
        assert sorted(options["categories"]) == ["Hate", "SelfHarm", "Sexual", "Violence"]
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        high = self.flag(options["text"])
        return SimpleNamespace(categories_analysis=[
            SimpleNamespace(category="Hate", severity=0),
            SimpleNamespace(category="Violence", severity=self.severity if high else 0)])

    async def close(self):
        self.closed = True


def check(client, text="A calm line.", **kw):
    return asyncio.run(ContentSafety(client, **kw).check(text))


def test_a_clean_line_passes():
    assert check(FakeClient()) == {"ok": True, "max_severity": 0}


def test_a_line_at_the_reject_level_fails_and_names_the_category():
    assert check(FakeClient(lambda t: True, severity=4)) == {"ok": False, "max_severity": 4,
                                                            "categories": ["Violence"]}
    assert check(FakeClient(lambda t: True, severity=2))["ok"] is True                    # below the default 4
    assert check(FakeClient(lambda t: True, severity=2), reject_at=2)["ok"] is False


def test_the_sdk_category_type_is_read_by_its_value():
    from azure.ai.contentsafety.models import TextCategory

    class EnumClient(FakeClient):
        async def analyze_text(self, options):
            return SimpleNamespace(categories_analysis=[SimpleNamespace(category=TextCategory.VIOLENCE, severity=6)])

    assert check(EnumClient()) == {"ok": False, "max_severity": 6, "categories": ["Violence"]}


def test_a_failed_or_slow_screen_is_not_a_pass():
    assert check(FakeClient(error=RuntimeError("503"))) == {"ok": False, "reason": "error:RuntimeError"}
    assert check(FakeClient(delay=0.2), timeout_s=0.01) == {"ok": False, "reason": "timeout"}


def test_settings_are_off_by_default_and_need_an_https_endpoint():
    s = Settings()
    assert s.content_safety == "off" and s.content_safety_reject_at == 4
    env = {"OVERLAP_CONTENT_SAFETY": "azure", "OVERLAP_CONTENT_SAFETY_ENDPOINT": "https://cs.example.com/"}
    assert Settings.from_env(env).content_safety_endpoint == "https://cs.example.com/"
    with pytest.raises(SettingsError, match="OVERLAP_CONTENT_SAFETY_ENDPOINT"):
        Settings.from_env({"OVERLAP_CONTENT_SAFETY": "azure"})
    with pytest.raises(SettingsError, match="OVERLAP_CONTENT_SAFETY_REJECT_AT"):
        Settings.from_env({**env, "OVERLAP_CONTENT_SAFETY_REJECT_AT": "3"})


def test_the_client_uses_a_credential_not_a_key():
    class Credential:                                   # stands in for managed identity; never asked for a token
        async def get_token(self, *scopes, **kw):
            raise AssertionError("no call in this test")

        async def close(self):
            pass

    s = Settings(content_safety="azure", content_safety_endpoint="https://cs.example.com/")
    cs = ContentSafety.from_settings(s, credential=Credential())
    assert type(cs.client).__name__ == "ContentSafetyClient" and cs.reject_at == 4
    asyncio.run(cs.close())


def run_moment(moments, clock, client):
    moment = copy.deepcopy(next(m for m in moments if m["id"] == "MO-1017-0013"))
    store, models = MemoryStore(), ScriptedModels(MODEL)
    models.moment = moment
    deps = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=MODEL, translator=FakeTranslator(),
                  models=models, context=lambda m: FakeContext(m),
                  safety=ContentSafety(client) if client else None)
    result = asyncio.run(W.process_moment(moment, deps))
    job = asyncio.run(store.read("SYN-1017", "job:MO-1017-0013"))[0]
    return result, job["stage_outputs"]["fact_checker"]


def test_without_a_screen_the_fact_checker_is_unchanged(moments, clock):
    result, checked = run_moment(moments, clock, None)
    assert result["verified"] is True and "safety" not in checked


def test_clean_model_lines_stay_verified(moments, clock):
    client = FakeClient()
    result, checked = run_moment(moments, clock, client)
    assert result["verified"] is True and result["fallback"] is False
    assert set(checked["safety"]) == {ln["id"] for ln in checked["lines"]}
    assert len(client.texts) == len(checked["lines"])


def test_a_flagged_line_uses_its_template(moments, clock):
    seen: list[str] = []

    def flag(text):                                    # only the first line screened is flagged
        seen.append(text)
        return len(seen) == 1

    result, checked = run_moment(moments, clock, FakeClient(flag))
    flagged = [i for i, r in checked["safety"].items() if not r["ok"]]
    assert len(flagged) == 1
    assert checked["status"][flagged[0]] == {"verified": False, "fallback": True}
    assert result["fallback"] is True and result["verified"] is False
    others = [i for i in checked["status"] if i not in flagged]
    assert others and all(checked["status"][i]["verified"] for i in others)


def test_an_unavailable_screen_falls_back_rather_than_publishing_unscreened(moments, clock):
    _, checked = run_moment(moments, clock, FakeClient(error=ConnectionError("down")))
    assert all(not s["verified"] and s["fallback"] for s in checked["status"].values())
    assert all(r == {"ok": False, "reason": "error:ConnectionError"} for r in checked["safety"].values())
