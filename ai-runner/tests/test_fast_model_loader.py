"""Check that the compact checkpoint is not sent into the x4plus RRDBNet."""
import sys
import types

from models.realesrgan import loader


def test_compact_loader_uses_srvgg_architecture(monkeypatch):
    selected = {}

    class CompactNet:
        def __init__(self, **kwargs):
            selected["architecture"] = kwargs

    class FakeRestorer:
        def __init__(self, **kwargs):
            selected["restorer"] = kwargs

    package = types.ModuleType("realesrgan")
    package.__path__ = []
    package.RealESRGANer = FakeRestorer
    archs = types.ModuleType("realesrgan.archs")
    archs.__path__ = []
    compact = types.ModuleType("realesrgan.archs.srvgg_arch")
    compact.SRVGGNetCompact = CompactNet
    monkeypatch.setitem(sys.modules, "realesrgan", package)
    monkeypatch.setitem(sys.modules, "realesrgan.archs", archs)
    monkeypatch.setitem(sys.modules, "realesrgan.archs.srvgg_arch", compact)
    monkeypatch.setattr(loader, "ensure_basicsr_compat", lambda: None)
    monkeypatch.setattr(loader, "select_device", lambda: "cpu")
    monkeypatch.setattr(loader, "required", lambda key: selected.setdefault("checkpoint", key))

    loader.model_for.cache_clear()
    try:
        result = loader.model_for(4, 256, "fast")
        assert isinstance(result, FakeRestorer)
        assert selected["checkpoint"] == "realesrgan_x4_fast"
        assert selected["architecture"]["num_conv"] == 32
        assert selected["architecture"]["upscale"] == 4
        assert selected["restorer"]["tile"] == 256
        assert selected["restorer"]["half"] is False
    finally:
        loader.model_for.cache_clear()
