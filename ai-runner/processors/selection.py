"""Smart Selection uses a single canonical SAM ViT-B model.

Supported prompt styles:
- points: legacy positive/negative click prompts
- positiveBrushStrokes / negativeBrushStrokes: freehand brush strokes over the object
- lassoPolygon: a freehand polygon drawn around the object
- box / boxes: normalized rectangular prompts

All prompt coordinates are normalized in the range [0, 1].
"""
from functools import lru_cache
from threading import Lock

import numpy as np
from PIL import Image

from core.config import WEIGHTS, MAX_MASK_POINTS
from core.errors import RunnerError
from core.model_loader import required_path
from core.validation import points
from processors.mask import apply_alpha, refine

_PREDICT_LOCK = Lock()


@lru_cache(maxsize=1)
def _sam_predictor():
    """Cache the validated SAM encoder and predictor on CPU/CUDA."""
    ckpt = required_path(
        WEIGHTS / "sam" / "sam_vit_b_01ec64.pth",
        "sam",
    )
    try:
        from segment_anything import sam_model_registry, SamPredictor
        from core.device import select_device

        model = sam_model_registry["vit_b"](checkpoint=str(ckpt))
        model.to(device=select_device()).eval()
        return SamPredictor(model)
    except RunnerError:
        raise
    except Exception as exc:
        raise RunnerError(
            "MODEL_LOAD_FAILED",
            "SAM dependency or checkpoint incompatible",
            503,
        ) from exc


def _float01(value, field: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise RunnerError("INVALID_PARAMS", f"{field} must be numeric", 422) from exc
    if not (0.0 <= result <= 1.0):
        raise RunnerError("INVALID_PARAMS", f"{field} must be between 0 and 1", 422)
    return result


def _point_xy(value, field: str) -> tuple[float, float]:
    if isinstance(value, dict):
        return _float01(value.get("x"), f"{field}.x"), _float01(value.get("y"), f"{field}.y")
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return _float01(value[0], f"{field}[0]"), _float01(value[1], f"{field}[1]")
    raise RunnerError("INVALID_PARAMS", f"{field} must contain x and y", 422)


def _stroke_list(value, field: str) -> list[list[tuple[float, float]]]:
    if value is None:
        return []
    if not isinstance(value, list) or not value:
        raise RunnerError("INVALID_PARAMS", f"{field} must be a non-empty array", 422)
    strokes = []
    for stroke_index, stroke in enumerate(value):
        points_value = stroke.get("points") if isinstance(stroke, dict) else stroke
        if not isinstance(points_value, list) or not points_value:
            raise RunnerError("INVALID_PARAMS", f"{field}[{stroke_index}] must contain points", 422)
        coords = [
            _point_xy(point, f"{field}[{stroke_index}].points[{point_index}]")
            for point_index, point in enumerate(points_value)
        ]
        strokes.append(coords)
    return strokes


def _polygon(value, field: str) -> list[tuple[float, float]]:
    if value is None:
        return []
    points_value = value.get("points") if isinstance(value, dict) else value
    if not isinstance(points_value, list) or len(points_value) < 3:
        raise RunnerError("INVALID_PARAMS", f"{field} must contain at least 3 points", 422)
    return [_point_xy(point, f"{field}[{index}]") for index, point in enumerate(points_value)]


def _box(value, field: str) -> tuple[float, float, float, float]:
    if isinstance(value, dict):
        if all(key in value for key in ("x", "y", "width", "height")):
            x = _float01(value["x"], f"{field}.x")
            y = _float01(value["y"], f"{field}.y")
            width = _float01(value["width"], f"{field}.width")
            height = _float01(value["height"], f"{field}.height")
            x2 = min(1.0, x + width)
            y2 = min(1.0, y + height)
            if x2 <= x or y2 <= y:
                raise RunnerError("INVALID_PARAMS", f"{field} width/height must be positive", 422)
            return x, y, x2, y2
        if all(key in value for key in ("x1", "y1", "x2", "y2")):
            x1 = _float01(value["x1"], f"{field}.x1")
            y1 = _float01(value["y1"], f"{field}.y1")
            x2 = _float01(value["x2"], f"{field}.x2")
            y2 = _float01(value["y2"], f"{field}.y2")
            if x2 <= x1 or y2 <= y1:
                raise RunnerError("INVALID_PARAMS", f"{field} x2/y2 must be greater than x1/y1", 422)
            return x1, y1, x2, y2
    if isinstance(value, (list, tuple)) and len(value) == 4:
        x1 = _float01(value[0], f"{field}[0]")
        y1 = _float01(value[1], f"{field}[1]")
        x2 = _float01(value[2], f"{field}[2]")
        y2 = _float01(value[3], f"{field}[3]")
        if x2 <= x1 or y2 <= y1:
            raise RunnerError("INVALID_PARAMS", f"{field} x2/y2 must be greater than x1/y1", 422)
        return x1, y1, x2, y2
    raise RunnerError("INVALID_PARAMS", f"{field} must be a normalized box", 422)


def _union_box(boxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float] | None:
    if not boxes:
        return None
    xs1, ys1, xs2, ys2 = zip(*boxes)
    return max(0.0, min(xs1)), max(0.0, min(ys1)), min(1.0, max(xs2)), min(1.0, max(ys2))


def _bbox_from_points(items: list[tuple[float, float]]) -> tuple[float, float, float, float] | None:
    if not items:
        return None
    xs, ys = zip(*items)
    x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
    if x2 <= x1:
        x2 = min(1.0, x1 + 0.01)
    if y2 <= y1:
        y2 = min(1.0, y1 + 0.01)
    return x1, y1, x2, y2


def _sample_indices(length: int, limit: int) -> list[int]:
    if length <= limit:
        return list(range(length))
    if limit <= 1:
        return [length // 2]
    return [round(i * (length - 1) / (limit - 1)) for i in range(limit)]


def _limit_labeled_points(items: list[tuple[float, float, int]], limit: int) -> list[tuple[float, float, int]]:
    if len(items) <= limit:
        return items
    positives = [item for item in items if item[2] == 1]
    negatives = [item for item in items if item[2] == 0]

    if positives and negatives:
        pos_limit = max(1, round(limit * len(positives) / len(items)))
        neg_limit = max(1, limit - pos_limit)
        pos_limit = min(pos_limit, len(positives))
        neg_limit = min(neg_limit, len(negatives))
        while pos_limit + neg_limit > limit:
            if pos_limit >= neg_limit and pos_limit > 1:
                pos_limit -= 1
            elif neg_limit > 1:
                neg_limit -= 1
            else:
                break
        selected = [positives[index] for index in _sample_indices(len(positives), pos_limit)]
        selected += [negatives[index] for index in _sample_indices(len(negatives), neg_limit)]
        return selected[:limit]

    return [items[index] for index in _sample_indices(len(items), limit)]


def _brush_prompts(strokes: list[list[tuple[float, float]]], label: int, limit: int) -> list[tuple[float, float, int]]:
    coords = [(x, y, label) for stroke in strokes for x, y in stroke]
    return _limit_labeled_points(coords, limit)


def _lasso_seed_points(polygon: list[tuple[float, float]]) -> list[tuple[float, float, int]]:
    if not polygon:
        return []
    box = _bbox_from_points(polygon)
    if box is None:
        return []
    x1, y1, x2, y2 = box
    cx = sum(x for x, _ in polygon) / len(polygon)
    cy = sum(y for _, y in polygon) / len(polygon)
    seed_points = [
        (cx, cy, 1),
        ((x1 * 3 + x2) / 4, (y1 * 3 + y2) / 4, 1),
        ((x1 + x2 * 3) / 4, (y1 * 3 + y2) / 4, 1),
        ((x1 * 3 + x2) / 4, (y1 + y2 * 3) / 4, 1),
        ((x1 + x2 * 3) / 4, (y1 + y2 * 3) / 4, 1),
    ]
    clipped = []
    for x, y, label in seed_points:
        clipped.append((min(1.0, max(0.0, x)), min(1.0, max(0.0, y)), label))
    return clipped


def _explicit_points(args: dict) -> list[tuple[float, float, int]]:
    raw = args.get("points")
    if raw in (None, []):
        return []
    return [(x, y, label) for x, y, label in points(raw, MAX_MASK_POINTS)]


def _box_from_args(args: dict) -> tuple[float, float, float, float] | None:
    boxes = []
    if args.get("box") is not None:
        boxes.append(_box(args["box"], "box"))
    if args.get("boxes") is not None:
        if not isinstance(args["boxes"], list) or not args["boxes"]:
            raise RunnerError("INVALID_PARAMS", "boxes must be a non-empty array", 422)
        boxes.extend(_box(item, f"boxes[{index}]") for index, item in enumerate(args["boxes"]))
    return _union_box(boxes)


def _build_prompt_bundle(args: dict) -> tuple[np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    explicit_points = _explicit_points(args)
    positive_brush = _stroke_list(args.get("positiveBrushStrokes"), "positiveBrushStrokes")
    negative_brush = _stroke_list(args.get("negativeBrushStrokes"), "negativeBrushStrokes")
    lasso = _polygon(args.get("lassoPolygon"), "lassoPolygon")

    positive_points = _brush_prompts(positive_brush, 1, MAX_MASK_POINTS)
    remaining = max(0, MAX_MASK_POINTS - len(positive_points))
    negative_points = _brush_prompts(negative_brush, 0, remaining)

    prompt_points = explicit_points + positive_points + negative_points + _lasso_seed_points(lasso)
    prompt_points = _limit_labeled_points(prompt_points, MAX_MASK_POINTS)

    boxes = []
    explicit_box = _box_from_args(args)
    if explicit_box is not None:
        boxes.append(explicit_box)

    # Smart Brush must NOT create a tight bounding box around the brush marks:
    # SAM should be allowed to expand from the positive points to the whole
    # subject, not restricted to the small area already painted by the user.

    lasso_box = _bbox_from_points(lasso)
    if lasso_box is not None:
        boxes.append(lasso_box)

    merged_box = _union_box(boxes)

    if not prompt_points and merged_box is None:
        raise RunnerError(
            "INVALID_PARAMS",
            "Provide points, positiveBrushStrokes, negativeBrushStrokes, lassoPolygon or box",
            422,
        )

    coords = labels = None
    if prompt_points:
        coords = np.asarray([[x, y] for x, y, _ in prompt_points], dtype=np.float32)
        labels = np.asarray([label for _, _, label in prompt_points], dtype=np.int32)

    box = None
    if merged_box is not None:
        box = np.asarray(merged_box, dtype=np.float32)

    return coords, labels, box


def _to_pixel_coords(coords: np.ndarray, width: int, height: int) -> np.ndarray:
    pixel = coords.copy()
    pixel[:, 0] = np.minimum(pixel[:, 0] * width, width - 1)
    pixel[:, 1] = np.minimum(pixel[:, 1] * height, height - 1)
    return pixel


def generate_mask(image: Image.Image, args: dict) -> Image.Image:
    """Compute a binary mask from normalized point, brush, lasso and box prompts."""
    coords, labels, box = _build_prompt_bundle(args)
    rgb = np.asarray(image.convert("RGB"))

    with _PREDICT_LOCK:
        predictor = _sam_predictor()
        try:
            predictor.set_image(rgb)
            point_coords = _to_pixel_coords(coords, image.width, image.height) if coords is not None else None
            box_prompt = None
            if box is not None:
                box_prompt = np.asarray([
                    min(box[0] * image.width, image.width - 1),
                    min(box[1] * image.height, image.height - 1),
                    min(box[2] * image.width, image.width - 1),
                    min(box[3] * image.height, image.height - 1),
                ], dtype=np.float32)
            masks, scores, _ = predictor.predict(
                point_coords=point_coords,
                point_labels=labels,
                box=box_prompt,
                multimask_output=True,
            )
            mask = (masks[int(np.argmax(scores))] * 255).astype("uint8")
        except RunnerError:
            raise
        except Exception as exc:
            raise RunnerError(
                "AI_INFERENCE_FAILED",
                "SAM selection failed",
                503,
            ) from exc

    return Image.fromarray(mask, "L")


def run(image: Image.Image, args: dict) -> Image.Image:
    """Return a selection mask or cut-out with original canvas dimensions."""
    selection = refine(generate_mask(image, args), args)
    return apply_alpha(
        image,
        selection,
        {
            **args,
            "outputMode": args.get("outputMode", "MASK_ONLY"),
        },
    )
