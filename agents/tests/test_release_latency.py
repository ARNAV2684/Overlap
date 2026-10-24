"""Real in-memory MCP protocol isolation and bounded narrator concurrency; no paid calls."""
import asyncio
import json
from types import SimpleNamespace

import pytest

import narrator
from config import Settings
from context import ContextRejected, mcp_context
from models import ModelFailed
from tests.fakes import good
from tests.test_agents import by_id


def test_embedded_protocol_is_bound_and_no_subprocess(moments, tmp_path, monkeypatch):
    chosen = by_id(moments, "MO-1017-0013")
    (tmp_path / f"{chosen['moment_id']}.json").write_text(json.dumps(chosen))
    settings = Settings(mcp_source="fixture", mcp_fixture_dir=str(tmp_path))

    async def forbidden(*args, **kwargs):
        raise AssertionError("embedded MCP must not launch a subprocess")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)

    async def check():
        async with mcp_context(settings)(chosen) as ctx:
            reply = await ctx.call("get_match_state")
            assert reply["moment_id"] == chosen["moment_id"]
            bad = await ctx.tool.session.call_tool("get_match_state", {
                **ctx.identity, "moment_id": "MO-1017-9999"})
            assert bad.structuredContent["status"] == "denied"
            with pytest.raises(ContextRejected):
                await ctx.call("write_match")
        assert ctx.tool is None
    asyncio.run(check())


@pytest.mark.parametrize("fail_second", [False, True])
def test_narrator_chunks_overlap_and_preserve_partial_success(moments, fail_second):
    moment = by_id(moments, "MO-1017-0013")
    active, peak = 0, 0
    calls = []
    async def ask(name, payload, schema):
        nonlocal active, peak
        calls.append(payload)
        index = len(calls)
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        if fail_second and index == 2:
            raise ModelFailed("timeout")
        return schema.model_validate(good(name, {**payload, "_moment": moment}))
    fake = SimpleNamespace(moment=moment, deps=SimpleNamespace(settings=Settings()), ask=ask,
                           output=lambda stage: {"model": True, "context": "ok"})
    result = asyncio.run(narrator.run(fake))
    assert len(calls) == 2 and peak == 2
    requested = [line["id"] for p in calls for line in p["lines"]]
    assert len(requested) == len(set(requested)) == len(result["lines"])
    expected = {line["id"] for p in calls[:1 if fail_second else 2] for line in p["lines"]}
    assert set(result["model_ids"]) == expected


def test_transport_setting_rejects_unknown():
    with pytest.raises(ValueError):
        Settings.from_env({"OVERLAP_MCP_TRANSPORT": "unrestricted"})


def test_embedded_concurrent_moments_keep_separate_scopes(moments, tmp_path):
    chosen = moments[:2]
    for moment in chosen:
        (tmp_path / f"{moment['moment_id']}.json").write_text(json.dumps(moment))
    settings = Settings(mcp_source="fixture", mcp_fixture_dir=str(tmp_path))

    async def one(moment):
        async with mcp_context(settings)(moment) as ctx:
            await asyncio.sleep(0)
            reply = await ctx.call("get_match_state")
            assert reply["moment_id"] == moment["moment_id"]
            return reply["state"]

    async def check():
        return await asyncio.gather(*(one(moment) for moment in chosen))
    assert len(asyncio.run(check())) == 2
