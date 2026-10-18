"""Real inference smoke: source image -> full-res mask files (no fake output)."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from PIL import Image, ImageOps
from processors.face_regions import analyze, generate


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--image',required=True)
    parser.add_argument('--face-index',type=int,default=0)
    parser.add_argument('--regions',default='LIPS,SKIN,HAIR,EYEBROWS,EYELIDS,NOSE,TEETH')
    parser.add_argument('--out',default='n4-face-smoke-output')
    args=parser.parse_args()
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    with Image.open(args.image) as src:
        img=ImageOps.exif_transpose(src).convert('RGB')
    detected=analyze(img,with_landmarks=False)
    print('Faces detected:',len(detected['faces']))
    print(json.dumps(detected,ensure_ascii=False,indent=2))
    (out/'detected_faces.json').write_text(json.dumps(detected,indent=2),encoding='utf8')
    requested=[x.strip() for x in args.regions.split(',') if x.strip()]
    manifest, masks=generate(img,args.face_index,requested)
    for filename,png in masks.items():
        dest=out/filename
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(png)
        print('Mask:',dest)
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    print('SUCCESS - real MediaPipe + ONNX outputs saved under',out)

if __name__=='__main__': main()
