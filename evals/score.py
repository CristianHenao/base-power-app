"""Score recorded narrator outputs against the fixtures.

Run: python -m evals.score
Records the template's outputs, then scores every folder in evals/recorded/
and writes evals/results.md. A model's outputs are recorded into their own
folder, one JSON per fixture with the same file name; CI scores what is recorded.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from api.app.narrator.facts import build_facts
from api.app.narrator.narrate import narrate
from api.app.narrator.validate import validate

EVALS = Path(__file__).resolve().parent
FIXTURE_DIR = EVALS / "fixtures"
RECORDED_DIR = EVALS / "recorded"
RESULTS_MD = EVALS / "results.md"


def fixtures() -> dict[str, dict]:
    return {path.name: json.loads(path.read_text()) for path in sorted(FIXTURE_DIR.glob("*.json"))}


def record_template(cases: dict[str, dict]) -> Path:
    out = RECORDED_DIR / "template"
    out.mkdir(parents=True, exist_ok=True)
    for name, report in cases.items():
        result = narrate(report)
        reply = {key: result[key] for key in ("headline", "summary", "fact_ids")}
        (out / name).write_text(json.dumps(reply, indent=2) + "\n")
    return out


def score_folder(folder: Path, cases: dict[str, dict]) -> dict:
    """Pass count and the most common failure reasons. A missing output is a failure."""
    passed = 0
    reasons: Counter[str] = Counter()
    for name, report in cases.items():
        path = folder / name
        if not path.exists():
            reasons["no recorded output"] += 1
            continue
        problems = validate(json.loads(path.read_text()), build_facts(report))
        if problems:
            reasons.update({failure_kind(problem) for problem in problems})
        else:
            passed += 1
    return {"source": folder.name, "cases": len(cases), "passed": passed, "reasons": reasons}


_KINDS = (
    ("number ", "number not in cited facts"),
    ("out of context", "number out of context"),
    ("banned phrase", "banned phrase"),
    ("reading grade", "reading grade above 7"),
    ("headline has", "headline too long"),
    ("summary has", "summary too long"),
    ("unknown fact ids", "unknown fact id"),
)


def failure_kind(problem: str) -> str:
    for prefix, kind in _KINDS:
        if problem.startswith(prefix):
            return kind
    return problem


def results_table(scores: list[dict]) -> str:
    lines = [
        "| Source | Cases | Passed | Pass rate | Most common failure |",
        "|---|---|---|---|---|",
    ]
    for score in scores:
        top = score["reasons"].most_common(1)
        failure = f"{top[0][0]} ({top[0][1]})" if top else "none"
        rate = score["passed"] / score["cases"] if score["cases"] else 0.0
        lines.append(f"| {score['source']} | {score['cases']} | {score['passed']} | {rate:.0%} | {failure} |")
    return "\n".join(lines)


def main() -> int:
    cases = fixtures()
    if not cases:
        print(f"no fixtures in {FIXTURE_DIR}; run python -m evals.build_fixtures")
        return 1
    record_template(cases)
    scores = [score_folder(folder, cases) for folder in sorted(RECORDED_DIR.iterdir()) if folder.is_dir()]
    table = results_table(scores)
    RESULTS_MD.write_text(
        "# Narrator evals\n\n"
        f"{len(cases)} fixtures: 8 counties, one per ERCOT weather zone, by 3 homes. "
        "An output passes when every number matches a cited fact, no banned phrase appears, "
        "the reading grade is 7 or lower, and the length caps hold.\n\n"
        f"{table}\n"
    )
    print(table)
    return 0


if __name__ == "__main__":
    sys.exit(main())
