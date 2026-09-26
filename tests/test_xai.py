import json
import os

import pytest

from api.app.narrator.xai import XAI_URL, chat_body, reply_text, xai_call
from evals.record import as_reply, load_env, record_case
from tests.test_narrator import GOOD, _report


def _payload(content: str) -> bytes:
    return json.dumps({"choices": [{"message": {"role": "assistant", "content": content}}]}).encode()


def test_call_posts_json_mode_request_with_bearer_key():
    seen = {}

    def post(url, headers, body, timeout_s):
        seen.update(url=url, headers=headers, body=json.loads(body), timeout=timeout_s)
        return _payload('{"headline": "h"}')

    call = xai_call("grok-test", api_key="k", post=post)
    assert call("sys", "user", 5.0) == '{"headline": "h"}'
    assert seen["url"] == XAI_URL
    assert seen["headers"]["Authorization"] == "Bearer k"
    assert seen["body"] == chat_body("grok-test", "sys", "user")
    assert seen["body"]["temperature"] == 0
    assert seen["timeout"] == 5.0


def test_missing_key_fails_fast(monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="XAI_API_KEY"):
        xai_call()


@pytest.mark.parametrize("payload", [{}, {"choices": []}, {"choices": [{"message": {"content": " "}}]}])
def test_bad_response_shapes_raise(payload):
    with pytest.raises(ValueError):
        reply_text(payload)


def test_load_env_does_not_override(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('# comment\nPORCH_A="one"\nPORCH_B=two\n')
    monkeypatch.setenv("PORCH_B", "kept")
    monkeypatch.delenv("PORCH_A", raising=False)
    load_env(env)
    assert os.environ["PORCH_A"] == "one"
    assert os.environ["PORCH_B"] == "kept"


def test_non_json_reply_records_as_empty():
    assert as_reply("sorry") == {"headline": "", "summary": "", "fact_ids": []}


def test_record_case_keeps_first_and_retried_replies():
    replies = iter(['{"headline": "", "summary": "", "fact_ids": []}', json.dumps(GOOD)])
    first, final, note = record_case(_report(), lambda s, u, t: next(replies))
    assert first["headline"] == ""
    assert final == GOOD
    assert note["status"] == "retried" and note["attempts"] == 2


def test_record_case_marks_a_failed_first_call_empty():
    calls = iter([TimeoutError("slow"), json.dumps(GOOD)])

    def call(system, user, timeout_s):
        item = next(calls)
        if isinstance(item, Exception):
            raise item
        return item

    first, final, note = record_case(_report(), call)
    assert first == {"headline": "", "summary": "", "fact_ids": []}
    assert final == GOOD
    assert note["status"] == "retried"
