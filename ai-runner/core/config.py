"""Load private runner settings from the runner directory, independent of cwd.

OS environment variables always win over values in ``ai-runner/.env``.  This
is important when a local development file coexists with deployed secrets.
Never log ``RUNNER_TOKEN`` or return it from any API endpoint.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]

# Function: Read this runner's .env BEFORE any module captures os.getenv values.
# Using an explicit path works even if run.py is invoked from another directory.
# override=False preserves deployment/CI values already present in the process.
load_dotenv(dotenv_path=ROOT / ".env", override=False, encoding="utf-8")


def _weights_path() -> Path:
    """Return the configured weights directory, relative to this runner if needed."""
    configured = os.getenv("AI_WEIGHTS_DIR", "").strip()
    weights = Path(configured).expanduser() if configured else ROOT / "weights"
    if not weights.is_absolute():
        weights = ROOT / weights
    return weights.resolve()


WEIGHTS = _weights_path()
RUNNER_TOKEN = os.getenv("AI_RUNNER_TOKEN", "")
RUNNER_PORT = int(os.getenv("AI_RUNNER_PORT", "8010"))
MAX_BYTES = int(os.getenv("AI_INPUT_MAX_BYTES", "20971520"))
MAX_OUTPUT_BYTES = int(os.getenv("AI_OUTPUT_MAX_BYTES", "83886080"))
MAX_PIXELS = int(os.getenv("AI_MAX_INPUT_PIXELS", "40000000"))
MAX_OUTPUT_PIXELS = int(os.getenv("AI_MAX_OUTPUT_PIXELS", "80000000"))
MAX_MASK_POINTS = int(os.getenv("AI_MAX_SELECTION_POINTS", "64"))
