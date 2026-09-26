import numpy as np
import pandas as pd
import pytest

from pipeline.sources.eia861_reliability import med_share, reliability_rows

UTILITIES = {8901: "CenterPoint", 44372: "Oncor"}


def _new_format() -> pd.DataFrame:
    """2021+ layout: section row, group row, name row."""
    nan = np.nan
    rows = [
        ["Utility Characteristics", nan, nan, nan, nan, "IEEE Standard", nan, nan, "Other Standard", nan, nan],
        [nan, nan, nan, nan, nan, "All Events (With Major Event Days)", "Without Major Event Days", nan,
         "All Events (With Major Event Days)", "Without Major Event Days", nan],
        ["Data Year", "Utility Number", "Utility Name", "State", "Ownership", "SAIDI (minutes per year)",
         "SAIDI (minutes per year)", "Number of Customers", "SAIDI (minutes per year)", "SAIDI (minutes per year)",
         "Number of Customers"],
        [2024, 8901, "CenterPoint Energy", "TX", "Investor Owned", 4315.8, 150.1, 2847806, ".", ".", "."],
        [2024, 44372, "Oncor Electric Delivery", "TX", "Investor Owned", ".", ".", ".", 532.5, 67.3, 4013062],
        [2024, 8901, "CenterPoint Energy", "OK", "Investor Owned", 1.0, 1.0, 1, ".", ".", "."],
    ]
    return pd.DataFrame(rows)


def _old_format() -> pd.DataFrame:
    """2019-2020 layout: section row, then names such as "SAIDI With MED", plus a Short Form column."""
    nan = np.nan
    rows = [
        ["Utility Characteristics", nan, nan, nan, nan, nan, "IEEE Standard", nan, nan, "Other Standard", nan, nan],
        ["Data Year", "Utility Number", "Utility Name", "State", "Ownership", "Short Form", "SAIDI With MED",
         "SAIDI Without MED", "Number of Customers", "SAIDI With MED", "SAIDI Without MED", "Number of Customers"],
        [2019, 8901, "CenterPoint Energy", "TX", "Investor Owned", nan, 227.6, 140.9, 2564204, ".", ".", "."],
    ]
    return pd.DataFrame(rows)


def test_new_format_prefers_ieee_and_falls_back_to_other():
    table = reliability_rows(_new_format(), 2024, UTILITIES).set_index("utility")
    assert table.loc["CenterPoint", ["standard", "saidi_with_med", "saidi_without_med"]].tolist() == ["IEEE", 4315.8, 150.1]
    assert table.loc["Oncor", ["standard", "saidi_with_med", "customers"]].tolist() == ["Other", 532.5, 4013062.0]
    assert len(table) == 2


def test_old_format_finds_columns_by_label_not_position():
    table = reliability_rows(_old_format(), 2019, UTILITIES)
    assert table[["saidi_with_med", "saidi_without_med", "customers"]].values.tolist() == [[227.6, 140.9, 2564204.0]]


def test_med_share_sums_years_before_dividing():
    table = pd.DataFrame({
        "utility": ["A", "A"], "saidi_with_med": [100.0, 300.0], "saidi_without_med": [50.0, 50.0],
    })
    assert med_share(table).loc["A", "share_removed"] == pytest.approx(0.75)


def test_state_reliability_keeps_every_texas_utility_and_its_standard():
    from pipeline.sources.eia861_reliability import state_reliability

    raw = _new_format()
    saifi = raw.copy()
    # Add SAIFI columns in the same layout the real file uses (after each SAIDI).
    saifi.insert(6, "ieee_saifi_with", [np.nan, "All Events (With Major Event Days)", "SAIFI (times per year)", 3.7, ".", 1.0])
    saifi.insert(8, "ieee_saifi_without", [np.nan, "Without Major Event Days", "SAIFI (times per year)", 1.6, ".", 1.0])
    saifi.insert(11, "other_saifi_with", [np.nan, "All Events (With Major Event Days)", "SAIFI (times per year)", ".", 1.7, "."])
    saifi.insert(13, "other_saifi_without", [np.nan, "Without Major Event Days", "SAIFI (times per year)", ".", 0.8, "."])
    saifi.columns = range(saifi.shape[1])
    table = state_reliability(saifi).set_index("utility_id")
    assert table.loc[8901, ["standard", "saidi_with_med", "saifi_with_med"]].tolist() == ["IEEE", 4315.8, 3.7]
    assert table.loc[44372, ["standard", "saidi_without_med", "saifi_without_med"]].tolist() == ["Other", 67.3, 0.8]
    assert len(table) == 2  # the Oklahoma row is dropped
