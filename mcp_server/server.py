"""Read-only MCP stdio tools for one bound moment. Spec: mcp_server/specs/tools.md §§2, 2b, 5."""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from mcp.shared.exceptions import McpError

from .data_access import make_reader
from .schema import INPUT_LIMIT, Identity, Reply, ToolReply, encoded
from .tools.base import AnalystTool, BoundSession
from .tools.compare_periods import ComparePeriodsTool
from .tools.live_state import LiveStateTool
from .tools.match_state import MatchStateTool
from .tools.pass_network import PassNetworkTool
from .tools.player_context import PlayerContextTool
from .tools.pressing import TeamPressingTool

ANALYST_TOOLS = (LiveStateTool, PlayerContextTool, TeamPressingTool, PassNetworkTool, ComparePeriodsTool)

TOOL_NAME = "get_match_state"
SAMPLE_DIR = Path(__file__).parent / "samples"
DESCRIPTION = ("Read immutable context for this exact moment, not the latest state. "
               "Numeric context is not additional narration evidence. Do not guess unavailable context.")


READ_ONLY = types.ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)


def build_server(tool: MatchStateTool, analyst_tools: list[AnalystTool] | None = None) -> Server:
    app = Server("overlap-moment-context")
    analysts = {t.name: t for t in analyst_tools or []}

    @app.list_tools()
    async def list_tools():
        return [types.Tool(name=TOOL_NAME, description=DESCRIPTION,
                           inputSchema=Identity.model_json_schema(), outputSchema=Reply.model_json_schema(),
                           annotations=READ_ONLY),
                *(types.Tool(name=t.name, description=t.description,
                             inputSchema=t.request_model.model_json_schema(),
                             outputSchema=ToolReply.model_json_schema(), annotations=READ_ONLY)
                  for t in analysts.values())]

    async def call_tool(request: types.CallToolRequest) -> types.ServerResult:
        # Low-level registration preserves JSON-RPC InvalidParams for malformed calls.
        try:
            raw = request.params.arguments
            name = request.params.name
            if (name != TOOL_NAME and name not in analysts) or len(encoded(raw)) > INPUT_LIMIT:
                raise ValueError("Invalid tool call")
            model = Identity if name == TOOL_NAME else analysts[name].request_model
            args = model.model_validate(raw)
        except (ValueError, TypeError):
            raise McpError(types.ErrorData(code=-32602, message="Invalid tool name or arguments")) from None
        reply = await (tool.call(args) if name == TOOL_NAME else analysts[name].call(args))
        payload = reply.payload()
        return types.ServerResult(types.CallToolResult(
            content=[types.TextContent(type="text", text=encoded(payload).decode())],
            structuredContent=payload, isError=False))

    app.request_handlers[types.CallToolRequest] = call_tool
    return app


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Local read-only moment MCP server (stdio)")
    p.add_argument("--source", choices=("fixture", "cosmos"), required=True)
    p.add_argument("--match-id", required=True)
    p.add_argument("--moment-id", required=True)
    p.add_argument("--evidence-version", type=int, default=1)
    p.add_argument("--fixture-dir", type=Path, default=SAMPLE_DIR)
    return p


async def serve(args) -> None:
    bound = Identity(match_id=args.match_id, moment_id=args.moment_id, evidence_version=args.evidence_version)
    if bound.match_id[4:] != bound.moment_id[3:7]:
        raise ValueError("Configured match and moment IDs disagree")
    reader = make_reader(args.source, args.fixture_dir)
    try:
        session = BoundSession(reader, bound)
        app = build_server(MatchStateTool(reader, bound), [cls(session) for cls in ANALYST_TOOLS])
        async with stdio_server() as (incoming, outgoing):
            await app.run(incoming, outgoing, app.create_initialization_options())
    finally:
        await reader.close()


def main() -> None:
    logging.basicConfig(level=logging.ERROR)
    args = parser().parse_args()
    try:
        asyncio.run(serve(args))
    except (ValueError, OSError):
        parser().exit(1, "MCP configuration/startup failed; check local settings and bound IDs.\n")


if __name__ == "__main__":
    main()
