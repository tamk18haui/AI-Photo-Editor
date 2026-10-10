"""Load validated Real-ESRGAN checkpoints; distinct instances for tile size."""
from functools import lru_cache
from core.model_loader import required
from core.device import select_device
from core.errors import RunnerError

@lru_cache(maxsize=8)
def model_for(scale: int, tile: int = 0):
    """Build a cached RealESRGANer for the selected scale and tile size."""
    path = required(f"realesrgan_x{scale}")
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer
        net = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23,
                      num_grow_ch=32, scale=scale)
        device = select_device()
        return RealESRGANer(scale=scale, model_path=str(path), model=net,
                            tile=tile, tile_pad=10, pre_pad=0,
                            half=(device == "cuda"), gpu_id=0 if device == "cuda" else None)
    except Exception as exc:
        raise RunnerError("MODEL_LOAD_FAILED", "Real-ESRGAN dependencies or weights incompatible", 503) from exc
