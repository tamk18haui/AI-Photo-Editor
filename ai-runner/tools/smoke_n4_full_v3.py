"""Honest REAL-inference smoke runner; zero model mocking, all outputs audited."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import traceback
from datetime import datetime,timezone
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw
from core.model_registry import MODELS
from core.config import WEIGHTS
from processors.dispatch import execute
from processors import face_regions, makeup

MAPPING = {
    "Real-ESRGAN x2":"upscale-x2", "Real-ESRGAN x4":"upscale-x4",
    "BiRefNet":"remove-background", "SAM ViT-B":"smart-selection",
    "Big-LaMa TorchScript":"remove-object", "GFPGAN 1.4":"face-restore",
    "Face Landmarker":"face-detect", "Face Parsing ONNX":"face-regions",
}
NAME_BY_PATH = {
    "Real-ESRGAN x2":["realesrgan/RealESRGAN_x2plus.pth"],
    "Real-ESRGAN x4":["realesrgan/RealESRGAN_x4plus.pth"],
    "BiRefNet":["birefnet/config.json","birefnet/model.safetensors","birefnet/birefnet.py","birefnet/BiRefNet_config.py"],
    "SAM ViT-B":["sam/sam_vit_b_01ec64.pth"], "Big-LaMa TorchScript":["lama/big-lama.pt"],
    "GFPGAN 1.4":["face/GFPGANv1.4.pth"],
    "Face Landmarker":["mediapipe/face_landmarker.task"],
    "Face Parsing ONNX":["face_parsing/resnet34.onnx"],
}

def fingerprints(files):
    out={}
    for p in files:
        file=WEIGHTS / p
        if not file.is_file(): return None
        st=file.stat()
        out[p]={"size":st.st_size,"mtimeNs":st.st_mtime_ns}
    return out


def test_one(label,fn,output,results):
    print(f"[N4-REAL] {label} ...",flush=True)
    try:
        value=fn()
        if isinstance(value,Image.Image):
            if value.width<=0 or value.height<=0 or not np.asarray(value).size:
                raise ValueError('empty result')
            value.save(output/(label+'.png'))
            description={"width":value.width,"height":value.height,"mode":value.mode}
        else:
            description=value
        results[label]={"status":"PASS","result":description}
        print(f"[N4-REAL] {label}: PASS",flush=True)
    except Exception as exc:
        results[label]={"status":"FAIL","errorCode":getattr(exc,"code",type(exc).__name__),
                        "message":str(exc)[:240]}
        print(f"[N4-REAL] {label}: FAIL {type(exc).__name__} {str(exc)[:130]}",flush=True)
    return results[label]["status"]=="PASS"


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--image',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--face-index',type=int,default=0)
    parser.add_argument('--second-face-index',type=int,default=None)
    args=parser.parse_args()
    path=Path(args.image)
    if not path.is_file():
        print('REAL IMAGE NOT FOUND: '+str(path),file=sys.stderr);return 2
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    src=Image.open(path);src.load();src=src.convert('RGB')
    # Real inference at a bounded size. This is a functional smoke, not full-resolution benchmarking.
    src.thumbnail((640,640),Image.Resampling.LANCZOS)
    results={}
    def faces():
        detected=face_regions.analyze(src)
        if len(detected['faces']) <= args.face_index:raise ValueError('Selected face was not detected')
        (out/'faces.json').write_text(json.dumps(detected,indent=2),encoding='utf8')
        return {"faceCount":len(detected['faces'])}
    test_one('face-detect',faces,out,results)
    test_one('face-regions',lambda: _regions(src,args.face_index,out),out,results)
    test_one('makeup-12',lambda: _makeup(src,args.face_index,out),out,results)
    test_one('smart-selection',lambda:execute('smart-selection',src,
        {'points':[{'x':.5,'y':.5,'label':1}],'outputMode':'MASK_ONLY'}),out,results)
    test_one('remove-background',lambda:execute('remove-background',src,
        {'outputMode':'TRANSPARENT'}),out,results)
    mask=Image.new('L',src.size,0);p=ImageDraw.Draw(mask)
    p.ellipse((src.width*.4,src.height*.4,src.width*.6,src.height*.6),fill=255)
    test_one('remove-object',lambda:execute('remove-object',src,{'method':'LAMA'},mask),out,results)
    test_one('upscale-x2',lambda:execute('upscale',src,{'scale':2,'tileSize':128}),out,results)
    test_one('upscale-x4',lambda:execute('upscale',src,{'scale':4,'tileSize':128}),out,results)
    test_one('face-restore',lambda:execute('face-restore',src,{'fidelity':.7}),out,results)
    for name,args2 in [('denoise',{'strength':'LOW'}),('auto-enhance',{'mode':'AUTO'}),
                       ('white-balance',{'strength':.5}),('hdr-style',{'strength':.5}),
                       ('sharpen',{'amount':120})]:
        test_one(name,lambda n=name,a=args2:execute(n,src,a),out,results)
    if args.second_face_index is not None:
        test_one('face-second',lambda:_regions(src,args.second_face_index,out),out,results)
    verified={}
    for name,oper in MAPPING.items():
        item=results.get(oper)
        fprints=fingerprints(NAME_BY_PATH[name])
        verified[name]={"status":"PASS" if item and item['status']=='PASS' and fprints else "FAIL",
                        "fingerprints":fprints}
    document={"format":"N4_SMOKE_REAL_V3","testedAt":datetime.now(timezone.utc).isoformat(),
              "inputSha256":hashlib.sha256(path.read_bytes()).hexdigest(),
              "smokeDimensions":list(src.size),"results":results,"modelVerification":verified,
              "testsPassed":sum(x['status']=='PASS' for x in results.values()),
              "testsFailed":sum(x['status']=='FAIL' for x in results.values())}
    (out/'N4_REAL_INFERENCE_REPORT.json').write_text(json.dumps(document,indent=2),encoding='utf8')
    # No network, tokens, or sensitive paths in readiness report.
    (Path(__file__).resolve().parents[1]/'.n4_models_verified.json').write_text(json.dumps(verified,indent=2),encoding='utf8')
    print(f"[N4] Real inference: {document['testsPassed']} PASS / {document['testsFailed']} FAIL",flush=True)
    return 1 if document['testsFailed'] else 0


def _regions(src,face_index,out):
    regions=['LIPS','UPPER_LIP','LOWER_LIP','EYELIDS','EYEBROWS','SKIN','HAIR','TEETH',
             'LEFT_EYE','RIGHT_EYE','FACE']
    manifest,files=face_regions.generate(src,face_index,regions)
    for key,data in files.items():
        target=out/f'face_{face_index}'/key
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {"count":len(files),"faceIndex":face_index,"size":list(src.size)}


def _makeup(src,face_index,out):
    count=0
    for effect in makeup.EFFECT_REGION:
        # No synthetic fallback; failed inference aborts this operation.
        settings={'faceIndex':face_index,'outputMode':'FINAL',
                  'effects':[{'effect':effect,'intensity':.55,'feather':.1}]}
        rendered=makeup.run(src,settings)
        rendered.save(out/('makeup_'+effect+'.png'))
        count+=1
    return {"effectsRendered":count}

if __name__=='__main__':sys.exit(main())
