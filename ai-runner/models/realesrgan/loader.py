"""Load validated Real-ESRGAN checkpoints; distinct instances for tile size."""
from functools import lru_cache
from core.model_loader import required
from core.device import select_device
from core.errors import RunnerError
from core.basicsr_compat import ensure_basicsr_compat

@lru_cache(maxsize=8)
def model_for(scale: int, tile: int = 0, mode: str = "quality"):
    """Load the requested *real* x2/x4 AI model, cached by mode and tile size.

    The compact x4 checkpoint has a different network architecture to x4plus.
    Do not load it through RRDBNet or silently substitute ordinary interpolation.
    """
    if mode not in ("fast", "quality") or (scale != 4 and mode != "quality"):
        raise RunnerError("INVALID_PARAMS", "Invalid upscale model for scale", 422)
    path = required("realesrgan_x4_fast" if mode == "fast" else f"realesrgan_x{scale}")
    try:
        ensure_basicsr_compat()
        from realesrgan import RealESRGANer
        if mode == "fast":
            from realesrgan.archs.srvgg_arch import SRVGGNetCompact
            net = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64,
                                  num_conv=32, upscale=4, act_type="prelu")
        else:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            net = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                          num_block=23, num_grow_ch=32, scale=scale)
        device = select_device()
        return RealESRGANer(scale=scale, model_path=str(path), model=net,
                            tile=tile, tile_pad=10, pre_pad=0,
                            half=(device == "cuda"), gpu_id=0 if device == "cuda" else None)
    except Exception as exc:
        raise RunnerError("MODEL_LOAD_FAILED", "Real-ESRGAN dependencies or weights incompatible", 503) from exc
