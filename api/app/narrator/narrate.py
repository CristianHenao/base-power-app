"""Narrator: one model attempt, one retry with the failure reasons, then the template.

The model sits behind `ModelCall`, so any provider can be wired in by the API
service. Whatever it returns is validated before it is shown.
"""
from __future__ import annotations

from collections.abc import Callable

from api.app.narrator.facts import build_facts
from api.app.narrator.prompt import SYSTEM_PROMPT, parse_reply, user_prompt
from api.app.narrator.template import template_narrative
from api.app.narrator.validate import validate

# (system prompt, user prompt, timeout in seconds) -> raw reply text.
ModelCall = Callable[[str, str, float], str]

MAX_ATTEMPTS = 2
TIMEOUT_S = 8.0


def narrate(report: dict, call: ModelCall | None = None, timeout_s: float = TIMEOUT_S) -> dict:
    """Headline, summary and cited fact ids, with a status the UI can show.

    status is "ok" (first try passed), "retried" (second try passed), or
    "template" (no model, or both tries failed). `failures` lists each failed
    attempt's reasons.
    """
    facts = build_facts(report)
    failures: list[list[str]] = []
    if call is not None:
        problems: list[str] | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                reply = parse_reply(call(SYSTEM_PROMPT, user_prompt(facts, problems), timeout_s))
                problems = validate(reply, facts)
            # The adapter is a network boundary: any error there falls back, never breaks the report.
            except Exception as error:  # noqa: BLE001
                reply, problems = {}, [f"model call failed: {type(error).__name__}: {error}"]
            if not problems:
                return {
                    "headline": reply["headline"], "summary": reply["summary"], "fact_ids": reply["fact_ids"],
                    "status": "ok" if attempt == 1 else "retried", "attempts": attempt, "failures": failures,
                }
            failures.append(problems)
    fallback = template_narrative(report)
    return {**fallback, "status": "template", "attempts": len(failures), "failures": failures}
