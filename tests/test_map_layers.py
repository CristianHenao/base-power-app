from pathlib import Path

import pandas as pd
import pytest

from pipeline.map_layers import acs_homes, nri_layers, percentile_ranks, scarcity_hours


def test_percentile_ranks_spread_zero_to_one_and_keep_missing() -> None:
    ranks = percentile_ranks(pd.Series({"a": 1.0, "b": 2.0, "c": None, "d": 3.0}))
    assert ranks["a"] == 0.0
    assert ranks["b"] == 0.5
    assert ranks["d"] == 1.0
    assert pd.isna(ranks["c"])


def test_percentile_ranks_ties_share_the_midpoint() -> None:
    ranks = percentile_ranks(pd.Series({"a": 1.0, "b": 1.0, "c": 2.0}))
    assert ranks["a"] == ranks["b"] == 0.25


def test_scarcity_hours_averages_intervals_over_years() -> None:
    grid_value = pd.DataFrame(
        {"load_zone": ["LZ_NORTH", "LZ_NORTH", "LZ_WEST"], "year": [2024, 2025, 2024],
         "scarcity_intervals": [8, 0, 4]}
    )
    hours = scarcity_hours(grid_value)
    assert hours["LZ_NORTH"] == pytest.approx(1.0)
    assert hours["LZ_WEST"] == pytest.approx(1.0)


def test_nri_layers_average_weather_and_take_max_flood(tmp_path: Path) -> None:
    path = tmp_path / "nri.csv"
    columns = ["WNTW", "ISTM", "HRCN", "SWND", "TRND", "HWAV"]
    row = {f"{code}_RISKS": 60.0 for code in columns} | {"CFLD_RISKS": None, "IFLD_RISKS": 40.0}
    pd.DataFrame([{"STCOFIPS": "48001", **row}]).to_csv(path, index=False)
    layers = nri_layers(path)
    assert layers.loc["48001", "weather"] == 60.0
    assert layers.loc["48001", "flood"] == 40.0


def test_acs_homes_adds_detached_and_attached_owner_homes(tmp_path: Path) -> None:
    path = tmp_path / "b25032.dat"
    path.write_text(
        "GEO_ID|B25032_E003|B25032_E004\n"
        "0500000US48001|900|100\n"
        "0500000US01001|5|5\n"
        "0400000US48|1|1\n"
    )
    homes = acs_homes(path)
    assert homes.to_dict() == {"48001": 1000}
