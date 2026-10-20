# config.py — Agent settings
#
# Purpose: one place for the model provider, endpoints, timeouts, budgets, modes and languages
# Inputs:  environment variables (names below; values live in an untracked local env file, never in the repo)
# Outputs: Settings
# Spec:    agents/specs/agents.md §8; agents/specs/workflow.md §3
#
# Local first: provider `local` talks to Foundry Local (or any OpenAI-compatible server on this machine); provider
# `azure` talks to Azure OpenAI in Foundry with managed identity. Switching is settings only. The default is `off`:
# every model call is refused until someone chooses a provider.

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, fields
from urllib.parse import urlparse

PROVIDERS = ("off", "local", "azure")
TRANSLATORS = ("fake", "azure")
MODES = ("casual", "analyst", "player", "club")
LANGUAGES = ("en", "es", "hi", "fr")
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

# Environment variable -> Settings field
ENV = {
    "OVERLAP_MODEL_PROVIDER": "provider",
    "OVERLAP_LOCAL_MODEL_URL": "local_base_url",
    "OVERLAP_LOCAL_MODEL": "local_model",
    "OVERLAP_AZURE_OPENAI_ENDPOINT": "azure_endpoint",
    "OVERLAP_AZURE_OPENAI_DEPLOYMENT": "azure_deployment",
    "OVERLAP_AZURE_OPENAI_API_VERSION": "azure_api_version",
    "OVERLAP_MODEL_TIMEOUT_S": "request_timeout_s",
    "OVERLAP_MOMENT_DEADLINE_S": "moment_deadline_s",
    "OVERLAP_MAX_CALLS_PER_MOMENT": "max_calls_per_moment",
    "OVERLAP_MAX_CALLS_PER_MATCH": "max_calls_per_match",
    "OVERLAP_MAX_TOKENS_PER_MATCH": "max_tokens_per_match",
    "OVERLAP_MAX_INPUT_TOKENS": "max_input_tokens",
    "OVERLAP_MAX_OUTPUT_TOKENS": "max_output_tokens",
    "OVERLAP_TRANSLATOR": "translator",
    "OVERLAP_TRANSLATOR_ENDPOINT": "translator_endpoint",
    "OVERLAP_TRANSLATOR_REGION": "translator_region",
    "OVERLAP_LANGUAGES": "languages",
    "OVERLAP_MODES": "modes",
}


class SettingsError(ValueError):
    """The settings can't be used. The message names the variable, never a secret value."""


@dataclass(frozen=True)
class Settings:
    provider: str = "off"
    local_base_url: str = ""
    local_model: str = ""
    azure_endpoint: str = ""
    azure_deployment: str = ""
    azure_api_version: str = ""
    # workflow.md §3 (proposed, unmeasured defaults)
    request_timeout_s: float = 4.0
    moment_deadline_s: float = 15.0
    max_calls_per_moment: int = 12
    max_calls_per_match: int = 120
    max_tokens_per_match: int = 400_000
    max_input_tokens: int = 3000
    max_output_tokens: int = 800
    translator: str = "fake"
    translator_endpoint: str = ""
    translator_region: str = ""
    languages: tuple[str, ...] = LANGUAGES
    modes: tuple[str, ...] = MODES

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        kinds = {f.name: f.type for f in fields(cls)}
        values: dict = {}
        for var, name in ENV.items():
            raw = env.get(var)
            if raw is None or raw.strip() == "":
                continue
            raw = raw.strip()
            kind = kinds[name]
            try:
                if kind == "int":
                    values[name] = int(raw)
                elif kind == "float":
                    values[name] = float(raw)
                elif kind.startswith("tuple"):
                    values[name] = tuple(x.strip() for x in raw.split(",") if x.strip())
                else:
                    values[name] = raw
            except ValueError as e:
                raise SettingsError(f"{var} is not a valid {kind}") from e
        settings = cls(**values)
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.provider not in PROVIDERS:
            raise SettingsError(f"OVERLAP_MODEL_PROVIDER must be one of {', '.join(PROVIDERS)}")
        if self.provider == "local":
            url = urlparse(self.local_base_url)
            if url.scheme not in ("http", "https") or url.hostname not in LOOPBACK_HOSTS:
                raise SettingsError("OVERLAP_LOCAL_MODEL_URL must be an http(s) URL on this machine (localhost)")
            if not self.local_model:
                raise SettingsError("OVERLAP_LOCAL_MODEL is required for the local provider")
        if self.provider == "azure":
            url = urlparse(self.azure_endpoint)
            if url.scheme != "https" or not url.hostname:
                raise SettingsError("OVERLAP_AZURE_OPENAI_ENDPOINT must be an https URL")
            if not self.azure_deployment:
                raise SettingsError("OVERLAP_AZURE_OPENAI_DEPLOYMENT is required for the azure provider")
        if self.translator not in TRANSLATORS:
            raise SettingsError(f"OVERLAP_TRANSLATOR must be one of {', '.join(TRANSLATORS)}")
        if self.translator == "azure" and not self.translator_endpoint.startswith("https://"):
            raise SettingsError("OVERLAP_TRANSLATOR_ENDPOINT must be an https URL for the azure translator")
        if "en" not in self.languages or not set(self.languages) <= set(LANGUAGES):
            raise SettingsError(f"OVERLAP_LANGUAGES must include en and use only {', '.join(LANGUAGES)}")
        if not self.modes or not set(self.modes) <= set(MODES):
            raise SettingsError(f"OVERLAP_MODES must use only {', '.join(MODES)}")
        for name in ("request_timeout_s", "moment_deadline_s"):
            if getattr(self, name) <= 0:
                raise SettingsError(f"{name} must be positive")
        for name in ("max_calls_per_moment", "max_calls_per_match", "max_tokens_per_match", "max_input_tokens",
                     "max_output_tokens"):
            if getattr(self, name) < 1:
                raise SettingsError(f"{name} must be at least 1")

    @property
    def model_name(self) -> str:
        return {"local": self.local_model, "azure": self.azure_deployment}.get(self.provider, "")
