"""Regression checks for BiRefNet RGB normalization; no model weights required."""
import numpy as np
from PIL import Image
from processors.remove_background import _normalize_for_birefnet


def test_birefnet_white_matches_imagenet_statistics():
    arr = _normalize_for_birefnet(Image.new("RGB", (4, 2), "white"))
    expected = (np.ones(3) - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])
    assert arr.shape == (3, 2, 4)
    assert arr.dtype == np.float32
    assert arr.flags.c_contiguous
    np.testing.assert_allclose(arr[:, 0, 0], expected, rtol=1e-5)


def test_birefnet_black_matches_imagenet_statistics():
    arr = _normalize_for_birefnet(Image.new("RGB", (3, 3), "black"))
    expected = -np.array([0.485, 0.456, 0.406]) / np.array([0.229, 0.224, 0.225])
    np.testing.assert_allclose(arr[:, 1, 1], expected, rtol=1e-5)


def test_birefnet_keeps_rgb_channel_order():
    arr = _normalize_for_birefnet(Image.new("RGB", (2, 2), (255, 0, 0)))
    np.testing.assert_allclose(arr[:, 0, 0],
        [(1 - .485) / .229, (0 - .456) / .224, (0 - .406) / .225], rtol=1e-5)
