import pandas as pd
import pytest

from pipeline.utility_map.validate_hazards import outage_links


def test_rank_correlation_with_outages_per_layer() -> None:
    outages = pd.Series({"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0})
    layers = {
        "same": pd.Series({"a": 10.0, "b": 20.0, "c": 30.0, "d": 40.0}),
        "opposite": pd.Series({"a": 4.0, "b": 3.0, "c": 2.0, "d": 1.0}),
        "partial": pd.Series({"a": 1.0, "b": None, "c": 3.0, "d": 2.0}),
    }
    links = outage_links(outages, layers)
    assert links["same"] == {"rho": pytest.approx(1.0), "n": 4, "weak": False}
    assert links["opposite"]["rho"] == pytest.approx(-1.0)
    assert links["opposite"]["weak"] is True
    assert links["partial"]["n"] == 3


def test_too_few_counties_gives_no_claim() -> None:
    links = outage_links(pd.Series({"a": 1.0, "b": 2.0}), {"x": pd.Series({"a": 1.0, "b": 2.0})})
    assert links["x"] == {"rho": None, "n": 2, "weak": None}
