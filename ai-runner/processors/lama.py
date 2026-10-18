"""Big-LaMa TorchScript adapter for CPU inpainting without saicinpainting."""

from functools import lru_cache
from threading import Lock

import numpy as np
from PIL import Image

from core.config import WEIGHTS
from core.errors import RunnerError
from core.model_loader import required_path
from processors.mask import require_source_mask

_INFERENCE_LOCK = Lock()


@lru_cache(maxsize=1)
def _model():
    """Load a local TorchScript model once per Python process, on CPU."""
    checkpoint = required_path(
        WEIGHTS / "lama" / "big-lama.pt",
        "lama",
    )
    try:
        import torch
        return torch.jit.load(
            str(checkpoint),
            map_location="cpu",
        ).eval()
    except RunnerError:
        raise
    except Exception as exc:
        raise RunnerError(
            "MODEL_LOAD_FAILED",
            "Cannot load the Big-LaMa TorchScript checkpoint",
            503,
        ) from exc


def run(image: Image.Image, mask: Image.Image) -> Image.Image:
    """Inpaint the selected mask area, returning original-size RGB PNG data."""
    selection = np.asarray(require_source_mask(mask, image.size), dtype=np.uint8)
    selection = (selection >= 128).astype(np.float32)
    if not np.any(selection):
        raise RunnerError("EMPTY_MASK", "Mask contains no selected pixels", 422)

    with _INFERENCE_LOCK:
        model = _model()
        import torch

        rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
        height, width = selection.shape
        padded_height = ((height + 7) // 8) * 8
        padded_width = ((width + 7) // 8) * 8

        rgb = np.pad(
            rgb,
            ((0, padded_height - height), (0, padded_width - width), (0, 0)),
            mode="edge",
        )
        selection = np.pad(
            selection,
            ((0, padded_height - height), (0, padded_width - width)),
            mode="constant",
        )

        image_tensor = torch.from_numpy(
            np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])
        )
        mask_tensor = torch.from_numpy(
            np.ascontiguousarray(selection[None, None])
        )

        try:
            with torch.inference_mode():
                output = model(image_tensor, mask_tensor)
        except Exception as exc:
            raise RunnerError(
                "AI_INFERENCE_FAILED",
                "LaMa inference failed",
                503,
            ) from exc

    if (
        not isinstance(output, torch.Tensor)
        or output.ndim != 4
        or output.shape[0] != 1
        or output.shape[1] != 3
        or output.shape[2] < height
        or output.shape[3] < width
    ):
        raise RunnerError(
            "MODEL_OUTPUT_INVALID",
            "LaMa TorchScript returned an unsupported output shape",
            503,
        )

    pixels = (
        output[0, :, :height, :width]
        .permute(1, 2, 0)
        .detach()
        .cpu()
        .numpy()
    )
    if not np.isfinite(pixels).all():
        raise RunnerError(
            "MODEL_OUTPUT_INVALID",
            "LaMa output contains non-finite values",
            503,
        )

    pixels = np.clip(pixels * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, "RGB")
# N4_HYBRID_FULL_V3_PATCHED
