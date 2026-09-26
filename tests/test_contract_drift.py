"""The web client's types (src/lib/report/types.ts) must name the same fields as api/app/schemas.py."""
import re
from pathlib import Path

import pytest

from api.app.schemas import Report, ReportRequest
from pipeline import settings

TYPES_TS = settings.REPO_ROOT / "src" / "lib" / "report" / "types.ts"
INTERFACE = re.compile(r"export interface (\w+) \{(.*?)\n\}", re.S)
FIELD = re.compile(r"^\s+(\w+)\??:", re.M)


def ts_interfaces(path: Path) -> dict[str, set[str]]:
    return {name: set(FIELD.findall(body)) for name, body in INTERFACE.findall(path.read_text())}


def schema_models() -> dict[str, set[str]]:
    models = {}
    for model in (Report, ReportRequest):
        schema = model.model_json_schema(mode="serialization")
        models[schema["title"]] = set(schema["properties"])
        for name, definition in schema.get("$defs", {}).items():
            models[name] = set(definition.get("properties", {}))
    return models


@pytest.mark.parametrize("name", sorted(schema_models()))
def test_every_schema_model_has_a_matching_ts_interface(name):
    interfaces = ts_interfaces(TYPES_TS)
    assert name in interfaces, f"{name} is missing from {TYPES_TS.name}"
    assert interfaces[name] == schema_models()[name]
