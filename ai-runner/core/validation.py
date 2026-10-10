"""Strict API argument validation shared by image processors."""
from core.errors import RunnerError


def choice(value, allowed, name):
    """Validate a string enum without silent fallbacks."""
    if not isinstance(value, str) or value not in allowed:
        raise RunnerError("INVALID_PARAMS", f"{name} must be one of {sorted(allowed)}", 422)
    return value


def integer(value, low, high, name):
    """Validate an integer, rejecting booleans and floats."""
    if type(value) is not int or not low <= value <= high:
        raise RunnerError("INVALID_PARAMS", f"{name} must be integer in [{low}, {high}]", 422)
    return value


def number(value, low, high, name):
    """Validate finite numeric input used in masks and generation."""
    import math
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise RunnerError("INVALID_PARAMS", f"{name} must be in [{low}, {high}]", 422)
    return float(value)


def points(items, limit=64):
    """Validate normalized positive and negative point prompts."""
    if not isinstance(items, list) or not 1 <= len(items) <= limit:
        raise RunnerError("INVALID_PARAMS", "points must be nonempty bounded list", 422)
    clean = []
    for item in items:
        if not isinstance(item, dict):
            raise RunnerError("INVALID_PARAMS", "Every point must be an object", 422)
        x = number(item.get("x"), 0, 1, "point.x")
        y = number(item.get("y"), 0, 1, "point.y")
        label = integer(item.get("label", 1), 0, 1, "point.label")
        clean.append((x, y, label))
    return clean
