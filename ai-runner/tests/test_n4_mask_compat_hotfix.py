"""Guard BOTH old model-mask resizing and strict external mask validation."""
from io import BytesIO
import json

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from core import config
from core.errors import RunnerError
from api.routes import app
from processors import mask
from processors.dispatch import execute


def _bytes(size, mode='L'):
    s = BytesIO()
    Image.new(mode,size,160 if mode=='L' else (12,80,160)).save(s,'PNG')
    return s.getvalue()


def test_small_generated_mask_can_be_resized_inside_compositor():
    source=Image.new('RGB',(128,96),'blue')
    alpha=Image.new('L',(8,6),160)
    result=mask.apply_alpha(source,alpha,{'outputMode':'TRANSPARENT'})
    assert result.size==source.size
    assert result.getpixel((50,50))[3]==160
    mask_only=mask.apply_alpha(source,alpha,{'outputMode':'MASK_ONLY'})
    assert mask_only.mode=='L' and mask_only.size==source.size


@pytest.mark.parametrize('operation,params',[
    ('apply-mask', {'outputMode':'TRANSPARENT'}),
    ('refine-mask', {'feather':2}),
    ('replace-background', {'backgroundColor':'#FFFFFF'}),
    ('remove-object', {'method':'OPENCV'}),
])
def test_wrong_user_mask_rejected_at_direct_operation_boundary(operation,params):
    source=Image.new('RGB',(128,96),'red')
    alpha=Image.new('L',(120,96),255)
    with pytest.raises(RunnerError) as e:
        execute(operation,source,params,alpha)
    assert e.value.code=='MASK_DIMENSION_MISMATCH'


@pytest.mark.parametrize('operation,params',[
    ('apply-mask', {'outputMode':'TRANSPARENT'}),
    ('refine-mask', {'feather':2}),
    ('replace-background', {'backgroundColor':'#FFFFFF'}),
    ('remove-object', {'method':'OPENCV'}),
])
def test_wrong_user_mask_rejected_at_http_boundary(monkeypatch, operation,params):
    monkeypatch.setattr(config,'RUNNER_TOKEN','hotfix-regression-token')
    with TestClient(app) as client:
        r=client.post('/v1/run/'+operation,
            headers={'X-Runner-Token':'hotfix-regression-token'},
            data={'params':json.dumps(params)},
            files={'file':('i.png',_bytes((128,96),'RGB'),'image/png'),
                   'mask':('m.png',_bytes((120,96),'L'),'image/png')})
    assert r.status_code==422
    assert r.json()['code']=='MASK_DIMENSION_MISMATCH'
