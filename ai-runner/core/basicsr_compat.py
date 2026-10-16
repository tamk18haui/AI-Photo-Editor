"""Narrow compatibility bridge for older BasicSR and newer torchvision.

BasicSR 1.4.x imports ``rgb_to_grayscale`` from the removed
``torchvision.transforms.functional_tensor`` module. Current torchvision
exposes this same public function in ``torchvision.transforms.functional``.

This does NOT replace a model, alter checkpoint weights or fall back to a
non-AI algorithm. Only the missing import route is reconstructed.
"""

import importlib
import sys
import types

_LEGACY = "torchvision.transforms.functional_tensor"
_CURRENT = "torchvision.transforms.functional"


def ensure_basicsr_compat() -> None:
    """Provide the legacy rgb_to_grayscale import only when it is missing."""
    if _LEGACY in sys.modules:
        return

    try:
        importlib.import_module(_LEGACY)
        return
    except ModuleNotFoundError as exc:
        if exc.name != _LEGACY:
            # Do not hide broken installations or missing transitive imports.
            raise

    functional = importlib.import_module(_CURRENT)
    rgb_to_grayscale = getattr(functional, "rgb_to_grayscale", None)
    if not callable(rgb_to_grayscale):
        raise ImportError(
            "torchvision.transforms.functional.rgb_to_grayscale is unavailable"
        )

    legacy = types.ModuleType(_LEGACY)
    legacy.rgb_to_grayscale = rgb_to_grayscale
    sys.modules.setdefault(_LEGACY, legacy)
