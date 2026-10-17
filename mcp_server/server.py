"""One MCP stdio tool. Spec: mcp_server/specs/tools.md §5."""

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
from .schema import INPUT_LIMIT, Identity, Reply, encoded
from .tools.match_state import MatchStateTool

TOOL_NAME = "get_match_state"
SAMPLE_DIR = Path(__file__).parent / "samples"
DESCRIPTION = ("Read immutable context for this exact moment, not the latest state. "
               "Numeric context is not additional narration evidence. Do not guess unavailable context.")


def build_server(tool: MatchStateTool) -> Server:
    app = Server("overlap-moment-context")

    @app.list_tools()
    async def list_tools():
        return [types.Tool(name=TOOL_NAME, description=DESCRIPTION,
                           inputSchema=Identity.model_json_schema(), outputSchema=Reply.model_json_schema(),
                           annotations=types.ToolAnnotations(readOnlyHint=True, destructiveHint=False,
                                                             openWorldHint=False))]

    async def call_tool(request: types.CallToolRequest) -> types.ServerResult:
        # Low-level registration preserves JSON-RPC InvalidParams for malformed calls.
        try:
            raw = request.params.arguments
            if request.params.name != TOOL_NAME or len(encoded(raw)) > INPUT_LIMIT:
                raise ValueError("Invalid tool call")
            identity = Identity.model_validate(raw)
        except (ValueError, TypeError):
            raise McpError(types.ErrorData(code=-32602, message="Invalid tool name or arguments")) from None
        reply = await tool.call(identity)
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
        app = build_server(MatchStateTool(reader, bound))
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
