from datetime import date

import duckdb
import pandas as pd
import pytest

from api.app.narrator.facts import build_facts, from_contract
from api.app.narrator.narrate import narrate
from pipeline.reports import build_report, event_record, storm_label, with_narrative

CONTRACT_KEYS = {
    "report_id", "location", "base_offer", "outlook", "events", "backup", "sizing", "live", "narrative", "sources",
}


def _event(**overrides) -> dict:
    row = {
        "id": "48201-2024-07-08", "county_fips": "48201",
        "start": pd.Timestamp("2024-07-08 14:15", tz="UTC"), "end": pd.Timestamp("2024-07-12", tz="UTC"),
        "peak_out": 1.0, "peak_out_pct": 90.86, "customer_hours": 100.0,
        "p50_h_rotate": 1.75, "p90_h_rotate": 42.25, "share_12h_rotate": 0.5,
        "p50_h_stay": 1.75, "p90_h_stay": 29.15, "share_12h_stay": 0.6,
        "backup_h_1": 20.1, "backup_h_2": 38.5,
    }
    for order in ("rotate", "stay"):
        for n in (1, 2):
            row[f"covered_{order}_{n}_homes"] = 0.5 + 0.1 * n
            row[f"covered_{order}_{n}_hours"] = 0.4 + 0.1 * n
    row.update(overrides)
    return row


@pytest.fixture
def con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    frames = {
        "outlook": pd.DataFrame([{
            "county_fips": "48201", "weather_zone": "COAST", "long_outages_per_year": 0.323, "lo90": 0.085,
            "hi90": 0.686, "years_of_data": 8.0, "level": 4, "label": "High", "once_every_years": 3.097,
        }]),
        "events": pd.DataFrame([
            _event(),
            _event(id="48201-2021-09-13", start=pd.Timestamp("2021-09-14 02:30", tz="UTC"),
                   end=pd.Timestamp("2021-09-15", tz="UTC"), customer_hours=10.0, peak_out_pct=6.5),
        ]),
        "backup_monthly": pd.DataFrame([
            {"county_fips": "48201", "mode": mode, "cores": n, "month": m, "hours": 10.0 * n + m}
            for mode in ("normal", "storm") for n in (1, 2) for m in range(1, 13)
        ]),
        "sizing": pd.DataFrame([{
            "county_fips": "48201", "cores": 2, "reason": "Two Cores would have covered 63%.", "order": "stay",
            "stay_share_1": 0.48, "stay_share_2": 0.637, "rotate_share_1": 0.5, "rotate_share_2": 0.67,
        }]),
        "assumptions": pd.DataFrame({
            "name": ["kwh_per_core", "kw_per_core", "start_soc", "backup_profile_year"],
            "value": [39.2, 20.0, 1.0, 2024.0],
        }),
    }
    for name, frame in frames.items():
        con.register("frame", frame)
        con.execute(f"create table {name} as select * from frame")
        con.unregister("frame")
    return con


def test_storm_label_names_known_windows_and_falls_back_to_month():
    labels = (("2024-07-08", "2024-07-10", "Hurricane Beryl"),)
    assert storm_label(date(2024, 7, 9), labels) == "Hurricane Beryl"
    assert storm_label(date(2024, 7, 11), labels) == "July 2024 outage"


def test_event_record_uses_central_time_and_the_chosen_order():
    record = event_record(pd.Series(_event()), order="stay")
    assert record["start"] == "2024-07-08T09:15:00-05:00"
    assert record["duration_h"]["p90"] == [42.2, 29.1]
    assert record["covered"]["cores_2"] == {"homes": 0.7, "hours": 0.6}
    assert record["covered_order"] == "stay"


def test_build_report_has_every_contract_key(con):
    zones = pd.Series({"48201": "COAST"})
    report = build_report(con, "48201", zones)
    assert CONTRACT_KEYS <= set(report)
    assert report["location"]["load_zone"] == "LZ_HOUSTON"
    assert report["outlook"]["interval_90"] == [0.085, 0.686]
    assert [event["id"] for event in report["events"]] == ["48201-2024-07-08", "48201-2021-09-13"]
    assert report["backup"]["hours_by_month"]["cores_1"][0] == 11.0
    assert report["sizing"] == {"cores": 2, "reason": "Two Cores would have covered 63%.", "share": 0.637}


def test_build_report_refuses_non_demo_counties(con):
    with pytest.raises(ValueError, match="not a demo county"):
        build_report(con, "48001", pd.Series({"48001": "EAST"}))


def test_contract_report_feeds_the_narrator(con):
    report = build_report(con, "48201", pd.Series({"48201": "COAST"}))
    facts = {fact.id: fact.text for fact in build_facts(from_contract(report))}
    assert facts["county.name"] == "Harris County"
    assert facts["event.1.p90_hours"] == "about 29 hours for the longest-waiting tenth"
    assert narrate(from_contract(report))["status"] == "template"


def test_template_narrative_marks_the_llm_degraded(con):
    report = with_narrative(build_report(con, "48201", pd.Series({"48201": "COAST"})), None)
    assert report["narrative"]["status"] == "template"
    assert report["sources"][-1] == {"id": "llm", "status": "degraded", "fallback": "template"}


def test_surprise_mode_is_reported_when_present(con):
    rows = [{"county_fips": "48201", "mode": "surprise", "cores": n, "month": m, "hours": 2.0 * n}
            for n in (1, 2) for m in range(1, 13)]
    con.register("extra", pd.DataFrame(rows))
    con.execute("insert into backup_monthly select * from extra")
    con.execute("insert into assumptions values ('reserve_soc', 0.2)")
    report = build_report(con, "48201", pd.Series({"48201": "COAST"}))
    assert report["backup"]["surprise"]["start_soc"] == 0.2
    assert report["backup"]["surprise"]["hours_by_month"]["cores_2"] == [4.0] * 12
    assert report["backup"]["hours_by_month"]["cores_1"][0] == 11.0
