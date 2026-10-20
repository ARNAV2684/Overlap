# context.py — MCP context for the analyst
#
# Purpose: open the real MCP server (mcp_server/server.py, stdio) bound to one match, moment and evidence version,
#          through Agent Framework's MCPStdioTool, and call its read-only tools
# Inputs:  settings (Python of the MCP server, source cosmos or fixture); the moment
# Outputs: validated tool replies as dicts
# Spec:    mcp_server/specs/tools.md §1–§2b; agents/specs/workflow.md §1 (Context row), §4
#
# Unavailable or transient context → ContextUnavailable (the card uses its template). Denied scope, version or
# identity mismatch → ContextRejected (the job is rejected; a template must not hide an integration error).

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Self

from config import Settings

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ("get_match_state", "get_live_state", "get_player_context", "get_team_pressing", "get_pass_network",
         "compare_periods")
REJECT = {"outside_scope", "version_mismatch", "context_mismatch"}
COSMOS_ENV = ("OVERLAP_COSMOS_ENDPOINT", "OVERLAP_COSMOS_KEY", "OVERLAP_COSMOS_DATABASE")


class ContextUnavailable(RuntimeError):
    """The context can't be read now (missing, not ready, timeout, server down)."""


class ContextRejected(RuntimeError):
    """The server refused the scope or returned another moment's context: an integration error."""


def mcp_python(settings: Settings) -> str:
    if settings.mcp_python:
        return settings.mcp_python
    venv = ROOT / "mcp_server" / ".venv"
    return str(venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python"))


class McpContext:
    """One MCP server process per job, closed when the analyst is done."""

    def __init__(self, settings: Settings, moment: dict):
        self.settings, self.moment = settings, moment
        self.identity = {"match_id": moment["match_id"], "moment_id": moment["moment_id"],
                         "evidence_version": moment["evidence_version"]}
        self.tool: Any = None

    async def __aenter__(self) -> Self:
        from agent_framework import MCPStdioTool
        s, ident = self.settings, self.identity
        args = ["-m", "mcp_server.server", "--source", s.mcp_source, "--match-id", ident["match_id"],
                "--moment-id", ident["moment_id"], "--evidence-version", str(ident["evidence_version"])]
        if s.mcp_source == "fixture":
            args += ["--fixture-dir", str(Path(s.mcp_fixture_dir).resolve())]
        env = {k: os.environ[k] for k in COSMOS_ENV if k in os.environ} if s.mcp_source == "cosmos" else {}
        self.tool = MCPStdioTool("overlap-moment-context", mcp_python(s), args=args, env=env, load_prompts=False,
                                 allowed_tools=TOOLS, request_timeout=max(1, round(s.mcp_timeout_s * 2)),
                                 parse_tool_results=_structured)
        try:
            await asyncio.wait_for(self.tool.connect(), timeout=s.mcp_timeout_s * 5)
        except Exception as e:                               # server missing, failed to start, or too slow
            await self._close()
            raise ContextUnavailable("mcp_start_failed") from e
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self._close()

    async def _close(self) -> None:
        if self.tool is not None:
            with contextlib.suppress(Exception):             # closing a dead server must not hide the result
                await self.tool.close()
            self.tool = None

    async def call(self, tool: str, **args: Any) -> dict:
        """A tool reply with status `ok`; two attempts for transient failures (tools.md §5)."""
        if tool not in TOOLS:
            raise ContextRejected(f"tool_not_allowed:{tool}")
        reply: dict = {}
        for _ in range(2):
            try:
                text = await asyncio.wait_for(self.tool.call_tool(tool, **self.identity, **args),
                                              timeout=self.settings.mcp_timeout_s)
                reply = json.loads(text) if isinstance(text, str) and text else {}
            except Exception:  # noqa: BLE001 — timeout, transport or malformed reply: retried, then unavailable
                reply = {"status": "unavailable", "reason": "source_error"}
                continue
            if reply.get("status") == "ok" or reply.get("reason") in REJECT:
                break
        if reply.get("status") == "denied" or reply.get("reason") in REJECT:
            raise ContextRejected(f"{tool}:{reply.get('reason')}")
        if reply.get("status") != "ok":
            raise ContextUnavailable(f"{tool}:{reply.get('reason')}")
        if any(reply.get(k) != v for k, v in self.identity.items()):
            raise ContextRejected(f"{tool}:identity_mismatch")
        return reply


def _structured(result: Any) -> str:
    return json.dumps(result.structuredContent) if getattr(result, "structuredContent", None) is not None else ""


def mcp_context(settings: Settings):
    """The context factory for Deps: moment -> McpContext."""
    return lambda moment: McpContext(settings, moment)
