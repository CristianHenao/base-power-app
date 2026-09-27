"""ZIP → county majority map used by the API and the Next.js saved-report fallback."""

import pandas as pd

from pipeline.zip_county import DEMO_COUNTY_FIPS, demo_zip_map


def test_demo_zip_map_keeps_only_majority_demo_counties() -> None:
    table = pd.DataFrame(
        {
            "zip": ["77002", "75001", "75025", "99999"],
            "county_fips": ["48201", "48113", "48085", "48201"],
            "share": ["1.000", "1.000", "0.900", "0.600"],
        }
    )
    assert demo_zip_map(table) == {"75025": "48085", "77002": "48201", "99999": "48201"}
    assert set(DEMO_COUNTY_FIPS) == {"48085", "48201", "48453"}
