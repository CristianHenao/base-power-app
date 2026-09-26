"""Checks a narrative must pass before anyone sees it."""
from __future__ import annotations

import re

import pyphen

from api.app.narrator.facts import Fact

MAX_HEADLINE_WORDS = 12
MAX_SUMMARY_WORDS = 120
MAX_GRADE = 7.0
# Fear words and promises Base can't make.
BANNED_PHRASES = (
    "guarantee",
    "never lose power",
    "never lose",
    "always stay on",
    "risk-free",
    "worry-free",
    "catastroph",
    "devastat",
    "deadly",
    "disaster",
    "terrif",
    "panic",
    "scary",
    "danger",
    "life-threatening",
    "act now",
    "don't wait",
)

_NUMBER = re.compile(r"(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])\d+(?:\.\d+)?")
_WORD = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*")
_SENTENCE_END = re.compile(r"[.!?]+(?:\s|$)")
_HYPHENATOR = pyphen.Pyphen(lang="en_US")


def numbers_in(text: str) -> list[float]:
    return [float(token.replace(",", "")) for token in _NUMBER.findall(text)]


def word_count(text: str) -> int:
    return len(text.split())


def syllables(word: str) -> int:
    return max(1, len(_HYPHENATOR.positions(word.lower())) + 1)


def reading_grade(text: str) -> float:
    """Flesch-Kincaid grade level, syllables from the pyphen en_US dictionary."""
    words = _WORD.findall(text)
    if not words:
        return 0.0
    sentences = max(1, len(_SENTENCE_END.findall(text.strip())))
    total = sum(syllables(word) for word in words)
    return 0.39 * (len(words) / sentences) + 11.8 * (total / len(words)) - 15.59


def validate(narrative: dict, facts: list[Fact]) -> list[str]:
    """Failure reasons, empty when the narrative passes."""
    problems: list[str] = []
    headline = str(narrative.get("headline", "")).strip()
    summary = str(narrative.get("summary", "")).strip()
    cited = narrative.get("fact_ids", [])
    if not headline:
        problems.append("headline is empty")
    if not summary:
        problems.append("summary is empty")
    if word_count(headline) > MAX_HEADLINE_WORDS:
        problems.append(f"headline has {word_count(headline)} words; the cap is {MAX_HEADLINE_WORDS}")
    if word_count(summary) > MAX_SUMMARY_WORDS:
        problems.append(f"summary has {word_count(summary)} words; the cap is {MAX_SUMMARY_WORDS}")

    by_id = {fact.id: fact for fact in facts}
    if not isinstance(cited, list) or not all(isinstance(item, str) for item in cited):
        problems.append("fact_ids must be a list of fact id strings")
        cited = []
    unknown = [item for item in cited if item not in by_id]
    if unknown:
        problems.append(f"unknown fact ids: {', '.join(unknown)}")
    allowed = {value for item in cited if item in by_id for value in by_id[item].numbers}
    for value in numbers_in(f"{headline} {summary}"):
        if not any(abs(value - ok) < 1e-6 for ok in allowed):
            problems.append(f"number {value:g} does not match a cited fact")

    lowered = f"{headline} {summary}".lower()
    for phrase in BANNED_PHRASES:
        if phrase in lowered:
            problems.append(f"banned phrase: {phrase}")

    grade = reading_grade(summary)
    if summary and grade > MAX_GRADE:
        problems.append(f"reading grade {grade:.1f} is above {MAX_GRADE:g}")
    return problems
