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
_SENTENCE = re.compile(r"[^.!?]+(?:[.!?]+|$)")
_CORE_PHRASE = re.compile(r"\b(one|1|a|single|two|2|both)\s+cores?\b", re.IGNORECASE)
_CORE_COUNT = {"one": 1, "1": 1, "a": 1, "single": 1, "two": 2, "2": 2, "both": 2}
_CLAUSE_BREAK = re.compile(r"[,;:]|\b(?:and|or|but|while)\b", re.IGNORECASE)


def nearest_cores(sentence: str, start: int, end: int) -> int | None:
    """Core count of the "one Core"/"two Cores" phrase closest to a number, if any."""
    best: tuple[int, int] | None = None
    for match in _CORE_PHRASE.finditer(sentence):
        if match.start() <= start < match.end():
            continue
        gap = start - match.end() if match.end() <= start else match.start() - end
        if best is None or gap < best[0]:
            best = (gap, _CORE_COUNT[match.group(1).lower()])
    return None if best is None else best[1]


def clause_cores(sentence: str, start: int, end: int) -> set[int]:
    """Core counts named in the clause around a number."""
    left = max((m.end() for m in _CLAUSE_BREAK.finditer(sentence, 0, start)), default=0)
    right = next((m.start() for m in _CLAUSE_BREAK.finditer(sentence, end)), len(sentence))
    return {_CORE_COUNT[m.group(1).lower()] for m in _CORE_PHRASE.finditer(sentence[left:right])}


def fits_context(fact: Fact, sentence: str, start: int, end: int) -> bool:
    """Unit right after the number, context words anywhere in the sentence, and Core counts
    from the number's own clause (else the nearest phrase), so "2 Cores ... on one Core" fails."""
    lowered = sentence.lower()
    if fact.unit and not lowered[end:end + 12].lstrip(" -").startswith(fact.unit):
        return False
    if fact.context and not any(word in lowered for word in fact.context):
        return False
    if fact.cores is None:
        return True
    named = clause_cores(sentence, start, end)
    if named:
        return named == {fact.cores}
    return nearest_cores(sentence, start, end) == fact.cores


def number_problems(text: str, cited: list[Fact]) -> list[str]:
    """Each number must match a cited fact and sit in a sentence that says what the fact says."""
    problems: list[str] = []
    for sentence in (m.group() for m in _SENTENCE.finditer(text)):
        for match in _NUMBER.finditer(sentence):
            value = float(match.group().replace(",", ""))
            owners = [fact for fact in cited if any(abs(value - ok) < 1e-6 for ok in fact.numbers)]
            if not owners:
                problems.append(f"number {value:g} does not match a cited fact")
            elif not any(fits_context(fact, sentence, match.start(), match.end()) for fact in owners):
                problems.append(f"out of context: {value:g} should read like \"{owners[0].text}\"")
    return problems


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
    cited_facts = [by_id[item] for item in cited if item in by_id]
    problems += number_problems(headline, cited_facts)
    problems += number_problems(summary, cited_facts)

    lowered = f"{headline} {summary}".lower()
    for phrase in BANNED_PHRASES:
        if phrase in lowered:
            problems.append(f"banned phrase: {phrase}")

    grade = reading_grade(summary)
    if summary and grade > MAX_GRADE:
        problems.append(f"reading grade {grade:.1f} is above {MAX_GRADE:g}")
    return problems
