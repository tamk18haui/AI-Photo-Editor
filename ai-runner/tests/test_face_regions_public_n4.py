"""N4 public makeup masks: live Python processor contract, simulated checkpoints."""
from io import BytesIO
import numpy as np
import pytest
from PIL import Image
from processors import face_regions
from core.errors import RunnerError

PUBLIC = ('CHEEKS','LEFT_CHEEK','RIGHT_CHEEK','IRIS','LEFT_IRIS','RIGHT_IRIS')

def _face(cx):
    points=[{'x':cx,'y':.5,'z':0.} for _ in range(478)]
    points[0]={'x':cx-.08,'y':.38,'z':0.}
    points[1]={'x':cx+.08,'y':.62,'z':0.}
    for indices in (face_regions.LEFT_CHEEK,face_regions.RIGHT_CHEEK,
                    face_regions.LEFT_IRIS_POINTS,face_regions.RIGHT_IRIS_POINTS):
        for i,idx in enumerate(indices):
            a=2*np.pi*i/len(indices)
            points[idx]={'x':cx+.02*np.cos(a),'y':.5+.02*np.sin(a),'z':0.}
    return {'landmarks':points}

@pytest.fixture
def image_and_models(monkeypatch):
    # Input detection intentionally reversed: region index still stable left-to-right.
    monkeypatch.setattr(face_regions,'run_landmarks',lambda _:{'faces':[_face(.75),_face(.25)]})
    def parse(img):
        labels=np.ones((64,64),dtype=np.uint8)
        labels[20:24,20:24]=4
        labels[25:29,25:29]=5
        return labels
    monkeypatch.setattr(face_regions,'infer_labels',parse)
    return Image.new('RGB',(256,128),(180,150,125))

@pytest.mark.parametrize('region',PUBLIC)
def test_public_region_source_geometry_and_face_index(image_and_models,region):
    image=image_and_models
    assert region in face_regions.CONTRACT_REGIONS
    manifest,masks=face_regions.generate(image,0,[region])
    assert manifest['faceIndex']==0
    assert manifest['imageWidth']==image.width
    assert manifest['imageHeight']==image.height
    assert manifest['masks'][0]['region']==region
    with Image.open(BytesIO(masks[f'regions/{region}.png'])) as mask:
        assert mask.size==image.size and mask.mode=='L'
        assert set(np.unique(np.asarray(mask))).issubset({0,255})


def test_public_region_batch_and_invalid_index(image_and_models):
    m,files=face_regions.generate(image_and_models,1,list(PUBLIC))
    assert len(files)==6 and m['faceIndex']==1
    with pytest.raises(RunnerError) as exc:
        face_regions.generate(image_and_models,2,['IRIS'])
    assert exc.value.code=='FACE_INDEX_INVALID'


def test_reject_unknown_and_repeated_regions(image_and_models):
    for regions in [['WHOLE_WORLD'],['IRIS','IRIS']]:
        with pytest.raises(RunnerError):face_regions.generate(image_and_models,0,regions)
