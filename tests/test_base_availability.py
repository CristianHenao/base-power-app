import re

import yaml

from pipeline import settings

PATH = settings.REPO_ROOT / "data" / "reference" / "base_availability.yaml"
OFFERS = {"energy_plus_backup", "energy_only", "backup_only", "unconfirmed"}


def _doc() -> dict:
    return yaml.safe_load(PATH.read_text())


def test_every_utility_has_a_known_offer_and_a_base_url() -> None:
    doc = _doc()
    keys = [row["key"] for row in doc["utilities"]]
    assert len(keys) == len(set(keys))
    for row in doc["utilities"]:
        assert row["offer"] in OFFERS, row["key"]
        assert set(row.get("also", [])) <= OFFERS, row["key"]
        assert row["url"].startswith("https://www.basepowercompany.com/"), row["key"]


def test_file_carries_no_prices() -> None:
    # CLAUDE.md: never hardcode prices. The app links to Base's page instead.
    assert not re.search(r"\$\s*\d|/mo\b|¢", PATH.read_text())


def test_file_names_its_source_and_date() -> None:
    doc = _doc()
    assert doc["source"].startswith("https://www.basepowercompany.com/")
    assert str(doc["as_of"])
