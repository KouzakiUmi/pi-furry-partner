#!/usr/bin/env python3
"""Patch full-eye blink rigs using the shipped, fixed reaction palettes.

Existing non-blink frames, mouths, tail, alpha and palette remain exact. The
main build_wumi_reactions.py also uses this corrected blink() rig on rebuild.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.dont_write_bytecode = True
from build_wumi_reactions import blink, decode, contact_sheet, font, HAPPY_LID_BOXES
from build_waiting import quantize_fixed, append_waiting

ROOT = Path(__file__).resolve().parents[1]
KEYS = {"idle-blink":"neutral", "idle-wink":"neutral", "think-blink":"think",
        "work-blink":"work", "talk-blink":"speak", "concern-blink":"neutral",
        "happy":"happy", "happy-blink":"happy", "rest":"rest"}


def proof(before, after, target):
    keys=["idle-blink","think-blink","work-blink","talk-blink","happy-blink","rest","wait-blink"]
    result=Image.new("RGB",(1680,1000),"#080f1c")
    draw=ImageDraw.Draw(result)
    draw.text((24,16),"闭眼修正 · 保留灰眉，只留真实眼位的一条闭眼线",font=font(26,True),fill="#e5edf5")
    draw.text((24,59),"上：旧版残留上睫线 / 下：清完整只眼睛后，闭眼线落在原眼睛中下部",font=font(16),fill="#95aac4")
    for column,key in enumerate(keys):
        x=column*240
        draw.text((x+12,100),key,font=font(14,True),fill="#bdd3ef")
        for row,data in enumerate([before,after]):
            image=decode(data,key)
            # Compare the same facial region at the native palette resolution.
            s=data["width"]/640
            box=tuple(round(v*s) for v in (158,178,438,370))
            crop=image.crop(box).resize((228,157),Image.Resampling.NEAREST)
            result.paste(crop,(x+6,134+row*430),crop)
            art=image.resize((230,230),Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS)
            result.paste(art,(x+5,290+row*430),art)
    result.save(target)


def main():
    metadata=json.loads((ROOT/"assets/poses/metadata.json").read_text(encoding="utf-8"))
    source={key:Image.open(ROOT/"assets/poses"/f"{key}.png").convert("RGBA") for key in set(KEYS.values())}
    before={}
    reports=[]
    for style in ["wumi","wumi-pixel"]:
        path=ROOT/"assets/reactions"/style/"reaction-sheet.json"
        data=json.loads(path.read_text(encoding="utf-8"))
        before[style]=json.loads(json.dumps(data))
        preserved={frame["id"]:frame["pixels"][:] for frame in data["frames"] if frame["id"] not in KEYS and not frame["id"].startswith("wait")}
        patched=[]
        for key,pose in KEYS.items():
            base=source[pose]
            edited=blink(base,metadata["poses"][pose]["eyes"],right_only=key in ["idle-wink","happy"],lid_boxes=HAPPY_LID_BOXES if pose=="happy" else None)
            assert np.array_equal(np.asarray(base)[:215],np.asarray(edited)[:215]), "Real gray eyebrows changed"
            assert np.array_equal(np.asarray(base)[327:],np.asarray(edited)[327:]), "Mouth/body changed"
            native_mask=np.any(np.asarray(base)!=np.asarray(edited),axis=2).astype(np.uint8)*255
            if pose=="happy": native_mask[260:326,326:424]=255
            mask=Image.fromarray(native_mask).filter(ImageFilter.MaxFilter(9)).resize((data["width"],data["height"]),Image.Resampling.BOX)
            allowed=np.asarray(mask).reshape(-1)>0
            if pose=="happy": allowed[round(327*data["height"]/640)*data["width"]:]=False
            frame=data["frames"][data["ids"][key]]
            old=np.array(frame["pixels"],dtype=np.uint8)
            replacement=np.array(quantize_fixed(edited,data),dtype=np.uint8)
            final=old.copy();final[allowed]=replacement[allowed]
            # A blink only alters opaque eye pixels, never silhouette alpha.
            assert np.array_equal(final==0,old==0)
            frame["pixels"]=final.tolist()
            xs,ys=np.where((final!=old).reshape((data["height"],data["width"])).T)
            patched.append({"id":key,"changedPixels":int((final!=old).sum()),"bbox":[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1] if len(xs) else None})
        assert all(frame["pixels"]==preserved[frame["id"]] for frame in data["frames"] if frame["id"] in preserved)
        path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        for key in KEYS:
            decode(data,key).save(path.parent/f"{key}.png")
        contact_sheet(data)
        reports.append({"style":style,"patched":patched,"paletteUnchanged":data["palette"]==before[style]["palette"],
                        "otherFramesUnchanged":True,"mouthAndTailUnchanged":True,"alphaUnchanged":True,"realGrayBrowsPreserved":True})
    append_waiting()
    for style in ["wumi","wumi-pixel"]:
        path=ROOT/"assets/reactions"/style/"reaction-sheet.json"
        data=json.loads(path.read_text(encoding="utf-8"))
        proof(before[style],data,path.parent/"blink-before-after.png")
    report={"passed":True,"method":"Complete upper-lash cleanup; one relaxed lower-eyelid curve; fixed palette local patch", "styles":reports}
    (ROOT/"tests/blink-asset-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
