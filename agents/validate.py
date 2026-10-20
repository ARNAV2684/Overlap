# validate.py — Moment validation
#
# Purpose: check a moment document before any agent touches it, with the MCP reader's schema
# Inputs:  a moment document from Cosmos `moments`
# Outputs: the validated document, or InvalidMoment
# Spec:    mcp_server/specs/tools.md §2a; agents/specs/workflow.md §1 (Validate)
#
# One source of truth for the moment shape: `mcp_server/schema.py`, loaded by path (it depends only on pydantic).

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCHEMA_FILE = Path(__file__).resolve().parents[1] / "mcp_server" / "schema.py"
_MODULE = "overlap_moment_schema"


class InvalidMoment(ValueError):
    """The document isn't a moment the stats engine writes; it is rejected, with no model call."""


def _schema():
    module = sys.modules.get(_MODULE)
    if module is None:
        spec = importlib.util.spec_from_file_location(_MODULE, SCHEMA_FILE)
        if spec is None or spec.loader is None:
            raise ImportError(f"moment schema not found at {SCHEMA_FILE}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[_MODULE] = module
        spec.loader.exec_module(module)
    return module


def validate_moment(doc: dict) -> dict:
    """The document unchanged if it is a valid moment; InvalidMoment otherwise."""
    if not isinstance(doc, dict) or doc.get("kind") != "moment":
        raise InvalidMoment("not a moment document")
    try:
        _schema().parse_moment(doc)
    except (ValueError, TypeError) as e:
        raise InvalidMoment(f"{doc.get('id', '?')}: invalid moment") from e
    return doc
