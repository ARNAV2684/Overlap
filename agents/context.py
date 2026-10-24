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
import logging
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
# The server is a child process that inherits only a minimal environment (PATH, TEMP...), so on Azure the managed
# identity settings the host gives this process are passed on, or DefaultAzureCredential can't sign in.
IDENTITY_ENV = ("AZURE_CLIENT_ID", "AZURE_TENANT_ID", "AZURE_FEDERATED_TOKEN_FILE", "AZURE_AUTHORITY_HOST",
                "IDENTITY_ENDPOINT", "IDENTITY_HEADER", "MSI_ENDPOINT", "MSI_SECRET")


class ContextUnavailable(RuntimeError):
    """The context can't be read now (missing, not ready, timeout, server down)."""


class ContextRejected(RuntimeError):
    """The server refused the scope or returned another moment's context: an integration error."""


log = logging.getLogger("agents.context")


def _describe(e: BaseException) -> str:
    """One line for the log: the error types and messages, through task groups' wrappers."""
    if isinstance(e, BaseExceptionGroup):
        return "; ".join(_describe(x) for x in e.exceptions)
    return f"{type(e).__name__}: {e}"[:300]


def mcp_python(settings: Settings) -> str:
    """The setting; else mcp_server/.venv (local development); else this Python: the Functions package ships the
    server beside the agents with the same packages, no second venv."""
    if settings.mcp_python:
        return settings.mcp_python
    venv = ROOT / "mcp_server" / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    return str(venv) if venv.exists() else sys.executable


def mcp_env(settings: Settings, python: str) -> dict[str, str]:
    env = {k: os.environ[k] for k in (*COSMOS_ENV, *IDENTITY_ENV) if k in os.environ} \
        if settings.mcp_source == "cosmos" else {}
    if python == sys.executable:
        # mcp_server is a folder beside agents/, not installed. The package folders inside the app go along too: on
        # Azure the packages (mcp among them) sit in the Functions build's .python_packages folder, which the worker
        # adds to its own path but a child Python would not see (every card fell back to a template, 24 Oct). Only
        # folders inside the app: the worker's own libraries, also on its path, must not shadow the app's packages
        root = ROOT.resolve()
        extra = [p for p in sys.path if p and Path(p).resolve() != root and Path(p).resolve().is_relative_to(root)
                 and os.path.isdir(p)]
        env["PYTHONPATH"] = os.pathsep.join([str(ROOT), *extra])
    return env


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
        python = mcp_python(s)
        self.tool = MCPStdioTool("overlap-moment-context", python, args=args, env=mcp_env(s, python), load_prompts=False,
                                 allowed_tools=TOOLS, request_timeout=max(1, round(s.mcp_timeout_s * 2)),
                                 parse_tool_results=_structured)
        try:
            await asyncio.wait_for(self.tool.connect(), timeout=s.mcp_timeout_s * 5)
        except Exception as e:                               # server missing, failed to start, or too slow
            await self._close()
            log.warning("MCP server did not start for %s: %s", self.identity["moment_id"], _describe(e))
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
