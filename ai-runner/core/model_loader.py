"""Validate local model checkpoints without implicit downloads."""

from pathlib import Path

from core.errors import RunnerError
from core.model_registry import checkpoint

_GIT_LFS_HEADER = b"version https://git-lfs.github.com/spec/v1"


def is_git_lfs_pointer(path: Path) -> bool:
    """Return True when a working-tree file is only a Git LFS pointer."""
    try:
        with path.open("rb") as handle:
            return handle.read(128).startswith(_GIT_LFS_HEADER)
    except OSError:
        return False


def required_path(path: Path, model_name: str) -> Path:
    """Validate one concrete checkpoint path and reject unmaterialized LFS files."""
    if not path.is_file():
        raise RunnerError(
            "MODEL_WEIGHTS_MISSING",
            f"Checkpoint missing: {path.name}",
            503,
        )

    if is_git_lfs_pointer(path):
        raise RunnerError(
            "MODEL_WEIGHTS_NOT_MATERIALIZED",
            f"Checkpoint {path.name} is still a Git LFS pointer; run git lfs pull",
            503,
        )

    try:
        size = path.stat().st_size
    except OSError as exc:
        raise RunnerError(
            "MODEL_WEIGHTS_MISSING",
            f"Checkpoint unavailable: {path.name}",
            503,
        ) from exc

    if size <= 0:
        raise RunnerError(
            "MODEL_WEIGHTS_MISSING",
            f"Checkpoint is empty: {path.name}",
            503,
        )

    return path


def required(name: str) -> Path:
    """Resolve and validate a registered local checkpoint."""
    return required_path(checkpoint(name), name)
