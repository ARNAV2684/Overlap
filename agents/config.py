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
    "OVERLAP_SPOTTER_RANK": "spotter_rank",
    "OVERLAP_MAX_MODEL_JOBS_PER_MATCH": "max_model_jobs_per_match",
    "OVERLAP_HIGH_PRIORITY_RESERVE": "high_priority_reserve",
    "OVERLAP_MAX_REWRITES": "max_rewrites",
    "OVERLAP_MAX_PLAYER_LINES": "max_player_lines",
    "OVERLAP_MODEL_BREAKER_FAILURES": "model_breaker_failures",
    "OVERLAP_MODEL_BREAKER_COOLDOWN_S": "model_breaker_cooldown_s",
    "OVERLAP_MAX_QUEUED_PER_MATCH": "max_queued_per_match",
    "OVERLAP_SKIP_STALE": "skip_stale",
    "OVERLAP_MCP_PYTHON": "mcp_python",
    "OVERLAP_MCP_SOURCE": "mcp_source",
    "OVERLAP_MCP_FIXTURE_DIR": "mcp_fixture_dir",
    "OVERLAP_MCP_TIMEOUT_S": "mcp_timeout_s",
    "OVERLAP_TAG_TOP_SPEED_KMH": "tag_top_speed_kmh",
    "OVERLAP_TAG_DISTANCE_KM": "tag_distance_km",
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
    # agents (agents.md §1–§7)
    spotter_rank: bool = True                  # small-model ranking of normal moments, when a model is on
    max_model_jobs_per_match: int = 12         # moments that may use model calls (workflow.md §3); the recap is extra
    high_priority_reserve: int = 3             # model-job slots kept for goals, red cards and penalties
    max_rewrites: int = 2
    max_player_lines: int = 3                  # player-mode lines per moment (first players in `player_ids`)
    model_breaker_failures: int = 3            # model failures in a row before the model is paused
    model_breaker_cooldown_s: float = 60.0     # how long it stays paused before one probe call
    max_queued_per_match: int = 2              # normal moments waiting behind the running one (workflow.md §3)
    skip_stale: bool = True                    # live: suppress a moment the match has already moved past (off for replays)
    mcp_python: str = ""                       # the MCP server's Python; default: mcp_server/.venv
    mcp_source: str = "cosmos"                 # cosmos (local emulator or Azure) or fixture
    mcp_fixture_dir: str = ""
    mcp_timeout_s: float = 2.0
    tag_top_speed_kmh: float = 33.0            # player tags (§10.6): first crossing of either threshold
    tag_distance_km: float = 10.0

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
                if kind == "bool":
                    if raw.lower() not in ("1", "0", "true", "false", "yes", "no", "on", "off"):
                        raise ValueError(raw)
                    values[name] = raw.lower() in ("1", "true", "yes", "on")
                elif kind == "int":
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
        if self.mcp_source not in ("cosmos", "fixture"):
            raise SettingsError("OVERLAP_MCP_SOURCE must be cosmos or fixture")
        if self.mcp_source == "fixture" and not self.mcp_fixture_dir:
            raise SettingsError("OVERLAP_MCP_FIXTURE_DIR is required for the fixture source")
        if not 0 <= self.high_priority_reserve < self.max_model_jobs_per_match:
            raise SettingsError("OVERLAP_HIGH_PRIORITY_RESERVE must be below OVERLAP_MAX_MODEL_JOBS_PER_MATCH")
        if not 0 <= self.max_rewrites <= 2:
            raise SettingsError("OVERLAP_MAX_REWRITES must be 0, 1 or 2")
        if self.model_breaker_failures < 1:
            raise SettingsError("OVERLAP_MODEL_BREAKER_FAILURES must be at least 1")
        if self.model_breaker_cooldown_s <= 0:
            raise SettingsError("OVERLAP_MODEL_BREAKER_COOLDOWN_S must be positive")
        if self.max_queued_per_match < 0:
            raise SettingsError("OVERLAP_MAX_QUEUED_PER_MATCH must not be negative")
        if self.max_player_lines < 0:
            raise SettingsError("OVERLAP_MAX_PLAYER_LINES must not be negative")
        for name in ("request_timeout_s", "moment_deadline_s", "mcp_timeout_s", "tag_top_speed_kmh",
                     "tag_distance_km"):
            if getattr(self, name) <= 0:
                raise SettingsError(f"{name} must be positive")
        for name in ("max_calls_per_moment", "max_calls_per_match", "max_tokens_per_match", "max_input_tokens",
                     "max_output_tokens", "max_model_jobs_per_match"):
            if getattr(self, name) < 1:
                raise SettingsError(f"{name} must be at least 1")

    @property
    def model_name(self) -> str:
        return {"local": self.local_model, "azure": self.azure_deployment}.get(self.provider, "")
