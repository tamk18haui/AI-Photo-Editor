"""High-resolution alpha masks and compositing used by segmentation operations."""
import re
import numpy as np
from PIL import Image, ImageFilter
from core.errors import RunnerError
from core.validation import number, choice


def resized_mask(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Upsample a segmentation mask to original image size, not vice versa."""
    return mask.convert("L").resize(size, Image.Resampling.BILINEAR)


def refine(mask: Image.Image, args: dict) -> Image.Image:
    """Smooth mask edges at full resolution using bounded feather and dilation."""
    pixels = number(args.get("feather", 0), 0, 30, "feather")
    grow = int(number(args.get("grow", 0), -20, 20, "grow"))
    output = mask.convert("L")
    if grow:
        size = min(41, 2 * abs(grow) + 1)
        output = output.filter(ImageFilter.MaxFilter(size) if grow > 0 else ImageFilter.MinFilter(size))
    if pixels:
        output = output.filter(ImageFilter.GaussianBlur(float(pixels)))
    return output


def apply_alpha(image: Image.Image, mask: Image.Image, args: dict) -> Image.Image:
    """Keep original RGB pixels and apply 8-bit alpha from the mask."""
    mode = choice(args.get("outputMode", "TRANSPARENT"), {"TRANSPARENT", "WHITE", "COLOR", "MASK_ONLY"}, "outputMode")
    mask = resized_mask(mask, image.size)
    if mode == "MASK_ONLY": return mask
    result = image.convert("RGBA")
    old_alpha = np.asarray(result.getchannel("A"), dtype=np.float32) / 255
    new_alpha = np.asarray(mask, dtype=np.float32) / 255
    result.putalpha(Image.fromarray(np.uint8(np.clip(old_alpha * new_alpha, 0, 1) * 255), "L"))
    if mode == "TRANSPARENT": return result
    color = "#FFFFFF" if mode == "WHITE" else args.get("backgroundColor", "")
    if not isinstance(color, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        raise RunnerError("INVALID_PARAMS", "backgroundColor must be #RRGGBB", 422)
    background = Image.new("RGBA", image.size, color)
    background.alpha_composite(result)
    return background.convert("RGB")


def replace_background(image: Image.Image, background: Image.Image | None, mask: Image.Image | None, args: dict) -> Image.Image:
    """Composite extracted subject over another project asset or a solid color."""
    if mask is None:
        from processors.remove_background import background_mask
        mask = background_mask(image)
    subject = apply_alpha(image, mask, {"outputMode": "TRANSPARENT"})
    if background is not None:
        canvas = background.convert("RGBA").resize(image.size, Image.Resampling.LANCZOS)
    else:
        color = args.get("backgroundColor", "#FFFFFF")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise RunnerError("INVALID_PARAMS", "backgroundColor must be #RRGGBB", 422)
        canvas = Image.new("RGBA", image.size, color)
    canvas.alpha_composite(subject)
    return canvas.convert("RGB")
