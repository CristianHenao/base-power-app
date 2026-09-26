import numpy as np
import pandas as pd
import pytest

from pipeline.pays_twice import pays_twice, ranks


def test_ranks_run_zero_to_one_and_keep_missing():
    out = ranks(pd.Series([3.0, 1.0, np.nan, 2.0]))
    assert out.tolist()[:2] == [1.0, 0.0] and np.isnan(out.iloc[2]) and out.iloc[3] == 0.5


def test_a_county_needs_both_kinds_of_value():
    counties = pd.DataFrame({
        "county_fips": ["1", "2", "3", "4"], "county": ["A", "B", "C", "D"],
        "load_zone": ["LZ_WEST", "LZ_NORTH", "LZ_WEST", None],
        "utility_id": [8901, 44372, None, None],
        "long_outages_per_year": [0.3, 0.3, 0.05, 0.3], "homes": [1000, 1000, 1000, 1000],
    })
    grid = pd.DataFrame({"load_zone": ["LZ_WEST", "LZ_NORTH", "LZ_WEST"], "year": [2021, 2021, 2019],
                         "arbitrage_usd_upper_bound": [3000.0, 1000.0, 99999.0]})
    table = pays_twice(counties, grid).set_index("county")
    assert table.at["A", "grid_usd_per_core"] == 3000.0  # 2019 is outside the window
    assert table.index[0] == "A"
    assert np.isnan(table.at["D", "index"])  # outside ERCOT
    assert table.at["C", "base_offer"] == "none"
    assert table.at["A", "index"] == pytest.approx(np.sqrt(table.at["A", "home_rank"] * table.at["A", "grid_rank"]))
