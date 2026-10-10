"""Regression tests for deterministic, safe auto-loading of ai-runner/.env."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


SOURCE = Path(__file__).resolve().parents[1] / "core" / "config.py"


def probe_config(tmp_path, env_file: str | None, overrides: dict | None = None) -> dict:
    """Import a staged config from another cwd to test file precedence."""
    root = tmp_path / "isolated-runner"
    core = root / "core"
    core.mkdir(parents=True)
    shutil.copyfile(SOURCE, core / "config.py")
    if env_file is not None:
        (root / ".env").write_text(env_file, encoding="utf-8")
    clean_env = {k: v for k, v in os.environ.items() if not k.startswith("AI_")}
    clean_env.update(overrides or {})
    code = (
        "import importlib.util, json, sys; "
        "p=sys.argv[1]; spec=importlib.util.spec_from_file_location('staged',p); "
        "cfg=importlib.util.module_from_spec(spec); spec.loader.exec_module(cfg); "
        "print(json.dumps({'token':cfg.RUNNER_TOKEN,'port':cfg.RUNNER_PORT,"
        "'weights':str(cfg.WEIGHTS),'max_bytes':cfg.MAX_BYTES}))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code, str(core / "config.py")],
        cwd=tmp_path,
        env=clean_env,
        check=True,
        text=True,
        capture_output=True,
        timeout=15,
    )
    return json.loads(result.stdout.strip())


def test_runner_loads_env_independent_of_working_directory(tmp_path):
    """Token, port and limits must load from the runner's own .env file."""
    result = probe_config(
        tmp_path,
        "AI_RUNNER_TOKEN=local-from-dotenv\nAI_RUNNER_PORT=8765\n"
        "AI_INPUT_MAX_BYTES=123456\nAI_WEIGHTS_DIR=custom-weights\n",
    )
    assert result["token"] == "local-from-dotenv"
    assert result["port"] == 8765
    assert result["max_bytes"] == 123456
    assert Path(result["weights"]) == (tmp_path / "isolated-runner" / "custom-weights").resolve()


def test_process_environment_overrides_env_file(tmp_path):
    """Production and CI secrets must override local .env values."""
    result = probe_config(
        tmp_path,
        "AI_RUNNER_TOKEN=local-secret\nAI_RUNNER_PORT=8010\n",
        {"AI_RUNNER_TOKEN": "deployment-secret", "AI_RUNNER_PORT": "8123"},
    )
    assert result["token"] == "deployment-secret"
    assert result["port"] == 8123


def test_runner_defaults_without_env_file(tmp_path):
    """An absent .env leaves authentication unconfigured (fail-closed)."""
    result = probe_config(tmp_path, None)
    assert result["token"] == ""
    assert result["port"] == 8010
    assert Path(result["weights"]) == (tmp_path / "isolated-runner" / "weights").resolve()
