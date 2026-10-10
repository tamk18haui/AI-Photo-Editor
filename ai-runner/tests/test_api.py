"""HTTP contract tests execute Java-compatible multipart requests."""
import json
from io import BytesIO
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from api.routes import app
from core import config

@pytest.fixture
def client(monkeypatch):
    """Create token-guarded test app without network access."""
    monkeypatch.setattr(config, 'RUNNER_TOKEN', 'integration-test-token')
    return TestClient(app)

@pytest.fixture
def png():
    """Create valid PNG bytes for multipart HTTP tests."""
    stream=BytesIO()
    Image.new('RGB',(64,48),(20,80,160)).save(stream,format='PNG')
    return stream.getvalue()


def test_health(client):
    """Health check must be public and non-sensitive."""
    assert client.get('/health').json()['status']=='UP'


def test_authentication(client,png):
    """Reject a request that lacks internal token."""
    response=client.post('/v1/analyze-quality',files={'file':('a.png',png,'image/png')})
    assert response.status_code==401


def test_quality_http(client,png):
    """Validate Java-to-Python HTTP contract including numeric metrics."""
    response=client.post('/v1/analyze-quality',headers={'X-Runner-Token':'integration-test-token'},
                         files={'file':('a.png',png,'image/png')})
    assert response.status_code==200
    assert response.json()['width']==64


def test_cpu_operation_http(client,png):
    """Exercise real CPU denoise through multipart endpoint and inspect PNG output."""
    response=client.post('/v1/run/denoise', headers={'X-Runner-Token':'integration-test-token'},
               data={'params':json.dumps({'strength':'LOW'})},files={'file':('a.png',png,'image/png')})
    assert response.status_code==200 and response.headers['content-type']=='image/png'
    with Image.open(BytesIO(response.content)) as image: assert image.size==(64,48)


def test_selection_needs_real_checkpoint(client,png,monkeypatch,tmp_path):
    """Smart selection must return MODEL_WEIGHTS_MISSING without actual weights."""
    from processors import selection
    selection._sam_predictor.cache_clear()
    monkeypatch.setattr(selection,'WEIGHTS',tmp_path)
    response=client.post('/v1/run/smart-selection',headers={'X-Runner-Token':'integration-test-token'},
         data={'params':json.dumps({'points':[{'x':0.4,'y':0.3,'label':1}]})},
         files={'file':('a.png',png,'image/png')})
    assert response.status_code==503 and response.json()['code']=='MODEL_WEIGHTS_MISSING'


def test_mask_operation_http(client,png):
    """Apply a grayscale mask from another project asset to original image pixels."""
    response=client.post('/v1/run/apply-mask',headers={'X-Runner-Token':'integration-test-token'},
      data={'params':json.dumps({'outputMode':'TRANSPARENT'})},
      files={'file':('a.png',png,'image/png'),'mask':('mask.png',png,'image/png')})
    assert response.status_code==200
    with Image.open(BytesIO(response.content)) as result:
        assert result.mode=='RGBA' and result.size==(64,48)


def test_unsupported_operation(client,png):
    """Do not return success for unknown operations."""
    response=client.post('/v1/run/nonexistent',headers={'X-Runner-Token':'integration-test-token'},
        files={'file':('a.png',png,'image/png')})
    assert response.status_code==404


def test_face_detection_http(client,png):
    """Face Studio receives face bounding-box JSON, never a fake image."""
    response=client.post('/v1/analyze-faces',headers={'X-Runner-Token':'integration-test-token'},
            files={'file':('a.png',png,'image/png')})
    assert response.status_code==200
    assert response.json()['faceCount']==0
    assert response.json()['width']==64
