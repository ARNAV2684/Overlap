"""Real MCP smoke client and offline workflow handoff. Spec: mcp_server/specs/tools.md §§5–6."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

import jsonschema
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult, TextContent

from .data_access import bounded_read, make_reader
from .sample import SAMPLE_FILE
from .schema import (
    OUTPUT_LIMIT,
    Identity,
    Moment,
    Reply,
    clean_document,
    encoded,
    parse_moment,
    projection,
    read_json,
)
from .server import ANALYST_TOOLS, SAMPLE_DIR, TOOL_NAME

ADVERTISED = {TOOL_NAME, *(t.name for t in ANALYST_TOOLS)}


def server_parameters(identity: Identity, source: str, directory: Path) -> StdioServerParameters:
    env = {key: os.environ[key] for key in
           ("OVERLAP_COSMOS_ENDPOINT", "OVERLAP_COSMOS_KEY", "OVERLAP_COSMOS_DATABASE") if key in os.environ}
    return StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_server.server", "--source", source,
              "--match-id", identity.match_id, "--moment-id", identity.moment_id,
              "--evidence-version", str(identity.evidence_version), "--fixture-dir", str(directory.resolve())],
        env=env if source == "cosmos" else {})


@asynccontextmanager
async def session_for(identity: Identity, source: str, directory: Path = SAMPLE_DIR):
    async with (
        stdio_client(server_parameters(identity, source, directory)) as (incoming, outgoing),
        ClientSession(incoming, outgoing, read_timeout_seconds=timedelta(seconds=6)) as session,
    ):
        await session.initialize()
        yield session


def validated_result(result: CallToolResult, expected: Moment, source: str, output_schema: dict) -> dict:
    if result.isError or result.structuredContent is None:
        raise ValueError("MCP returned an execution error or no structured result")
    payload = result.structuredContent
    if len(encoded(payload)) > OUTPUT_LIMIT:
        raise ValueError("MCP result exceeds limit")
    jsonschema.validate(payload, output_schema)
    reply = Reply.model_validate(payload)
    if reply.status != "ok":
        raise ValueError(f"MCP did not return context: {reply.reason}")
    if reply.payload() != projection(expected, source).payload():
        raise ValueError("MCP result differs from the bound evidence/context or source")
    if len(result.content) != 1 or not isinstance(result.content[0], TextContent):
        raise ValueError("MCP result must have exactly one equivalent JSON text block")
    if json.loads(result.content[0].text) != payload:
        raise ValueError("Structured and text results disagree")
    return payload


async def check(source: str, expected_path: Path, directory: Path) -> dict:
    expected_raw = read_json(expected_path)
    expected = parse_moment(expected_raw)
    reader = make_reader(source, directory)
    try:
        # The workflow loads its evidence from the chosen store. The sample is only the test oracle.
        actual_raw = await bounded_read(reader, expected.identity)
    finally:
        await reader.close()
    actual = parse_moment(actual_raw)
    if clean_document(actual_raw) != clean_document(expected_raw):
        raise ValueError("Stored sample does not match the expected source")
    async with session_for(actual.identity, source, directory) as session:
        discovered = {t.name: t for t in (await session.list_tools()).tools}
        if set(discovered) != ADVERTISED or not all(t.annotations and t.annotations.readOnlyHint
                                                    for t in discovered.values()):
            raise ValueError("Only the implemented read-only tools may be advertised")
        tool = discovered[TOOL_NAME]
        if not tool.outputSchema:
            raise ValueError("Tool is missing its output schema")
        jsonschema.validate(actual.identity.model_dump(), tool.inputSchema)
        result = await session.call_tool(TOOL_NAME, actual.identity.model_dump())
        payload = validated_result(result, actual, source, tool.outputSchema)
    return {
        "status": "passed", "data_kind": "source_derived_fixture", "transport": "mcp_stdio",
        "checks": ["source_readback", "initialise", "tools_list", "tools_call", "exact_context", "text_parity"],
        "model_called": False, "live_delivery": False,
        "source_document_sha256": hashlib.sha256(encoded(clean_document(actual_raw))).hexdigest(),
        "workflow_input": {
            "evidence": actual.evidence.model_dump(exclude_none=True),
            "context_result": payload,
        },
        "next_step": "Foundry access, budget and the M3 workflow implementation are still required.",
    }


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, delete=False) as stream:
            temp = Path(stream.name)
            stream.write(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False).encode() + b"\n")
        os.replace(temp, path)
    finally:
        if temp and temp.exists():
            temp.unlink()


async def run_check(source: str, expected_path: Path, directory: Path) -> dict:
    async with asyncio.timeout(20):
        return await check(source, expected_path, directory)


def main() -> None:
    logging.basicConfig(level=logging.ERROR)
    p = argparse.ArgumentParser(description="Read a stored sample through MCP; make no model calls")
    p.add_argument("--source", choices=("fixture", "cosmos"), required=True)
    p.add_argument("--expected-sample", type=Path, default=SAMPLE_FILE)
    p.add_argument("--fixture-dir", type=Path, default=SAMPLE_DIR)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    if args.output.resolve() == args.expected_sample.resolve():
        p.error("Output must not replace the expected sample")
    try:
        report = asyncio.run(run_check(args.source, args.expected_sample, args.fixture_dir))
        write_report(args.output, report)
        print(f"PASS: {TOOL_NAME} via MCP stdio, source={args.source}; report={args.output}")
    except Exception:  # noqa: BLE001 -- CLI boundary redacts SDK/transport errors, including ExceptionGroup.
        p.exit(1, "MCP check failed; no success report written. Check source settings, source JSON and "
                  "MCP diagnostics. An older report, if present, is not evidence for this run.\n")


if __name__ == "__main__":
    main()
