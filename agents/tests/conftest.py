"""Shared test data: the stats engine's own moments for its fixture match (KES v ORR, seed 1017)."""
import json
from pathlib import Path

import pytest

MOMENTS_FILE = Path(__file__).resolve().parents[2] / "mcp_server" / "tests" / "data" / "SYN-1017-moments.json"


@pytest.fixture(scope="session")
def moments():
    return json.loads(MOMENTS_FILE.read_text(encoding="utf-8"))


class Clock:
    def __init__(self, t=1_000.0):
        self.t = t

    def __call__(self):
        return self.t


@pytest.fixture
def clock():
    return Clock()
