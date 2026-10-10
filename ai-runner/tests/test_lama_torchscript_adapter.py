"""TorchScript LaMa regression tests independent of a 196 MB checkpoint."""
from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from core.errors import RunnerError
from processors import lama


def test_missing_torchscript_checkpoint(monkeypatch, tmp_path):
    """Do not try importing saicinpainting or inventing a result when .pt is missing."""
    lama._model.cache_clear()
    monkeypatch.setattr(lama, "WEIGHTS", tmp_path)
    with pytest.raises(RunnerError) as err:
        lama.run(Image.new("RGB", (15, 13), "blue"), Image.new("L", (15, 13), 255))
    assert err.value.code == "MODEL_WEIGHTS_MISSING"
    lama._model.cache_clear()


def test_empty_selection_returns_422_without_loading_model(monkeypatch):
    monkeypatch.setattr(lama, "_model", lambda: pytest.fail("model should not load"))
    with pytest.raises(RunnerError) as err:
        lama.run(Image.new("RGB", (17, 19)), Image.new("L", (17, 19), 0))
    assert err.value.code == "EMPTY_MASK" and err.value.status == 422


def test_inference_uses_two_tensors_and_crops_to_input(monkeypatch):
    import torch

    class FakeModel:
        def __call__(self, image, mask):
            assert image.shape == (1, 3, 16, 24)
            assert mask.shape == (1, 1, 16, 24)
            assert image.dtype == mask.dtype == torch.float32
            assert (mask[:, :, :13, :19] == 1).all()
            assert (mask[:, :, 13:, :] == 0).all()
            assert (mask[:, :, :, 19:] == 0).all()
            return torch.ones_like(image) * .5

    monkeypatch.setattr(lama, "_model", lambda: FakeModel())
    result = lama.run(Image.new("RGB", (19, 13), (50, 110, 180)), Image.new("L", (19, 13), 255))
    assert result.size == (19, 13) and result.mode == "RGB"
    assert np.asarray(result)[0, 0, 0] == 127


def test_invalid_torchscript_output_never_claims_success(monkeypatch):
    import torch
    monkeypatch.setattr(lama, "_model", lambda: lambda image, mask: torch.zeros((1, 1, 16, 16)))
    with pytest.raises(RunnerError) as err:
        lama.run(Image.new("RGB", (16, 16)), Image.new("L", (16, 16), 255))
    assert err.value.code == "MODEL_OUTPUT_INVALID"
