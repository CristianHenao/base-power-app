from pipeline.persona_check import Check, close, render


def test_close_uses_relative_tolerance() -> None:
    assert close(100.0, 101.0)
    assert not close(100.0, 110.0)
    assert close(0.0, 0.0)


def test_render_counts_flags() -> None:
    text = render([Check("Sally", "a", "1", "1", True), Check("Sally", "b", "1", "2", False)])
    assert "2 checks, 1 flagged" in text
    assert "**FLAG**" in text
