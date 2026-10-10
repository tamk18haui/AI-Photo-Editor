"""N4 FULL face parsing regression tests: no checkpoints required.

Fake only detector boxes and ONNX label arrays; production code always uses
real MediaPipe and BiSeNet. These tests assert geometry, compositing & contract.
"""
import numpy as np
import pytest
from PIL import Image

from core.errors import RunnerError
from models.face_parsing import loader
from processors import face, landmarks
from processors.dispatch import execute


def _fake_face_labels(image):
    # Distinctive skin/hair segments to check class mapping and placement.
    a = np.zeros((512, 512), dtype=np.uint8)
    a[64:448, 60:452] = 1
    a[64:150, 60:452] = 17
    return a


def test_loader_exports_and_legacy_contract(monkeypatch):
    class FakeInput:
        name = 'image'
    class Session:
        def run(self, _, feed):
            tensor = feed['image']
            assert tensor.shape == (1, 3, 512, 512)
            assert tensor.dtype == np.float32
            out = np.zeros((1, 19, 512, 512), dtype=np.float32)
            out[:, 17] = 1.0
            return [out]
    monkeypatch.setattr(loader, 'load', lambda: (Session(), 'image'))
    image = Image.new('RGB', (78, 96), (140, 120, 100))
    assert loader.infer_labels(image).shape == (512, 512)
    label = loader.run(image, {})
    assert label.size == image.size and label.mode == 'L'
    assert set(np.asarray(label).ravel()) == {17}
    assert set(np.asarray(loader.run(image, {'classId': 17})).ravel()) == {255}


def test_single_crop_label_and_overlay(monkeypatch):
    monkeypatch.setattr(face, 'detect_face_boxes',
                        lambda image, **kw: [(50, 30, 140, 120)])
    monkeypatch.setattr(face, 'infer_labels', _fake_face_labels)
    im = Image.new('RGB', (200, 160), (110, 120, 130))
    result = execute('face-parsing', im, {})
    arr = np.asarray(result)
    assert result.size == im.size and result.mode == 'L'
    assert arr[0, 0] == 0 and arr[85, 80] == 1 and arr[50, 75] == 17
    overlay = execute('face-parsing', im, {'outputMode': 'OVERLAY', 'alpha': 0.7})
    assert overlay.size == im.size and overlay.mode == 'RGB'
    assert overlay.getpixel((0, 0)) == im.getpixel((0, 0))
    assert overlay.getpixel((80, 55)) != im.getpixel((80, 55))
    for mode in ['COLOR', 'BINARY_MASK']:
        assert execute('face-parsing', im, {'outputMode': mode}).size == im.size
    hair = execute('face-parsing', im, {'classId': 17, 'outputMode': 'BINARY_MASK'})
    assert hair.mode == 'L'
    assert hair.getpixel((80, 50)) == 255 and hair.getpixel((80, 100)) == 0
    legacy_hair = execute('face-parsing', im, {'classId': 17})
    assert legacy_hair.mode == 'L' and legacy_hair.getpixel((80, 50)) == 255


def test_multi_face(monkeypatch):
    monkeypatch.setattr(face, 'detect_face_boxes',
                        lambda image, **kw: [(15, 20, 85, 90), (115, 20, 185, 90)])
    monkeypatch.setattr(face, 'infer_labels', _fake_face_labels)
    result = execute('face-parsing', Image.new('RGB', (200, 100)), {})
    arr = np.asarray(result)
    assert np.count_nonzero(arr[20:90, 15:85]) > 0
    assert np.count_nonzero(arr[20:90, 115:185]) > 0
    assert np.count_nonzero(arr[0:15, :]) == 0


def test_no_face_and_invalid_params(monkeypatch):
    monkeypatch.setattr(face, 'detect_face_boxes', lambda im, **kw: [])
    im = Image.new('RGB', (80, 80))
    with pytest.raises(RunnerError) as exc:
        face.parsing(im, {})
    assert exc.value.code == 'NO_FACE_DETECTED' and exc.value.status == 422
    with pytest.raises(RunnerError) as exc:
        face.parsing(im, {'classId': 19})
    assert exc.value.code == 'INVALID_PARAMS'
    with pytest.raises(RunnerError) as exc:
        face.parsing(im, {'outputMode': 'RAW'})
    assert exc.value.code == 'INVALID_PARAMS'


def test_box_detection_uses_real_landmarks(monkeypatch):
    """Fake MediaPipe IO only; check crop top expands beyond forehead."""
    import sys
    from types import SimpleNamespace
    class FakeMPImage:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
    fake_mp = SimpleNamespace(Image=FakeMPImage, ImageFormat=SimpleNamespace(SRGB=1))
    monkeypatch.setitem(sys.modules, 'mediapipe', fake_mp)
    coords = [(0.35, 0.30), (0.65, 0.30), (0.65, 0.60), (0.35, 0.60)]
    class FakeDetector:
        def detect(self, image):
            return SimpleNamespace(face_landmarks=[
                [SimpleNamespace(x=x, y=y) for x,y in coords]
            ])
    monkeypatch.setattr(landmarks, '_detector', lambda: FakeDetector())
    boxes = landmarks.detect_face_boxes(Image.new('RGB', (300, 400)), min_size=24)
    assert len(boxes) == 1
    x1, y1, x2, y2 = boxes[0]
    assert x1 < 105 and x2 > 195 and y1 < 120 and y2 > 240
    assert abs((x2-x1) - (y2-y1)) <= 2
