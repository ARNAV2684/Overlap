"""Scope, retry and source limits. Spec: mcp_server/specs/tools.md §§3–4."""
import asyncio
import json
from pathlib import Path

import pytest
from mcp_server.data_access import (
    CosmosReader,
    FixtureReader,
    SourceFailure,
    azure_cosmos_endpoint,
    local_cosmos_settings,
)
from mcp_server.schema import Identity, encoded
from mcp_server.tools.match_state import MatchStateTool


class RecordingReader:
    source = "cosmos"

    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    async def read(self, identity):
        self.calls.append(identity)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    async def close(self):
        pass


@pytest.mark.anyio
async def test_scope_denied_before_read(moment):
    reader = RecordingReader()
    tool = MatchStateTool(reader, moment.identity)
    other = Identity(match_id="SYN-9999", moment_id="MO-9999-0001", evidence_version=1)
    result = await tool.call(other)
    assert result.status == "denied" and result.reason == "outside_scope"
    assert reader.calls == []


@pytest.mark.anyio
async def test_transient_retry_success_and_session_budget(document, moment):
    reader = RecordingReader(SourceFailure("source_error", transient=True), document)
    tool = MatchStateTool(reader, moment.identity)
    assert (await tool.call(moment.identity)).status == "ok"
    assert (await tool.call(moment.identity)).reason == "source_not_ready"
    assert len(reader.calls) == 2


@pytest.mark.anyio
@pytest.mark.parametrize("reason", ["not_found", "source_error", "response_too_large"])
async def test_no_retry_for_nontransient(reason, moment):
    reader = RecordingReader(SourceFailure(reason))
    result = await MatchStateTool(reader, moment.identity).call(moment.identity)
    assert result.status == "unavailable" and result.reason == reason
    assert len(reader.calls) == 1


@pytest.mark.anyio
async def test_timeout_and_cancellation(moment):
    class SlowReader:
        source = "fixture"
        calls = 0
        cancelled = 0

        async def read(self, identity):
            self.calls += 1
            try:
                await asyncio.sleep(10)
            finally:
                self.cancelled += 1

    reader = SlowReader()
    result = await MatchStateTool(reader, moment.identity, timeout=0.01).call(moment.identity)
    assert result.reason == "source_timeout"
    assert reader.calls == reader.cancelled == 2


@pytest.mark.anyio
@pytest.mark.parametrize("field,value,reason", [
    ("evidence_version", 2, "version_mismatch"),
    ("kind", "insight_job", "context_mismatch"),
    ("id", "MO-1017-0002", "context_mismatch"),
])
async def test_bad_stored_source(document, moment, field, value, reason):
    document[field] = value
    reader = RecordingReader(document)
    assert (await MatchStateTool(reader, moment.identity).call(moment.identity)).reason == reason
    assert len(reader.calls) == 1


@pytest.mark.anyio
async def test_wrong_document_identity(document, moment):
    other = json.loads(encoded(document).decode().replace("1017", "9999"))
    reader = RecordingReader(other)
    assert (await MatchStateTool(reader, moment.identity).call(moment.identity)).reason == "context_mismatch"


@pytest.mark.anyio
async def test_concurrent_calls_cannot_exceed_budget(document, moment):
    reader = RecordingReader(document, document)
    tool = MatchStateTool(reader, moment.identity)
    replies = await asyncio.gather(*(tool.call(moment.identity) for _ in range(5)))
    assert sum(r.status == "ok" for r in replies) == 2
    assert len(reader.calls) == 2


@pytest.mark.anyio
async def test_symlink_cannot_escape_configured_directory(tmp_path, moment):
    root = tmp_path / "root"
    root.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text("{}")
    try:
        (root / f"{moment.id}.json").symlink_to(outside)
    except OSError:                         # Windows without symlink privilege
        pytest.skip("creating symlinks is not permitted on this system")
    with pytest.raises(SourceFailure, match="source_error"):
        await FixtureReader(root).read(moment.identity)


@pytest.mark.parametrize("endpoint", [
    "https://example.documents.azure.com:443", "http://127.0.0.1.evil.test:8081",
    "http://user@localhost:8081", "http://localhost:8081/dbs/other",
    "http://localhost:8081?redirect=example.com",
])
def test_cloud_or_ambiguous_endpoints_fail_before_connect(monkeypatch, endpoint):
    monkeypatch.setenv("OVERLAP_COSMOS_ENDPOINT", endpoint)
    monkeypatch.setenv("OVERLAP_COSMOS_KEY", "test-only")
    with pytest.raises(ValueError):
        local_cosmos_settings()


@pytest.mark.parametrize("endpoint", [
    "http://example.documents.azure.com", "https://example.documents.azure.com.evil.test",
    "https://evil.test/example.documents.azure.com", "https://user@example.documents.azure.com",
    "https://example.documents.azure.com/dbs/live", "https://example.documents.azure.com:8081",
    "https://a.b.documents.azure.com", "http://localhost:8081",
])
def test_without_a_key_only_an_azure_cosmos_endpoint_is_accepted(monkeypatch, endpoint):
    monkeypatch.setenv("OVERLAP_COSMOS_ENDPOINT", endpoint)
    monkeypatch.delenv("OVERLAP_COSMOS_KEY", raising=False)
    with pytest.raises(ValueError):
        azure_cosmos_endpoint()


def test_azure_mode_uses_the_given_identity_and_reads_only_live(monkeypatch):
    monkeypatch.setenv("OVERLAP_COSMOS_ENDPOINT", "https://overlap-demo.documents.azure.com:443/")
    monkeypatch.delenv("OVERLAP_COSMOS_KEY", raising=False)
    assert azure_cosmos_endpoint() == "https://overlap-demo.documents.azure.com:443/"

    class Token:                                       # stands in for a managed-identity credential
        async def get_token(self, *scopes, **kwargs):
            raise AssertionError("no network in tests")

        async def close(self):
            pass
    reader = CosmosReader(credential=Token())
    assert reader.own_credential is None and reader.container.id == "moments"
    monkeypatch.setenv("OVERLAP_COSMOS_DATABASE", "other")
    with pytest.raises(ValueError):
        azure_cosmos_endpoint()


def test_the_seed_command_never_writes_to_azure(monkeypatch, tmp_path):
    import asyncio

    from mcp_server.sample import seed
    monkeypatch.setenv("OVERLAP_COSMOS_ENDPOINT", "https://overlap-demo.documents.azure.com")
    monkeypatch.delenv("OVERLAP_COSMOS_KEY", raising=False)
    path = Path(__file__).parent.parent / "samples" / "MO-1017-0001.json"
    with pytest.raises(ValueError):
        asyncio.run(seed(path))
