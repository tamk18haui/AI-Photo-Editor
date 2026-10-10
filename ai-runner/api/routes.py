"""Private, token-protected HTTP API. Public application endpoints live in Spring Boot."""
import hmac
import json
import logging
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response, JSONResponse
from core import config
from core.errors import RunnerError
from core.image_io import decode, to_png
from processors.analyze_quality import run as quality, detect_faces
from processors.landmarks import run as face_landmarks
from tools.verify_models import EXPECTED
from processors.dispatch import execute, OPERATIONS

logger = logging.getLogger(__name__)
app = FastAPI(title="Image AI Runner", version="1.0.0", docs_url=None, redoc_url=None)


def authorize(token: str | None) -> None:
    """Reject unauthenticated calls, including when server token is unconfigured."""
    if not config.RUNNER_TOKEN or not token or not hmac.compare_digest(token, config.RUNNER_TOKEN):
        raise HTTPException(status_code=401, detail={"code":"RUNNER_UNAUTHORIZED"})


@app.exception_handler(RunnerError)
async def on_runner_error(request, exc: RunnerError):
    """Return stable machine-readable error codes, without system paths or stack traces."""
    return JSONResponse(status_code=exc.status, content={"code":exc.code,"message":exc.message})


@app.get("/health")
def health():
    """Report process liveness without exposing local model details."""
    return {"status":"UP"}


@app.get("/v1/capabilities")
def capabilities(x_runner_token: str | None = Header(default=None)):
    """List available processor names; an operation may still require a checkpoint."""
    authorize(x_runner_token)
    return {"operations": sorted(OPERATIONS),
            "modelFiles": {name: all((config.WEIGHTS / relative).is_file() for relative in paths)
                           for name, paths in EXPECTED.items()},
            "notice": "File presence does not certify compatibility; run inference smoke tests."}


@app.post("/v1/analyze-quality")
async def analyze(file: UploadFile = File(...), x_runner_token: str | None = Header(default=None)):
    """Return contract-compatible numeric quality indicators for a real image."""
    authorize(x_runner_token)
    image = decode(await file.read(config.MAX_BYTES + 1))
    return quality(image)


@app.post("/v1/run/{operation}")
async def process(operation: str, file: UploadFile = File(...), params: str = Form("{}"),
                  mask: UploadFile | None = File(default=None),
                  background: UploadFile | None = File(default=None),
                  x_runner_token: str | None = Header(default=None)):
    """Run exactly one operation and return real image data as PNG bytes."""
    authorize(x_runner_token)
    if len(params) > 16384:
        raise RunnerError("INVALID_PARAMS", "Parameter payload too long", 422)
    try:
        options = json.loads(params)
    except ValueError as exc:
        raise RunnerError("INVALID_PARAMS", "params must be JSON", 422) from exc
    if not isinstance(options, dict):
        raise RunnerError("INVALID_PARAMS", "params must be an object", 422)
    image = decode(await file.read(config.MAX_BYTES + 1))
    selection = decode(await mask.read(config.MAX_BYTES + 1), mask=True) if mask else None
    backdrop = decode(await background.read(config.MAX_BYTES + 1)) if background else None
    try:
        result = execute(operation, image, options, selection, backdrop)
        return Response(content=to_png(result), media_type="image/png")
    except RunnerError:
        raise
    except Exception:
        logger.exception("Unhandled processing error for %s", operation)
        raise RunnerError("AI_INFERENCE_FAILED", "Image processing failed", 503)


@app.post("/v1/analyze-faces")
async def faces(file: UploadFile = File(...), x_runner_token: str | None = Header(default=None)):
    """Return detected face bounding boxes for the selected project asset."""
    authorize(x_runner_token)
    image = decode(await file.read(config.MAX_BYTES + 1))
    return detect_faces(image)


@app.post("/v1/face-landmarks")
async def landmarks(file: UploadFile = File(...), x_runner_token: str | None = Header(default=None)):
    """Return MediaPipe landmark coordinates from the uploaded project asset."""
    authorize(x_runner_token)
    image = decode(await file.read(config.MAX_BYTES + 1))
    return face_landmarks(image)
