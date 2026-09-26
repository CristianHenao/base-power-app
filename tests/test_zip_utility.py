import pandas as pd
import pytest

from pipeline.sources.zip_utility import combine, ptc_frame, ptc_tdus, tdu_eia_id


def test_tdu_names_map_to_eia_ids() -> None:
    assert tdu_eia_id("CENTERPOINT ENERGY HOUSTON ELECTRIC LLC") == 8901
    assert tdu_eia_id("ONCOR ELECTRIC DELIVERY COMPANY") == 44372
    assert tdu_eia_id("AEP TEXAS CENTRAL COMPANY") == 3278
    assert tdu_eia_id("Some Co-op") is None


def test_ptc_tdus_keeps_distinct_names_only() -> None:
    payload = {"data": [{"company_tdu_name": "ONCOR ELECTRIC DELIVERY COMPANY"}] * 3}
    assert ptc_tdus(payload) == ["ONCOR ELECTRIC DELIVERY COMPANY"]
    assert ptc_tdus({"data": [], "message": "No Plans Found"}) == []


def test_ptc_frame_rejects_unknown_tdus() -> None:
    with pytest.raises(ValueError):
        ptc_frame({"75001": ["NEW WIRES CO"]})


def test_combine_lists_competitive_tdu_first_and_counts_candidates() -> None:
    ptc = ptc_frame({"75070": ["ONCOR ELECTRIC DELIVERY COMPANY"], "78701": []})
    nrel = pd.DataFrame(
        {"zip": ["75070", "78701"], "utility_id": [5078, 1015], "source": "nrel_2024"}
    )
    names = pd.Series({44372: "Oncor", 5078: "CoServ", 1015: "Austin Energy"})
    out = combine(nrel, ptc, names)
    mckinney = out[out["zip"] == "75070"]
    assert mckinney["utility_name"].tolist() == ["Oncor", "CoServ"]
    assert mckinney["candidates"].tolist() == [2, 2]
    assert out.loc[out["zip"] == "78701", "utility_name"].tolist() == ["Austin Energy"]
