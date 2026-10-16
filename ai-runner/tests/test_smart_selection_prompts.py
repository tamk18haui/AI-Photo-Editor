"""Regression tests for Smart Brush and Lasso prompt conversion on top of SAM."""

import numpy as np
import pytest
from PIL import Image

from core.errors import RunnerError
from processors import selection


class _FakePredictor:
    def __init__(self):
        self.last_image = None
        self.last_kwargs = None

    def set_image(self, image):
        self.last_image = image

    def predict(self, **kwargs):
        self.last_kwargs = kwargs
        height, width = self.last_image.shape[:2]
        mask = np.zeros((3, height, width), dtype=np.uint8)
        mask[0, 5:25, 8:28] = 1
        mask[1, 10:22, 10:24] = 1
        mask[2, 2:28, 2:30] = 1
        scores = np.asarray([0.25, 0.95, 0.50], dtype=np.float32)
        logits = np.zeros_like(mask, dtype=np.float32)
        return mask, scores, logits


@pytest.fixture
def image():
    return Image.new("RGB", (40, 30), "white")


def test_legacy_points_still_work(monkeypatch, image):
    fake = _FakePredictor()
    monkeypatch.setattr(selection, "_sam_predictor", lambda: fake)

    result = selection.run(
        image,
        {
            "outputMode": "MASK_ONLY",
            "points": [{"x": 0.50, "y": 0.40, "label": 1}, {"x": 0.15, "y": 0.20, "label": 0}],
        },
    )

    assert result.mode == "L"
    assert result.size == image.size
    assert fake.last_kwargs["box"] is None
    assert fake.last_kwargs["point_coords"].shape == (2, 2)
    assert fake.last_kwargs["point_labels"].tolist() == [1, 0]


def test_smart_brush_allows_expansion_and_positive_negative_points(monkeypatch, image):
    fake = _FakePredictor()
    monkeypatch.setattr(selection, "_sam_predictor", lambda: fake)

    result = selection.run(
        image,
        {
            "outputMode": "MASK_ONLY",
            "positiveBrushStrokes": [
                [{"x": 0.22, "y": 0.25}, {"x": 0.25, "y": 0.35}, {"x": 0.30, "y": 0.45}],
                [{"x": 0.32, "y": 0.30}, {"x": 0.36, "y": 0.42}],
            ],
            "negativeBrushStrokes": [
                [{"x": 0.65, "y": 0.60}, {"x": 0.70, "y": 0.65}]
            ],
        },
    )

    assert result.mode == "L"
    # Brush marks must NOT constrain SAM to a tiny auto-generated box.
    assert fake.last_kwargs["box"] is None
    assert fake.last_kwargs["point_coords"].shape[0] >= 4
    labels = fake.last_kwargs["point_labels"].tolist()
    assert 1 in labels and 0 in labels


def test_lasso_polygon_creates_box_and_seed_points(monkeypatch, image):
    fake = _FakePredictor()
    monkeypatch.setattr(selection, "_sam_predictor", lambda: fake)

    result = selection.run(
        image,
        {
            "outputMode": "MASK_ONLY",
            "lassoPolygon": [
                {"x": 0.20, "y": 0.20},
                {"x": 0.55, "y": 0.18},
                {"x": 0.58, "y": 0.70},
                {"x": 0.22, "y": 0.72},
            ],
        },
    )

    assert result.mode == "L"
    box = fake.last_kwargs["box"]
    assert box is not None
    assert pytest.approx(float(box[0]), rel=0, abs=0.5) == 8.0
    assert pytest.approx(float(box[2]), rel=0, abs=0.5) == 23.2
    assert fake.last_kwargs["point_coords"].shape[0] >= 3
    assert set(fake.last_kwargs["point_labels"].tolist()) == {1}


def test_explicit_box_only_is_supported(monkeypatch, image):
    fake = _FakePredictor()
    monkeypatch.setattr(selection, "_sam_predictor", lambda: fake)

    result = selection.run(
        image,
        {
            "outputMode": "MASK_ONLY",
            "box": {"x": 0.10, "y": 0.15, "width": 0.40, "height": 0.55},
        },
    )

    assert result.mode == "L"
    assert fake.last_kwargs["point_coords"] is None
    assert fake.last_kwargs["point_labels"] is None
    box = fake.last_kwargs["box"]
    assert box is not None
    assert pytest.approx(float(box[0]), rel=0, abs=0.5) == 4.0
    assert pytest.approx(float(box[3]), rel=0, abs=0.5) == 21.0


def test_missing_prompts_is_rejected(image):
    with pytest.raises(RunnerError) as error:
        selection.run(image, {"outputMode": "MASK_ONLY"})
    assert error.value.code == "INVALID_PARAMS"
