"""Single source of truth for local model checkpoint paths."""
from pathlib import Path
from core.config import WEIGHTS

MODELS = {
    "realesrgan_x2": "realesrgan/RealESRGAN_x2plus.pth",
    "realesrgan_x4": "realesrgan/RealESRGAN_x4plus.pth",
    "birefnet": "birefnet/model.safetensors",
    "face_parsing": "face_parsing/resnet34.onnx",
    "sam": "sam/sam_vit_b_01ec64.pth",
    "gfpgan": "face/GFPGANv1.4.pth",
    "landmarker": "mediapipe/face_landmarker.task",
    "lama": "lama/big-lama.pt",
}

def checkpoint(name: str) -> Path:
    """Resolve a known checkpoint within the configured weights folder."""
    if name not in MODELS:
        raise ValueError(f"Unknown model name: {name}")
    return WEIGHTS / MODELS[name]
