"""xAI (Grok) adapter for the narrator, over the OpenAI-compatible chat endpoint.

The key comes from the XAI_API_KEY environment variable and never from code.
Standard library only, so the API image needs no extra dependency.
"""
from __future__ import annotations

import json
import os
import urllib.request
from collections.abc import Callable

from api.app.narrator.narrate import ModelCall

XAI_URL = "https://api.x.ai/v1/chat/completions"
XAI_MODEL = "grok-4.20-0309-non-reasoning"
KEY_ENV = "XAI_API_KEY"

# (url, headers, body bytes, timeout in seconds) -> response body bytes.
Post = Callable[[str, dict[str, str], bytes, float], bytes]


def _urllib_post(url: str, headers: dict[str, str], body: bytes, timeout_s: float) -> bytes:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout_s) as response:
        return response.read()


def chat_body(model: str, system: str, user: str) -> dict:
    """Deterministic JSON-mode request. The validator, not the model, decides what ships."""
    return {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }


def reply_text(payload: dict) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise ValueError(f"unexpected xAI response shape: {error}") from error
    if not isinstance(content, str) or not content.strip():
        raise ValueError("xAI reply is empty")
    return content


def xai_call(model: str = XAI_MODEL, api_key: str | None = None, post: Post = _urllib_post) -> ModelCall:
    """A `ModelCall` bound to one Grok model. Fails fast when no key is set."""
    key = api_key if api_key is not None else os.environ.get(KEY_ENV, "")
    if not key:
        raise RuntimeError(f"{KEY_ENV} is not set")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def call(system: str, user: str, timeout_s: float) -> str:
        body = json.dumps(chat_body(model, system, user)).encode()
        return reply_text(json.loads(post(XAI_URL, headers, body, timeout_s)))

    return call
