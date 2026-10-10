"""Real BiRefNet foreground extraction, without faked fallback masks."""
import numpy as np
from PIL import Image
from core.errors import RunnerError
from models.birefnet.loader import load
from processors.mask import apply_alpha, refine


# BiRefNet official preprocessing uses ImageNet RGB channel statistics, not (x - 0.5).
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def _normalize_for_birefnet(image: Image.Image) -> np.ndarray:
    """Return a contiguous CHW float32 tensor input using BiRefNet training normalization."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32).transpose(2, 0, 1) / 255.0
    normalized = (rgb - _IMAGENET_MEAN) / _IMAGENET_STD
    return np.ascontiguousarray(normalized, dtype=np.float32)


def background_mask(image: Image.Image) -> Image.Image:
    """Run BiRefNet on a resized inference copy and restore the original mask size."""
    import torch
    import torch.nn.functional as functional
    model, device = load()
    # BiRefNet's inference tensor is intentionally downsampled; the output isn't.
    sample = image.convert("RGB").resize((1024, 1024), Image.Resampling.BILINEAR)
    values = _normalize_for_birefnet(sample)
    tensor = torch.from_numpy(values).unsqueeze(0).to(device)
    with torch.inference_mode():
        prediction = model(tensor)
        if isinstance(prediction, (tuple, list)): prediction = prediction[-1]
        if hasattr(prediction, "logits"): prediction = prediction.logits
        if not isinstance(prediction, torch.Tensor) or prediction.ndim != 4:
            raise RunnerError("MODEL_OUTPUT_INVALID", "BiRefNet output is incompatible", 503)
        normalized = torch.sigmoid(prediction[:, :1])
        restored = functional.interpolate(normalized, (image.height, image.width), mode="bilinear", align_corners=False)
        mask = np.uint8(np.clip(restored[0, 0].float().cpu().numpy(), 0, 1) * 255)
    return Image.fromarray(mask, "L")


def run(image: Image.Image, args: dict) -> Image.Image:
    """Extract the subject and honor transparent, solid color or mask-only output."""
    mask = refine(background_mask(image), args)
    return apply_alpha(image, mask, args)
