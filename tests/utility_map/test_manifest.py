import hashlib
import importlib
import json
from pathlib import Path

import pytest


def test_raw_dir_follows_the_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from pipeline import settings

    monkeypatch.setenv("PORCHLIGHT_RAW_DIR", str(tmp_path))
    try:
        assert importlib.reload(settings).RAW_DIR == tmp_path
    finally:
        monkeypatch.delenv("PORCHLIGHT_RAW_DIR")
        importlib.reload(settings)


def test_raw_dir_defaults_to_the_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    from pipeline import settings

    monkeypatch.delenv("PORCHLIGHT_RAW_DIR", raising=False)
    reloaded = importlib.reload(settings)
    assert reloaded.RAW_DIR == reloaded.REPO_ROOT / "data" / "raw"


def test_sha256_matches_hashlib(tmp_path: Path) -> None:
    from pipeline.utility_map.manifest import sha256

    path = tmp_path / "a.csv"
    path.write_bytes(b"fips,value\n48201,1\n")
    assert sha256(path) == hashlib.sha256(b"fips,value\n48201,1\n").hexdigest()


def test_record_upserts_one_entry_per_source(tmp_path: Path) -> None:
    from pipeline.utility_map.manifest import record

    manifest = tmp_path / "manifest.json"
    raw = tmp_path / "raw.csv"
    raw.write_text("x\n1\n")
    for rows in (1, 2):
        record("noaa_storm_events", "https://example.gov/x.csv", raw, rows=rows,
               period_start="2000-01-01", period_end="2024-12-31", manifest_path=manifest)

    sources = json.loads(manifest.read_text())["sources"]
    assert len(sources) == 1
    entry = sources[0]
    assert entry["source_id"] == "noaa_storm_events"
    assert entry["rows"] == 2
    assert entry["files"][0]["sha256"] == hashlib.sha256(b"x\n1\n").hexdigest()
    assert entry["retrieved_at_utc"].endswith("Z")
