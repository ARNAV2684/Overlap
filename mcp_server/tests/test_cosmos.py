"""Opt-in real emulator + subprocess check. Spec: mcp_server/specs/tools.md §6."""

import os

import pytest
from mcp_server.client import run_check, session_for
from mcp_server.sample import SAMPLE_FILE, seed
from mcp_server.schema import Identity
from mcp_server.server import SAMPLE_DIR, TOOL_NAME

pytestmark = [
    pytest.mark.cosmos,
    pytest.mark.anyio,
    pytest.mark.skipif(os.environ.get("OVERLAP_TEST_COSMOS") != "1", reason="Opt-in local emulator"),
]


async def test_seed_read_mcp_and_reseed():
    first = await seed(SAMPLE_FILE)
    assert first["status"] in ("created", "already_present")
    report = await run_check("cosmos", SAMPLE_FILE, SAMPLE_DIR)
    assert report["workflow_input"]["context_result"]["provenance"]["source"] == "cosmos"
    assert report["workflow_input"]["evidence"]["facts"][0]["value"] == 3
    assert report["model_called"] is False
    assert (await seed(SAMPLE_FILE))["status"] == "already_present"


async def test_missing_cosmos_item_does_not_fall_back_to_fixture():
    missing = Identity(match_id="SYN-1017", moment_id="MO-1017-9999", evidence_version=1)
    async with session_for(missing, "cosmos") as session:
        result = await session.call_tool(TOOL_NAME, missing.model_dump())
        assert result.structuredContent["status"] == "unavailable"
        assert result.structuredContent["reason"] == "not_found"
