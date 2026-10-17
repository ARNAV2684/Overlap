"""Create-only sample behaviour. Spec: mcp_server/specs/tools.md §6."""
from copy import deepcopy

import pytest
from azure.cosmos.exceptions import CosmosResourceExistsError
from mcp_server.sample import insert_once


class Container:
    def __init__(self, existing=None):
        self.saved = existing

    async def create_item(self, body):
        if self.saved is not None:
            raise CosmosResourceExistsError(status_code=409, message="exists")
        self.saved = deepcopy(body)

    async def read_item(self, item, partition_key):
        assert item == self.saved["id"] and partition_key == self.saved["match_id"]
        return {**self.saved, "_etag": "test"}


@pytest.mark.anyio
async def test_create_then_identical_seed(document):
    container = Container()
    assert await insert_once(container, document) == "created"
    assert await insert_once(container, document) == "already_present"
    assert container.saved == document


@pytest.mark.anyio
async def test_conflict_never_overwrites(document):
    existing = deepcopy(document)
    existing["context"]["score"]["home"] += 1
    container = Container(existing)
    with pytest.raises(ValueError, match="Conflicting"):
        await insert_once(container, document)
    assert container.saved == existing


@pytest.mark.anyio
async def test_invalid_sample_never_writes(document):
    document["kind"] = "insight_job"
    container = Container()
    with pytest.raises(ValueError):
        await insert_once(container, document)
    assert container.saved is None
