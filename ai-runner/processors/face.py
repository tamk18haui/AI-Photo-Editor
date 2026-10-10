"""Face parsing via detector crops and GFPGAN face restoration."""
from functools import lru_cache
import cv2
import numpy as np
from PIL import Image
from core.config import WEIGHTS
from core.errors import RunnerError
from core.validation import integer, number, choice
from models.face_parsing.loader import infer_labels, labels_to_binary, labels_to_color
from processors.landmarks import detect_face_boxes


def parsing(image: Image.Image, args: dict) -> Image.Image:
    """Detect, crop and parse up to five faces; restore labels to source canvas.

    Default LABEL_MAP preserves original contract (grayscale class indices).
    COLOR and OVERLAY are human-readable previews; BINARY_MASK targets a class.
    """
    rgb = image.convert('RGB')
    width, height = rgb.size
    mode = choice(str(args.get('outputMode', 'LABEL_MAP')).upper(),
                  {'LABEL_MAP', 'COLOR', 'OVERLAY', 'BINARY_MASK'}, 'outputMode')
    class_id = args.get('classId')
    if class_id is not None:
        class_id = integer(class_id, 0, 18, 'classId')
    alpha = number(args.get('alpha', 0.55), 0.0, 1.0, 'alpha')
    expansion = number(args.get('expandRatio', 0.45), 0.0, 1.0, 'expandRatio')
    min_size = integer(args.get('minFaceSize', 24), 8, 512, 'minFaceSize')
    # Presentation only: raw LABEL_MAP and mask semantics remain unchanged.
    # FACE_ONLY prevents rectangular crop borders from neck/cloth labels
    # (14, 15, 16) appearing in a human-readable OVERLAY preview.
    preview_regions = choice(str(args.get('previewRegions', 'FACE_ONLY')).upper(),
                             {'FACE_ONLY', 'ALL_CLASSES'}, 'previewRegions')

    boxes = detect_face_boxes(rgb, expand_ratio=expansion, min_size=min_size)
    if not boxes:
        raise RunnerError('NO_FACE_DETECTED', 'No detectable face in image', 422)

    labels = np.zeros((height, width), dtype=np.uint8)
    covered = np.zeros((height, width), dtype=bool)
    for x1, y1, x2, y2 in boxes:
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            raise RunnerError('MODEL_OUTPUT_INVALID', 'Invalid face crop coordinates', 503)
        cropped_labels = infer_labels(rgb.crop((x1, y1, x2, y2)))
        restored_labels = cv2.resize(cropped_labels,
                                      (x2 - x1, y2 - y1),
                                      interpolation=cv2.INTER_NEAREST)
        if restored_labels.dtype != np.uint8 or restored_labels.ndim != 2:
            raise RunnerError('MODEL_OUTPUT_INVALID', 'Invalid face label array', 503)
        # Non-background pixels of smaller faces override overlapping large face crops.
        selection = restored_labels != 0
        region = labels[y1:y2, x1:x2]
        np.copyto(region, restored_labels, where=selection)
        covered[y1:y2, x1:x2] |= selection

    if mode == 'LABEL_MAP':
        if class_id is None:
            return Image.fromarray(labels, 'L')
        return Image.fromarray(labels_to_binary(labels, class_id, covered), 'L')

    if mode == 'BINARY_MASK':
        return Image.fromarray(labels_to_binary(labels, class_id, covered), 'L')

    colors = labels_to_color(labels)
    active = (labels != 0) if class_id is None else (labels == class_id) & covered
    if mode == 'COLOR':
        result = np.zeros_like(colors)
        result[active] = colors[active]
        return Image.fromarray(result, 'RGB')

    if class_id is None and preview_regions == 'FACE_ONLY':
        # Show skin, facial features, hair and hats; hide collar, neck and
        # clothing predictions, which often hit the straight crop border.
        # An explicit classId overrides this presentation filter so users
        # can still inspect any class (including 14, 15, 16) in OVERLAY.
        active &= ((labels >= 1) & (labels <= 13)) | (labels >= 17)

    base = np.asarray(rgb, dtype=np.uint8).copy()
    output = base.copy()
    # Blend only segmented face-part pixels. Keep everything else unchanged.
    output[active] = np.rint(base[active] * (1.0 - alpha) + colors[active] * alpha).astype(np.uint8)
    return Image.fromarray(output, 'RGB')


@lru_cache(maxsize=1)
def _restorer():
    """Initialize GFPGAN v1.4 from an explicit checkpoint path."""
    ckpt = WEIGHTS / "face" / "GFPGANv1.4.pth"
    if not ckpt.is_file():
        raise RunnerError("MODEL_WEIGHTS_MISSING", "GFPGANv1.4.pth is missing", 503)
    try:
        from gfpgan import GFPGANer
        return GFPGANer(model_path=str(ckpt), upscale=1, arch="clean", channel_multiplier=2,
                        bg_upsampler=None)
    except Exception as exc:
        raise RunnerError("MODEL_LOAD_FAILED", "GFPGAN dependency/weight incompatible", 503) from exc


def restoration(image: Image.Image, args: dict) -> Image.Image:
    """Restore detected facial details while preserving input canvas dimensions."""
    from core.validation import number
    fidelity = number(args.get("fidelity", 0.7), 0, 1, "fidelity")
    engine = _restorer()
    bgr = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)
    try:
        _, _, restored = engine.enhance(bgr, has_aligned=False, only_center_face=False, paste_back=True)
        if restored is None: raise RuntimeError("No restoration result")
        output = Image.fromarray(cv2.cvtColor(restored, cv2.COLOR_BGR2RGB))
        output = output.resize(image.size, Image.Resampling.LANCZOS)
        return Image.blend(output, image.convert("RGB"), fidelity)
    except Exception as exc:
        raise RunnerError("AI_INFERENCE_FAILED", "Face restoration inference failed", 503) from exc
