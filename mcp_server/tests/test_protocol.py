"""Real stdio protocol and workflow-client failures. Spec: mcp_server/specs/tools.md §§2–6."""

import copy
import json
import subprocess
import sys

import pytest
from mcp.shared.exceptions import McpError
from mcp.types import CallToolResult, TextContent
from mcp_server.client import run_check, session_for, validated_result
from mcp_server.sample import SAMPLE_FILE
from mcp_server.schema import Reply, encoded, projection
from mcp_server.server import SAMPLE_DIR, TOOL_NAME


@pytest.mark.anyio
async def test_real_initialize_list_call_and_scope(moment):
    async with session_for(moment.identity, "fixture") as session:
        listed = sorted((await session.list_tools()).tools, key=lambda t: t.name != TOOL_NAME)
        assert listed[0].name == TOOL_NAME and len(listed) == 6
        assert all(t.annotations.readOnlyHint for t in listed)
        assert listed[0].inputSchema["additionalProperties"] is False
        args = moment.identity.model_dump()
        result = await session.call_tool(TOOL_NAME, args)
        assert validated_result(result, moment, "fixture", listed[0].outputSchema) == projection(moment, "fixture").payload()
        args["moment_id"] = "MO-1017-0002"
        denied = await session.call_tool(TOOL_NAME, args)
        assert denied.structuredContent["status"] == "denied"
        assert "state" not in denied.structuredContent


@pytest.mark.anyio
async def test_invalid_calls_are_protocol_errors(moment):
    async with session_for(moment.identity, "fixture") as session:
        cases = [
            ("not_a_tool", moment.identity.model_dump()),
            (TOOL_NAME, {}),
            (TOOL_NAME, {**moment.identity.model_dump(), "match_id": "../../escape"}),
            (TOOL_NAME, {**moment.identity.model_dump(), "evidence_version": True}),
            (TOOL_NAME, {**moment.identity.model_dump(), "sql": "x" * 2000}),
        ]
        for name, args in cases:
            with pytest.raises(McpError) as exc:
                await session.call_tool(name, args)
            assert exc.value.error.code == -32602
        # Invalid calls don't spend the bound source-read budget.
        assert not (await session.call_tool(TOOL_NAME, moment.identity.model_dump())).isError


@pytest.mark.anyio
async def test_missing_fixture_is_unavailable_not_success(tmp_path, moment):
    async with session_for(moment.identity, "fixture", tmp_path) as session:
        result = await session.call_tool(TOOL_NAME, moment.identity.model_dump())
        assert result.structuredContent["reason"] == "not_found"
        with pytest.raises(ValueError, match="did not return"):
            validated_result(result, moment, "fixture", Reply.model_json_schema())


@pytest.mark.anyio
async def test_complete_fixture_handoff_reads_actual_source(moment):
    report = await run_check("fixture", SAMPLE_FILE, SAMPLE_DIR)
    assert report["status"] == "passed"
    assert report["model_called"] is False and report["live_delivery"] is False
    assert report["workflow_input"]["evidence"] == moment.evidence.model_dump(exclude_none=True)
    assert report["workflow_input"]["context_result"]["provenance"]["source"] == "fixture"


@pytest.mark.parametrize("case", ["is_error", "missing_structured", "wrong_cursor", "wrong_provenance", "text_mismatch"])
def test_client_never_accepts_failed_or_mismatched_result(moment, case):
    good = projection(moment, "fixture").payload()
    raw = copy.deepcopy(good)
    if case == "wrong_cursor":
        raw["as_of"]["event_seq"] += 1
    if case == "wrong_provenance":
        raw["provenance"]["source"] = "cosmos"
    result = CallToolResult(
        structuredContent=None if case == "missing_structured" else raw,
        content=[TextContent(type="text", text=encoded(good if case == "text_mismatch" else raw).decode())],
        isError=case == "is_error",
    )
    if case == "text_mismatch":
        result.content[0].text = "{}"
    with pytest.raises(ValueError):
        validated_result(result, moment, "fixture", Reply.model_json_schema())


def test_failed_cli_cannot_leave_a_new_success_report(tmp_path):
    output = tmp_path / "report.json"
    result = subprocess.run(
        [sys.executable, "-m", "mcp_server.client", "--source", "fixture", "--fixture-dir", str(tmp_path),
         "--output", str(output)], capture_output=True, text=True, timeout=25, check=False,
    )
    assert result.returncode != 0
    assert not output.exists()
    assert "PASS:" not in result.stdout


@pytest.mark.anyio
async def test_bad_fixture_cannot_be_hidden_by_text_success(tmp_path, document, moment):
    document["context"]["score"]["home"] = -1
    (tmp_path / f"{moment.id}.json").write_text(json.dumps(document))
    async with session_for(moment.identity, "fixture", tmp_path) as session:
        result = await session.call_tool(TOOL_NAME, moment.identity.model_dump())
        assert result.structuredContent["reason"] == "context_mismatch"
