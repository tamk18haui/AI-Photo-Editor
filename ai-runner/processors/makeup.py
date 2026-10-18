"""N4 Hybrid Makeup: server-side final compositor for all twelve FULL V3 effects.

Uses ONLY existing MediaPipe+ONNX parsing. N2 owns low-latency preview and
controls; this processor creates a new immutable AI_OUTPUT via shared Job Core.
Heuristic regions (cheeks, iris, teeth) are explicitly not dedicated models.
"""
from __future__ import annotations

from io import BytesIO
import math
import re

import cv2
import numpy as np
from PIL import Image

from core.errors import RunnerError
from processors import face_regions

EFFECT_REGION = {
    "LIPSTICK": "LIPS", "LIP_GLOSS": "LIPS",
    "EYESHADOW": "EYELIDS", "EYELINER": "EYELIDS",
    "EYEBROW_COLOR": "EYEBROWS", "BLUSH": "CHEEKS",
    "FOUNDATION": "SKIN", "SKIN_SMOOTH": "SKIN",
    "HAIR_COLOR": "HAIR", "TEETH_WHITEN": "TEETH",
    "EYE_COLOR": "IRIS", "FACE_RELIGHT": "SKIN",
}
BLENDS = frozenset({"NORMAL", "MULTIPLY", "OVERLAY", "SOFT_LIGHT", "SCREEN"})
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_COLORS = {
    "LIPSTICK":"#BC3151", "LIP_GLOSS":"#D85A76", "EYESHADOW":"#A36B8A",
    "EYELINER":"#241C23", "EYEBROW_COLOR":"#654431", "BLUSH":"#DB8588",
    "FOUNDATION":"#C89979", "SKIN_SMOOTH":"#FFFFFF", "HAIR_COLOR":"#794835",
    "TEETH_WHITEN":"#FFFFFF", "EYE_COLOR":"#487B9F", "FACE_RELIGHT":"#FFFFFF",
}


def _bad(code, message):
    raise RunnerError(code, message, 422)


def validate(args: dict) -> tuple[int, list[dict]]:
    """Validate untrusted params before attempting expensive model inference."""
    if not isinstance(args, dict):
        _bad("INVALID_MAKEUP", "Makeup params must be an object")
    idx = args.get("faceIndex")
    if type(idx) is not int or idx < 0:
        _bad("FACE_INDEX_INVALID", "faceIndex must be a non-negative integer")
    effects = args.get("effects")
    if not isinstance(effects, list) or not 1 <= len(effects) <= 24:
        _bad("INVALID_MAKEUP", "effects must have 1..24 entries")
    if args.get("outputMode", "PREVIEW") not in ("PREVIEW", "FINAL"):
        _bad("INVALID_OUTPUT_MODE", "outputMode must be PREVIEW or FINAL")
    normalized = []
    for item in effects:
        if not isinstance(item, dict):
            _bad("INVALID_MAKEUP", "Each effect must be an object")
        effect = item.get("effect")
        if effect not in EFFECT_REGION:
            _bad("UNSUPPORTED_MAKEUP_EFFECT", "Unsupported makeup effect")
        region = item.get("region")
        if region is not None and region not in face_regions._ALL_REGIONS:
            _bad("UNSUPPORTED_FACE_REGION", "Unknown makeup region")
        for field in ("intensity", "feather"):
            v = item.get(field, 0.0)
            if type(v) not in (int,float) or not math.isfinite(v) or not 0 <= v <= 1:
                _bad("INVALID_MAKEUP", f"{field} must be in [0,1]")
        color = item.get("color")
        if color is not None and (not isinstance(color, str) or not COLOR_RE.fullmatch(color)):
            _bad("INVALID_MAKEUP", "color must be #RRGGBB")
        blend = item.get("blendMode", "NORMAL")
        if blend not in BLENDS:
            _bad("INVALID_MAKEUP", "Unknown blendMode")
        if item.get("params") is not None and not isinstance(item["params"], dict):
            _bad("INVALID_MAKEUP", "params must be an object")
        # Explicit region override allowed only if within the requested effect's region family.
        # Otherwise a caller could turn teeth whitening into whole-image processing.
        if region is not None and region != EFFECT_REGION[effect]:
            family = {"LIPSTICK":{"LIPS","UPPER_LIP","LOWER_LIP"},
                      "LIP_GLOSS":{"LIPS","UPPER_LIP","LOWER_LIP"},
                      "EYE_COLOR":{"IRIS","LEFT_IRIS","RIGHT_IRIS"},
                      "EYEBROW_COLOR":{"EYEBROWS","LEFT_EYEBROW","RIGHT_EYEBROW"},
                      "EYESHADOW":{"EYELIDS","LEFT_EYE","RIGHT_EYE"},
                      "EYELINER":{"EYELIDS","LEFT_EYE","RIGHT_EYE"},
                      "BLUSH":{"CHEEKS","LEFT_CHEEK","RIGHT_CHEEK"}}.get(effect, {EFFECT_REGION[effect]})
            if region not in family:
                _bad("INVALID_MAKEUP", "Region is incompatible with effect")
        normalized.append({**item, "effect": effect, "region":region or EFFECT_REGION[effect],
                           "intensity":float(item.get("intensity",0.0)),
                           "feather":float(item.get("feather",0.0)),
                           "blendMode":blend,
                           "color":color or DEFAULT_COLORS[effect]})
    return idx, normalized


def _color(code):
    return np.array([int(code[i:i+2],16) for i in (1,3,5)],dtype=np.float32)


def _blend(base, target, mode):
    b = base/255.0; t=target/255.0
    if mode == "MULTIPLY": v=b*t
    elif mode == "SCREEN": v=1-(1-b)*(1-t)
    elif mode == "OVERLAY": v=np.where(b<.5,2*b*t,1-2*(1-b)*(1-t))
    elif mode == "SOFT_LIGHT": v=(1-2*t)*b*b+2*t*b
    else: v=t
    return np.clip(v*255,0,255)


def _tinted(base, color, effect):
    # Preserve image brightness and small-scale photographic texture.
    target = color.reshape(1,1,3)
    luminance = (base[:,:,0]*.299 + base[:,:,1]*.587 + base[:,:,2]*.114)
    current = np.maximum(12.0,luminance).reshape(base.shape[0],base.shape[1],1)
    luminance_scale = np.clip(current / np.mean(color[[0,1,2]]), .45, 1.8)
    result = np.clip(target * luminance_scale,0,255)
    if effect in ("LIP_GLOSS", "TEETH_WHITEN", "FACE_RELIGHT"):
        result=np.clip(.6*result+.4*base,0,255)
    return result


def _apply_one(rgb, mask, item):
    intensity=item["intensity"]
    if intensity<=0 or not np.any(mask): return rgb
    effect=item["effect"]
    strength=np.asarray(mask,dtype=np.float32)/255
    feather_px=min(25., item["feather"]*25)
    if feather_px>0:
        strength=cv2.GaussianBlur(strength,(0,0),sigmaX=max(.01,feather_px))
    if effect in ("EYELINER", "EYESHADOW"):
        # Dilate contour slightly for eyeshadow; draw along the rim for eyeliner.
        if effect == "EYELINER":
            binary=(strength>.3).astype('uint8')*255
            edge=cv2.morphologyEx(binary,cv2.MORPH_GRADIENT,np.ones((3,3),np.uint8))
            strength=np.minimum(strength,edge/255.0)
        else:
            strength=cv2.GaussianBlur(strength,(0,0),sigmaX=2)
    base=rgb.astype(np.float32)
    color=_color(item["color"])
    if effect=="SKIN_SMOOTH":
        smooth=cv2.bilateralFilter(rgb, d=7,sigmaColor=38,sigmaSpace=5).astype(np.float32)
        # Keep original edges/texture to avoid plastic skin.
        desired=.7*smooth+.3*base
    elif effect=="FACE_RELIGHT":
        hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB)
        lab=hsv.astype(np.float32)
        lab[:,:,0]=np.clip(lab[:,:,0]+25*intensity,0,255)
        desired=cv2.cvtColor(lab.astype(np.uint8),cv2.COLOR_LAB2RGB).astype(np.float32)
    elif effect=="TEETH_WHITEN":
        desired=.5*base+.5*255
        strength=np.minimum(strength, .7)
    elif effect=="LIP_GLOSS":
        highlight=cv2.GaussianBlur(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),(0,0),1).astype(np.float32)/255
        gloss=(highlight**2*40)[:,:,None]
        desired=np.clip(_tinted(base,color,effect)+gloss,0,255)
    else:
        desired=_tinted(base,color,effect)
        desired=_blend(base,desired,item["blendMode"])
    alpha=(np.clip(strength*intensity,0,1))[:,:,None]
    return np.uint8(np.clip(base*(1-alpha)+desired*alpha,0,255))


def run(image: Image.Image,args: dict) -> Image.Image:
    face_index,effects=validate(args)
    original=image.convert("RGBA")
    regions=list(dict.fromkeys(e["region"] for e in effects if e["intensity"]>0))
    if not regions: return original.copy()
    manifest, png_masks=face_regions.generate(image,face_index,regions,allow_experimental=True)
    if manifest["faceIndex"]!=face_index or (manifest["imageWidth"],manifest["imageHeight"])!=image.size:
        raise RunnerError("MODEL_OUTPUT_INVALID", "Face masks did not match selected asset", 503)
    masks={}
    for region in regions:
        raw=png_masks["regions/"+region+".png"]
        with Image.open(BytesIO(raw)) as decoded:
            if decoded.mode!="L" or decoded.size!=image.size:
                raise RunnerError("MODEL_OUTPUT_INVALID","Face mask geometry invalid",503)
            masks[region]=np.asarray(decoded).copy()
    rgb=np.array(original.convert("RGB"))
    for e in effects:
        if e["intensity"]>0:
            rgb=_apply_one(rgb,masks[e["region"]],e)
    result=Image.fromarray(rgb,"RGB").convert("RGBA")
    result.putalpha(original.getchannel("A"))
    return result
