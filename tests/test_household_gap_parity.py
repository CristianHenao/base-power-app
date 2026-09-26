"""The browser's household gap (src/lib/report/household-gap.ts) must match pipeline/household_gap.py."""
import json
import shutil
import subprocess

import numpy as np
import pytest

from pipeline import settings
from pipeline.household_gap import GRID_HOURS, gap

TS = settings.REPO_ROOT / "src" / "lib" / "report" / "household-gap.ts"
NODE = shutil.which("node")


def node_supports_type_stripping() -> bool:
    if NODE is None:
        return False
    out = subprocess.run([NODE, "--version"], capture_output=True, text=True).stdout.strip().lstrip("v")
    major, minor = (int(part) for part in out.split(".")[:2])
    return (major, minor) >= (22, 6)


@pytest.mark.skipif(not node_supports_type_stripping(), reason="needs Node 22.6+ to run TypeScript directly")
def test_browser_and_pipeline_gap_agree(tmp_path):
    seasons = [
        {"season": "winter", "outages_per_year": 0.4, "survival": np.exp(-GRID_HOURS / 30.0).round(5).tolist()},
        {"season": "summer", "outages_per_year": 1.1, "survival": np.exp(-(GRID_HOURS / 8.0) ** 0.7).round(5).tolist()},
    ]
    backups = [{"winter": 0.0, "summer": 0.0}, {"winter": 16.0, "summer": 22.0}, {"winter": 3.3, "summer": 0.1}]
    expected = [gap(seasons, b) for b in backups]
    script = tmp_path / "run.mjs"
    script.write_text(
        f"import {{ gapFor }} from {json.dumps(TS.as_uri())};\n"
        f"const g = {{ hours_grid: {json.dumps([float(h) for h in GRID_HOURS])}, seasons: {json.dumps(seasons)} }};\n"
        f"const backups = {json.dumps(backups)};\n"
        "console.log(JSON.stringify(backups.map((b) => { const r = gapFor(g, b); return [r.darkHours, r.chance]; })));\n"
    )
    out = subprocess.run([NODE, "--experimental-strip-types", "--no-warnings", str(script)],
                         capture_output=True, text=True, check=True).stdout
    for (hours, chance), (ts_hours, ts_chance) in zip(expected, json.loads(out), strict=True):
        assert ts_hours == pytest.approx(hours, rel=1e-6, abs=1e-9)
        assert ts_chance == pytest.approx(chance, rel=1e-6, abs=1e-9)
