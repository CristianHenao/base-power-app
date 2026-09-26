"""Write the /v1/report JSON Schemas, the reference for the web client's hand-written types.

Run: python -m api.app.export_schema   (src/lib/report/types.ts mirrors these; tests/test_contract_drift.py checks it)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from api.app.schemas import Narrative, Report, ReportRequest

SCHEMA_DIR = Path(__file__).resolve().parents[1] / "schema"
MODELS = {"report": Report, "report-request": ReportRequest, "narrative": Narrative}


def main() -> int:
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    for name, model in MODELS.items():
        path = SCHEMA_DIR / f"{name}.schema.json"
        path.write_text(json.dumps(model.model_json_schema(mode="serialization"), indent=2) + "\n")
        print(f"wrote {path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
