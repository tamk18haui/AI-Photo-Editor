"""Select a local CPU or CUDA device without requiring CUDA to be installed."""

def select_device() -> str:
    """Function: Return cuda if available, else cpu for all model adapters."""
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"
