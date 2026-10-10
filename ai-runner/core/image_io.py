"""Secure image decoding/encoding, including orientation and alpha."""
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from core.config import MAX_BYTES, MAX_PIXELS, MAX_OUTPUT_PIXELS, MAX_OUTPUT_BYTES
from core.errors import RunnerError

SUPPORTED = {"JPEG", "PNG", "WEBP"}


def decode(data: bytes, *, mask: bool = False) -> Image.Image:
    """Decode a bounded image and apply EXIF orientation once.

    Args:
        data: Raw uploaded file bytes.
        mask: True for grayscale segmentation inputs.
    Returns:
        A detached RGB/RGBA or L image.
    Raises:
        RunnerError: Missing, oversize, truncated or unsupported images.
    """
    if not data or len(data) > MAX_BYTES:
        raise RunnerError("INVALID_IMAGE", "Image exceeds upload limit or is empty", 413)
    try:
        with Image.open(BytesIO(data)) as raw:
            if raw.format not in SUPPORTED:
                raise RunnerError("INVALID_IMAGE", "Only JPEG, PNG and WebP are supported", 422)
            if raw.width * raw.height > MAX_PIXELS:
                raise RunnerError("IMAGE_TOO_LARGE", "Image exceeds pixel limit", 413)
            raw.load()
            oriented = ImageOps.exif_transpose(raw)
            return oriented.convert("L" if mask else ("RGBA" if oriented.mode == "RGBA" else "RGB"))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise RunnerError("INVALID_IMAGE", "Invalid or damaged image", 422) from exc


def to_png(image: Image.Image) -> bytes:
    """Encode a result as PNG without silently downscaling the original pixels."""
    if image.width * image.height > MAX_OUTPUT_PIXELS:
        raise RunnerError("OUTPUT_TOO_LARGE", "Result exceeds configured pixel limit", 413)
    buff = BytesIO()
    image.save(buff, format="PNG", optimize=True)
    payload = buff.getvalue()
    if len(payload) > MAX_OUTPUT_BYTES:
        raise RunnerError("OUTPUT_TOO_LARGE", "PNG exceeds output byte limit", 413)
    return payload
