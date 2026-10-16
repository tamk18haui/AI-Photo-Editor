"""Regression tests for the BasicSR/TorchVision import compatibility shim."""

import sys
import types

import pytest

from core import basicsr_compat


def test_removed_functional_tensor_uses_public_torchvision_api(monkeypatch):
    old = basicsr_compat._LEGACY
    new = basicsr_compat._CURRENT
    monkeypatch.delitem(sys.modules, old, raising=False)
    called = lambda image: image

    def import_module(name):
        if name == old:
            raise ModuleNotFoundError(f"No module named '{old}'", name=old)
        if name == new:
            return types.SimpleNamespace(rgb_to_grayscale=called)
        raise AssertionError(f"Unexpected import: {name}")

    monkeypatch.setattr(basicsr_compat.importlib, "import_module", import_module)
    basicsr_compat.ensure_basicsr_compat()
    assert sys.modules[old].rgb_to_grayscale is called


def test_does_not_replace_existing_legacy_module(monkeypatch):
    old = basicsr_compat._LEGACY
    existing = types.ModuleType(old)
    monkeypatch.setitem(sys.modules, old, existing)
    basicsr_compat.ensure_basicsr_compat()
    assert sys.modules[old] is existing


def test_does_not_hide_unrelated_dependency_failure(monkeypatch):
    old = basicsr_compat._LEGACY
    monkeypatch.delitem(sys.modules, old, raising=False)

    def missing_torchvision(name):
        raise ModuleNotFoundError("No module named 'torchvision'", name="torchvision")

    monkeypatch.setattr(basicsr_compat.importlib, "import_module", missing_torchvision)
    with pytest.raises(ModuleNotFoundError, match="torchvision"):
        basicsr_compat.ensure_basicsr_compat()
    assert old not in sys.modules
