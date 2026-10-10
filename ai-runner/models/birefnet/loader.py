from functools import lru_cache
from core.model_loader import required
from core.config import WEIGHTS
from core.device import select_device
from core.errors import RunnerError

@lru_cache(maxsize=1)
def load():
    """Function: Load and cache the compatible local BiRefNet model on CPU/CUDA."""
    required("birefnet")
    folder = WEIGHTS / "birefnet"
    if not (folder / "config.json").exists():
        raise RunnerError("MODEL_CONFIG_MISSING", "BiRefNet config.json missing", 503)
    try:
        import torch
        from transformers import AutoModelForImageSegmentation
        # Only load model code supplied and reviewed locally by the user.
        model = AutoModelForImageSegmentation.from_pretrained(
            str(folder), local_files_only=True, trust_remote_code=True)
        device = select_device()
        model.to(device).eval()
        return model, device
    except Exception as exc:
        raise RunnerError("MODEL_LOAD_FAILED", "BiRefNet checkpoint/config incompatible; see README", 503) from exc
