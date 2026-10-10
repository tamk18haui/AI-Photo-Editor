"""Fail-closed tests for the seven-model contract; no fake checkpoint output."""
from io import BytesIO
import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from api.routes import app
from core import config
from core.errors import RunnerError


def test_missing_landmarker(monkeypatch, tmp_path):
    """A face landmark request must report missing weights, never invented landmarks."""
    from processors import landmarks
    monkeypatch.setattr(landmarks, 'WEIGHTS', tmp_path)
    landmarks._detector.cache_clear()
    with pytest.raises(RunnerError, match='face_landmarker.task'):
        landmarks.run(Image.new('RGB', (32, 32)))


def test_missing_face_parsing_onnx(monkeypatch, tmp_path):
    """Face parsing never silently falls back to a different model."""
    from models.face_parsing import loader
    loader.load.cache_clear()
    monkeypatch.setattr(loader, 'WEIGHTS', tmp_path)
    with pytest.raises(RunnerError) as error:
        loader.run(Image.new('RGB',(48,64)), {})
    assert error.value.code == 'MODEL_WEIGHTS_MISSING'


def test_missing_lama_checkpoint(monkeypatch, tmp_path):
    """LaMa requires both its config and matching checkpoint."""
    from processors import lama
    lama._model.cache_clear()
    monkeypatch.setattr(lama, 'WEIGHTS', tmp_path)
    with pytest.raises(RunnerError) as error:
        lama.run(Image.new('RGB',(64,64)), Image.new('L',(64,64),255))
    assert error.value.code == 'MODEL_WEIGHTS_MISSING'


def test_onnx_preprocessing_and_segmentation(monkeypatch):
    """ONNX adapter normalizes correctly and resizes its 19-class output."""
    from models.face_parsing import loader
    class Input:
        name = 'input'
    class FakeSession:
        def get_inputs(self): return [Input()]
        def run(self, outputs, feed):
            tensor=feed['input']
            assert tensor.shape==(1,3,512,512)
            assert tensor.dtype==np.float32
            logits=np.zeros((1,19,512,512),dtype=np.float32)
            logits[:,3,:,:]=3
            return [logits]
    monkeypatch.setattr(loader,'load',lambda:(FakeSession(),'input'))
    image=Image.new('RGB',(61,45),'#8a6432')
    result=loader.run(image,{'classId':3})
    assert result.size==image.size and result.mode=='L'
    assert set(np.asarray(result).ravel())=={255}


def test_runner_rejects_unapproved_generative_outpaint(monkeypatch):
    """The agreed 7-model scope must not advertise unavailable diffusion functionality."""
    from processors.dispatch import OPERATIONS
    assert 'outpaint' not in OPERATIONS


def test_api_reports_missing_lama(monkeypatch,tmp_path):
    """Test the public-to-private image transport without model weights."""
    from processors import lama
    monkeypatch.setattr(config,'RUNNER_TOKEN','test-internal')
    monkeypatch.setattr(lama,'WEIGHTS',tmp_path)
    lama._model.cache_clear()
    stream=BytesIO();Image.new('RGB',(32,32),'blue').save(stream,format='PNG')
    img=stream.getvalue(); stream=BytesIO();Image.new('L',(32,32),255).save(stream,format='PNG')
    response=TestClient(app).post('/v1/run/remove-object',headers={'X-Runner-Token':'test-internal'},
            data={'params':'{}'},files={'file':('src.png',img,'image/png'),
            'mask':('mask.png',stream.getvalue(),'image/png')})
    assert response.status_code==503
    assert response.json()['code']=='MODEL_WEIGHTS_MISSING'
