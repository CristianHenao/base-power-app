import duckdb
import pandas as pd
import pytest

from api.app.narrator.facts import build_facts, from_contract
from api.app.narrator.narrate import narrate
from api.app.narrator.validate import validate
from pipeline.reports import base_offer, build_report, event_label, event_record, with_narrative

CONTRACT_KEYS = {
    "report_id", "location", "base_offer", "outlook", "events", "backup", "sizing", "live", "narrative", "sources",
}


def _event(fips: str = "48201", replayed: bool = True, **overrides) -> dict:
    row = {
        "id": f"{fips}-2024-07-08", "county_fips": fips, "storm": "Hurricane Beryl",
        "start": pd.Timestamp("2024-07-08 14:15", tz="UTC"), "end": pd.Timestamp("2024-07-12", tz="UTC"),
        "peak_out": 1.0, "peak_out_pct": 90.86, "customer_hours": 100.0,
        "p50_h_rotate": 30.8, "p90_h_rotate": 115.4, "share_12h_rotate": 0.5,
        "p50_h_stay": 73.4, "p90_h_stay": 175.0, "share_12h_stay": 0.6,
    }
    if replayed:
        row.update({"backup_h_1": 20.1, "backup_h_2": 38.5})
        for order in ("rotate", "stay"):
            for n in (1, 2):
                row[f"covered_{order}_{n}_homes"] = 0.1 * n
                row[f"covered_{order}_{n}_hours"] = 0.2 * n
    row.update(overrides)
    return row


def _monthly(key: dict) -> list[dict]:
    return [{**key, "mode": mode, "cores": n, "month": m, "hours": 10.0 * n + m + (0 if mode == "normal" else 100)}
            for mode in ("normal", "storm", "surprise") for n in (1, 2) for m in range(1, 13)]


@pytest.fixture
def con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    outlook_row = {"weather_zone": "COAST", "long_outages_per_year": 0.221, "lo90": 0.145, "hi90": 0.31,
                   "years_of_data": 8.0, "level": 4, "label": "High", "once_every_years": 4.52}
    frames = {
        "county_info": pd.DataFrame([
            {"county_fips": "48201", "county": "Harris", "weather_zone": "COAST", "utility_id": 8901,
             "utility_name": "CenterPoint Energy", "grid": "ERCOT", "load_zone": "LZ_HOUSTON"},
            {"county_fips": "48167", "county": "Galveston", "weather_zone": "COAST", "utility_id": 8901,
             "utility_name": "CenterPoint Energy", "grid": "ERCOT", "load_zone": "LZ_HOUSTON"},
        ]),
        "outlook": pd.DataFrame([{"county_fips": "48201", **outlook_row}, {"county_fips": "48167", **outlook_row}]),
        "events": pd.DataFrame([
            _event(),
            _event(id="48201-2021-09-13", storm=None, start=pd.Timestamp("2021-09-14 02:30", tz="UTC"),
                   end=pd.Timestamp("2021-09-15", tz="UTC"), customer_hours=10.0, peak_out_pct=6.5),
        ]),
        "events_texas": pd.DataFrame([_event(replayed=False), _event("48167", replayed=False)]),
        "backup_monthly": pd.DataFrame(_monthly({"county_fips": "48201"})),
        "backup_zone_monthly": pd.DataFrame(_monthly({"weather_zone": "COAST", "profile_type": "RESLOWR"})),
        "sizing": pd.DataFrame([{
            "county_fips": "48201", "cores": 2, "reason": "Two Cores would have covered 48%.", "order": "stay",
            "stay_share_1": 0.31, "stay_share_2": 0.486, "rotate_share_1": 0.44, "rotate_share_2": 0.65,
        }]),
        "assumptions": pd.DataFrame({
            "name": ["kwh_per_core", "kw_per_core", "start_soc", "reserve_soc", "backup_profile_year"],
            "value": [39.2, 20.0, 1.0, 0.2, 2024.0],
        }),
    }
    for name, frame in frames.items():
        con.register("frame", frame)
        con.execute(f"create table {name} as select * from frame")
        con.unregister("frame")
    return con


def test_event_label_uses_the_storm_name_or_the_month():
    start = pd.Timestamp("2024-07-11", tz="America/Chicago")
    assert event_label("Hurricane Beryl", start) == "Hurricane Beryl"
    assert event_label(None, start) == "July 2024 outage"


def test_event_record_uses_central_time_and_the_stay_bound():
    record = event_record(pd.Series(_event()))
    assert record["start"] == "2024-07-08T09:15:00-05:00"
    assert record["duration_h"]["p90"] == [115.4, 175.0]
    assert record["covered"]["cores_2"] == {"homes": 0.2, "hours": 0.4}
    assert record["covered_order"] == "stay"


def test_event_without_a_replay_has_null_coverage():
    record = event_record(pd.Series(_event(replayed=False)))
    assert record["covered"] is None and record["backup_h"] is None


def test_persona_report_has_every_contract_key_and_sizing(con):
    report = build_report(con, "48201")
    assert CONTRACT_KEYS <= set(report)
    assert report["location"]["load_zone"] == "LZ_HOUSTON"
    assert report["base_offer"]["product"] == "energy_plus_backup"
    assert [event["label"] for event in report["events"]] == ["Hurricane Beryl", "September 2021 outage"]
    assert report["backup"]["hours_by_month"]["cores_1"][0] == 11.0
    assert report["backup"]["surprise"]["hours_by_month"]["cores_1"][0] == 111.0
    assert report["sizing"] == {"cores": 2, "reason": "Two Cores would have covered 48%.", "share": 0.486}


def test_other_county_uses_zone_hours_and_skips_sizing(con):
    report = build_report(con, "48167")
    assert report["location"]["county"] == "Galveston"
    assert report["events"][0]["covered"] is None
    assert report["backup"]["hours_by_month"]["cores_2"][11] == 32.0
    assert report["sizing"]["cores"] is None
    assert "Base confirms sizing at install" in report["sizing"]["reason"]


def test_unknown_county_and_profile_fail(con):
    with pytest.raises(ValueError, match="not a Texas county"):
        build_report(con, "06001")
    with pytest.raises(ValueError, match="unknown profile"):
        build_report(con, "48201", "COMMERCIAL")


def test_base_offer_falls_back_to_none():
    assert base_offer(None) == {"product": "none", "url": None}
    assert base_offer(8901)["product"] == "energy_plus_backup"


def test_contract_report_feeds_the_narrator(con):
    report = build_report(con, "48201")
    facts = {fact.id: fact.text for fact in build_facts(from_contract(report))}
    assert facts["county.name"] == "Harris County"
    assert facts["event.1.p90_hours"] == "about 175 hours for the longest-waiting tenth"
    assert narrate(from_contract(report))["status"] == "template"


def test_template_without_sizing_still_passes_validation(con):
    report = build_report(con, "48167")
    narrative = narrate(from_contract(report))
    assert "sizing.cores" not in narrative["fact_ids"]
    assert validate(narrative, build_facts(from_contract(report))) == []


def test_template_narrative_marks_the_llm_degraded(con):
    report = with_narrative(build_report(con, "48201"), None)
    assert report["narrative"]["status"] == "template"
    assert report["sources"][-1] == {"id": "llm", "status": "degraded", "fallback": "template"}


def test_floored_county_hides_the_peak_share(con):
    con.execute("alter table outlook add column customers_floored boolean")
    con.execute("update outlook set customers_floored = county_fips = '48167'")
    report = build_report(con, "48167")
    assert report["outlook"]["customers_floored"] is True
    assert report["events"][0]["peak_out_pct"] is None and report["events"][0]["peak_out"] == 1
    narrative = narrate(from_contract(report))
    assert "At its peak" not in narrative["summary"]
    assert validate(narrative, build_facts(from_contract(report))) == []
    assert build_report(con, "48201")["events"][0]["peak_out_pct"] == 90.9
