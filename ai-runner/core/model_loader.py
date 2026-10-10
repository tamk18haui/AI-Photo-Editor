"""Check that required checkpoints are present before starting GPU work."""
from core.model_registry import checkpoint
from core.errors import RunnerError

def required(name: str):
    """Return a local model file or fail with a machine-readable 503."""
    path = checkpoint(name)
    if not path.is_file():
        raise RunnerError("MODEL_WEIGHTS_MISSING", f"Checkpoint missing: {path.name}", 503)
    return path
