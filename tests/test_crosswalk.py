import math

import pandas as pd

from pipeline.sources.crosswalk import fill_nearest, majority_zone

ZIP_ZONE = pd.DataFrame(
    {"zip": ["75001", "75002", "77001"], "weather_zone": ["NCENT", "NORTH", "COAST"]}
)

ZCTA_COUNTY = pd.DataFrame(
    {
        "zip": ["75001", "75002", "77001", "79901"],
        "county_fips": ["48085", "48085", "48201", "48141"],
        "county": ["Collin", "Collin", "Harris", "El Paso"],
        "land": [70.0, 30.0, 50.0, 10.0],
    }
)


def test_majority_zone_takes_the_zone_with_most_land() -> None:
    table = majority_zone(ZIP_ZONE, ZCTA_COUNTY).set_index("county_fips")
    assert table.loc["48085", "weather_zone"] == "NCENT"
    assert math.isclose(table.loc["48085", "zone_share"], 0.7)
    assert "48141" not in table.index


def test_fill_nearest_covers_counties_outside_ercot() -> None:
    counties = ZCTA_COUNTY[["county_fips", "county"]].drop_duplicates()
    centroids = {"48085": (-96.6, 33.2), "48201": (-95.4, 29.8), "48141": (-106.2, 31.8)}
    table = fill_nearest(majority_zone(ZIP_ZONE, ZCTA_COUNTY), counties, centroids)
    el_paso = table.set_index("county_fips").loc["48141"]
    assert len(table) == 3
    assert el_paso["weather_zone"] == "NCENT"
    assert el_paso["zone_source"] == "nearest:48085"
