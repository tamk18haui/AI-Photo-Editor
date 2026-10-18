"""N4 Face Studio tests: deterministic face selection, typed masks, no fake model."""
import json
from io import BytesIO
import zipfile

import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from api.routes import app
from core import config
from core.errors import RunnerError
from processors import face_regions


def _landmarks(center_x):
    # 478 landmarks; two isolated faces horizontally separated.
    pts = [{"x": center_x, "y": 0.5, "z": 0.0} for _ in range(478)]
    pts[0] = {"x": center_x - 0.08, "y": .38, "z": 0.0}
    pts[1] = {"x": center_x + 0.08, "y": .62, "z": 0.0}
    # Give polygons usable non-degenerate geometry for synthetic testing.
    for inds in (face_regions.LEFT_EYE_LINE, face_regions.RIGHT_EYE_LINE,
                 face_regions.INNER_LIPS, face_regions.LEFT_CHEEK,
                 face_regions.RIGHT_CHEEK, face_regions.LEFT_IRIS_POINTS,
                 face_regions.RIGHT_IRIS_POINTS):
        for i, idx in enumerate(inds):
            angle = i * 2*np.pi / len(inds)
            pts[idx] = {"x": center_x + .02 * np.cos(angle),
                        "y": .50 + .02 * np.sin(angle), "z": 0.0}
    return pts


@pytest.fixture
def fake_models(monkeypatch):
    # Deliberately return reverse detection order. N4 must sort left-to-right.
    monkeypatch.setattr(face_regions, 'run_landmarks', lambda image: {
        'faces': [{'landmarks': _landmarks(.74)}, {'landmarks': _landmarks(.26)}]
    })
    def parse(image):
        labels = np.ones((512,512), dtype=np.uint8)
        labels[120:170, 120:170] = 17   # hair
        labels[240:270, 240:270] = 12   # upper lip
        labels[280:290, 240:270] = 13   # lower lip
        labels[295:320, 245:265] = 11  # mouth interior / teeth candidate
        labels[190:210, 230:250] = 4    # eye
        labels[195:210, 260:280] = 5
        return labels
    monkeypatch.setattr(face_regions, 'infer_labels', parse)
    return Image.new('RGB', (420, 260), (190, 160, 140))


def test_sorted_face_indices(fake_models):
    data = face_regions.analyze(fake_models, with_landmarks=True)
    assert len(data['faces']) == 2
    assert data['faces'][0]['boundingBox']['x'] < data['faces'][1]['boundingBox']['x']
    assert data['faces'][0]['faceIndex'] == 0
    assert data['faces'][1]['faceIndex'] == 1
    assert len(data['faces'][0]['landmarks']) == 478


def test_source_sized_masks_and_no_other_face(fake_models):
    manifest, results = face_regions.generate(fake_models, 1, ['SKIN','HAIR','LIPS','EYELIDS','TEETH'])
    assert manifest['faceIndex'] == 1
    assert len(manifest['masks']) == 5
    for content in results.values():
        with Image.open(BytesIO(content)) as image:
            assert image.size == fake_models.size and image.mode == 'L'
            px = np.asarray(image)
            assert px[:, :fake_models.width//2].max() == 0
            assert set(np.unique(px)).issubset({0,255})
    # Return ZIP with source-size mask names; must never create preview overlay.
    zipped = face_regions.archive(manifest, results)
    with zipfile.ZipFile(BytesIO(zipped)) as archive:
        assert 'manifest.json' in archive.namelist()
        assert 'regions/HAIR.png' in archive.namelist()
        assert json.loads(archive.read('manifest.json'))['faceIndex'] == 1


def test_face_index_out_of_bounds(fake_models):
    with pytest.raises(RunnerError) as err:
        face_regions.generate(fake_models, 2, ['SKIN'])
    assert err.value.code == 'FACE_INDEX_INVALID'


def test_unsupported_region_fail_closed(fake_models):
    with pytest.raises(RunnerError) as err:
        face_regions.generate(fake_models, 0, ['WHOLE_WORLD'])
    assert err.value.code == 'UNSUPPORTED_FACE_REGION'
    with pytest.raises(RunnerError):
        face_regions.generate(fake_models, 0, ['SKIN','SKIN'])
    # Extras are gated pending a reviewed YAML contract change.
    with pytest.raises(RunnerError):
        face_regions.generate(fake_models, 0, ['IRIS'])


def test_grayscale_label_map(fake_models):
    manifest, masks = face_regions.generate(fake_models, 0, ['SKIN'], 'LABEL_MAP')
    assert manifest['outputMode'] == 'LABEL_MAP'
    with Image.open(BytesIO(masks['regions/SKIN.png'])) as image:
        assert set(np.unique(image)).issubset({0,1})


def test_zero_faces(monkeypatch, fake_models):
    monkeypatch.setattr(face_regions, 'run_landmarks', lambda _: {'faces': []})
    assert face_regions.analyze(fake_models)['faces'] == []
    with pytest.raises(RunnerError) as err:
        face_regions.generate(fake_models, 0, ['LIPS'])
    assert err.value.code == 'FACE_INDEX_INVALID'


def test_model_failure_is_not_silent(monkeypatch, fake_models):
    def fail(_):
        raise RunnerError('MODEL_WEIGHTS_MISSING', 'Checkpoint missing', 503)
    monkeypatch.setattr(face_regions, 'infer_labels', fail)
    with pytest.raises(RunnerError) as err:
        face_regions.generate(fake_models, 0, ['SKIN'])
    assert err.value.code == 'MODEL_WEIGHTS_MISSING'


def test_http_routes_auth_and_zip(monkeypatch, fake_models):
    monkeypatch.setattr(config, 'RUNNER_TOKEN', 'n4-test-token')
    def make_png(image):
        b=BytesIO();image.save(b,format='PNG');return b.getvalue()
    with TestClient(app) as client:
        bare = client.post('/v1/face-detect', files={'file':('x.png',make_png(fake_models),'image/png')})
        assert bare.status_code == 401
        headers = {'X-Runner-Token':'n4-test-token'}
        res = client.post('/v1/face-detect',headers=headers,files={'file':('x.png',make_png(fake_models),'image/png')})
        assert res.status_code == 200 and len(res.json()['faces']) == 2
        land = client.post('/v1/face-landmarks-v3',headers=headers,
                           files={'file':('x.png',make_png(fake_models),'image/png')})
        assert land.status_code == 200 and land.json()['faces'][0]['faceIndex'] == 0
        mask = client.post('/v1/face-regions',headers=headers,
                           files={'file':('x.png',make_png(fake_models),'image/png')},
                           data={'faceIndex':'1','regions':'["SKIN","LIPS"]'})
        assert mask.status_code == 200 and mask.headers['content-type']=='application/zip'
        with zipfile.ZipFile(BytesIO(mask.content)) as archive:
            assert len(archive.namelist()) == 3
        bad = client.post('/v1/face-regions',headers=headers,
                          files={'file':('x.png',make_png(fake_models),'image/png')},
                          data={'faceIndex':'7','regions':'["SKIN"]'})
        assert bad.status_code == 422 and bad.json()['code'] == 'FACE_INDEX_INVALID'
