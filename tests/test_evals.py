import pytest

from evals.score import RECORDED_DIR, failure_kind, fixtures, score_folder

CASES = fixtures()


def test_there_are_24_fixtures():
    assert len(CASES) == 24


@pytest.mark.parametrize("folder", sorted(path for path in RECORDED_DIR.iterdir() if path.is_dir()), ids=lambda p: p.name)
def test_recorded_outputs_are_scored(folder):
    score = score_folder(folder, CASES)
    assert score["cases"] == 24
    if folder.name == "template":
        assert score["passed"] == 24, score["reasons"]


def test_failure_kinds_group_reasons():
    assert failure_kind("number 18 does not match a cited fact") == "number not in cited facts"
    assert failure_kind("banned phrase: guarantee") == "banned phrase"
