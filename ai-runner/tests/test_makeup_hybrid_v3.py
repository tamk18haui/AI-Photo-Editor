"""N4 Hybrid makeup / mask validation regressions. No pretrained weights mocked as ready."""
from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from core.errors import RunnerError
from processors import makeup, face_regions


def _landmarks(cx):
    pts=[{'x':cx,'y':.5,'z':0.} for _ in range(478)]
    pts[0]={'x':cx-.08,'y':.38,'z':0.}
    pts[1]={'x':cx+.08,'y':.62,'z':0.}
    for inds in (face_regions.LEFT_EYE_LINE,face_regions.RIGHT_EYE_LINE,
                 face_regions.INNER_LIPS,face_regions.LEFT_CHEEK,
                 face_regions.RIGHT_CHEEK,face_regions.LEFT_IRIS_POINTS,
                 face_regions.RIGHT_IRIS_POINTS):
        for i,index in enumerate(inds):
            a=i*2*np.pi/len(inds)
            pts[index]={'x':cx+.016*np.cos(a),'y':.50+.016*np.sin(a),'z':0.}
    return pts

@pytest.fixture
def models(monkeypatch):
    monkeypatch.setattr(face_regions,'run_landmarks',lambda _: {
        'faces':[{'landmarks':_landmarks(.75)},{'landmarks':_landmarks(.25)}]})
    def infer(_):
        labels=np.ones((512,512),dtype=np.uint8)
        # Distinct parsing classes: current image cropped around each selected face.
        labels[80:130,80:130]=17
        labels[180:195,240:270]=4
        labels[180:195,270:300]=5
        labels[130:145,220:260]=2
        labels[130:145,270:300]=3
        labels[260:275,240:265]=12
        labels[275:290,240:265]=13
        labels[300:325,230:260]=11
        return labels
    monkeypatch.setattr(face_regions,'infer_labels',infer)
    rgb=Image.new('RGBA',(420,260),(177,150,123,255))
    return rgb

@pytest.mark.parametrize('effect',list(makeup.EFFECT_REGION))
def test_all_12_effects_render_selected_face_only(models,effect):
    output=makeup.run(models,{'faceIndex':1,'effects':[{
        'effect':effect,'intensity':.8,'feather':.0}]})
    assert output.size==models.size and output.mode=='RGBA'
    old=np.asarray(models).copy();new=np.asarray(output)
    assert np.array_equal(old[:,:models.width//2],new[:,:models.width//2])
    assert np.array_equal(old[:,:,3],new[:,:,3])


def test_multiple_makeup_effects_single_inference(models,monkeypatch):
    original=face_regions.generate
    calls=[]
    def generate(*a,**k):
        calls.append(1)
        return original(*a,**k)
    monkeypatch.setattr(face_regions,'generate',generate)
    result=makeup.run(models,{'faceIndex':0,'outputMode':'FINAL','effects':[
        {'effect':'LIPSTICK','intensity':.3,'color':'#FF0000'},
        {'effect':'BLUSH','intensity':.4,'feather':.5},
        {'effect':'HAIR_COLOR','intensity':.5,'blendMode':'MULTIPLY'},
    ]})
    assert len(calls)==1 and result.size==models.size
    assert np.array_equal(np.asarray(models)[:,models.width//2:], np.asarray(result)[:,models.width//2:])

@pytest.mark.parametrize('bad',[{}, {'faceIndex':-1,'effects':[{'effect':'BLUSH','intensity':.3}]},
     {'faceIndex':0,'effects':[{'effect':'UNKNOWN','intensity':.5}]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':float('nan')}]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':1.1}]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':.5,'color':'red'}]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':.5,'region':'HAIR'}]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':.5,'blendMode':'unknown'}]},
     {'faceIndex':0,'effects':[]},
     {'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':.5}], 'outputMode':'DEBUG'}])
def test_invalid_makeup_requests_fail_closed(bad):
    with pytest.raises(RunnerError): makeup.validate(bad)


def test_nonexistent_face_fails_instead_of_faking(models):
    with pytest.raises(RunnerError) as exc:
        makeup.run(models,{'faceIndex':50,'effects':[{'effect':'LIPSTICK','intensity':.4}]})
    assert exc.value.code=='FACE_INDEX_INVALID'


def test_zero_strength_does_not_modify_original(models):
    result=makeup.run(models,{'faceIndex':0,'effects':[{'effect':'LIPSTICK','intensity':0}]})
    assert np.array_equal(np.asarray(models),np.asarray(result))


def test_mask_dimension_mismatch_raised():
    from processors.mask import require_source_mask
    source=Image.new('L',(41,28),255)
    with pytest.raises(RunnerError) as exc:require_source_mask(source,(40,28))
    assert exc.value.code=='MASK_DIMENSION_MISMATCH'
    assert require_source_mask(source,(41,28)).mode=='L'


def test_model_readiness_does_not_falsify(monkeypatch,tmp_path):
    from core import model_readiness
    monkeypatch.setattr(model_readiness,'WEIGHTS',tmp_path)
    state=model_readiness.report()
    assert all(not info['ready'] for info in state['modelReadiness'].values())
    assert state['modelReadiness']['MagicTouch']['status']=='NOT_INSTALLED'
