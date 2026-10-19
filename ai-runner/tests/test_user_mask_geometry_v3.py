"""Regression: uploaded masks are not silently rescaled to source geometry."""
from io import BytesIO
import json
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from api.routes import app
from core import config


def _png(size,mode):
    buf=BytesIO()
    Image.new(mode,size,255 if mode=='L' else (50,100,130)).save(buf,'PNG')
    return buf.getvalue()

@pytest.mark.parametrize('operation,params',[
    ('apply-mask',{'outputMode':'TRANSPARENT'}),
    ('refine-mask',{'feather':1}),
    ('remove-object',{'method':'OPENCV'}),
    ('replace-background',{'backgroundColor':'#FFFFFF'}),
])
def test_mismatched_uploaded_mask_rejected_by_http(monkeypatch,operation,params):
    monkeypatch.setattr(config,'RUNNER_TOKEN','n4-geometry-unit-token')
    source=_png((64,48),'RGB')
    wrong=_png((63,48),'L')
    with TestClient(app) as client:
        result=client.post('/v1/run/'+operation,
            headers={'X-Runner-Token':'n4-geometry-unit-token'},
            data={'params':json.dumps(params)},
            files={'file':('source.png',source,'image/png'),
                   'mask':('mask.png',wrong,'image/png')})
    assert result.status_code==422, (operation,result.status_code,result.text[:250])
    assert result.json()['code']=='MASK_DIMENSION_MISMATCH'
