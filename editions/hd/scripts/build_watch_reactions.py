#!/usr/bin/env python3
"""Align the authored magnifier pose and append palette-compatible watch assets.

The 21-frame reaction sheets and their palettes are never rewritten. The
original transparent generated master is retained alongside the 640px rig.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from build_wumi_reactions import blink, EYE_CLEAN_POLYGONS

ROOT = Path(__file__).resolve().parents[1]
POSES = ROOT / "assets/poses"


def normalize(region):
    return {"polygon": [[x/640, y/640] for x, y in region["polygon"]],
            "pivot": [v/640 for v in region["pivot"]], "normalized": True,
            "paddingNormalized": region.get("padding", 12)/640}


def motion():
    return {
        "head": normalize({"polygon": [[100,14],[277,10],[367,55],[504,20],[541,160],[540,343],[471,395],[348,427],[222,401],[152,362],[135,213]], "pivot": [315,406], "padding": 24}),
        "lens": normalize({"polygon": [[106,225],[164,221],[196,246],[205,288],[198,329],[175,351],[189,384],[201,437],[185,469],[163,490],[111,478],[88,442],[89,402],[107,363],[88,340],[75,299],[78,260]], "pivot": [170,492], "padding": 22}),
        "ears": [normalize({"polygon": [[106,95],[177,17],[266,90],[235,141],[144,163]], "pivot": [231,148], "padding": 12}),
                 normalize({"polygon": [[373,86],[500,37],[510,148],[470,211],[403,167]], "pivot": [409,171], "padding": 12})],
        "periodMs": 4200,
        "design": "Left/right inspection: neck-led head turn and connected paw/lens sweep; soft breathing and ear twitch"
    }


def palette_index(image, palette, size, pixel=False):
    image = image.resize((size,size), Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
    colors = np.asarray(palette[1:], dtype=np.int32)
    rgb = np.asarray(image)[:,:,:3].astype(np.int32).reshape(-1,3)
    result = np.zeros(len(rgb), dtype=np.uint16)
    for start in range(0,len(rgb),4096):
        part = rgb[start:start+4096]
        result[start:start+len(part)] = np.argmin(((part[:,None,:]-colors[None,:,:])**2).sum(axis=2),axis=1)+1
    result[np.asarray(image)[:,:,3].reshape(-1)<128] = 0
    return result.tolist()


def main(source, hd_output, legacy_rebuild=False):
    current = ROOT / 'assets/reactions/wumi/watch-frames.json'
    if current.exists() and json.loads(current.read_text(encoding='utf-8')).get('sequence') and not legacy_rebuild:
        if source or hd_output:
            raise ValueError('Authored watch sequence is protected. Use build_watch_sequence.py to stage/rebuild it; --legacy-rebuild explicitly restores the old two-pose pack.')
        print(json.dumps({'preserved':True,'reason':'Authored whole-frame watch sequence is canonical','asset':'assets/reactions/wumi/watch-frames.json'}))
        return
    original = POSES / "watch-generated.png"
    if source:
        original.write_bytes(source.read_bytes())
    image = Image.open(original).convert("RGBA")
    rgba = np.array(image)
    # Isolate the tiny dark nose, rather than aligning the larger hood silhouette.
    nose_window = rgba[625:659,550:610]
    ys,xs = np.where((nose_window[:,:,:3].max(axis=2)<80)&(nose_window[:,:,3]>240))
    nose = [float(xs.mean()+550),float(ys.mean()+625)]
    scale = .5
    offset = [288-nose[0]*scale,318-nose[1]*scale]
    rgba[rgba[:,:,3]<16] = 0
    rgba[rgba[:,:,3]>=250,3] = 255
    image = Image.fromarray(rgba)
    canonical = image.transform((640,640),Image.Transform.AFFINE,
        (1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
    canonical.save(POSES / "watch.png")
    eyes = {"left": (214,239,264,307),"right":(333,253,390,321)}
    EYE_CLEAN_POLYGONS[eyes["left"]] = [(192,243),(204,230),(225,222),(249,223),(269,239),(277,261),(272,299),(260,313),(222,314),(206,299),(198,278)]
    EYE_CLEAN_POLYGONS[eyes["right"]] = [(317,259),(330,241),(351,230),(374,231),(397,245),(420,267),(424,282),(416,293),(397,323),(340,327),(325,305)]
    closed = blink(canonical,eyes)
    closed.save(POSES / "watch-blink.png")
    report = {"source": "watch-generated.png", "sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
              "sourceSize": list(image.size), "sourceNose":nose,"scale":scale,"pasteOffset":offset,
              "noseAnchor":[288,318],"width":640,"height":640,"eyes":eyes,
              "motion":motion(),"alphaBounds":canonical.getbbox(),"mainSheetsUnchanged":True,"styles":[]}
    for style,size in (("wumi",240),("wumi-pixel",80)):
        directory = ROOT / "assets/reactions" / style
        sheet = json.loads((directory / "reaction-sheet.json").read_text(encoding="utf-8"))
        frames = [{"id":name,"pixels":palette_index(im,sheet["palette"],size,style.endswith("pixel"))}
                  for name,im in (("watch",canonical),("watch-blink",closed))]
        asset = {"schemaVersion":1,"width":size,"height":size,"frames":frames,"motion":motion(),
                 "paletteSha256":hashlib.sha256(json.dumps(sheet["palette"],separators=(",",":")).encode()).hexdigest()}
        (directory / "watch-frames.json").write_text(json.dumps(asset,separators=(",",":"))+"\n",encoding="utf-8")
        for frame in frames:
            arr=np.asarray(frame["pixels"]).reshape(size,size)
            display=np.zeros((size,size,4),dtype=np.uint8)
            display[:,:,:3]=np.asarray(sheet["palette"],dtype=np.uint8)[arr]
            display[:,:,3]=np.where(arr==0,0,255)
            Image.fromarray(display).save(directory / f"{frame['id']}.png")
        report["styles"].append({"style":style,"width":size,"paletteSize":len(sheet["palette"]),"frameCount":len(frames)})
    if hd_output:
        # Standalone high-resolution bank for the film compositor, independent
        # of the terminal's palette and fixed 21-frame source sheets.
        mosaic=Image.new("RGB",(640,1280));mosaic.paste(canonical.convert("RGB"),(0,0));mosaic.paste(closed.convert("RGB"),(0,640))
        quant=mosaic.quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
        flat=quant.getpalette()[:765]
        palette=[[0,0,0]]+[flat[i:i+3] for i in range(0,len(flat),3)]
        data={"width":640,"height":640,"transparentIndex":0,"palette":palette,"ids":{"watch":0,"watch-blink":1},
              "frames":[{"id":name,"pixels":palette_index(im,palette,640)} for name,im in (("watch",canonical),("watch-blink",closed))],
              "motion":{"ears":False,"paws":False,"watch":motion()}}
        hd_output.parent.mkdir(parents=True,exist_ok=True)
        hd_output.write_text(json.dumps(data,separators=(",",":")),encoding="utf-8")
    from refine_pixel_lines import refine
    refine()
    (POSES / "watch-metadata.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path)
    parser.add_argument("--hd-output",type=Path)
    parser.add_argument("--legacy-rebuild",action='store_true',help='Explicitly replace the authored sequence with the legacy two-pose pack')
    args=parser.parse_args()
    main(args.source,args.hd_output,args.legacy_rebuild)
