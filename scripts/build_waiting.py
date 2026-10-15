#!/usr/bin/env python3
"""Append a gentle waiting head tilt without changing the existing final art.

The canonical neutral head rotates about the neck. A smooth inverse warp falls
to zero at source row 390; the scarf, body and gray paws below remain exact.
Existing palette colors and frame pixels are preserved when appending the pose.
Run: python scripts/build_waiting.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
POSES = ROOT / "assets/poses"


def head_tilt(base):
    source = np.asarray(base, dtype=float)
    height, width = source.shape[:2]
    yy, xx = np.indices((height, width), dtype=float)
    weight = np.clip((390-yy)/65, 0, 1)
    weight = weight*weight*(3-2*weight)
    angle = np.radians(5.5)*weight
    cosine, sine = np.cos(angle), np.sin(angle)
    ox, oy = xx-288, yy-374
    sx, sy = ox*cosine-oy*sine+288, ox*sine+oy*cosine+374
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = sx-x0, sy-y0
    alpha = source[:, :, 3:4]/255
    premultiplied = np.concatenate((source[:, :, :3]*alpha, source[:, :, 3:4]), axis=2)
    result = np.zeros_like(source)
    for dx, dy, amount in [(0,0,(1-fx)*(1-fy)),(1,0,fx*(1-fy)),(0,1,(1-fx)*fy),(1,1,fx*fy)]:
        x, y = x0+dx, y0+dy
        valid = (x>=0)&(x<width)&(y>=0)&(y<height)
        result[valid] += premultiplied[y[valid], x[valid]]*amount[valid, None]
    visible = result[:, :, 3] > 0
    result[visible, :3] *= 255/result[visible, 3, None]
    result = np.clip(np.round(result), 0, 255).astype(np.uint8)
    result[390:] = np.asarray(base)[390:]
    result[result[:, :, 3] == 0] = 0
    return Image.fromarray(result)


def question_mark(image):
    """A small floating anime question mark beside, rather than on, the head."""
    from build_wumi_reactions import bezier, line
    result = image.copy()
    draw = ImageDraw.Draw(result)
    points = bezier([(548,156),(551,128),(591,130),(592,157)])
    points += bezier([(592,157),(593,177),(567,177),(567,194)])[1:]
    line(draw, points, (53,74,103,255), 13)
    line(draw, points, (149,197,243,255), 7)
    draw.ellipse((560,207,574,221), fill=(53,74,103,255))
    draw.ellipse((563,210,571,218), fill=(149,197,243,255))
    return result


def quantize_fixed(image, data):
    # Exclude transparent index 0 from RGB matching and reserve it for alpha.
    colors = data["palette"][1:]
    palette = Image.new("P", (1,1))
    palette.putpalette([channel for color in colors for channel in color] + colors[-1]*(256-len(colors)))
    image = image.resize((data["width"], data["height"]), Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS)
    pixels = np.asarray(image.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)).astype(np.uint16)
    pixels[pixels >= len(colors)] = len(colors)-1
    pixels += 1
    pixels[np.asarray(image)[:, :, 3] < 128] = 0
    return pixels.reshape(-1).tolist()


def decode(data, key):
    frame = data["frames"][data["ids"][key]]
    image = Image.new("RGBA", (data["width"], data["height"]))
    image.putdata([(*data["palette"][index],255) if index else (0,0,0,0) for index in frame["pixels"]])
    return image


def digest(value):
    return hashlib.sha256(json.dumps(value, separators=(",",":"), sort_keys=True).encode()).hexdigest()


def comparison(data):
    image = Image.new("RGB", (1080,560), "#080f1c")
    draw = ImageDraw.Draw(image)
    try:
        title_font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc",24)
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc",16)
    except OSError:
        title_font = font = ImageFont.load_default()
    draw.text((22,16), "呜咪 · 歪头等你回答", fill="#e5edf5", font=title_font)
    draw.text((22,54), "同一角色与灰爪姿态，头部轻歪 5.5°；等待时也会眨眨眼。", fill="#8fa2ba", font=font)
    for index,(key,label) in enumerate([("idle-open","原就绪姿态"),("wait","歪头等待"),("wait-blink","歪头眨眼")]):
        x = 12+index*356
        draw.rounded_rectangle((x,98,x+344,544), radius=12, fill="#101827", outline="#2b3a51")
        draw.text((x+18,112),label, fill="#dce8f8", font=font)
        art = decode(data,key).resize((330,330),Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS)
        image.paste(art,(x+7,165),art)
        draw.text((x+18,512),key, fill="#8194af", font=font)
    image.save(ROOT/"assets/reactions"/data["style"]/"waiting-comparison.png")


def append_waiting():
    from build_wumi_reactions import blink
    metadata = json.loads((POSES/"metadata.json").read_text(encoding="utf-8"))
    base = Image.open(POSES/"neutral.png").convert("RGBA")
    waiting = question_mark(head_tilt(base))
    waiting_blink = question_mark(head_tilt(blink(base, metadata["poses"]["neutral"]["eyes"])))
    assert np.array_equal(np.asarray(waiting)[:,:,3],np.asarray(waiting_blink)[:,:,3])
    assert np.array_equal(np.asarray(waiting)[390:],np.asarray(base)[390:])
    assert waiting.getbbox()[0]>0 and waiting.getbbox()[1]>0 and waiting.getbbox()[2]<640 and waiting.getbbox()[3]<640
    waiting.save(POSES/"wait.png")
    waiting_blink.save(POSES/"wait-blink.png")
    rig = {"schemaVersion":1,"source":"neutral.png","width":640,"height":640,"angleDeg":5.5,
           "pivot":[288,374],"falloffRows":[325,390],"unchangedBodyFromRow":390,
           "method":"Premultiplied bilinear inverse neck warp with smoothstep falloff",
           "questionMark":{"placement":"outside head, upper right","bounds":[541,130,599,222],"color":"scarf blue"},
           "poses":{"wait":"wait.png","wait-blink":"wait-blink.png"}}
    (POSES/"wait-metadata.json").write_text(json.dumps(rig,ensure_ascii=False,indent=2),encoding="utf-8")
    reports=[]
    for style in ["wumi","wumi-pixel"]:
        path=ROOT/"assets/reactions"/style/"reaction-sheet.json"
        data=json.loads(path.read_text(encoding="utf-8"))
        existing={frame["id"]:digest(frame) for frame in data["frames"] if not frame["id"].startswith("wait")}
        palette_hash=digest(data["palette"])
        for key,source in [("wait",waiting),("wait-blink",waiting_blink)]:
            frame={"id":key,"pixels":quantize_fixed(source,data)}
            if key in data["ids"]:
                data["frames"][data["ids"][key]]=frame
            else:
                data["ids"][key]=len(data["frames"])
                data["frames"].append(frame)
            data.setdefault("sourcePoses",{})[key]="neutral head-tilt rig"
        assert digest(data["palette"])==palette_hash
        assert all(digest(frame)==existing[frame["id"]] for frame in data["frames"] if frame["id"] in existing)
        assert all(len(frame["pixels"])==data["width"]*data["height"] for frame in data["frames"])
        open_image,blink_image=decode(data,"wait"),decode(data,"wait-blink")
        assert np.array_equal(np.asarray(open_image)[:,:,3],np.asarray(blink_image)[:,:,3])
        assert not np.array_equal(np.asarray(open_image),np.asarray(blink_image))
        path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        open_image.save(path.parent/"wait.png")
        blink_image.save(path.parent/"wait-blink.png")
        comparison(data)
        reports.append({"style":style,"width":data["width"],"height":data["height"],"frameCount":len(data["frames"]),
                        "ids":{key:data["ids"][key] for key in ["wait","wait-blink"]},"existingFramePixelsAndPalettePreserved":True,
                        "waitingAlphaAligned":True,"mouthsAndTailUnchanged":True})
    report={"passed":True,"rig":rig,"nativeBodyUnchangedBelow390":True,"styles":reports}
    (ROOT/"tests/waiting-asset-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    validation_path=ROOT/"tests/wumi-asset-validation.json"
    if validation_path.exists():
        validation=json.loads(validation_path.read_text(encoding="utf-8"))
        data=json.loads((ROOT/"assets/reactions/wumi/reaction-sheet.json").read_text(encoding="utf-8"))
        validation["frameCount"]=len(data["frames"])
        validation["ids"]=data["ids"]
        validation["waitingRig"]={"passed":True,"ids":["wait","wait-blink"],"angleDeg":5.5,"existingFramesPreserved":True}
        validation["pixelDerivative"]["frameCount"]=reports[1]["frameCount"]
        validation_path.write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding="utf-8")
    from refine_pixel_lines import refine
    refine()  # Protect subpixel mouth strokes after the 21-frame bank is complete.
    return report


if __name__=="__main__":
    print(json.dumps(append_waiting(),ensure_ascii=False,indent=2))
