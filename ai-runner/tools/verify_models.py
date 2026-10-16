"""Inspect local model files without downloading anything from the internet."""

from core.config import WEIGHTS
from core.errors import RunnerError
from core.model_loader import required_path

EXPECTED = {
    "Real-ESRGAN x2": ["realesrgan/RealESRGAN_x2plus.pth"],
    "Real-ESRGAN x4": ["realesrgan/RealESRGAN_x4plus.pth"],
    "BiRefNet": [
        "birefnet/config.json",
        "birefnet/model.safetensors",
        "birefnet/birefnet.py",
        "birefnet/BiRefNet_config.py",
    ],
    "SAM ViT-B": ["sam/sam_vit_b_01ec64.pth"],
    "Big-LaMa TorchScript": ["lama/big-lama.pt"],
    "GFPGAN 1.4": ["face/GFPGANv1.4.pth"],
    "Face Landmarker": ["mediapipe/face_landmarker.task"],
    "Face Parsing ONNX": ["face_parsing/resnet34.onnx"],
}


def main():
    """Report materialization separately from real-inference verification."""
    for model_name, paths in EXPECTED.items():
        try:
            for relative in paths:
                required_path(WEIGHTS / relative, model_name)
        except RunnerError as error:
            print(f"{model_name}: {error.code} - {error.message}")
            continue

        print(
            f"{model_name}: FILES MATERIALIZED; "
            "real inference test still required"
        )


if __name__ == "__main__":
    main()
