"""BiSeNet ResNet34 ONNX: genuine 19-class face parsing on an aligned face crop.

The public processor handles detection and placement. The legacy run() remains
for internal callers/tests expecting raw cropped inference.
"""
from functools import lru_cache

import numpy as np
from PIL import Image

from core.config import WEIGHTS
from core.errors import RunnerError
from core.validation import integer

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)
PALETTE = np.array([
    [0, 0, 0], [255, 204, 153], [153, 102, 51], [153, 102, 51],
    [51, 102, 255], [51, 102, 255], [0, 255, 255], [255, 102, 102],
    [255, 102, 102], [255, 153, 102], [255, 180, 50], [255, 255, 153],
    [204, 102, 153], [153, 0, 102], [153, 180, 255], [102, 204, 102],
    [76, 153, 76], [153, 51, 255], [255, 255, 255],
], dtype=np.uint8)


@lru_cache(maxsize=1)
def load():
    path = WEIGHTS / 'face_parsing' / 'resnet34.onnx'
    if not path.is_file():
        raise RunnerError('MODEL_WEIGHTS_MISSING', 'Face Parsing needs face_parsing/resnet34.onnx', 503)
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
        inp = session.get_inputs()[0]
        if len(inp.shape) != 4:
            raise ValueError('Expected NCHW ONNX input')
        return session, inp.name
    except Exception as exc:
        raise RunnerError('MODEL_LOAD_FAILED', 'Cannot initialize BiSeNet ResNet34 ONNX', 503) from exc


def infer_labels(image: Image.Image) -> np.ndarray:
    """Infer unmodified class indices (0..18) from one cropped face image."""
    session, input_name = load()
    crop = image.convert('RGB').resize((512, 512), Image.Resampling.BILINEAR)
    values = (np.asarray(crop, dtype=np.float32) / 255.0 - MEAN) / STD
    batch = np.transpose(values, (2, 0, 1))[None].copy()
    try:
        raw = session.run(None, {input_name: batch})[0]
        if raw.ndim != 4 or raw.shape[0] != 1 or raw.shape[1] != 19:
            raise ValueError(f'Unexpected face parsing shape {raw.shape}')
        labels = np.argmax(raw[0], axis=0).astype(np.uint8)
        return labels
    except Exception as exc:
        raise RunnerError('MODEL_OUTPUT_INVALID', 'Face parsing inference failed or wrong ONNX output', 503) from exc


def labels_to_binary(labels: np.ndarray, class_id: int | None = None,
                     coverage: np.ndarray | None = None) -> np.ndarray:
    if class_id is None:
        selected = labels != 0
    else:
        selected = labels == integer(class_id, 0, 18, 'classId')
    if coverage is not None:
        selected = selected & coverage
    return selected.astype(np.uint8) * 255


def labels_to_color(labels: np.ndarray) -> np.ndarray:
    if labels.dtype != np.uint8 or np.any(labels > 18):
        raise RunnerError('MODEL_OUTPUT_INVALID', 'Labels must be uint8 in range 0..18', 503)
    return PALETTE[labels]


def run(image: Image.Image, args: dict) -> Image.Image:
    """Compatibility wrapper, running ONNX directly on a pre-cropped face.

    The main face-parsing processor uses infer_labels() on detector crops.
    """
    labels = infer_labels(image)
    out = Image.fromarray(labels, 'L').resize(image.size, Image.Resampling.NEAREST)
    if args.get('classId') is not None:
        return Image.fromarray(labels_to_binary(np.asarray(out),
             integer(args['classId'], 0, 18, 'classId')), 'L')
    return out
