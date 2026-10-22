"""The Functions entry points read each message's properties the way the host delivers a batch (cardinality many)."""
import json

import azure.functions as func
from azure.functions import meta

import function_app as A


def batch(bodies: list[dict], props: list[dict]) -> list[func.EventHubEvent]:
    """Events as the Python worker builds them for a batch: every event shares the batch's metadata, with the
    application properties of all of them in PropertiesArray."""
    metadata = {"PropertiesArray": meta.Datum(json.dumps(props), "json"),
                "PartitionContext": meta.Datum(json.dumps({"PartitionId": "2"}), "json")}
    return [func.EventHubEvent(body=json.dumps(b).encode(), trigger_metadata=metadata, offset=100 + i)
            for i, b in enumerate(bodies)]


def test_each_message_gets_its_own_properties_from_the_batch():
    events = batch([{"match_id": "SYN-0801"}, {"match_id": "SYN-0801", "seq": 1}],
                   [{"kind": "setup", "match_id": "SYN-0801"}, {"kind": "event", "match_id": "SYN-0801"}])
    assert A._properties(events) == [{"kind": "setup", "match_id": "SYN-0801"},
                                     {"kind": "event", "match_id": "SYN-0801"}]
    messages = A._messages("match-events", events)
    assert [m.kind for m in messages] == ["setup", "event"]
    assert messages[1].where == "match-events/2/101"


def test_a_single_event_uses_its_own_properties():
    event = func.EventHubEvent(body=b"{}", trigger_metadata={
        "Properties": meta.Datum(json.dumps({"kind": "stats"}), "json")})
    assert A._properties([event]) == [{"kind": "stats"}]
