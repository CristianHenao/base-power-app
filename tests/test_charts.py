import xml.etree.ElementTree as ET

import pandas as pd

from pipeline.charts import backtest_svg, month_svg, nice_max, spread, tail_svg

RECORD = {
    "train": ["2018-01-01", "2023-01-01"], "test": ["2023-01-01", "2025-01-01"], "counties": 254,
    "zero_train_counties_with_test_outages": 5,
    "methods": {"empirical_bayes": {"poisson_deviance": 132.8}, "raw_rate": {"poisson_deviance": "inf"}},
}


def test_nice_max_rounds_up_to_one_two_five():
    assert [nice_max(v) for v in (0.0, 37.0, 163.0, 500.0)] == [1.0, 50.0, 200.0, 500.0]


def test_spread_keeps_order_and_gap():
    assert spread([100.0, 95.0, 300.0], min_gap=20.0) == [115.0, 95.0, 300.0]


def test_backtest_writes_infinite_as_text_not_a_bar():
    svg = backtest_svg(RECORD)
    ET.fromstring(svg)
    assert svg.count('class="s1"') == 1
    assert "infinite: 5 counties" in svg


def test_month_and_tail_charts_are_valid_svg():
    hours = {"Harris, gas heat": [40.0] * 7 + [15.0] + [30.0] * 4}
    assert "low 15 h in Aug" in month_svg(hours)
    ET.fromstring(month_svg(hours))
    ET.fromstring(tail_svg(pd.Series({"48201": 0.88, "48453": 0.84, "48001": 0.4}), {"48201": "Harris", "48453": "Travis"}))
