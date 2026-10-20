"""Template lines for every real moment. Spec: agents/specs/workflow.md §4, fact-checking.md §1."""
import pytest

from config import MODES
from fallbacks import template
from validate import InvalidMoment, validate_moment
from workflow import numeric_check


def test_every_moment_validates(moments):
    for m in moments:
        assert validate_moment(m) is m


@pytest.mark.parametrize("mode", MODES)
def test_every_template_passes_the_numeric_check(moments, mode):
    for m in moments:
        line = template(m, mode)
        assert line["lang"] == "en" and line["mode"] == mode
        assert numeric_check(line, m) == [], (m["id"], line["text"])


def test_template_wording(moments):
    by_id = {m["id"]: m for m in moments}
    assert template(by_id["MO-1017-0013"], "casual")["text"] == \
        "Kestlebury United have taken 3 shots in the last 5 minutes."
    assert template(by_id["MO-1017-0014"], "casual")["text"].endswith("are down to 10.")
    goal = template(by_id["MO-1017-0012"], "analyst")
    assert goal["text"].startswith("Goal for Kestlebury United:") and goal["text"].endswith("3–0.")
    for m in moments:
        text = template(m, "casual")["text"].lower()
        assert "possession" not in text and "tired" not in text


def test_press_direction_comes_from_the_rates(moments):
    for m in (m for m in moments if m["evidence"]["trigger"] == "press_change"):
        f = {x["key"]: x["value"] for x in m["evidence"]["facts"]}
        text = template(m, "casual")["text"]
        harder = f["pressures_per_opp_pass_last_5min"] > f["pressures_per_opp_pass_previous_10min"]
        assert ("pressing harder" in text) == harder and ("pressing less" in text) == (not harder)


def test_invalid_documents_are_rejected(moments):
    bad = {**moments[0], "evidence": {**moments[0]["evidence"], "trigger": "sprint"}}
    with pytest.raises(InvalidMoment):
        validate_moment(bad)
    with pytest.raises(InvalidMoment):
        validate_moment({"kind": "insight_job"})


def test_a_wrong_claim_is_caught(moments):
    m = next(x for x in moments if x["evidence"]["trigger"] == "shot_cluster")
    line = template(m, "casual")
    assert numeric_check({**line, "text": line["text"].replace("3 shots", "4 shots")}, m)
    assert numeric_check({**line, "claims": line["claims"][:1]}, m)
