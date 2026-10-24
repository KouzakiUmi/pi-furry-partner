#!/usr/bin/env python3
"""Normalize the happy wink and blink lid proportions, preserving all else."""
from __future__ import annotations
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.dont_write_bytecode = True
from build_wumi_reactions import blink, HAPPY_LID_BOXES, decode, font, contact_sheet
from build_waiting import quantize_fixed

ROOT=Path(__file__).resolve().parents[1]


def proof(before,after,path):
    result=Image.new("RGB",(1440,720),"#080f1c");draw=ImageDraw.Draw(result)
    draw.text((24,16),"完成挥爪 · 左右闭眼线按同一眼部比例校正",font=font(25,True),fill="#e5edf5")
    draw.text((24,59),"原右侧长平线 → 宽度与左眼相近、弧度一致；Wink 与闭眼沿用同一条右眼线",font=font(16),fill="#91a6c1")
    for index,(data,key,label) in enumerate([(before,"happy","修改前 · Wink"),(before,"happy-blink","修改前 · 闭眼"),(after,"happy","修改后 · Wink"),(after,"happy-blink","修改后 · 闭眼")]):
        x=10+index*358
        draw.rounded_rectangle((x,104,x+346,704),radius=10,fill="#101827",outline="#2b3b53")
        draw.text((x+16,117),label,font=font(18,True),fill="#c6daf2")
        image=decode(data,key);s=data["width"]/640
        crop=image.crop(tuple(round(v*s) for v in (175,196,438,377))).resize((328,226),Image.Resampling.NEAREST)
        result.paste(crop,(x+9,155),crop)
        art=image.resize((300,300),Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS)
        result.paste(art,(x+23,391),art)
    result.save(path)


def main():
    metadata=json.loads((ROOT/"assets/poses/metadata.json").read_text(encoding="utf-8"))
    base=Image.open(ROOT/"assets/poses/happy.png").convert("RGBA")
    variants={key:blink(base,metadata["poses"]["happy"]["eyes"],right_only=key=="happy",lid_boxes=HAPPY_LID_BOXES) for key in ["happy","happy-blink"]}
    reports=[]
    for style in ["wumi","wumi-pixel"]:
        path=ROOT/"assets/reactions"/style/"reaction-sheet.json";data=json.loads(path.read_text(encoding="utf-8"))
        before=json.loads(json.dumps(data));stats=[]
        for key,edited in variants.items():
            native=np.any(np.asarray(base)!=np.asarray(edited),axis=2).astype(np.uint8)*255
            # Include the old wide procedural line's endpoints, even where
            # that earlier line was drawn over originally white face pixels.
            native[260:326,326:424]=255
            mask=np.asarray(Image.fromarray(native).filter(ImageFilter.MaxFilter(9)).resize((data["width"],data["height"]),Image.Resampling.BOX)).reshape(-1)>0
            mask[round(327*data["height"]/640)*data["width"]:]=False
            old=np.array(data["frames"][data["ids"][key]]["pixels"],dtype=np.uint8)
            replacement=np.array(quantize_fixed(edited,data),dtype=np.uint8)
            final=old.copy();final[mask]=replacement[mask]
            assert np.array_equal(old==0,final==0)
            # All changes stay above the muzzle; mouth, scarf and paw are exact.
            changed=(old!=final).reshape((data["height"],data["width"]))
            assert not changed[round(327*data["height"]/640):].any()
            data["frames"][data["ids"][key]]["pixels"]=final.tolist()
            stats.append({"id":key,"changedPixels":int(changed.sum())})
        assert data["palette"]==before["palette"] and data["motion"]==before["motion"]
        assert all(frame==before["frames"][index] for index,frame in enumerate(data["frames"]) if frame["id"] not in variants)
        a=np.array(data["frames"][data["ids"]["happy"]]["pixels"]).reshape((data["height"],data["width"]))
        b=np.array(data["frames"][data["ids"]["happy-blink"]]["pixels"]).reshape(a.shape)
        assert np.array_equal(a[:,round(326*data["width"]/640):],b[:,round(326*data["width"]/640):])
        path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        for key in variants:decode(data,key).save(path.parent/f"{key}.png")
        contact_sheet(data);proof(before,data,path.parent/"happy-lids-before-after.png")
        reports.append({"style":style,"changes":stats,"other19FramesUnchanged":True,"mouthAndMotionAndPaletteUnchanged":True,"alphaUnchanged":True,"rightEyelidIdenticalAcrossWinkAndBlink":True})
    report={"passed":True,"leftLidSourceWidth":52,"rightLidSourceWidth":54,"rightAxisOffsetSourcePx":2,"curvature":"matching lower eyelid arcs","styles":reports}
    (ROOT/"tests/happy-lid-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=="__main__":main()
