"""Record a model's narrator outputs for every fixture.

Run: python -m evals.record [--model grok-4.20-0309-non-reasoning]
Needs XAI_API_KEY in the environment or in the repo's gitignored .env.

Writes two sources that evals.score picks up:
  evals/recorded/<model>/        the first reply, before any retry
  evals/recorded/<model>+retry/  the reply after the one retry narrate() allows
A reply that never parsed is recorded empty, so it scores as a failure.
Run notes (status, attempts, seconds, failure reasons) go to <model>/run.jsonl.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from api.app.narrator.narrate import ModelCall, narrate
from api.app.narrator.prompt import parse_reply
from api.app.narrator.xai import KEY_ENV, XAI_MODEL, xai_call
from evals.score import RECORDED_DIR, fixtures
from pipeline import settings

EMPTY_REPLY = {"headline": "", "summary": "", "fact_ids": []}


def load_env(path: Path) -> None:
    """KEY=VALUE lines into os.environ, without overriding what is already set."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def as_reply(raw: str) -> dict:
    """The fields the scorer reads, or an empty reply when the text is not JSON."""
    try:
        parsed = parse_reply(raw)
    except ValueError:
        return dict(EMPTY_REPLY)
    return {key: parsed.get(key, EMPTY_REPLY[key]) for key in EMPTY_REPLY}


def record_case(report: dict, call: ModelCall) -> tuple[dict, dict, dict]:
    """(first reply, reply after retry, run note) for one fixture, through narrate() itself."""
    raws: list[str] = []

    def spy(system: str, user: str, timeout_s: float) -> str:
        raws.append("")  # stays empty when the call raises, so attempts line up
        raws[-1] = call(system, user, timeout_s)
        return raws[-1]

    started = time.perf_counter()
    result = narrate(report, spy)
    seconds = time.perf_counter() - started
    first = as_reply(raws[0]) if raws else dict(EMPTY_REPLY)
    final = as_reply(raws[-1]) if raws else dict(EMPTY_REPLY)
    note = {
        "status": result["status"], "attempts": result["attempts"],
        "seconds": round(seconds, 2), "failures": result["failures"],
    }
    return first, final, note


def record(model: str, call: ModelCall, root: Path = RECORDED_DIR) -> list[dict]:
    first_dir, retry_dir = root / model, root / f"{model}+retry"
    first_dir.mkdir(parents=True, exist_ok=True)
    retry_dir.mkdir(parents=True, exist_ok=True)
    notes = []
    for name, report in fixtures().items():
        first, final, note = record_case(report, call)
        (first_dir / name).write_text(json.dumps(first, indent=2) + "\n")
        (retry_dir / name).write_text(json.dumps(final, indent=2) + "\n")
        notes.append({"fixture": name, **note})
    (first_dir / "run.jsonl").write_text("".join(json.dumps(note) + "\n" for note in notes))
    return notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=XAI_MODEL)
    args = parser.parse_args()
    load_env(settings.ENV_FILE)
    if not os.environ.get(KEY_ENV):
        print(f"{KEY_ENV} is not set; put it in {settings.ENV_FILE}")
        return 1
    notes = record(args.model, xai_call(args.model))
    statuses = [note["status"] for note in notes]
    seconds = sorted(note["seconds"] for note in notes)
    print(f"{args.model}: " + ", ".join(f"{s} {statuses.count(s)}" for s in ("ok", "retried", "template")))
    print(f"median {seconds[len(seconds) // 2]:.1f}s, slowest {seconds[-1]:.1f}s per fixture")
    return 0


if __name__ == "__main__":
    sys.exit(main())
