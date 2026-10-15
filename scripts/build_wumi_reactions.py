#!/usr/bin/env python3
"""Rig the six existing Umi poses with local eye/mouth patches.

Uses assets/poses/metadata.json for face coordinates. No network or image model.
The four speech mouth shapes all stay on the same speak pose. Blink variants
retain their own neutral, chin-on-paw, or typing pose and its exact alpha.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.dont_write_bytecode = True
from build_reactions import draw_beast_mouth, draw_round_mouth


ROOT = Path(__file__).resolve().parents[1]
POSES = ROOT / "assets/poses"
OUT = ROOT / "assets/reactions/wumi"
IDS = ["idle-open", "idle-blink", "talk-closed", "talk-small", "talk-medium", "talk-wide",
       "think", "work", "happy", "concern", "rest", "idle-wink", "think-blink", "work-blink", "talk-blink", "concern-blink", "happy-blink", "error", "search"]
SOURCE = {"idle-open": "neutral", "idle-blink": "neutral", "idle-wink": "neutral", "concern": "neutral",
          "talk-closed": "speak", "talk-small": "speak", "talk-medium": "speak", "talk-wide": "speak",
          "think": "think", "think-blink": "think", "work": "work", "work-blink": "work", "talk-blink": "speak", "happy": "happy", "rest": "rest", "concern-blink": "neutral", "happy-blink": "happy", "error": "neutral", "search": "search"}
LABELS = {"idle-open": "就绪", "idle-blink": "眨眼", "idle-wink": "醒来 Wink", "talk-closed": "说话：闭嘴",
          "talk-small": "说话：小口", "talk-medium": "说话：中口", "talk-wide": "说话：大口",
          "think": "托腮思考", "think-blink": "托腮眨眼", "work": "双爪工作", "work-blink": "工作眨眼",
          "happy": "开心挥爪", "concern": "担忧", "rest": "闭眼休息", "talk-blink": "说话眨眼", "concern-blink": "担忧眨眼", "happy-blink": "挥爪眨眼", "error": "吃瘪 × ×", "search": "埋头找资料"}


def font(size, bold=False):
    for name in ["msyhbd.ttc" if bold else "msyh.ttc", "segoeui.ttf"]:
        try:
            return ImageFont.truetype("C:/Windows/Fonts/" + name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def bezier(points):
    return [tuple((1-t)**3*points[0][axis] + 3*(1-t)**2*t*points[1][axis] +
                  3*(1-t)*t*t*points[2][axis] + t**3*points[3][axis] for axis in (0, 1))
            for t in np.linspace(0, 1, 35)]


def line(draw, points, color, width):
    draw.line(points, fill=color, width=width, joint="curve")
    r = width/2
    for x, y in [points[0], points[-1]]:
        draw.ellipse((x-r, y-r, x+r, y+r), fill=color)


def keep_alpha(base, edited):
    edited.putalpha(base.getchannel("A"))
    return edited


# The metadata iris boxes intentionally do not include the broad upper lashes.
# A blink must remove those lashes too, otherwise the retained upper stroke
# reads as a second eyebrow above the newly drawn eyelid. These face-only
# polygons stop below the real gray eyebrows and follow the eye corners.
EYE_CLEAN_POLYGONS = {
    (207,239,260,312): [(178,253),(190,235),(213,224),(236,219),(252,226),(267,248),(265,308),(253,316),(215,316),(201,297),(186,279)],
    (325,239,384,313): [(311,246),(325,232),(345,222),(371,220),(390,231),(410,247),(406,274),(394,290),(383,317),(335,317),(323,301),(317,274)],
    (223,231,273,302): [(199,252),(209,231),(231,217),(250,215),(269,227),(283,249),(279,290),(268,308),(229,309),(216,294),(207,275)],
    (340,248,396,319): [(324,253),(341,238),(363,230),(386,233),(408,252),(427,275),(414,296),(397,322),(343,323),(330,303)],
    (206,242,262,313): [(176,256),(190,237),(213,224),(237,222),(255,231),(270,251),(266,309),(253,317),(214,317),(200,299),(184,281)],
    (322,242,381,314): [(308,249),(322,235),(342,223),(368,222),(389,234),(406,251),(401,278),(389,295),(381,318),(332,318),(319,303),(313,278)],
    (215,243,272,317): [(184,253),(197,234),(222,222),(244,222),(263,235),(282,255),(278,312),(264,321),(221,321),(206,295),(191,279)],
    (333,244,392,319): [(315,250),(329,238),(348,228),(373,230),(397,240),(416,262),(412,285),(398,304),(392,323),(338,324),(325,305)],
    (214,247,270,321): [(188,262),(203,242),(223,231),(245,233),(263,248),(280,275),(272,321),(259,325),(218,326),(201,305),(196,284)],
    (330,273,417,306): [(326,273),(350,264),(375,263),(400,271),(420,286),(418,308),(330,310)],
    (193,278,265,311): [(190,277),(269,277),(269,313),(190,313)],
    (320,278,400,312): [(317,277),(403,277),(403,314),(317,314)],
}
# The generated happy wink occupied an 87px-wide, 33px-high box. Its open
# counterpart is approximately the left eye's 56x74 dimensions, with a 2px
# vertical face-axis offset. Use that geometry for a matching closed eyelid.
HAPPY_LID_BOXES = {"right": (344,249,402,323)}


def blink(base, eyes, right_only=False, cross=False, lid_boxes=None):
    result = base.copy()
    array = np.array(result)
    for name, box in eyes.items():
        if right_only and name != "right":
            continue
        if not cross:
            polygon = EYE_CLEAN_POLYGONS.get(tuple(box))
            if polygon is None:
                raise ValueError(f"Missing full eyelash polygon for {box}")
            region = Image.new("L", base.size)
            ImageDraw.Draw(region).polygon(polygon, fill=255)
            rgb = array[:, :, :3].astype(np.int16)
            blue = (rgb[:,:,1]-rgb[:,:,0] > 10) & (rgb[:,:,2]-rgb[:,:,0] > 30)
            dark = rgb.max(axis=2) < 135
            iris_region = np.zeros(base.size[::-1], dtype=bool)
            x0,y0,x1,y1 = box
            iris_region[y0:y1,x0:x1] = True
            coral = (rgb[:,:,0]-rgb[:,:,1] > 16) & (rgb[:,:,0]-rgb[:,:,2] > 16) & iris_region
            feature = (blue | dark | coral) & (np.asarray(region) > 0)
            nearby = Image.fromarray(feature.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(17))
            feature |= (np.asarray(nearby)>0) & (rgb.min(axis=2)<235) & (np.asarray(region)>0)
            mask = Image.fromarray(feature.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.7))
            # Limit the softened patch to the face-only polygon; hair, brows,
            # muzzle, blush and alpha outside it remain bitwise unchanged.
            weight = np.minimum(np.asarray(mask), np.asarray(region))[:,:,None].astype(float)/255
            array[:,:,:3] = np.round(rgb*(1-weight)+np.array([251,251,252])*weight).astype(np.uint8)
            continue
        x0, y0, x1, y1 = box
        rgb = array[y0:y1, x0:x1, :3].astype(np.int16)
        blue = (rgb[:, :, 1]-rgb[:, :, 0] > 3) & (rgb[:, :, 2]-rgb[:, :, 0] > 9)
        dark = rgb.max(axis=2) < 185
        coral = (rgb[:, :, 0]-rgb[:, :, 1] > 16) & (rgb[:, :, 0]-rgb[:, :, 2] > 16)
        mask = Image.fromarray((blue | dark | coral).astype(np.uint8)*255)
        mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.6))
        weight = np.asarray(mask)[:, :, None].astype(float)/255
        array[y0:y1, x0:x1, :3] = np.round(rgb*(1-weight)+np.array([251, 251, 252])*weight).astype(np.uint8)
    result = Image.fromarray(array)
    draw = ImageDraw.Draw(result)
    for name, (x0, y0, x1, y1) in eyes.items():
        if right_only and name != "right":
            continue
        if lid_boxes and name in lid_boxes:
            x0,y0,x1,y1 = lid_boxes[name]
        width, height = x1-x0, y1-y0
        if cross:
            x, y = (x0+x1)/2, (y0+y1)/2
            radius = min(width*.29, height*.25)
            line(draw, [(x-radius, y-radius), (x+radius, y+radius)], (37, 44, 53, 255), 6)
            line(draw, [(x-radius, y+radius), (x+radius, y-radius)], (37, 44, 53, 255), 6)
        else:
            # A single relaxed lower eyelid, centered where the eye used to
            # be. Short source boxes already describe a closed/winking eye.
            end, control = (.35,.70) if height < 45 else (.66,.91)
            points = [(x0+2, y0+height*end), (x0+width*.28, y0+height*control),
                      (x0+width*.72, y0+height*control), (x1-2, y0+height*end)]
            line(draw, bezier(points), (37, 44, 53, 255), 6)
    return keep_alpha(base, result)


def clean_mouth(base, box):
    array = np.array(base)
    original = np.array(base)
    x0, y0, x1, y1 = box
    x0 -= 2; y0 -= 2; x1 += 2; y1 += 2
    rgb = original[y0:y1, x0:x1, :3].astype(np.int16)
    feature = (rgb.min(axis=2) < 224) | (rgb[:, :, 0]-rgb[:, :, 1] > 7) | (rgb[:, :, 0]-rgb[:, :, 2] > 7)
    mask = Image.fromarray(feature.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.5))
    weight = np.asarray(mask)[:, :, None].astype(float)/255
    top, bottom = y0-3, y1+3
    for row, y in enumerate(range(y0, y1)):
        amount = (y-top)/(bottom-top)
        background = original[top, x0:x1, :3]*(1-amount)+original[bottom, x0:x1, :3]*amount
        # All mouth patches lie on the white muzzle; do not pull a nose/scarf
        # shadow into the lip patch when estimating its local paper texture.
        background = np.maximum(background, [241, 240, 241])
        array[y, x0:x1, :3] = np.round(rgb[row]*(1-weight[row])+background*weight[row]).astype(np.uint8)
    return Image.fromarray(array)


def mouth(base, box, shape):
    result = clean_mouth(base, box)
    draw = ImageDraw.Draw(result)
    x0, y0, x1, y1 = box
    cx = (x0+x1)/2
    cy = (y0+y1)/2
    pink = (207, 115, 119, 255)
    dark = (129, 63, 76, 255)
    if shape == "closed":
        draw_beast_mouth(result, cx=cx, baseline=y0+7, half_width=24,
                         stroke=3, fang=False,
                         outer=(145, 91, 98, 255), inner=(119, 62, 78, 255))
    elif shape in ("small", "medium", "wide"):
        width, height = {"small": (28, 0), "medium": (30, 26), "wide": (44, 34)}[shape]
        draw_round_mouth(result, cx=cx, cy=cy, width=width, height=height,
                         stroke=3, fang=shape in ("medium", "wide"),
                         outer=(145, 91, 98, 255), inner=(119, 62, 78, 255))
    elif shape == "concern":
        line(draw, bezier([(cx-22, cy+7), (cx-10, cy-8), (cx+10, cy-8), (cx+22, cy+7)]), (145, 91, 98, 255), 3)
    else:
        raise ValueError(shape)
    return keep_alpha(base, result)


def indexed_sheet(frames):
    size = 240
    normalized = {key: image.resize((size, size), Image.Resampling.LANCZOS) for key, image in frames.items()}
    mosaic = Image.new("RGB", (size, size*len(IDS)))
    for i, key in enumerate(IDS):
        mosaic.paste(normalized[key].convert("RGB"), (0, i*size))
    palette_image = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    flat_palette = palette_image.getpalette()[:765]
    palette = [[0, 0, 0]] + [flat_palette[i:i+3] for i in range(0, len(flat_palette), 3)]
    result = []
    for key in IDS:
        image = normalized[key]
        pixels = np.asarray(image.convert("RGB").quantize(palette=palette_image, dither=Image.Dither.NONE)).astype(np.uint16)+1
        pixels[np.asarray(image)[:, :, 3] < 128] = 0
        result.append({"id": key, "pixels": pixels.reshape(-1).tolist()})
    search_metadata = json.loads((POSES / "search-metadata.json").read_text(encoding="utf-8"))
    tail = search_metadata["tail"]
    wave = {"polygon":[[446,349],[469,337],[480,315],[509,310],[528,334],[552,332],[571,345],[570,373],[587,389],[585,418],[562,450],[542,470],[526,500],[503,514],[478,504],[447,483],[433,454],[431,415],[433,381]],"pivot":[484,492],"angle":5}
    normalize = lambda shape: {"polygon":[[x/640,y/640] for x,y in shape["polygon"]],"pivot":[v/640 for v in shape["pivot"]],"normalized":True,**({"angle":shape["angle"]} if "angle" in shape else {})}
    motion = {"wave":normalize(wave),"tail":normalize({"polygon":tail["maskPolygon"],"pivot":tail["pivot"]})}
    if "tip" in tail:
        motion["tail"]["tip"]=[value/640 for value in tail["tip"]]
    if "spineNormalized" in tail:
        motion["tail"]["spine"]=tail["spineNormalized"]
    elif "spine" in tail:
        motion["tail"]["spine"]=[[x/640,y/640] for x,y in tail["spine"]]
    motion["tail"]["rootPinned"]=bool(tail.get("rootPinned",True))
    motion["tail"]["rootFlexible"]=bool(tail.get("rootFlexible",False))
    if "rootBlendNormalized" in tail:
        motion["tail"]["rootBlendNormalized"]=tail["rootBlendNormalized"]
    motion["papers"]=[{**page,"polygon":[[x/640,y/640] for x,y in page["polygon"]],"pivot":[value/640 for value in page["pivot"]],"normalized":True} for page in search_metadata.get("papers",[])]
    motion["searchHead"]=[{**part,"polygon":[[x/640,y/640] for x,y in part["polygon"]],"pivot":[value/640 for value in part["pivot"]],"normalized":True} for part in search_metadata.get("searchHead",[])]
    motion["searchOcclusion"]=[[[x/640,y/640] for x,y in polygon] for polygon in search_metadata.get("searchOcclusion",[])]
    return {"schemaVersion": 1, "style": "wumi", "transparentIndex": 0, "width": size, "height": size,
            "palette": palette, "frames": result, "ids": {key: i for i, key in enumerate(IDS)},
            "sourcePoses": SOURCE, "motion": motion}


def decode(data, key):
    frame = data["frames"][data["ids"][key]]
    image = Image.new("RGBA", (data["width"], data["height"]))
    image.putdata([(*data["palette"][i], 255) if i else (0, 0, 0, 0) for i in frame["pixels"]])
    return image


def contact_sheet(data):
    sheet = Image.new("RGB", (1234, 108+300*((len(IDS)+4)//5)), "#080f1c")
    draw = ImageDraw.Draw(sheet)
    draw.text((22, 15), "呜咪 · 灰爪托腮 / 工作 / 说话 / 醒来", font=font(25, True), fill="#e5edf5")
    draw.text((22, 55), "角色姿态来自同一设定；说话四口型保留同一摊爪姿态，眨眼保留托腮和工作爪。", font=font(15), fill="#8fa2ba")
    for index, key in enumerate(IDS):
        x, y = 12+(index%5)*242, 96+(index//5)*300
        draw.rounded_rectangle((x, y, x+232, y+288), radius=9, fill="#101827", outline="#2b3a51")
        draw.text((x+10, y+12), LABELS[key], font=font(15, True), fill="#dce8f8")
        art = decode(data, key).resize((210, 210), Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS)
        sheet.paste(art, (x+10, y+39), art)
        draw.text((x+10, y+258), key, font=font(12), fill="#8194af")
    sheet.save(ROOT / "assets/reactions" / data["style"] / "reactiondemo.png")


def pixel_sheet(data):
    """A clean 80px palette-limited derivative of the Umi character poses.

    Shared 48-color hard quantization, protected face accent colors, no dithering
    and nearest sampling provide deliberate flat color regions and sharp steps.
    """
    size = 80
    images = [decode(data, key).resize((size, size), Image.Resampling.NEAREST) for key in IDS]
    mosaic = Image.new("RGB", (size, size*len(images)))
    for index, image in enumerate(images):
        mosaic.paste(image.convert("RGB"), (0, index*size))
    automatic = mosaic.quantize(colors=31, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).getpalette()[:93]
    colors = [automatic[i:i+3] for i in range(0, len(automatic), 3)]
    colors += [[34,40,50],[53,69,91],[85,105,132],[116,151,193],[140,185,237],
               [224,232,247],[255,255,255],[122,124,130],[163,164,167],[233,149,153],
               [255,102,47],[28,138,200],[71,185,238],[12,61,103],[228,136,148],[135,68,82]]
    palette_image = Image.new("P", (1, 1))
    flat = [channel for color in colors for channel in color]
    flat += colors[-1]*(256-len(colors))
    palette_image.putpalette(flat)
    frames = []
    for key, image in zip(IDS, images):
        indexed = np.asarray(image.convert("RGB").quantize(palette=palette_image, dither=Image.Dither.NONE)).astype(np.uint16)
        indexed[indexed >= len(colors)] = len(colors)-1
        indexed += 1
        indexed[np.asarray(image)[:, :, 3] < 128] = 0
        frames.append({"id": key, "pixels": indexed.reshape(-1).tolist()})
    return {"schemaVersion":1,"style":"wumi-pixel","transparentIndex":0,"width":size,"height":size,
            "palette":[[0,0,0]]+colors,"frames":frames,"ids":data["ids"],"sourcePoses":SOURCE,"motion":data["motion"]}


def mouth_comparison(data):
    sheet = Image.new("RGB", (1240, 650), "#080f1c")
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 18), "说话口型 · w / — / o / O", font=font(26, True), fill="#e5edf5")
    draw.text((24, 60), "自然小 w · 短平口 · 简洁小 o · 圆润大 O，张口保留一颗小虎牙", font=font(15), fill="#8fa2ba")
    for index, key in enumerate(["talk-closed", "talk-small", "talk-medium", "talk-wide"]):
        x = 16 + index*306
        draw.rounded_rectangle((x, 100, x+294, 628), radius=12, fill="#101827", outline="#2b3a51")
        draw.text((x+18, 114), LABELS[key], font=font(20, True), fill="#dce8f8")
        image = decode(data, key)
        portrait = image.resize((250, 250), Image.Resampling.LANCZOS)
        sheet.paste(portrait, (x+22, 148), portrait)
        crop = image.crop((94, 116, 130, 143)).resize((252, 189), Image.Resampling.NEAREST)
        sheet.paste(crop, (x+21, 416), crop)
    sheet.save(OUT / "mouth-comparison.png")


def editor_demo(data, key, status, phrase, bubble):
    image = Image.new("RGB", (1120, 650), "#0a111c")
    draw = ImageDraw.Draw(image)
    draw.text((32, 22), "呜咪 · 输入框左侧状态角色", font=font(28, True), fill="#e5edf5")
    draw.text((34, 69), "效果预览 · 灰爪托腮、说话嘴型与动态状态短句", font=font(15), fill="#8fa2ba")
    draw.rounded_rectangle((26, 115, 1094, 608), radius=15, fill="#101827", outline="#2b3c53", width=2)
    draw.rounded_rectangle((28, 117, 1092, 157), radius=13, fill="#142033")
    for i, color in enumerate(["#d1848b", "#d3b87f", "#83b6a8"]):
        draw.ellipse((45+i*18, 132, 54+i*18, 141), fill=color)
    draw.text((116, 126), "pi · MiniMax-M3.1-Flash-Preview · minimax-cn", font=font(13), fill="#8397b1")
    draw.text((51, 181), "示例对话", font=font(12), fill="#657d9b")
    draw.text((51, 209), "› 帮我把这个项目的启动体验做得更清晰。", font=font(18), fill="#c1d7ef")
    draw.text((51, 244), "呜咪   我会先了解现有结构，再把合适的调整落到代码里。", font=font(16), fill="#9dacc1")
    draw.text((51, 277), "       你可以继续补充想法，我会留在输入框旁边。", font=font(16), fill="#9dacc1")
    draw.rounded_rectangle((94, 326, 221, 362), radius=8, fill="#14263e", outline="#6c91bb", width=1)
    draw.text((107, 332), bubble, font=font(16), fill="#b4cfea")
    art = decode(data, key).resize((220, 220), Image.Resampling.LANCZOS)
    image.paste(art, (49, 368), art)
    draw.ellipse((294, 393, 302, 401), fill="#89b4e6")
    draw.text((314, 384), status, font=font(17, True), fill="#bfd5ee")
    draw.text((444, 386), phrase, font=font(16), fill="#b1c0d2")
    draw.rectangle((292, 429, 1055, 545), fill="#101b2b", outline="#59708c", width=1)
    draw.rectangle((304, 419, 431, 439), fill="#101827")
    draw.text((311, 418), "输入你的想法", font=font(13), fill="#9cb7d9")
    draw.text((309, 457), "接下来，想一起做点什么？", font=font(17), fill="#7087a3")
    draw.line((308, 504, 1038, 504), fill="#30435d", width=1)
    draw.text((309, 515), "Enter 发送  ·  Shift+Enter 换行  ·  / 命令", font=font(12), fill="#829ab8")
    draw.line((288, 568, 1055, 568), fill="#25364d", width=1)
    draw.text((292, 579), "示例状态 · F:/Projects/your-project (main)", font=font(11), fill="#6f87a6")
    draw.text((32, 624), "角色固定在输入框旁边；思考气泡与状态文字由界面绘制，未烘进角色图。", font=font(13), fill="#8096b2")
    return image


def validate(frames, data, metadata):
    report = {"passed": True, "style": "wumi", "width": 240, "height": 240, "frameCount": len(IDS),
              "paletteSize": len(data["palette"]), "noseAnchor": metadata["noseAnchor"], "sources": SOURCE,
              "samePoseAlphaAligned": True, "speechChangesConfinedToMouth": True, "fourDistinctSpeechMouths": True,
              "thinkBlinkPreservesPawPose": True, "workBlinkPreservesPawPose": True}
    for frame in data["frames"]:
        assert len(frame["pixels"]) == 240*240
        assert all(0 <= i < len(data["palette"]) for i in frame["pixels"])
    for a, b in [("idle-open", "idle-blink"), ("idle-open", "idle-wink"), ("think", "think-blink"), ("work", "work-blink"), ("talk-closed", "talk-blink"), ("concern", "concern-blink"), ("happy", "happy-blink"), ("idle-open", "error")]:
        assert np.array_equal(np.asarray(frames[a])[:, :, 3], np.asarray(frames[b])[:, :, 3])
        assert np.array_equal(np.asarray(decode(data, a))[:, :, 3], np.asarray(decode(data, b))[:, :, 3])
        assert np.array_equal(np.asarray(frames[a])[385:], np.asarray(frames[b])[385:]), "Blink changed a paw/scarf."
    speech = [frames[key] for key in ["talk-closed", "talk-small", "talk-medium", "talk-wide"]]
    assert len({frame.tobytes() for frame in speech}) == 4
    base = np.asarray(speech[-1])
    x0, y0, x1, y1 = metadata["poses"]["speak"]["mouth"]
    allowed = np.zeros(base.shape[:2], dtype=bool)
    allowed[y0-4:max(y1+2, y0+49), x0-10:x1+10] = True
    report["speechChangedBoundingBoxes"] = {}
    for key in ["talk-closed", "talk-small", "talk-medium"]:
        array = np.asarray(frames[key])
        assert np.array_equal(array[:, :, 3], base[:, :, 3])
        changed = np.any(array != base, axis=2)
        assert not np.any(changed & ~allowed), "Speech patch changed eyes or pose."
        ys, xs = np.where(changed)
        report["speechChangedBoundingBoxes"][key] = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets-only", action="store_true", help="Preserve separately rendered editor preview PNG/GIF")
    args = parser.parse_args()
    metadata = json.loads((POSES / "metadata.json").read_text(encoding="utf-8"))
    poses = {name: Image.open(POSES / f"{name}.png").convert("RGBA") for name in ["neutral", "think", "work", "speak", "happy", "rest", "search"]}
    frames = {"idle-open": poses["neutral"].copy(), "idle-blink": blink(poses["neutral"], metadata["poses"]["neutral"]["eyes"]),
              "idle-wink": blink(poses["neutral"], metadata["poses"]["neutral"]["eyes"], right_only=True),
              "think": poses["think"].copy(), "think-blink": blink(poses["think"], metadata["poses"]["think"]["eyes"]),
              "work": poses["work"].copy(), "work-blink": blink(poses["work"], metadata["poses"]["work"]["eyes"]),
              "happy": blink(poses["happy"], metadata["poses"]["happy"]["eyes"], right_only=True, lid_boxes=HAPPY_LID_BOXES), "rest": blink(poses["rest"], metadata["poses"]["rest"]["eyes"]),
              "concern": mouth(poses["neutral"], metadata["poses"]["neutral"]["mouth"], "concern")}
    for shape in ["closed", "small", "medium", "wide"]:
        frames["talk-"+shape] = mouth(poses["speak"], metadata["poses"]["speak"]["mouth"], shape)
    frames["talk-blink"] = blink(frames["talk-medium"], metadata["poses"]["speak"]["eyes"])
    frames["concern-blink"] = blink(frames["concern"], metadata["poses"]["neutral"]["eyes"])
    frames["happy-blink"] = blink(poses["happy"], metadata["poses"]["happy"]["eyes"], lid_boxes=HAPPY_LID_BOXES)
    frames["error"] = mouth(blink(poses["neutral"], metadata["poses"]["neutral"]["eyes"], cross=True), metadata["poses"]["neutral"]["mouth"], "closed")
    frames["search"] = poses["search"].copy()
    data = indexed_sheet(frames)
    report = validate(frames, data, metadata)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "reaction-sheet.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for key in IDS:
        decode(data, key).save(OUT / f"{key}.png")
    contact_sheet(data)
    mouth_comparison(data)
    pixel_data = pixel_sheet(data)
    pixel_out = ROOT / "assets/reactions/wumi-pixel"
    pixel_out.mkdir(parents=True, exist_ok=True)
    (pixel_out / "reaction-sheet.json").write_text(json.dumps(pixel_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for key in IDS:
        decode(pixel_data, key).save(pixel_out / f"{key}.png")
    contact_sheet(pixel_data)
    assert pixel_data["width"] == 80 and len(pixel_data["palette"]) == 48
    assert len({bytes(pixel_data["frames"][pixel_data["ids"][key]]["pixels"]) for key in ["talk-closed", "talk-small", "talk-medium", "talk-wide"]}) == 4
    report["pixelDerivative"] = {"style":"wumi-pixel","width":80,"height":80,"paletteSize":48,"frameCount":len(IDS),"fourDistinctSpeechMouths":True,"dithering":False,"sampling":"nearest","sharedPalette":True}
    report["mouthDesign"] = "w / short dash / small o / large O; one subtle side fang on medium/wide; talk-blink uses medium o"
    report["ids"] = data["ids"]
    report["errorDesign"] = "Two cute dark X eyes and a small closed W muzzle on the neutral paw pose"
    report["searchDesign"] = "Head buried in papers; independent normalized tail polygon and pivot"
    report["motionMetadata"] = {"wave":True,"tail":True,"normalized":True}
    if not args.assets_only:
        print("Assets rebuilt. To render previews from the actual runtime, run: node scripts/build_motion_preview.mjs", file=sys.stderr)
    (ROOT / "tests").mkdir(parents=True, exist_ok=True)
    (ROOT / "tests/wumi-asset-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    from build_waiting import append_waiting
    append_waiting()
    report = json.loads((ROOT / "tests/wumi-asset-validation.json").read_text(encoding="utf-8"))
    print(json.dumps({"output": str(OUT), "validation": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
