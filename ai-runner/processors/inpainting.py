"""Object removal via Big-LaMa; optional classical inpaint; no generative outpaint substitution."""
import cv2
import numpy as np
from PIL import Image
from core.errors import RunnerError
from core.validation import choice, number
from processors.mask import resized_mask


def run(image: Image.Image, args: dict, mask: Image.Image | None) -> Image.Image:
    """Remove masked objects using LaMa or explicitly requested classical OpenCV."""
    if mask is None:
        raise RunnerError('MASK_REQUIRED', 'maskAssetId is required to remove an object', 422)
    method = choice(args.get('method', 'LAMA'), {'LAMA', 'OPENCV'}, 'method')
    if method == 'LAMA':
        from processors.lama import run as run_lama
        return run_lama(image, mask)
    selection = np.asarray(resized_mask(mask, image.size), dtype=np.uint8)
    selection = ((selection >= 128) * 255).astype('uint8')
    if not np.any(selection):
        raise RunnerError('EMPTY_MASK', 'Selection mask is empty', 422)
    radius = number(args.get('radius', 3), 1, 15, 'radius')
    bgr = cv2.cvtColor(np.asarray(image.convert('RGB')), cv2.COLOR_RGB2BGR)
    result = cv2.inpaint(bgr, selection, radius, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
