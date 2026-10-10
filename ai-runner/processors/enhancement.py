"""Deterministic CPU enhancements; these are actual pixel transformations."""
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from core.validation import choice, number
from processors.analyze_quality import run as quality


def denoise(image: Image.Image, args: dict) -> Image.Image:
    """Apply real non-local means denoising at the requested strength."""
    strength = choice(args.get("strength", "MEDIUM"), {"LOW", "MEDIUM", "HIGH"}, "strength")
    h = {"LOW": 3, "MEDIUM": 7, "HIGH": 12}[strength]
    rgb = np.asarray(image.convert("RGB"))
    result = cv2.fastNlMeansDenoisingColored(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), None, h, h, 7, 21)
    return preserve_alpha(image, Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB)))


def auto_enhance(image: Image.Image, args: dict) -> Image.Image:
    """Balance exposure and local contrast while keeping original dimensions."""
    mode = choice(args.get("mode", "AUTO"), {"AUTO", "PORTRAIT", "LANDSCAPE", "DOCUMENT"}, "mode")
    output = image.convert("RGB")
    info = quality(output)
    if info["brightness"] < 0.43:
        output = ImageEnhance.Brightness(output).enhance(min(1.55, 0.48 / max(info["brightness"], 0.12)))
    rgb = np.asarray(output)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    l,a,b = cv2.split(lab)
    clip = 1.25 if mode == "PORTRAIT" else (2.25 if mode == "DOCUMENT" else 1.7)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    output = Image.fromarray(cv2.cvtColor(cv2.merge([l,a,b]), cv2.COLOR_LAB2RGB))
    return preserve_alpha(image, ImageEnhance.Color(output).enhance(1.05 if mode != "DOCUMENT" else 1.0))


def sharpen(image: Image.Image, args: dict) -> Image.Image:
    """Apply unsharp masking to the chosen image asset."""
    radius = number(args.get("radius", 1.5), 0.2, 10, "radius")
    amount = number(args.get("amount", 120), 0, 500, "amount")
    return preserve_alpha(image, image.convert("RGB").filter(ImageFilter.UnsharpMask(radius=radius, percent=int(amount), threshold=2)))


def adjust(image: Image.Image, args: dict) -> Image.Image:
    """Adjust brightness, contrast, saturation and exposure on one image."""
    output = image.convert("RGB")
    for key, method in [("brightness", ImageEnhance.Brightness), ("contrast", ImageEnhance.Contrast),
                        ("saturation", ImageEnhance.Color)]:
        output = method(output).enhance(number(args.get(key, 1.0), 0, 4, key))
    exposure = number(args.get("exposure", 0.0), -3, 3, "exposure")
    return preserve_alpha(image, ImageEnhance.Brightness(output).enhance(2 ** exposure))


def preserve_alpha(original: Image.Image, processed: Image.Image) -> Image.Image:
    """Preserve transparent layer pixels across RGB-only enhancement algorithms."""
    if original.mode == "RGBA":
        processed = processed.convert("RGBA")
        processed.putalpha(original.getchannel("A"))
    return processed


def white_balance(image: Image.Image, args: dict) -> Image.Image:
    """Correct white balance with controlled gray-world channel gains."""
    strength = number(args.get("strength", 0.7), 0, 1, "strength")
    pixels = np.asarray(image.convert("RGB"),dtype=np.float32)
    means = pixels.reshape(-1,3).mean(axis=0)
    neutral = float(means.mean())
    gains = (1 - strength) + strength * neutral / np.maximum(means, 1.0)
    corrected = np.uint8(np.clip(pixels * np.clip(gains, 0.6, 1.6), 0, 255))
    return preserve_alpha(image, Image.fromarray(corrected, "RGB"))

def hdr_style(image: Image.Image, args: dict) -> Image.Image:
    """Create an HDR-style local-contrast look from one frame (not true bracketed HDR)."""
    strength = number(args.get("strength", 0.6), 0, 1, "strength")
    pixels = np.asarray(image.convert("RGB"))
    lab = cv2.cvtColor(pixels, cv2.COLOR_RGB2LAB)
    light, a, b = cv2.split(lab)
    lifted = cv2.createCLAHE(clipLimit=1 + 2.5*strength, tileGridSize=(8,8)).apply(light)
    merged = cv2.cvtColor(cv2.merge([lifted,a,b]), cv2.COLOR_LAB2RGB)
    output = Image.blend(Image.fromarray(pixels), Image.fromarray(merged), strength)
    return preserve_alpha(image, output)
