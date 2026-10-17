"""Local test sources. Spec: mcp_server/specs/tools.md §§2–6."""
import pytest
from mcp_server.sample import SAMPLE_FILE
from mcp_server.schema import parse_moment, read_json


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def document():
    return read_json(SAMPLE_FILE)


@pytest.fixture
def moment(document):
    return parse_moment(document)
