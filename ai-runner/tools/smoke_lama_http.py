"""Verify live Python Runner remove-object HTTP with the TorchScript checkpoint.

Launch ``python run.py`` in another terminal before running this command.
The token is read from ai-runner/.env via core.config; it is never printed.
"""
from io import BytesIO
import json
from pathlib import Path
from tempfile import gettempdir
import sys

import httpx
from PIL import Image, ImageDraw

from core.config import RUNNER_PORT, RUNNER_TOKEN


def main() -> int:
    if not RUNNER_TOKEN:
        print("FAIL: AI_RUNNER_TOKEN is empty in .env or the process environment")
        return 2
    source = Image.new("RGB", (160, 120), "#cecece")
    ImageDraw.Draw(source).rectangle((64, 40, 96, 82), fill="#2255bb")
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).rectangle((62, 38, 98, 84), fill=255)

    def png(image):
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    url = f"http://127.0.0.1:{RUNNER_PORT}/v1/run/remove-object"
    try:
        response = httpx.post(
            url,
            headers={"X-Runner-Token": RUNNER_TOKEN},
            data={"params": json.dumps({"method": "LAMA"})},
            files={
                "file": ("source.png", png(source), "image/png"),
                "mask": ("mask.png", png(mask), "image/png"),
            },
            timeout=420.0,
        )
    except httpx.RequestError as exc:
        print(f"HTTP_FAIL: {type(exc).__name__} — check that run.py is running on port {RUNNER_PORT}")
        return 1

    if response.status_code != 200:
        # Response should be a structured error, never print credentials.
        print("HTTP_FAIL:", response.status_code, response.text[:500])
        return 1
    if not response.headers.get("content-type", "").startswith("image/png"):
        print("HTTP_FAIL: server returned unexpected content type")
        return 1
    try:
        with Image.open(BytesIO(response.content)) as output:
            output.load()
            if output.size != source.size or output.mode not in {"RGB", "RGBA"}:
                print("HTTP_FAIL: wrong output image shape or mode", output.size, output.mode)
                return 1
    except Exception as exc:
        print("HTTP_FAIL: invalid response PNG", type(exc).__name__)
        return 1

    output_dir = Path(gettempdir()) / "AI-Local-Smoke-Results"
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / "lama_http_result.png"
    file_path.write_bytes(response.content)
    print("LAMA_HTTP_PASS", source.size, "->", file_path)
    print("NOTE: inspect output visually; this confirms only technical inference")
    return 0


if __name__ == "__main__":
    sys.exit(main())
