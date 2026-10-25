"""Mode-specific x4 dispatch tests without loading a large checkpoint."""
import numpy as np
import pytest
from PIL import Image

from core.errors import RunnerError
from processors import upscale


def test_fast_x4_uses_compact_mode_and_keeps_true_x4_dimensions(monkeypatch):
    selected = []

    class FakeEngine:
        def enhance(self, rgb, outscale):
            assert outscale == 4
            # Only a test double. Production never uses resize as an AI fallback.
            return np.repeat(np.repeat(rgb, 4, axis=0), 4, axis=1), None

    def fake_model_for(scale, tile, mode):
        selected.append((scale, tile, mode))
        return FakeEngine()

    monkeypatch.setattr(upscale, "model_for", fake_model_for)
    result = upscale.run(Image.new("RGB", (13, 11)), {
        "scale": 4, "tileSize": 256, "model": "fast",
    })
    assert selected == [(4, 256, "fast")]
    assert result.size == (52, 44)


@pytest.mark.parametrize("options", [
    {"scale": 2, "model": "fast"},
    {"scale": 4, "model": "not-a-model"},
])
def test_invalid_mode_rejected_before_loading_weights(monkeypatch, options):
    def should_not_load(*args):
        raise AssertionError("Model must not be loaded for invalid params")
    monkeypatch.setattr(upscale, "model_for", should_not_load)
    with pytest.raises(RunnerError) as error:
        upscale.run(Image.new("RGB", (4, 4)), options)
    assert error.value.code == "INVALID_PARAMS"
