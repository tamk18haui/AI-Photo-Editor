"""Check model files without downloading anything from the internet."""
from pathlib import Path
from core.config import WEIGHTS

EXPECTED = {
    "Real-ESRGAN x2": ["realesrgan/RealESRGAN_x2plus.pth"],
    "Real-ESRGAN x4": ["realesrgan/RealESRGAN_x4plus.pth"],
    "BiRefNet": ["birefnet/config.json", "birefnet/model.safetensors", "birefnet/birefnet.py", "birefnet/BiRefNet_config.py"],
    "SAM ViT-B": ["sam/sam_vit_b_01ec64.pth"],
    "Big-LaMa TorchScript": ["lama/big-lama.pt"],
    "GFPGAN 1.4": ["face/GFPGANv1.4.pth"],
    "Face Landmarker": ["mediapipe/face_landmarker.task"],
    "Face Parsing ONNX": ["face_parsing/resnet34.onnx"],
}


def main():
    """Print model file presence; presence alone does not prove compatibility."""
    for operation, paths in EXPECTED.items():
        missing = [name for name in paths if not (WEIGHTS / name).is_file()]
        print(f"{operation}: {'MISSING ' + ', '.join(missing) if missing else 'FILES FOUND; inference test still required'}")


if __name__ == "__main__": main()
