from pathlib import Path

import pytest

from pipeline.utility_map.geography import county_land_km2


def test_land_area_in_square_km_for_texas_only(tmp_path: Path) -> None:
    path = tmp_path / "gaz.txt"
    path.write_text(
        "USPS\tGEOID\tANSICODE\tNAME\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG   \n"
        "TX\t48201\t01\tHarris County\t4411000000\t0\t1703\t0\t29.8\t-95.4\n"
        "AL\t01001\t01\tAutauga County\t1539631459\t0\t594\t0\t32.5\t-86.6\n"
    )
    area = county_land_km2(path)
    assert list(area.index) == ["48201"]
    assert area["48201"] == pytest.approx(4411.0)
