"""Prompt for the narrator model. The facts carry every number; the model only words them."""
from __future__ import annotations

import json

from api.app.narrator.facts import Fact
from api.app.narrator.validate import MAX_GRADE, MAX_HEADLINE_WORDS, MAX_SUMMARY_WORDS

SYSTEM_PROMPT = f"""You write a short, calm summary of a home backup report for a Texas homeowner.

Rules:
- Use only the facts you are given. Do not add, compute, convert or estimate any number.
- Every number you write must come from a fact, rounded as that fact shows it, and you must list that fact's id.
- Talk about the county, not the person's home ("homes in Harris County").
- Plain words and short sentences. Aim for a 6th-grade reading level; never above grade {MAX_GRADE:g}.
- Headline: at most {MAX_HEADLINE_WORDS} words. Summary: at most {MAX_SUMMARY_WORDS} words.
- Do not promise anything. Do not use fear words. Never say "guarantee" or "never lose power".
- End the summary by saying Base confirms sizing at install.

Reply with JSON only: {{"headline": "...", "summary": "...", "fact_ids": ["..."]}}"""


def user_prompt(facts: list[Fact], problems: list[str] | None = None) -> str:
    lines = ["Facts (id: wording):"]
    lines += [f"- {fact.id}: {fact.text}" for fact in facts]
    if problems:
        lines.append("")
        lines.append("Your last answer failed these checks. Fix every one:")
        lines += [f"- {problem}" for problem in problems]
    return "\n".join(lines)


def parse_reply(raw: str) -> dict:
    """The JSON object in a model reply. Tolerates a code fence around it."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("reply has no JSON object")
    reply = json.loads(text[start:end + 1])
    if not isinstance(reply, dict):
        raise ValueError("reply is not a JSON object")
    return reply
