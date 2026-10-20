"""Analyst tools on real stats-engine data. Spec: mcp_server/specs/tools.md §2b.

`data/tools/` holds the stats engine's own output for its fixture match (KES v ORR, seed 1017) at the KES shot
cluster `MO-1017-0013` (65:34): the moment, `match_state` written right after it, and the archived panels the tools
read (the moment's second, ten minutes earlier, and the two minute panels with heavy blocks before it)."""

import copy
import json
import shutil
from pathlib import Path

import pytest
from mcp_server.client import session_for
from mcp_server.data_access import FixtureReader
from mcp_server.schema import Identity, PlayerRequest, TeamRequest, ToolReply
from mcp_server.server import TOOL_NAME
from mcp_server.tools.base import BoundSession
from mcp_server.tools.compare_periods import ComparePeriodsTool
from mcp_server.tools.live_state import LiveStateTool
from mcp_server.tools.pass_network import PassNetworkTool
from mcp_server.tools.player_context import PlayerContextTool
from mcp_server.tools.pressing import TeamPressingTool

DATA = Path(__file__).parent / "data" / "tools"
BOUND = Identity(match_id="SYN-1017", moment_id="MO-1017-0013", evidence_version=1)
ARGS = BOUND.model_dump()


class CountingReader(FixtureReader):
    def __init__(self, directory):
        super().__init__(directory)
        self.reads = 0

    async def read(self, identity):
        self.reads += 1
        return await super().read(identity)

    async def read_doc(self, container, match_id, doc_id):
        self.reads += 1
        return await super().read_doc(container, match_id, doc_id)


def tool(cls, directory=DATA):
    reader = CountingReader(directory)
    return cls(BoundSession(reader, BOUND)), reader


@pytest.mark.anyio
async def test_live_state_is_the_state_after_the_moment():
    t, _ = tool(LiveStateTool)
    reply = await t.call(BOUND)
    assert reply.status == "ok" and reply.after_moment is False
    assert reply.as_of.event_seq == 1592 and reply.provenance.container == "match_state"
    assert reply.data["score"] == {"home": 3, "away": 0}
    assert reply.data["panel"]["home"]["team_id"] == "KES" and "xg" in reply.data["totals"]["home"]
    ToolReply.model_validate(reply.payload())


@pytest.mark.anyio
async def test_player_context_without_tracking_leaves_speed_out():
    """The fixture match has no tracking, so the engine computed no speed or distance: left out, never zero."""
    t, _ = tool(PlayerContextTool)
    reply = await t.call(PlayerRequest(**ARGS, player_id="KES-11"))
    assert reply.status == "ok" and reply.data["player_id"] == "KES-11"
    assert {"name", "pos", "minutes", "passes"} <= set(reply.data)
    assert not {"top_speed_kmh", "distance_km", "sprints"} & set(reply.data)


@pytest.mark.anyio
async def test_player_context_with_tracking_has_speed_and_distance(tmp_path):
    shutil.copytree(DATA, tmp_path, dirs_exist_ok=True)
    path = tmp_path / "match_state" / "SYN-1017" / "state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    state["players"]["KES-11"].update(distance_km=7.9, top_speed_kmh=33.4, sprints=12)
    path.write_text(json.dumps(state), encoding="utf-8")
    reply = await tool(PlayerContextTool, tmp_path)[0].call(PlayerRequest(**ARGS, player_id="KES-11"))
    assert (reply.data["top_speed_kmh"], reply.data["distance_km"], reply.data["sprints"]) == (33.4, 7.9, 12)


@pytest.mark.anyio
async def test_pressing_and_pass_network_come_from_the_minute_before():
    t, _ = tool(TeamPressingTool)
    reply = await t.call(TeamRequest(**ARGS, team_id="KES"))
    assert reply.status == "ok" and reply.provenance.document_id == "stats-004140000"
    assert reply.as_of.match_ms <= 4174400 and reply.after_moment is False
    assert isinstance(reply.data["pressing_grid"], list)
    t, _ = tool(PassNetworkTool)
    reply = await t.call(TeamRequest(**ARGS, team_id="ORR"))
    assert reply.status == "ok" and 0 < len(reply.data["links"]) <= 40
    counts = [link["count"] for link in reply.data["links"]]
    assert counts == sorted(counts, reverse=True)


@pytest.mark.anyio
async def test_compare_periods_same_half_ten_minutes_apart():
    t, _ = tool(ComparePeriodsTool)
    reply = await t.call(TeamRequest(**ARGS, team_id="KES"))
    assert reply.status == "ok"
    assert (reply.data["earlier"]["clock"], reply.data["now"]["clock"]) == ("55:33", "65:33")
    assert reply.data["minutes_between"] == 10


@pytest.mark.anyio
@pytest.mark.parametrize("cls,request_args", [
    (LiveStateTool, {}), (PlayerContextTool, {"player_id": "KES-11"}), (TeamPressingTool, {"team_id": "KES"}),
])
async def test_other_match_or_moment_is_denied_without_reading(cls, request_args):
    t, reader = tool(cls)
    model = cls.request_model
    for other in ({"moment_id": "MO-1017-0012"}, {"match_id": "SYN-1018", "moment_id": "MO-1018-0013"}):
        reply = await t.call(model(**{**ARGS, **other, **request_args}))
        assert reply.status == "denied" and reply.reason == "outside_scope"
    assert reader.reads == 0


@pytest.mark.anyio
async def test_team_or_player_outside_the_match_is_denied():
    t, _ = tool(TeamPressingTool)
    assert (await t.call(TeamRequest(**ARGS, team_id="ZZZ"))).status == "denied"
    t, _ = tool(PlayerContextTool)
    assert (await t.call(PlayerRequest(**ARGS, player_id="ZZZ-10"))).status == "denied"


@pytest.mark.anyio
async def test_missing_sources_are_unavailable_not_guessed(tmp_path):
    shutil.copy(DATA / "MO-1017-0013.json", tmp_path / "MO-1017-0013.json")
    for cls, extra in ((LiveStateTool, {}), (TeamPressingTool, {"team_id": "KES"}),
                       (ComparePeriodsTool, {"team_id": "KES"})):
        reply = await tool(cls, tmp_path)[0].call(cls.request_model(**ARGS, **extra))
        assert reply.status == "unavailable" and reply.reason == "not_found" and reply.data is None


@pytest.mark.anyio
async def test_state_from_another_match_is_rejected(tmp_path):
    shutil.copytree(DATA, tmp_path, dirs_exist_ok=True)
    path = tmp_path / "match_state" / "SYN-1017" / "state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    path.write_text(json.dumps({**state, "match_id": "SYN-0001"}), encoding="utf-8")
    reply = await tool(LiveStateTool, tmp_path)[0].call(BOUND)
    assert reply.status == "unavailable" and reply.reason == "context_mismatch"


@pytest.mark.anyio
async def test_later_state_is_flagged_after_moment(tmp_path):
    shutil.copytree(DATA, tmp_path, dirs_exist_ok=True)
    path = tmp_path / "match_state" / "SYN-1017" / "state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    later = copy.deepcopy(state)
    later["source"]["event_seq"] = state["source"]["event_seq"] + 40
    path.write_text(json.dumps(later), encoding="utf-8")
    reply = await tool(LiveStateTool, tmp_path)[0].call(BOUND)
    assert reply.status == "ok" and reply.after_moment is True


@pytest.mark.anyio
async def test_two_attempts_per_tool_per_session():
    t, _ = tool(LiveStateTool)
    assert (await t.call(BOUND)).status == "ok"
    assert (await t.call(BOUND)).status == "ok"
    third = await t.call(BOUND)
    assert third.status == "unavailable" and third.reason == "source_not_ready"


@pytest.mark.anyio
async def test_protocol_lists_and_calls_every_tool():
    from mcp_server.client import validated_result  # noqa: F401 (import check only)
    async with session_for(BOUND, "fixture", DATA) as session:
        listed = {t.name: t for t in (await session.list_tools()).tools}
        assert set(listed) == {TOOL_NAME, "get_live_state", "get_player_context", "get_team_pressing",
                               "get_pass_network", "compare_periods"}
        assert all(t.annotations.readOnlyHint for t in listed.values())
        calls = {"get_live_state": ARGS, "get_player_context": {**ARGS, "player_id": "KES-10"},
                 "get_team_pressing": {**ARGS, "team_id": "ORR"}, "get_pass_network": {**ARGS, "team_id": "KES"},
                 "compare_periods": {**ARGS, "team_id": "ORR"}, TOOL_NAME: ARGS}
        for name, args in calls.items():
            result = await session.call_tool(name, args)
            assert not result.isError and result.structuredContent["status"] == "ok", name
            assert json.loads(result.content[0].text) == result.structuredContent
