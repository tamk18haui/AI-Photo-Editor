"""Face Parsing v55 preview-only filtering; no ONNX/media weights required."""
import numpy as np
import pytest
from PIL import Image
from core.errors import RunnerError
from processors import face
from processors.dispatch import execute
from models.face_parsing.loader import PALETTE


def setup_scene(monkeypatch):
    # Two crops with all target classes, including cloth/neck reaching the
    # lower rectangular crop edge (the defect visible in the user's photo).
    monkeypatch.setattr(face, 'detect_face_boxes',
                        lambda img, **kw: [(10, 15, 110, 115), (130, 25, 230, 125)])
    def predict(_image):
        labels = np.zeros((512, 512), dtype=np.uint8)
        labels[20:130, 100:410] = 17  # hair
        labels[130:320, 100:410] = 1  # skin
        labels[320:390, 130:370] = 14  # neck
        labels[390:, :] = 16  # cloth (hits crop straight border)
        labels[230:240, 200:240] = 10  # nose
        return labels
    monkeypatch.setattr(face, 'infer_labels', predict)
    return Image.new('RGB', (240, 140), (40, 60, 80))


def test_default_overlay_hides_rectangular_neck_and_cloth_on_two_faces(monkeypatch):
    im=setup_scene(monkeypatch)
    arr=np.asarray(execute('face-parsing', im, {}))
    assert arr[110, 30] == 16 and arr[85, 60] == 14  # raw labels intact
    assert arr[30, 60] == 17 and arr[60, 60] == 1
    overlay=execute('face-parsing', im, {'outputMode':'OVERLAY','alpha':1})
    out=np.asarray(overlay)
    base=np.asarray(im)
    for x, y0 in ((30, 15), (150, 25)):
        assert np.array_equal(out[y0+95,x],base[y0+95,x])  # cloth NOT overlaid
        assert np.array_equal(out[y0+70,x],base[y0+70,x])  # neck NOT overlaid
        assert np.array_equal(out[y0+15,x], PALETTE[17])  # hair colored
        assert np.array_equal(out[y0+45,x],PALETTE[1])    # skin colored
    assert np.array_equal(out[0,0],base[0,0])


def test_all_classes_overlay_reproduces_previous_v49_behavior(monkeypatch):
    im=setup_scene(monkeypatch)
    overlay=execute('face-parsing', im, {'outputMode':'OVERLAY', 'previewRegions':'ALL_CLASSES', 'alpha':1})
    a=np.asarray(overlay)
    for x, y0 in ((30, 15), (150, 25)):
        assert np.array_equal(a[y0+95,x], PALETTE[16])
        assert np.array_equal(a[y0+70,x+30], PALETTE[14])


def test_explicit_neck_or_cloth_class_overrides_default_filter(monkeypatch):
    im=setup_scene(monkeypatch)
    overlay=execute('face-parsing', im, {'outputMode':'OVERLAY','classId':16,'alpha':1})
    a=np.asarray(overlay)
    assert np.array_equal(a[110,30], PALETTE[16])
    assert overlay.getpixel((30,60)) == im.getpixel((30,60))
    # Legacy classId semantics and BINARY_MASK unaffected.
    labels=execute('face-parsing', im, {'classId':16})
    bmask=execute('face-parsing', im, {'outputMode':'BINARY_MASK','classId':16})
    assert labels.mode == 'L' and np.array_equal(np.asarray(labels),np.asarray(bmask))
    assert bmask.getpixel((30,110))==255
    assert bmask.getpixel((30,60))==0


def test_color_keeps_full_19_class_palette(monkeypatch):
    im=setup_scene(monkeypatch)
    color=execute('face-parsing', im, {'outputMode':'COLOR'})
    c=np.asarray(color)
    assert color.mode=='RGB' and color.size==im.size
    assert np.array_equal(c[110,30],PALETTE[16])
    assert np.array_equal(c[85,60],PALETTE[14])


def test_invalid_preview_scope_returns_validation_error(monkeypatch):
    im=setup_scene(monkeypatch)
    with pytest.raises(RunnerError) as exc:
        execute('face-parsing', im, {'outputMode':'OVERLAY','previewRegions':'UNSUPPORTED'})
    assert exc.value.code == 'INVALID_PARAMS' and exc.value.status==422


def test_alpha_zero_keeps_original_and_legacy_no_preview_region(monkeypatch):
    im=setup_scene(monkeypatch)
    a=execute('face-parsing',im,{'outputMode':'OVERLAY','alpha':0})
    assert np.array_equal(np.asarray(a),np.asarray(im))
    b=execute('face-parsing',im,{'outputMode':'BINARY_MASK'})
    assert np.count_nonzero(np.asarray(b))>0
