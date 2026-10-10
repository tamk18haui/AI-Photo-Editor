"""Real-ESRGAN upscale with original color preservation."""
import cv2
import numpy as np
from PIL import Image
from core.config import MAX_OUTPUT_PIXELS
from core.errors import RunnerError
from core.validation import integer
from models.realesrgan.loader import model_for


def run(image: Image.Image, args: dict) -> Image.Image:
    """Upscale by x2/x4 with CPU/GPU Real-ESRGAN weights (never interpolate as AI fallback)."""
    scale = integer(args.get("scale"), 2, 4, "scale")
    if scale not in (2, 4):
        raise RunnerError("INVALID_PARAMS", "scale must be 2 or 4", 422)
    tile = integer(args.get("tileSize", 0) or 0, 0, 2048, "tileSize")
    if image.width * image.height * scale ** 2 > MAX_OUTPUT_PIXELS:
        raise RunnerError("OUTPUT_TOO_LARGE", "Upscale output exceeds pixel limit", 413)
    engine = model_for(scale, tile)
    rgba = image.mode == "RGBA"
    rgb = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)
    output, _ = engine.enhance(rgb, outscale=scale)
    result = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))
    if rgba:
        alpha = image.getchannel("A").resize(result.size, Image.Resampling.LANCZOS)
        result.putalpha(alpha)
    return result
