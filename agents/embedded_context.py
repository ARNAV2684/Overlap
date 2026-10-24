"""Per-moment MCP protocol sessions without launching a Python process.

Spec: mcp_server/specs/tools.md, agents/specs/workflow.md. Same read-only tools,
identity checks, retry budgets and server schemas as stdio; never share a bound session.
"""
from __future__ import annotations

import sys
from datetime import timedelta
from pathlib import Path

from context import ROOT, ContextUnavailable, McpContext, _structured

# The repository/Functions bundle ships mcp_server beside agents, not as an installed package.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class EmbeddedTool:
    def __init__(self, session, connection, reader):
        self.session, self.connection, self.reader = session, connection, reader

    async def call_tool(self, name, **arguments):
        return _structured(await self.session.call_tool(name, arguments))

    async def close(self):
        try:
            await self.connection.__aexit__(None, None, None)
        finally:
            await self.reader.close()


class EmbeddedMcpContext(McpContext):
    async def __aenter__(self):
        from mcp.shared.memory import create_connected_server_and_client_session
        from mcp_server.data_access import make_reader
        from mcp_server.schema import Identity
        from mcp_server.server import ANALYST_TOOLS, SAMPLE_DIR, build_server
        from mcp_server.tools.base import BoundSession
        from mcp_server.tools.match_state import MatchStateTool

        ident = Identity(**self.identity)
        if ident.match_id[4:] != ident.moment_id[3:7]:
            raise ContextUnavailable("mcp_invalid_binding")
        try:
            reader = make_reader(self.settings.mcp_source, Path(self.settings.mcp_fixture_dir or SAMPLE_DIR))
        except (ValueError, OSError) as error:
            raise ContextUnavailable("mcp_source_unavailable") from error
        bound = BoundSession(reader, ident)
        server = build_server(MatchStateTool(reader, ident), [tool(bound) for tool in ANALYST_TOOLS])
        connection = create_connected_server_and_client_session(
            server, read_timeout_seconds=timedelta(seconds=self.settings.mcp_timeout_s))
        entered = False
        try:
            # MCP's AnyIO cancel scopes must enter and exit in this same task. Unlike subprocess
            # startup this initializes local streams only, with no source/model I/O.
            session = await connection.__aenter__()
            entered = True
            await session.list_tools()
        except BaseException:
            try:
                if entered:
                    await connection.__aexit__(None, None, None)
            finally:
                await reader.close()
            raise
        self.tool = EmbeddedTool(session, connection, reader)
        return self
