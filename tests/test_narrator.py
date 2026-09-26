import json

import pytest

from api.app.narrator.facts import build_facts
from api.app.narrator.narrate import narrate
from api.app.narrator.prompt import parse_reply
from api.app.narrator.template import template_narrative
from api.app.narrator.validate import reading_grade, validate


def _report() -> dict:
    return {
        "county": {"fips": "48201", "name": "Harris"},
        "home": {"label": "gas heat"},
        "outlook": {
            "label": "High", "long_outages_per_year": 0.323, "once_every_years": 3.097,
            "years_of_data": 8.0, "since": 2018,
        },
        "events": [{
            "id": "48201-2024-07-08", "start": "2024-07-08T09:15:00-05:00", "peak_out_pct": 90.86,
            "duration_h": {"p50": [1.75, 1.75], "p90": [42.25, 29.15]},
        }],
        "backup": {"hours_by_month": {
            "cores_1": [41.7, 40.7, 37.6, 26.2, 19.6, 16.6, 16.8, 15.4, 18.0, 20.7, 32.2, 40.9],
            "cores_2": [82.0, 79.7, 69.3, 52.8, 39.9, 30.6, 32.9, 24.9, 36.1, 42.4, 61.8, 79.1],
        }},
        "sizing": {"cores": 2, "share": 0.637},
    }


GOOD = {
    "headline": "High outlook for long outages in Harris County",
    "summary": "Homes in Harris County lose power for 12 hours or more about once every 3 years. "
               "One Core lasts about 15 hours in August. Base confirms sizing at install.",
    "fact_ids": ["county.name", "outlook.label", "threshold.hours", "outlook.once_every_years", "backup.short_month"],
}


def test_template_passes_every_check():
    report = _report()
    narrative = template_narrative(report)
    assert validate(narrative, build_facts(report)) == []
    assert "91% of homes" in narrative["summary"]
    assert "63% of past long outage hours" in narrative["summary"]


def test_a_good_reply_passes():
    assert validate(GOOD, build_facts(_report())) == []


def test_a_number_not_in_the_facts_fails():
    bad = {**GOOD, "summary": GOOD["summary"].replace("15 hours", "18 hours")}
    assert "number 18 does not match a cited fact" in validate(bad, build_facts(_report()))


def test_a_true_number_must_still_be_cited():
    bad = {**GOOD, "fact_ids": [item for item in GOOD["fact_ids"] if item != "backup.short_month"]}
    assert "number 15 does not match a cited fact" in validate(bad, build_facts(_report()))


def test_unknown_fact_ids_fail():
    bad = {**GOOD, "fact_ids": [*GOOD["fact_ids"], "made.up"]}
    assert "unknown fact ids: made.up" in validate(bad, build_facts(_report()))


@pytest.mark.parametrize("phrase", ["We guarantee it.", "You will never lose power.", "A deadly storm."])
def test_banned_phrases_fail(phrase):
    bad = {**GOOD, "summary": f"{GOOD['summary']} {phrase}"}
    assert any(problem.startswith("banned phrase") for problem in validate(bad, build_facts(_report())))


def test_length_caps():
    bad = {**GOOD, "headline": "word " * 13, "summary": "Short words. " * 70}
    problems = validate(bad, build_facts(_report()))
    assert "headline has 13 words; the cap is 12" in problems
    assert "summary has 140 words; the cap is 120" in problems


def test_dense_prose_fails_the_reading_grade():
    dense = (
        "Probabilistic characterization of distribution-level interruption frequency "
        "necessitates hierarchical Bayesian regularization of heterogeneous county estimates."
    )
    assert reading_grade(dense) > 7
    assert any("reading grade" in problem for problem in validate({**GOOD, "summary": dense}, build_facts(_report())))


def _model(*replies):
    calls = []

    def call(system: str, user: str, timeout: float) -> str:
        calls.append(user)
        reply = replies[len(calls) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply

    return call, calls


def test_first_good_reply_is_used():
    call, _ = _model(json.dumps(GOOD))
    result = narrate(_report(), call)
    assert result["status"] == "ok" and result["summary"] == GOOD["summary"]


def test_one_retry_carries_the_failure_reasons():
    wrong = {**GOOD, "summary": GOOD["summary"].replace("15 hours", "18 hours")}
    call, calls = _model(json.dumps(wrong), json.dumps(GOOD))
    result = narrate(_report(), call)
    assert result["status"] == "retried" and result["attempts"] == 2
    assert "number 18 does not match a cited fact" in calls[1]


def test_two_failures_fall_back_to_the_template():
    wrong = {**GOOD, "summary": "We guarantee 99% uptime."}
    call, calls = _model(json.dumps(wrong), json.dumps(wrong))
    result = narrate(_report(), call)
    assert result["status"] == "template" and len(calls) == 2
    assert result["summary"] == template_narrative(_report())["summary"]


def test_a_timeout_falls_back_to_the_template():
    call, _ = _model(TimeoutError("8s"), TimeoutError("8s"))
    result = narrate(_report(), call)
    assert result["status"] == "template"
    assert result["failures"][0] == ["model call failed: TimeoutError: 8s"]


def test_no_model_uses_the_template():
    assert narrate(_report())["status"] == "template"


def test_parse_reply_accepts_a_code_fence():
    assert parse_reply("```json\n" + json.dumps(GOOD) + "\n```")["headline"] == GOOD["headline"]


def test_one_core_hours_written_as_two_cores_fail():
    bad = {**GOOD, "summary": "Homes in Harris County lose power for 12 hours or more about once every 3 years. "
                              "Two Cores last about 15 hours in August. Base confirms sizing at install."}
    problems = validate(bad, build_facts(_report()))
    assert problems == ['out of context: 15 should read like "about 15 hours on one Core in August", or cite the fact this number comes from']


def test_hours_named_after_the_number_count_as_context():
    ok = {**GOOD, "summary": "Homes in Harris County lose power for 12 hours or more about once every 3 years. "
                             "In August, expect about 15 hours on one Core, or about 25 hours on two Cores. "
                             "Base confirms sizing at install.",
          "fact_ids": GOOD["fact_ids"] + ["backup.short_month_two_cores"]}
    assert validate(ok, build_facts(_report())) == []


def test_a_rate_without_long_outage_words_fails():
    bad = {**GOOD, "summary": "Homes in Harris County lose power about once every 3 years. "
                              "One Core lasts about 15 hours in August. Base confirms sizing at install.",
           "fact_ids": ["county.name", "outlook.once_every_years", "backup.short_month"]}
    assert any(p.startswith("out of context: 3") for p in validate(bad, build_facts(_report())))


def test_a_clause_naming_two_core_counts_fails():
    bad = {**GOOD, "summary": "Homes in Harris County lose power for 12 hours or more about once every 3 years. "
                              "A system with 2 Cores covers about 15 hours on one Core in August. "
                              "Base confirms sizing at install.",
           "fact_ids": GOOD["fact_ids"] + ["sizing.cores"]}
    assert validate(bad, build_facts(_report())) == [
        'out of context: 15 should read like "about 15 hours on one Core in August", '
        'or cite the fact this number comes from'
    ]


def test_a_number_needs_its_fact_unit():
    facts = build_facts(_report())
    shaky = {**GOOD, "summary": "Homes in Harris County lose power for 12 hours or more about once every 3 years. "
                                "One Core lasts about 15% in August. Base confirms sizing at install."}
    assert validate(shaky, facts) == ['out of context: 15 should read like "about 15 hours on one Core in August", or cite the fact this number comes from']
