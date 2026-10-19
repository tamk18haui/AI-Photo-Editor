"""N4 Face Studio V3: per-face typed masks on the CURRENT project image.

Reuses the existing MediaPipe Face Landmarker and 19-class ONNX parsing
checkpoint; does not load additional model weights or render any makeup.
"""
from __future__ import annotations

from io import BytesIO
import math
import zipfile
import json

import cv2
import numpy as np
from PIL import Image

from core.errors import RunnerError
from models.face_parsing.loader import infer_labels
from processors.landmarks import run as run_landmarks

# CelebAMask-HQ / 19-class BiSeNet index order used by the existing checkpoint.
PARSING_CLASSES = {
    "LIPS": (12, 13), "UPPER_LIP": (12,), "LOWER_LIP": (13,),
    "HAIR": (17,), "LEFT_EYE": (4,), "RIGHT_EYE": (5,),
    "EYEBROWS": (2, 3), "LEFT_EYEBROW": (2,), "RIGHT_EYEBROW": (3,),
    "SKIN": (1,), "FACE": (1, 2, 3, 4, 5, 6, 10, 11, 12, 13),
    "NOSE": (10,), "EARS": (7, 8), "NECK": (14, 15),
}
# Exact FULL V3 enum. TEETH is an explicitly documented heuristic, not an ONNX class.
CONTRACT_REGIONS = frozenset(PARSING_CLASSES) | {"EYELIDS", "TEETH"}
# Extension proposal only: requires FE/BE approval and YAML enum update before public use.
EXPERIMENTAL_REGIONS = frozenset({"LEFT_CHEEK", "RIGHT_CHEEK", "CHEEKS",
                                  "IRIS", "LEFT_IRIS", "RIGHT_IRIS"})
_ALL_REGIONS = CONTRACT_REGIONS | EXPERIMENTAL_REGIONS
_MAX_BATCH_PIXELS = 100_000_000
_MAX_FACES = 10  # Still bounded by underlying MediaPipe configuration (currently five).


def _fail(code: str, message: str, status: int = 422):
    raise RunnerError(code, message, status)


def _bounds(points: list[dict], width: int, height: int) -> tuple[int, int, int, int]:
    xy = [(float(p["x"]), float(p["y"])) for p in points]
    if not xy or any(not math.isfinite(x) or not math.isfinite(y) for x, y in xy):
        _fail("MODEL_OUTPUT_INVALID", "Invalid face landmark coordinates", 503)
    xs, ys = [p[0] for p in xy], [p[1] for p in xy]
    x0, y0 = max(0, min(1, min(xs))), max(0, min(1, min(ys)))
    x1, y1 = max(0, min(1, max(xs))), max(0, min(1, max(ys)))
    if (x1 - x0) * width < 8 or (y1 - y0) * height < 8:
        _fail("FACE_TOO_SMALL", "Face landmark bounds are too small")
    return (max(0, math.floor(x0 * width)), max(0, math.floor(y0 * height)),
            min(width, math.ceil(x1 * width)), min(height, math.ceil(y1 * height)))


def analyze(image: Image.Image, *, with_landmarks: bool = False) -> dict:
    """Stable left-to-right face indices for exactly this decoded image/geometry."""
    raw = run_landmarks(image)
    groups = raw.get("faces", [])
    if len(groups) > _MAX_FACES:
        _fail("TOO_MANY_FACES", "Face count exceeds supported limit")
    faces = []
    for group in groups:
        points = group.get("landmarks", [])
        x0, y0, x1, y1 = _bounds(points, image.width, image.height)
        bounding = {"x": x0/image.width, "y": y0/image.height,
                    "width": (x1-x0)/image.width, "height": (y1-y0)/image.height}
        faces.append({"boundingBox": bounding, "landmarks": points})
    faces.sort(key=lambda f: (f["boundingBox"]["x"] + f["boundingBox"]["width"] / 2,
                              f["boundingBox"]["y"] + f["boundingBox"]["height"] / 2))
    for i, face in enumerate(faces):
        face["faceIndex"] = i
        if not with_landmarks:
            del face["landmarks"]
    return {"imageWidth": image.width, "imageHeight": image.height, "faces": faces}


def _crop_box(face: dict, width: int, height: int) -> tuple[int,int,int,int]:
    b = face["boundingBox"]
    x0, y0 = b["x"]*width, b["y"]*height
    fw, fh = b["width"]*width, b["height"]*height
    # Expand enough to capture hair, jawline and upper neck, not just the central face.
    return (max(0, int(math.floor(x0 - fw * 0.75))),
            max(0, int(math.floor(y0 - fh * 1.00))),
            min(width, int(math.ceil(x0 + fw * 1.75))),
            min(height, int(math.ceil(y0 + fh * 1.65))))


# Eye and inner-lip landmark contours from MediaPipe's standard 468+ topology.
LEFT_EYE_LINE = (33, 160, 158, 133, 153, 144)
RIGHT_EYE_LINE = (362, 385, 387, 263, 373, 380)
INNER_LIPS = (78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
              415, 310, 311, 312, 13, 82, 81, 80, 191)
LEFT_CHEEK = (50, 101, 118, 123, 205, 36, 111)
RIGHT_CHEEK = (280, 330, 347, 352, 425, 266, 340)
LEFT_IRIS_POINTS = (469, 470, 471, 472)
RIGHT_IRIS_POINTS = (474, 475, 476, 477)


def _poly(points, indices, crop_box, width, height):
    """Rasterize a closed landmark polygon into the crop coordinate space."""
    x0, y0, x1, y1 = crop_box
    out = np.zeros((y1-y0, x1-x0), dtype=np.uint8)
    if len(points) <= max(indices):
        return out
    vertices = np.asarray([
        [int(round(float(points[i]["x"])*width - x0)),
         int(round(float(points[i]["y"])*height - y0))] for i in indices
    ], dtype=np.int32)
    cv2.fillPoly(out, [vertices], 255)
    return out


def _typed_region(region, labels, rgb, points, box, w, h):
    if region in PARSING_CLASSES:
        return np.isin(labels, PARSING_CLASSES[region])
    if region == "EYELIDS":
        left = _poly(points, LEFT_EYE_LINE, box, w, h)
        right = _poly(points, RIGHT_EYE_LINE, box, w, h)
        ring = cv2.dilate(np.maximum(left, right),
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        return (ring > 0) & (left == 0) & (right == 0) & (labels == 1)
    if region == "TEETH":
        # No teeth class in the 19-class checkpoint. Conservative candidate:
        # intersection of mouth interior, inner-lip polygon and low-saturation
        # light pixels. No teeth visible => empty mask (never whiten tongue).
        inner = _poly(points, INNER_LIPS, box, w, h) > 0
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        light = (hsv[..., 1] < 95) & (hsv[..., 2] >= 95)
        return inner & (labels == 11) & light
    if region in {"LEFT_CHEEK", "RIGHT_CHEEK", "CHEEKS"}:
        m = np.zeros(labels.shape, dtype=np.uint8)
        if region in ("LEFT_CHEEK", "CHEEKS"):
            m = np.maximum(m, _poly(points, LEFT_CHEEK, box, w, h))
        if region in ("RIGHT_CHEEK", "CHEEKS"):
            m = np.maximum(m, _poly(points, RIGHT_CHEEK, box, w, h))
        return (m > 0) & (labels == 1)
    if region in {"IRIS", "LEFT_IRIS", "RIGHT_IRIS"}:
        if len(points) < 478:
            _fail("REGION_UNAVAILABLE", "Iris landmarks missing from MediaPipe output")
        m = np.zeros(labels.shape, dtype=np.uint8)
        if region in ("IRIS", "LEFT_IRIS"):
            m = np.maximum(m, _poly(points, LEFT_IRIS_POINTS, box, w, h))
        if region in ("IRIS", "RIGHT_IRIS"):
            m = np.maximum(m, _poly(points, RIGHT_IRIS_POINTS, box, w, h))
        return (m > 0) & np.isin(labels, (4, 5))
    _fail("UNSUPPORTED_FACE_REGION", "Unsupported face region")


def _exclusive_to_face(mask, box, face, faces, w, h):
    """Prevent regions overlapping a neighboring face from contaminating it."""
    if len(faces) < 2:
        return mask
    x0, y0, x1, y1 = box
    yy, xx = np.ogrid[y0:y1, x0:x1]
    b = face["boundingBox"]
    cx = (b["x"] + b["width"]*.5)*w
    cy = (b["y"] + b["height"]*.5)*h
    nearest = (xx-cx)**2 + (yy-cy)**2
    allowed = np.ones(mask.shape, dtype=bool)
    for other in faces:
        if other is face:
            continue
        ob = other["boundingBox"]
        ox = (ob["x"] + ob["width"]*.5)*w
        oy = (ob["y"] + ob["height"]*.5)*h
        allowed &= nearest <= (xx-ox)**2 + (yy-oy)**2
    return mask & allowed


def validate_regions(regions: list[str], *, allow_experimental: bool = False) -> list[str]:
    if not isinstance(regions, list) or not 1 <= len(regions) <= len(_ALL_REGIONS):
        _fail("INVALID_FACE_REGIONS", "regions must contain 1-22 unique region names")
    allowed = _ALL_REGIONS if allow_experimental else CONTRACT_REGIONS
    if any(not isinstance(s, str) or s not in allowed for s in regions) or len(regions) != len(set(regions)):
        _fail("UNSUPPORTED_FACE_REGION", "Unsupported or repeated face region")
    return regions


def generate(image: Image.Image, face_index: int, regions: list[str],
             output_mode: str = "REGION_MASK", *, allow_experimental: bool = False) -> tuple[dict, dict[str,bytes]]:
    """Return verified source-size grayscale masks, no makeup image changes."""
    regions = validate_regions(regions, allow_experimental=allow_experimental)
    if output_mode not in ("REGION_MASK", "LABEL_MAP"):
        _fail("INVALID_OUTPUT_MODE", "outputMode must be REGION_MASK or LABEL_MAP")
    if not isinstance(face_index, int) or isinstance(face_index, bool) or face_index < 0:
        _fail("FACE_INDEX_INVALID", "faceIndex must be a non-negative integer")
    width, height = image.size
    if width * height * len(regions) > _MAX_BATCH_PIXELS:
        _fail("FACE_REGION_BATCH_TOO_LARGE", "Request too many full-resolution masks", 413)
    info = analyze(image, with_landmarks=True)
    faces = info["faces"]
    if face_index >= len(faces):
        _fail("FACE_INDEX_INVALID", "faceIndex not detected on this input asset")
    face = faces[face_index]
    box = _crop_box(face, width, height)
    x0, y0, x1, y1 = box
    rgb = np.asarray(image.convert("RGB").crop(box), dtype=np.uint8)
    parsed = infer_labels(Image.fromarray(rgb, "RGB"))
    if parsed.ndim != 2 or parsed.dtype != np.uint8 or np.any(parsed > 18):
        _fail("MODEL_OUTPUT_INVALID", "Invalid 19-class face parsing output", 503)
    labels = cv2.resize(parsed, (x1-x0, y1-y0), interpolation=cv2.INTER_NEAREST)
    # Hair can extend beyond the small facial box but is constrained to this crop.
    entries, files = [], {}
    for region in regions:
        roi = _typed_region(region, labels, rgb, face["landmarks"], box, width, height)
        roi = _exclusive_to_face(roi, box, face, faces, width, height)
        if output_mode == "LABEL_MAP":
            # Preserve ONNX class IDs in the selected region; geometric regions
            # that have no parser class (eyelids/teeth) emit binary 255.
            values = np.where(roi, labels, 0).astype(np.uint8)
            if region not in PARSING_CLASSES:
                values = (roi.astype(np.uint8) * 255)
        else:
            values = roi.astype(np.uint8) * 255
        full = Image.new("L", (width, height), 0)
        full.paste(Image.fromarray(values, "L"), (x0, y0))
        raw = BytesIO()
        full.save(raw, format="PNG", optimize=False)
        filename = f"regions/{region}.png"
        files[filename] = raw.getvalue()
        entries.append({"region": region, "file": filename,
                        "width": width, "height": height})
    manifest = {"format": "N4_FACE_REGIONS_V1", "faceIndex": face_index,
                "imageWidth": width, "imageHeight": height,
                "outputMode": output_mode, "masks": entries}
    return manifest, files


def archive(manifest: dict, files: dict[str,bytes]) -> bytes:
    """Minimal deterministic exchange format for the private N4->Spring transport."""
    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        z.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
        for name, data in files.items():
            z.writestr(name, data)
    return output.getvalue()
