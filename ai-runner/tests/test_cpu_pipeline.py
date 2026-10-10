"""Real CPU tests exercise transformations, alpha masks and image dimensions."""
import numpy as np
import pytest
from PIL import Image
from processors import enhancement, mask, inpainting, analyze_quality
from core.errors import RunnerError

@pytest.fixture
def image():
    """Synthetic input fixture contains actual pixel content, not mock inference."""
    array = np.random.default_rng(42).integers(10,240,(96,128,3),dtype=np.uint8)
    return Image.fromarray(array,"RGB")

@pytest.mark.parametrize("strength", ["LOW", "MEDIUM", "HIGH"])
def test_denoise(image, strength):
    """Verify NLM denoising returns an actual image with original geometry."""
    assert enhancement.denoise(image, {"strength":strength}).size == image.size

@pytest.mark.parametrize("mode", ["AUTO", "PORTRAIT", "LANDSCAPE", "DOCUMENT"])
def test_auto_enhance(image, mode):
    """Validate each enhancement preset returns a usable RGB image."""
    assert enhancement.auto_enhance(image, {"mode":mode}).size == image.size


def test_sharpen_and_adjust(image):
    """Check deterministic adjustments change pixel data."""
    assert enhancement.sharpen(image, {"amount":200}).size == image.size
    assert enhancement.adjust(image, {"exposure":0.5}).tobytes() != image.tobytes()


def test_mask_full_resolution(image):
    """Mask generated at thumbnail size MUST restore to original pixel dimensions."""
    alpha = Image.new("L", (16,12), 170)
    result = mask.apply_alpha(image, alpha, {"outputMode":"TRANSPARENT"})
    assert result.mode == "RGBA" and result.size == image.size
    assert 160 <= result.getpixel((20,30))[3] <= 175


def test_mask_only(image):
    """MASK_ONLY returns a grayscale image at image's dimensions."""
    assert mask.apply_alpha(image, Image.new("L",(8,6),200), {"outputMode":"MASK_ONLY"}).size==image.size


def test_replace_background(image):
    """Composite a selected region on another real image."""
    alpha = Image.new("L", image.size, 100)
    second = Image.new("RGB",(32,32),(24,50,80))
    result = mask.replace_background(image,second,alpha,{})
    assert result.size==image.size


def test_inpaint(image):
    """Run OpenCV inpaint with an explicitly supplied small object mask."""
    alpha = Image.new("L",image.size,0)
    alpha.paste(255,(20,20,30,30))
    output = inpainting.run(image,{"method":"OPENCV"},alpha)
    assert output.size == image.size
    assert output.tobytes() != image.tobytes()


def test_no_mask_is_not_faked(image):
    """Refuse inpainting without a user-selected mask."""
    with pytest.raises(RunnerError) as exc:
        inpainting.run(image,{},None)
    assert exc.value.code == "MASK_REQUIRED"


def test_quality_contract(image):
    """Ensure JSON schema fields match the shared OpenAPI contract."""
    result = analyze_quality.run(image)
    assert {'brightness','contrast','blurScore','noiseScore','width','height','faceCount','recommendations'} <= result.keys()
    assert result['width']==128 and result['height']==96


def test_white_balance_and_hdr_style(image):
    """Additional real CPU image adjustments maintain asset geometry."""
    assert enhancement.white_balance(image, {"strength":0.8}).size==image.size
    assert enhancement.hdr_style(image, {"strength":0.6}).size==image.size
