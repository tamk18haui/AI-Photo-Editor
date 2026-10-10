"""Smart Selection uses a single canonical SAM ViT-B model."""
from functools import lru_cache
from threading import Lock
import numpy as np
from PIL import Image
from core.config import WEIGHTS, MAX_MASK_POINTS
from core.errors import RunnerError
from core.validation import points
from processors.mask import apply_alpha, refine

_PREDICT_LOCK = Lock()  # SamPredictor.set_image is mutable and not thread-safe.


@lru_cache(maxsize=1)
def _sam_predictor():
    """Cache the validated SAM encoder and predictor on the configured CPU/CUDA device."""
    ckpt = WEIGHTS / 'sam' / 'sam_vit_b_01ec64.pth'
    if not ckpt.is_file():
        raise RunnerError('MODEL_WEIGHTS_MISSING', 'Place sam_vit_b_01ec64.pth in weights/sam/', 503)
    try:
        from segment_anything import sam_model_registry, SamPredictor
        from core.device import select_device
        model = sam_model_registry['vit_b'](checkpoint=str(ckpt))
        model.to(device=select_device()).eval()
        return SamPredictor(model)
    except Exception as exc:
        raise RunnerError('MODEL_LOAD_FAILED', 'SAM dependency or checkpoint incompatible', 503) from exc


def generate_mask(image: Image.Image, args: dict) -> Image.Image:
    """Compute a binary mask from normalized positive/negative point prompts."""
    prompts = points(args.get('points'), MAX_MASK_POINTS)
    coords = np.asarray([[min(x * image.width, image.width-1), min(y * image.height, image.height-1)]
                         for x, y, _ in prompts], dtype=np.float32)
    labels = np.asarray([label for _, _, label in prompts], dtype=np.int32)
    rgb = np.asarray(image.convert('RGB'))
    with _PREDICT_LOCK:
        predictor = _sam_predictor()
        try:
            predictor.set_image(rgb)
            masks, scores, _ = predictor.predict(point_coords=coords, point_labels=labels,
                                                  multimask_output=True)
            mask = (masks[int(np.argmax(scores))] * 255).astype('uint8')
        except Exception as exc:
            raise RunnerError('AI_INFERENCE_FAILED', 'SAM selection failed', 503) from exc
    return Image.fromarray(mask, 'L')


def run(image: Image.Image, args: dict) -> Image.Image:
    """Return an 8-bit selection mask or cut-out with the original canvas dimensions."""
    selection = refine(generate_mask(image, args), args)
    return apply_alpha(image, selection, {**args, 'outputMode': args.get('outputMode', 'MASK_ONLY')})
