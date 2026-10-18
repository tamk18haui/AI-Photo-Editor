"""Truthful, side-effect-free model availability (file != inference-ready)."""
from core.config import WEIGHTS
from tools.verify_models import EXPECTED
import json
from pathlib import Path


def report():
    models={}
    verified_path=Path(__file__).resolve().parents[1]/".n4_models_verified.json"
    try:
        records=json.loads(verified_path.read_text(encoding="utf8"))
    except (OSError,ValueError):
        records={}
    for name, paths in EXPECTED.items():
        found=all((WEIGHTS / p).is_file() and (WEIGHTS / p).stat().st_size>256 for p in paths)
        evidence=records.get(name,{})
        expected_fingerprints={}
        if found:
            for p in paths:
                st=(WEIGHTS/p).stat()
                expected_fingerprints[p]={"size":st.st_size,"mtimeNs":st.st_mtime_ns}
        ready=bool(found and evidence.get("status")=="PASS" and evidence.get("fingerprints")==expected_fingerprints)
        models[name]={"filesPresent":found,
                      "status":"INFERENCE_VERIFIED" if ready else "FILES_PRESENT_UNVERIFIED" if found else "MISSING",
                      "ready":ready,"notice":"Real inference smoke verified against exact checkpoint file metadata" if ready else "Run real inference smoke; file presence is not readiness"}
    models["MagicTouch"]={"filesPresent":False,"ready":False,"status":"NOT_INSTALLED"}
    return {"modelReadiness":models,"makeupEffects":["LIPSTICK","LIP_GLOSS","EYESHADOW","EYELINER",
        "EYEBROW_COLOR","BLUSH","FOUNDATION","SKIN_SMOOTH","HAIR_COLOR","TEETH_WHITEN",
        "EYE_COLOR","FACE_RELIGHT"],"makeupEngine":"HYBRID_N4_FINAL_N2_PREVIEW",
        "readyPolicy":"Models are NOT marked READY without successful real inference"}
