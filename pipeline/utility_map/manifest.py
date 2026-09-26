"""Source manifest for the utility map: where each raw file came from and its checksum."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from pipeline import settings

MANIFEST_JSON = settings.UTILITY_MAP_DIR / "manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record(
    source_id: str,
    url: str,
    *paths: Path,
    rows: int,
    period_start: str | None,
    period_end: str | None,
    note: str = "",
    manifest_path: Path = MANIFEST_JSON,
) -> dict:
    """Add or replace one source entry. Returns the entry."""
    entry = {
        "source_id": source_id,
        "url": url,
        "files": [{"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size} for path in paths],
        "rows": rows,
        "period_start": period_start,
        "period_end": period_end,
        "retrieved_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": note,
    }
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"sources": []}
    manifest["sources"] = [s for s in manifest["sources"] if s["source_id"] != source_id] + [entry]
    manifest["sources"].sort(key=lambda s: s["source_id"])
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return entry
