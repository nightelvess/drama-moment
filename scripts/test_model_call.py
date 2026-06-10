#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from urllib import error, request


ROOT_DIR = Path(__file__).resolve().parents[1]
SETTINGS_FILE = ROOT_DIR / "data" / "model-settings.json"


def load_settings() -> dict[str, Any]:
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method="POST")
    with request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_payload(endpoint_id: str, text_prompt: str, video_url: str | None) -> dict[str, Any]:
    if video_url:
        user_content: Any = [
            {"type": "text", "text": text_prompt},
            {"type": "video_url", "video_url": {"url": video_url}},
        ]
    else:
        user_content = text_prompt

    return {
        "model": endpoint_id,
        "messages": [
            {
                "role": "system",
                "content": "You are a concise assistant. Respond briefly.",
            },
            {
                "role": "user",
                "content": user_content,
            },
        ],
    }


def extract_text(response_json: dict[str, Any]) -> str:
    choices = response_json.get("choices") or []
    if not choices:
        return json.dumps(response_json, ensure_ascii=False)
    content = choices[0].get("message", {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        if parts:
            return "".join(parts)
    return json.dumps(response_json, ensure_ascii=False)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Local smoke test for Volcengine Ark endpoint configuration."
    )
    parser.add_argument(
        "--prompt",
        default="请只回复 OK",
        help="Text prompt for the model. Default is a minimal ping.",
    )
    parser.add_argument(
        "--video-url",
        help="Optional public video URL. If provided, the request becomes multimodal.",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Print the raw JSON response instead of extracting text.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = load_settings()
    api_base_url = str(settings.get("apiBaseUrl", "")).rstrip("/")
    endpoint_id = str(settings.get("endpointId", "")).strip()
    api_key = str(settings.get("apiKey", "")).strip()

    if not api_base_url:
        print("Missing apiBaseUrl in data/model-settings.json", file=sys.stderr)
        return 2
    if not endpoint_id:
        print("Missing endpointId in data/model-settings.json", file=sys.stderr)
        return 2
    if not api_key:
        print("Missing apiKey in data/model-settings.json", file=sys.stderr)
        return 2

    payload = build_payload(endpoint_id, args.prompt, args.video_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response_json = post_json(f"{api_base_url}/chat/completions", payload, headers)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}\n{detail}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    if args.raw:
        print(json.dumps(response_json, ensure_ascii=False, indent=2))
    else:
        print(extract_text(response_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
