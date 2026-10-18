"""Private Face Studio V3 HTTP endpoints; public JWT endpoints remain in Spring."""
from __future__ import annotations

import json
from fastapi import APIRouter, File, Form, Header, UploadFile
from fastapi.responses import Response

from core import config
from core.errors import RunnerError
from core.image_io import decode
from processors import face_regions

router = APIRouter()


def _auth(token: str | None):
    # Reuse current runner token validation without copying auth policy.
    from api.routes import authorize
    authorize(token)


@router.post("/v1/face-detect")
async def detect(file: UploadFile = File(...), x_runner_token: str | None = Header(default=None)):
    _auth(x_runner_token)
    image = decode(await file.read(config.MAX_BYTES + 1))
    return face_regions.analyze(image)


@router.post("/v1/face-landmarks-v3")
async def landmarks_v3(file: UploadFile = File(...), x_runner_token: str | None = Header(default=None)):
    _auth(x_runner_token)
    image = decode(await file.read(config.MAX_BYTES + 1))
    return face_regions.analyze(image, with_landmarks=True)


@router.post("/v1/face-regions")
async def regions(file: UploadFile = File(...), faceIndex: int = Form(...),
                  regions: str = Form(...), outputMode: str = Form("REGION_MASK"),
                  x_runner_token: str | None = Header(default=None)):
    _auth(x_runner_token)
    if len(regions) > 2500:
        raise RunnerError("INVALID_FACE_REGIONS", "Region JSON too long", 422)
    try:
        selected = json.loads(regions)
    except (ValueError, TypeError) as exc:
        raise RunnerError("INVALID_FACE_REGIONS", "regions must be JSON array", 422) from exc
    image = decode(await file.read(config.MAX_BYTES + 1))
    manifest, masks = face_regions.generate(image, faceIndex, selected, outputMode)
    return Response(content=face_regions.archive(manifest, masks), media_type="application/zip")
