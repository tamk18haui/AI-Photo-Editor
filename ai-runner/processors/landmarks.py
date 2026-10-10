"""MediaPipe Face Landmarker returns landmark data for the selected image."""
from functools import lru_cache
from threading import Lock
import numpy as np
from PIL import Image
from core.config import WEIGHTS
from core.errors import RunnerError

_LOCK = Lock()

@lru_cache(maxsize=1)
def _detector():
    """Load a local Face Landmarker task; never download checkpoints implicitly."""
    path = WEIGHTS / 'mediapipe' / 'face_landmarker.task'
    if not path.is_file():
        raise RunnerError('MODEL_WEIGHTS_MISSING', 'Place face_landmarker.task in weights/mediapipe/', 503)
    try:
        import mediapipe as mp
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(path)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=5)
        return mp.tasks.vision.FaceLandmarker.create_from_options(options)
    except Exception as exc:
        raise RunnerError('MODEL_LOAD_FAILED', 'Face Landmarker task or MediaPipe installation incompatible', 503) from exc


def run(image: Image.Image) -> dict:
    """Return normalized x/y/z landmarks as JSON, never an altered image."""
    detector = _detector()  # Check weights before optional imports.
    try:
        import mediapipe as mp
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB,
                            data=np.ascontiguousarray(np.asarray(image.convert('RGB'))))
        with _LOCK:
            output = detector.detect(mp_image)
        return {'faceCount': len(output.face_landmarks), 'faces': [
            {'landmarks': [{'x': float(p.x), 'y': float(p.y), 'z': float(p.z)} for p in group]}
            for group in output.face_landmarks]}
    except RunnerError:
        raise
    except Exception as exc:
        raise RunnerError('AI_INFERENCE_FAILED', 'Face landmark inference failed', 503) from exc


def detect_face_boxes(image: Image.Image, expand_ratio: float = 0.45,
                      min_size: int = 24) -> list[tuple[int, int, int, int]]:
    """Detect padded head crops from genuine Face Landmarker landmarks.

    Expand above landmark forehead so the face-parser sees hair. Use square
    bounding crops where possible, preserving proportions for the ONNX model.
    No fabricated boxes are returned when no face is detected.
    """
    detector = _detector()
    try:
        import mediapipe as mp
        rgb = image.convert('RGB')
        width, height = rgb.size
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB,
                            data=np.ascontiguousarray(np.asarray(rgb)))
        with _LOCK:
            detected = detector.detect(mp_image)
        boxes = []
        for group in detected.face_landmarks:
            if not group:
                continue
            xs = [float(p.x) * width for p in group]
            ys = [float(p.y) * height for p in group]
            if not (np.all(np.isfinite(xs)) and np.all(np.isfinite(ys))):
                continue
            left, right = min(xs), max(xs)
            top, bottom = min(ys), max(ys)
            fw, fh = right - left, bottom - top
            if fw < min_size or fh < min_size:
                continue
            # Landmarker contours end at forehead, NOT at top of hair.
            left -= fw * expand_ratio
            right += fw * expand_ratio
            top -= fh * max(0.8, 1.8 * expand_ratio)
            bottom += fh * max(0.25, 0.65 * expand_ratio)
            cx, cy = (left + right) / 2, (top + bottom) / 2
            side = max(right - left, bottom - top)
            # Keep a square crop within the original image whenever practical.
            side = min(side, width, height)
            x1 = int(round(max(0, min(width - side, cx - side / 2))))
            y1 = int(round(max(0, min(height - side, cy - side / 2))))
            x2 = int(round(min(width, x1 + side)))
            y2 = int(round(min(height, y1 + side)))
            if x2 - x1 >= min_size and y2 - y1 >= min_size:
                boxes.append((x1, y1, x2, y2))
        boxes.sort(key=lambda b: (b[2]-b[0]) * (b[3]-b[1]), reverse=True)
        return boxes
    except RunnerError:
        raise
    except Exception as exc:
        raise RunnerError('AI_INFERENCE_FAILED', 'Face box detection failed', 503) from exc
