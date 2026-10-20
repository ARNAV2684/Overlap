"""Settings from the environment. Spec: agents/specs/agents.md §8."""
import pytest

from config import LANGUAGES, MODES, Settings, SettingsError


def test_defaults_are_safe():
    s = Settings.from_env({})
    assert s.provider == "off" and s.translator == "fake"
    assert s.languages == LANGUAGES and s.modes == MODES
    assert (s.max_calls_per_moment, s.max_calls_per_match, s.max_tokens_per_match) == (12, 120, 400_000)


def test_local_provider():
    s = Settings.from_env({"OVERLAP_MODEL_PROVIDER": "local", "OVERLAP_LOCAL_MODEL_URL": "http://localhost:5273/v1",
                           "OVERLAP_LOCAL_MODEL": "small-model"})
    assert s.model_name == "small-model"


@pytest.mark.parametrize("url", ["http://example.com/v1", "ftp://localhost/v1", "", "http://10.0.0.5:5273/v1"])
def test_local_provider_must_be_on_this_machine(url):
    with pytest.raises(SettingsError, match="OVERLAP_LOCAL_MODEL_URL"):
        Settings.from_env({"OVERLAP_MODEL_PROVIDER": "local", "OVERLAP_LOCAL_MODEL_URL": url,
                           "OVERLAP_LOCAL_MODEL": "m"})


def test_azure_needs_endpoint_and_deployment():
    with pytest.raises(SettingsError, match="ENDPOINT"):
        Settings.from_env({"OVERLAP_MODEL_PROVIDER": "azure", "OVERLAP_AZURE_OPENAI_DEPLOYMENT": "d"})
    with pytest.raises(SettingsError, match="DEPLOYMENT"):
        Settings.from_env({"OVERLAP_MODEL_PROVIDER": "azure",
                           "OVERLAP_AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com"})
    s = Settings.from_env({"OVERLAP_MODEL_PROVIDER": "azure",
                           "OVERLAP_AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
                           "OVERLAP_AZURE_OPENAI_DEPLOYMENT": "mini"})
    assert s.model_name == "mini"


@pytest.mark.parametrize("env,match", [
    ({"OVERLAP_MODEL_PROVIDER": "openai"}, "OVERLAP_MODEL_PROVIDER"),
    ({"OVERLAP_TRANSLATOR": "azure"}, "OVERLAP_TRANSLATOR_ENDPOINT"),
    ({"OVERLAP_LANGUAGES": "es,fr"}, "OVERLAP_LANGUAGES"),
    ({"OVERLAP_LANGUAGES": "en,de"}, "OVERLAP_LANGUAGES"),
    ({"OVERLAP_MODES": "casual,expert"}, "OVERLAP_MODES"),
    ({"OVERLAP_MAX_CALLS_PER_MOMENT": "many"}, "OVERLAP_MAX_CALLS_PER_MOMENT"),
    ({"OVERLAP_MODEL_TIMEOUT_S": "0"}, "request_timeout_s"),
])
def test_bad_settings_name_the_variable(env, match):
    with pytest.raises(SettingsError, match=match):
        Settings.from_env(env)


def test_lists_and_numbers_parse():
    s = Settings.from_env({"OVERLAP_LANGUAGES": "en, hi", "OVERLAP_MODES": "casual,player",
                           "OVERLAP_MAX_CALLS_PER_MATCH": "30", "OVERLAP_MODEL_TIMEOUT_S": "2.5"})
    assert s.languages == ("en", "hi") and s.modes == ("casual", "player")
    assert s.max_calls_per_match == 30 and s.request_timeout_s == 2.5
