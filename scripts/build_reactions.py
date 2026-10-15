#!/usr/bin/env python3
"""Build a local expression rig for the two existing WINK portraits.

No artwork generation or network access. Pillow/numpy only: palette-preserving
pixel edits and small, masked face patches on the existing illustration.
Run from any directory: python scripts/build_reactions.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ASSETS / "reactions"
IDS = ["idle-open", "idle-blink", "talk-closed", "talk-small", "talk-medium",
       "talk-wide", "think", "work", "happy", "concern", "rest", "idle-wink", "talk-blink", "concern-blink", "happy-blink", "error"]
LABELS = ["就绪", "眨眼 / 等待", "说话 · 闭嘴", "说话 · 小口", "说话 · 中口",
          "说话 · 大口", "思考 / 整理", "工具执行", "完成 · 开心", "错误 · 担忧", "暂停 / 取消", "醒来 · Wink", "说话 · 眨眼", "担忧 · 眨眼", "开心 · 闭眼", "错误 · 吃瘪"]
PIXEL_DARK = (47, 58, 60, 255)
PINK = (235, 141, 135, 255)
MOUTH_DARK = (133, 65, 83, 255)
TONGUE = (241, 157, 167, 255)


def source_pixel():
    data = json.loads((ASSETS / "native-frames.json").read_text(encoding="utf-8"))
    image = Image.new("RGBA", (data["width"], data["height"]))
    image.putdata([(*data["palette"][i], 255) if i else (0, 0, 0, 0)
                   for i in data["frames"][0]["pixels"]])
    return image


def preserve_alpha(base, edited):
    edited.putalpha(base.getchannel("A"))
    return edited


def pixel_clean_mouth(image):
    result = image.copy()
    ImageDraw.Draw(result).rectangle((39, 60, 53, 66), fill="white")
    return result


def pixel_mouth(base, shape):
    result = pixel_clean_mouth(base)
    draw = ImageDraw.Draw(result)
    if shape == "closed":
        draw_beast_mouth(result, cx=46, baseline=61, half_width=5.5,
                         stroke=1, fang=False,
                         outer=PINK, inner=MOUTH_DARK, tongue=TONGUE)
    elif shape in ("small", "medium", "wide", "happy"):
        width, height = {"small": (6, 0), "medium": (7, 5), "wide": (10, 7), "happy": (10, 7)}[shape]
        draw_round_mouth(result, cx=46, cy=63.5, width=width, height=height,
                         stroke=1, fang=shape in ("medium", "wide", "happy"),
                         outer=PINK, inner=MOUTH_DARK)
    elif shape == "concern":
        draw.line([(41, 64), (42, 63), (44, 62), (48, 62), (50, 63), (51, 64)], fill=PINK, width=1)
    elif shape == "flat":
        draw.line((43, 63, 49, 63), fill=PINK)
    elif shape == "soft":
        draw.line([(43, 62), (44, 63), (48, 63), (49, 62)], fill=PINK)
    else:
        raise ValueError(shape)
    return preserve_alpha(base, result)


def pixel_lash_mask(base, right_only=False):
    """Original upper lashes, including the outer corner, never lavender hair."""
    array = np.asarray(base)
    mask = np.zeros(array.shape[:2], dtype=bool)
    for name, (x0, y0, x1, y1) in {"left": (30,38,42,49), "right": (52,38,67,49)}.items():
        if right_only and name != "right":
            continue
        mask[y0:y1,x0:x1] = np.all(array[y0:y1,x0:x1,:3] == PIXEL_DARK[:3], axis=2)
    # The former half-open Python slices also missed one last iris column,
    # leaving two orange glints beside a blink or an X eye.
    for name,x,bottom in [("left",40,54),("right",61,55)]:
        if right_only and name != "right":
            continue
        rgb=array[43:bottom,x,:3]
        hair=np.all(rgb==(192,188,206),axis=1)
        white=np.all(rgb==(255,255,255),axis=1)
        mask[43:bottom,x] |= ~hair & ~white
    return Image.fromarray(mask.astype(np.uint8) * 255)


def pixel_eyes(base, focused=False, cross=False, squeezed=False, right_only=False):
    result = base.copy()
    array = np.array(result)
    # Remove blue/orange iris and its outline only; keep the lavender hair edge
    # crossing the inner left eye. The dark arches above y43 are the open
    # eye's lashes, so a full blink removes them too; lavender hair remains.
    if not focused:
        array[np.asarray(pixel_lash_mask(base, right_only)) > 0] = (255,255,255,255)
    iris_boxes = [(34,40,54),(54,61,55)] if focused else [(34,41,54),(54,62,55)]
    for index, (left, right, bottom) in enumerate(iris_boxes):
        if right_only and index == 0:
            continue
        region = array[43:bottom, left:right]
        protected_hair = np.all(region[:, :, :3] == (192, 188, 206), axis=2)
        if focused:
            protected_hair[3:] = True
        region[~protected_hair] = (255, 255, 255, 255)
    result = Image.fromarray(array)
    draw = ImageDraw.Draw(result)
    if squeezed:
        draw.line([(34, 47), (39, 50), (34, 53)], fill=PIXEL_DARK, width=1)
        draw.line([(60, 47), (55, 50), (60, 53)], fill=PIXEL_DARK, width=1)
    elif cross:
        for x0, x1 in [(34, 39), (54, 60)]:
            draw.line((x0, 47, x1, 52), fill=PIXEL_DARK, width=1)
            draw.line((x0, 52, x1, 47), fill=PIXEL_DARK, width=1)
    elif focused:
        draw.line([(34, 46), (35, 45), (38, 45), (39, 46)], fill=PIXEL_DARK)
        draw.line([(54, 46), (55, 45), (59, 45), (60, 46)], fill=PIXEL_DARK)
    else:
        draw.line([(34, 51), (35, 50), (36, 49), (38, 49), (39, 50)], fill=PIXEL_DARK, width=1)
        draw.line([(54, 51), (55, 50), (56, 49), (58, 49), (59, 50), (60, 51)], fill=PIXEL_DARK, width=1)
    if right_only:
        # A wink changes only the viewer-right eye, including its old lash.
        result.paste(base.crop((0,0,52,base.height)),(0,0))
    return preserve_alpha(base, result)


def pixel_frames(base):
    blink = pixel_eyes(base)
    focused = pixel_eyes(base, focused=True)
    wink = pixel_eyes(base, right_only=True)
    return {
        "idle-open": base.copy(), "idle-blink": blink,
        "talk-closed": pixel_mouth(base, "closed"),
        "talk-small": pixel_mouth(base, "small"),
        "talk-medium": pixel_mouth(base, "medium"),
        "talk-wide": pixel_mouth(base, "wide"),
        "think": focused,
        "work": pixel_mouth(focused, "flat"),
        "happy": pixel_mouth(blink, "happy"),
        "concern": pixel_mouth(base, "concern"),
        "rest": pixel_mouth(blink, "soft"),
        "idle-wink": wink,
        "talk-blink": pixel_mouth(blink, "medium"),
        "concern-blink": pixel_mouth(blink, "concern"),
        "happy-blink": pixel_mouth(blink, "happy"),
        "error": pixel_mouth(pixel_eyes(base, cross=True), "closed"),
    }


def round_line(draw, points, fill, width):
    draw.line(points, fill=fill, width=width, joint="curve")
    radius = width / 2
    for x, y in [points[0], points[-1]]:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def curve(points, samples=45):
    """Cubic Bezier for the illustration's smooth closed lips/eyelids."""
    return [tuple((1-t)**3 * points[0][axis] + 3*(1-t)**2*t * points[1][axis]
                  + 3*(1-t)*t*t * points[2][axis] + t**3 * points[3][axis]
                  for axis in (0, 1))
            for t in np.linspace(0, 1, samples)]


def draw_beast_mouth(image, *, cx, baseline, half_width, opening_width=0,
                     opening_height=0, stroke=3, fang=False,
                     outer=(137, 91, 100, 255), inner=MOUTH_DARK, tongue=TONGUE):
    """A small canine/feline W muzzle with a soft V opening and one fang.

    The two upper muzzle arcs remain in every mouth. The oral cavity opens
    downwards from their center, without an oval outline or a thick lip ring.
    """
    sag = max(1.25, half_width * .20)
    if opening_width and opening_height:
        left = (cx-opening_width/2, baseline+sag*.8)
        center = (cx, baseline+sag*.20)
        right = (cx+opening_width/2, baseline+sag*.8)
        outline = curve([left, (cx-opening_width*.28, baseline+sag*.94),
                         (cx-opening_width*.12, baseline+sag*.25), center])
        outline += curve([center, (cx+opening_width*.12, baseline+sag*.25),
                          (cx+opening_width*.28, baseline+sag*.94), right])
        outline += curve([right, (cx+opening_width*.39, baseline+opening_height*.70),
                          (cx+opening_width*.16, baseline+opening_height),
                          (cx, baseline+opening_height)])
        outline += curve([(cx, baseline+opening_height),
                          (cx-opening_width*.16, baseline+opening_height),
                          (cx-opening_width*.39, baseline+opening_height*.70), left])
        mask = Image.new("L", image.size)
        ImageDraw.Draw(mask).polygon(outline, fill=255)
        layer = Image.new("RGBA", image.size, inner)
        detail = ImageDraw.Draw(layer)
        if opening_height >= stroke*4:
            detail.ellipse((cx-opening_width*.25, baseline+opening_height*.76,
                            cx+opening_width*.25, baseline+opening_height*1.1), fill=tongue)
        if fang:
            tooth_width = max(1, min(opening_width*.22, opening_height*.35))
            tooth_height = max(1, min(opening_height*.35, opening_width*.25))
            tooth_x = cx+opening_width*.18
            tooth_y = baseline+sag*.90
            detail.polygon([(tooth_x, tooth_y), (tooth_x+tooth_width, tooth_y),
                            (tooth_x+tooth_width*.45, tooth_y+tooth_height)], fill=(255, 254, 250, 255))
        image.paste(layer, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    upper = curve([(cx-half_width, baseline), (cx-half_width*.72, baseline+sag*1.2),
                   (cx-half_width*.27, baseline+sag*1.2), (cx, baseline+sag*.20)])
    upper += curve([(cx, baseline+sag*.20), (cx+half_width*.27, baseline+sag*1.2),
                    (cx+half_width*.72, baseline+sag*1.2), (cx+half_width, baseline)])
    round_line(draw, upper, outer, stroke)
    return image


def draw_round_mouth(image, *, cx, cy, width, height, stroke=3, fang=False,
                     outer=(145, 91, 98, 255), inner=MOUTH_DARK):
    """A clean short dash / small o / large O articulation, with one tiny fang."""
    if not height:
        round_line(ImageDraw.Draw(image), [(cx-width/2, cy), (cx+width/2, cy)], outer, stroke)
        return image
    box = (cx-width/2, cy-height/2, cx+width/2, cy+height/2)
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    layer = Image.new("RGBA", image.size, inner)
    detail = ImageDraw.Draw(layer)
    detail.ellipse((cx-width*.28, cy+height*.23, cx+width*.28, cy+height*.60), fill=TONGUE)
    if fang:
        tooth_x = cx+width*.15
        tooth_y = cy-height*.42
        tooth_width = max(1, width*.17)
        tooth_height = max(1, height*.24)
        detail.polygon([(tooth_x, tooth_y), (tooth_x+tooth_width, tooth_y),
                        (tooth_x+tooth_width*.42, tooth_y+tooth_height)], fill=(255, 254, 250, 255))
    image.paste(layer, (0, 0), mask)
    return image


def illustration_clean_mouth(base):
    array = np.array(base)
    original = np.array(base)
    x0, y0, x1, y1 = 414, 623, 545, 666
    rgb = original[y0:y1, x0:x1, :3].astype(np.int16)
    # Select only the coral mouth and its antialias fringe. Replace with local
    # white-face texture interpolated between clean rows above and below it.
    mask = (rgb[:, :, 0] - rgb[:, :, 1] > 7) & (rgb[:, :, 0] - rgb[:, :, 2] > 7)
    mask = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(0.8))
    amount = np.asarray(mask).astype(float)[:, :, None] / 255
    for local_y, y in enumerate(range(y0, y1)):
        weight = (y - 618) / (677 - 618)
        background = original[618, x0:x1, :3] * (1 - weight) + original[677, x0:x1, :3] * weight
        array[y, x0:x1, :3] = np.round(array[y, x0:x1, :3] * (1 - amount[local_y]) + background * amount[local_y]).astype(np.uint8)
    return Image.fromarray(array)


def illustration_mouth(base, shape):
    result = illustration_clean_mouth(base)
    draw = ImageDraw.Draw(result)
    pink = (236, 135, 133, 255)
    dark = (139, 64, 82, 255)
    if shape == "closed":
        draw_beast_mouth(result, cx=481, baseline=633, half_width=48,
                         stroke=5, fang=False,
                         outer=(157, 100, 110, 255), inner=dark)
    elif shape in ("small", "medium", "wide", "happy"):
        width, height = {"small": (52, 0), "medium": (54, 39), "wide": (76, 45), "happy": (76, 45)}[shape]
        draw_round_mouth(result, cx=481, cy=650, width=width, height=height,
                         stroke=5, fang=shape in ("medium", "wide", "happy"), inner=dark)
    elif shape == "concern":
        round_line(draw, curve([(433, 655), (457, 628), (503, 628), (530, 655)]), pink, 7)
    elif shape == "flat":
        round_line(draw, [(453, 646), (508, 646)], pink, 6)
    elif shape == "soft":
        round_line(draw, curve([(449, 640), (465, 657), (497, 657), (513, 640)]), pink, 6)
    else:
        raise ValueError(shape)
    return preserve_alpha(base, result)


ILLUSTRATION_EYE_POLYGONS = {
    "left": [(298,470),(316,447),(337,429),(356,420),(377,422),(395,432),(413,451),
             (426,478),(428,585),(338,590),(326,529),(305,505)],
    "right": [(526,476),(542,450),(563,431),(583,420),(607,427),(632,443),
              (657,468),(684,492),(670,533),(643,522),(636,590),(539,591),(526,510)],
}


def illustration_hair_mask(base):
    rgb=np.asarray(base)[:,:,:3].astype(np.int16)
    r,g,b=rgb.transpose(2,0,1);yy,xx=np.indices(r.shape)
    edge=np.interp(yy,[405,430,455,480,505,535,570],[382,396,410,432,463,496,520])
    inner_right=np.interp(yy,[415,440,470,488],[540,533,527,526])
    geometry=(((xx>=edge-3)&(xx<=edge+10)&(yy>=405)&(yy<=570)) |
              ((xx<=304)&(yy>=455)&(yy<=510)) |
              ((xx>=510)&(xx<=inner_right+3)&(yy>=415)&(yy<=488)))
    return Image.fromarray(((r>110)&(np.abs(r-g)<16)&(b-r>7)&geometry).astype(np.uint8)*255)


def illustration_eye_mask(base, right_only=False, lashes_only=False):
    """Full original sockets; the original gray-violet forelock is protected."""
    array = np.asarray(base)
    mask = Image.new("L", base.size)
    draw = ImageDraw.Draw(mask)
    for name, polygon in ILLUSTRATION_EYE_POLYGONS.items():
        if not right_only or name == "right":
            draw.polygon(polygon, fill=255)
    region = np.asarray(mask).copy()
    rgb = array[:,:,:3].astype(np.int16)
    r,g,b = rgb.transpose(2,0,1)
    # Eyelash antialiasing is also violet gray. Color alone would keep an
    # entire phantom upper lid, so protect this color only where the actual
    # outer hair edge or diagonal forelock crosses an eye corner.
    hair=np.asarray(illustration_hair_mask(base))>0
    if lashes_only:
        # Existing released closed-eye frames have already erased their iris.
        # Refresh only source ink outside those old boxes, preserving every
        # authored closed line and all mouth frames exactly.
        old_iris = np.zeros(region.shape, dtype=bool)
        # The old RGB-selective iris eraser also left pale gray crescents
        # in its upper half. Refresh those too; preserve from y491 down so
        # the current X, squeeze and ordinary closed strokes stay exact.
        old_iris[491:586,341:422] = True
        old_iris[491:586,541:631] = True
        region[old_iris] = 0
    region[hair | (array[:,:,3] == 0)] = 0
    return Image.fromarray(region)


def illustration_clean_eyes(base, right_only=False):
    """Cover complete lashes with nearby authored cheek fur, preserving hair."""
    result = base.copy()
    for name, window in {"left": (355,594,405,621), "right": (548,595,599,621)}.items():
        if right_only and name != "right":
            continue
        polygon = ILLUSTRATION_EYE_POLYGONS[name]
        local = Image.new("L",base.size)
        ImageDraw.Draw(local).polygon(polygon, fill=255)
        full = np.asarray(illustration_eye_mask(base, right_only=name=="right"))
        mask = Image.fromarray(np.minimum(np.asarray(local), full))
        soft = mask.filter(ImageFilter.GaussianBlur(.65))
        mask = Image.fromarray(np.minimum(np.asarray(mask),np.asarray(soft)))
        x0=min(x for x,y in polygon); x1=max(x for x,y in polygon)
        y0=min(y for x,y in polygon); y1=max(y for x,y in polygon)
        sx0,sy0,sx1,sy1=window
        scale_x=(sx1-sx0)/(x1-x0); scale_y=(sy1-sy0)/(y1-y0)
        donor=base.transform(base.size,Image.Transform.AFFINE,
            (scale_x,0,sx0-x0*scale_x,0,scale_y,sy0-y0*scale_y),Image.Resampling.BICUBIC)
        result.paste(donor,(0,0),mask)
    return preserve_alpha(base,result)


def illustration_eyes(base, focused=False, cross=False, squeezed=False, right_only=False):
    original = np.array(base)
    array = original.copy()
    for index, (x0, x1, bottom) in enumerate([(341, 422, 586), (541, 631, 586)]):
        if right_only and index == 0:
            continue
        y0, y1 = 459, 501 if focused else bottom
        rgb = original[y0:y1, x0:x1, :3].astype(np.int16)
        blue = (rgb[:, :, 1] - rgb[:, :, 0] > 3) & (rgb[:, :, 2] - rgb[:, :, 0] > 9)
        dark = np.max(rgb, axis=2) < 180
        orange = (rgb[:, :, 0] - rgb[:, :, 1] > 16) & (rgb[:, :, 0] - rgb[:, :, 2] > 16)
        orange[max(0, 550-y0):] = False  # Keep the adjacent coral cheek marks.
        mask = Image.fromarray((blue | dark | orange).astype(np.uint8) * 255)
        mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.5))
        amount = np.asarray(mask).astype(float)[:, :, None] / 255
        array[y0:y1, x0:x1, :3] = np.round(array[y0:y1, x0:x1, :3] * (1-amount) + np.array([253, 253, 253]) * amount).astype(np.uint8)
    result = Image.fromarray(array) if focused else illustration_clean_eyes(base, right_only)
    draw = ImageDraw.Draw(result)
    dark = (38, 45, 53, 255)
    if squeezed:
        round_line(draw, [(357, 502), (405, 525), (357, 548)], dark, 9)
        round_line(draw, [(610, 502), (562, 525), (610, 548)], dark, 9)
    elif cross:
        for x, y in [(381, 523), (586, 523)]:
            round_line(draw, [(x-24, y-25), (x+24, y+25)], dark, 10)
            round_line(draw, [(x-24, y+25), (x+24, y-25)], dark, 10)
    elif focused:
        round_line(draw, curve([(346, 502), (365, 489), (397, 489), (416, 503)]), dark, 8)
        round_line(draw, curve([(546, 503), (568, 489), (602, 489), (625, 503)]), dark, 8)
    else:
        round_line(draw, curve([(346, 540), (366, 517), (394, 517), (416, 541)]), dark, 9)
        round_line(draw, curve([(547, 541), (569, 516), (603, 516), (625, 540)]), dark, 9)
    if right_only:
        result.paste(base.crop((0,0,520,base.height)),(0,0))
    return preserve_alpha(base, result)


def illustration_frames(base):
    blink = illustration_eyes(base)
    focused = illustration_eyes(base, focused=True)
    # This authored one-eye wink already replaces the complete socket and
    # has no open-eye residue. Retain its original tapered single eyelid.
    wink = base.copy()
    with Image.open(ASSETS / "illustration/avatar-wink.png") as source:
        existing = source.convert("RGBA")
        wink.paste(existing.crop((528,420,685,589)),(528,420))
    preserve_alpha(base,wink)
    frames = {
        "idle-open": base.copy(), "idle-blink": blink,
        "talk-closed": illustration_mouth(base, "closed"),
        "talk-small": illustration_mouth(base, "small"),
        "talk-medium": illustration_mouth(base, "medium"),
        "talk-wide": illustration_mouth(base, "wide"),
        "think": focused,
        "work": illustration_mouth(focused, "flat"),
        "happy": illustration_mouth(blink, "happy"),
        "concern": illustration_mouth(base, "concern"),
        "rest": illustration_mouth(blink, "soft"),
        "idle-wink": wink,
        "talk-blink": illustration_mouth(blink, "medium"),
        "concern-blink": illustration_mouth(blink, "concern"),
        "happy-blink": illustration_mouth(blink, "happy"),
        "error": illustration_mouth(illustration_eyes(base, cross=True), "closed"),
    }
    return {name: image.resize((240, 240), Image.Resampling.LANCZOS) for name, image in frames.items()}


def index_frames(style, frames):
    width, height = next(iter(frames.values())).size
    if style == "pixel":
        colors = sorted({tuple(pixel[:3]) for image in frames.values() for pixel in np.asarray(image).reshape(-1, 4) if pixel[3]})
        palette = [[0, 0, 0]] + [list(map(int, rgb)) for rgb in colors]
        lookup = {tuple(rgb): index for index, rgb in enumerate(palette) if index}
        indexed = [[lookup[tuple(pixel[:3])] if pixel[3] else 0 for pixel in np.asarray(frames[name]).reshape(-1, 4)] for name in IDS]
    else:
        # One shared palette prevents untouched hat/scarf pixels from changing
        # between expressions. Index 0 is reserved for alpha throughout.
        mosaic = Image.new("RGB", (width, height * len(IDS)))
        for index, name in enumerate(IDS):
            mosaic.paste(frames[name].convert("RGB"), (0, index * height))
        quantized = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        raw_palette = quantized.getpalette()[:255 * 3]
        palette = [[0, 0, 0]] + [raw_palette[i:i+3] for i in range(0, len(raw_palette), 3)]
        indexed = []
        for name in IDS:
            image = frames[name]
            pixels = np.asarray(image.convert("RGB").quantize(palette=quantized, dither=Image.Dither.NONE)).astype(np.uint16) + 1
            pixels[np.asarray(image)[:, :, 3] < 128] = 0
            indexed.append(pixels.reshape(-1).tolist())
    assert len(palette) <= 256
    return {"schemaVersion": 1, "style": style, "transparentIndex": 0, "width": width, "height": height,
            "palette": palette, "frames": [{"id": name, "pixels": pixels} for name, pixels in zip(IDS, indexed)],
            "ids": {name: index for index, name in enumerate(IDS)}}


def decode(data, frame):
    image = Image.new("RGBA", (data["width"], data["height"]))
    image.putdata([(*data["palette"][i], 255) if i else (0, 0, 0, 0) for i in frame["pixels"]])
    return image


def font(size, bold=False):
    for path in ["C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/segoeui.ttf"]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def contact_sheet(styles):
    cell_w, cell_h = 242, 288
    sheet = Image.new("RGB", (cell_w * 8 + 24, cell_h * 4 + 108), "#080f1c")
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 15), "输入框角色 · 状态与说话嘴型", font=font(26, True), fill="#e5edf5")
    draw.text((24, 56), "所有帧与基底 Alpha 对齐，帽子与围巾保持一致；说话嘴型仅修改下脸。", font=font(15), fill="#8fa2ba")
    for style_index, (style, data) in enumerate(styles.items()):
        for index, frame in enumerate(data["frames"]):
            x = 12 + (index % 8) * cell_w
            y = 96 + (style_index * 2 + index // 8) * cell_h
            draw.rounded_rectangle((x+3, y+2, x+cell_w-6, y+cell_h-8), radius=10, fill="#101827", outline="#2b3a51")
            draw.text((x+14, y+13), ("像素" if style == "pixel" else "插画") + " · " + LABELS[index], font=font(15, True), fill="#dce8f8")
            art = decode(data, frame).resize((210, 210), Image.Resampling.NEAREST if style == "pixel" else Image.Resampling.LANCZOS)
            sheet.paste(art, (x+12, y+44), art)
            draw.text((x+14, y+256), frame["id"], font=font(11), fill="#8194af")
    sheet.save(OUT / "reactiondemo.png")


def validate(style, data):
    images = [np.asarray(decode(data, frame)) for frame in data["frames"]]
    base = images[0]
    allowed = np.zeros(base.shape[:2], dtype=bool)
    # Includes only eye/mouth face patches, including their resize filter fringe.
    if style == "pixel":
        allowed[38:55, 30:67] = True
        allowed[60:69, 38:55] = True
    else:
        allowed[96:141, 67:164] = True  # Complete eye sockets and resize fringe.
        allowed[142:163, 93:133] = True
    report = {"style": style, "width": data["width"], "height": data["height"], "frameCount": len(images),
              "paletteSize": len(data["palette"]), "alphaAligned": True, "changesConfinedToFace": True, "frames": []}
    assert set(data["ids"]) == set(IDS)
    for name, pixels, frame in zip(IDS, images, data["frames"]):
        assert len(frame["pixels"]) == data["width"] * data["height"]
        assert all(0 <= index < len(data["palette"]) for index in frame["pixels"])
        assert np.array_equal(pixels[:, :, 3], base[:, :, 3]), f"Alpha shifted: {style}/{name}"
        changed = np.any(pixels != base, axis=2)
        assert not np.any(changed & ~allowed), f"Edits outside face: {style}/{name}"
        ys, xs = np.where(changed)
        bbox = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1] if len(xs) else None
        report["frames"].append({"id": name, "changedPixels": int(changed.sum()), "changedBoundingBox": bbox})
    mouths = [images[data["ids"][name]] for name in ("talk-closed", "talk-small", "talk-medium", "talk-wide")]
    assert len({image.tobytes() for image in mouths}) == 4, "Speech shapes must all differ."
    report["fourDistinctSpeechMouths"] = True
    report["mouthChangesDoNotTouchEyes"] = all(np.array_equal(image[:60 if style == "pixel" else 143], base[:60 if style == "pixel" else 143]) for image in mouths)
    assert report["mouthChangesDoNotTouchEyes"]
    return report


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    styles = {"pixel": index_frames("pixel", pixel_frames(source_pixel()))}
    with Image.open(ASSETS / "illustration/avatar.png") as source:
        base = source.convert("RGBA")
        assert base.size == (1024, 1024), "Illustration rig coordinates target the supplied 1024px artwork."
        styles["illustration"] = index_frames("illustration", illustration_frames(base))
    reports = []
    for style, data in styles.items():
        reports.append(validate(style, data))
        folder = OUT / style
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "reaction-sheet.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for frame in data["frames"]:
            decode(data, frame).save(folder / f"{frame['id']}.png")
    contact_sheet(styles)
    (ROOT / "tests").mkdir(parents=True, exist_ok=True)
    validation = {"passed": True, "method": "Deterministic face-only code rig; shared palette and unchanged alpha", "styles": reports}
    (ROOT / "tests/asset-validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "styles": [{k: v for k, v in report.items() if k != "frames"} for report in reports]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
