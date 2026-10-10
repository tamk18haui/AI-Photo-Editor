"""Single audited dispatch table for all supported AI Local operations."""
from PIL import Image
from core.errors import RunnerError
from processors import enhancement, upscale, remove_background, selection, inpainting, mask as masks, face

# Only operations intentionally owned by AI Local are registered here.
OPERATIONS = frozenset({"upscale", "remove-background", "denoise", "auto-enhance",
    "sharpen", "adjust", "white-balance", "hdr-style", "smart-selection", "refine-mask", "apply-mask",
    "replace-background", "remove-object", "inpaint",
    "face-parsing", "face-restore"})


def execute(operation: str, image: Image.Image, args: dict,
            mask: Image.Image | None = None, background: Image.Image | None = None) -> Image.Image:
    """Run a real algorithm for one request, rejecting unknown operations explicitly."""
    if operation not in OPERATIONS:
        raise RunnerError("UNSUPPORTED_OPERATION", "Unsupported AI Local operation", 404)
    if operation == "upscale": return upscale.run(image, args)
    if operation == "remove-background": return remove_background.run(image, args)
    if operation == "denoise": return enhancement.denoise(image, args)
    if operation == "auto-enhance": return enhancement.auto_enhance(image, args)
    if operation == "sharpen": return enhancement.sharpen(image, args)
    if operation == "adjust": return enhancement.adjust(image, args)
    if operation == "white-balance": return enhancement.white_balance(image, args)
    if operation == "hdr-style": return enhancement.hdr_style(image, args)
    if operation == "smart-selection": return selection.run(image, args)
    if operation == "face-parsing": return face.parsing(image, args)
    if operation == "face-restore": return face.restoration(image, args)
    if operation in ("remove-object", "inpaint"):
        return inpainting.run(image, args, mask)
    if operation == "refine-mask":
        if mask is None: raise RunnerError("MASK_REQUIRED", "Mask asset required", 422)
        return masks.refine(masks.resized_mask(mask, image.size), args)
    if operation == "apply-mask":
        if mask is None: raise RunnerError("MASK_REQUIRED", "Mask asset required", 422)
        return masks.apply_alpha(image, masks.refine(mask, args), args)
    if operation == "replace-background":
        return masks.replace_background(image, background, mask, args)
    raise RunnerError("UNSUPPORTED_OPERATION", "No processor registered", 404)
