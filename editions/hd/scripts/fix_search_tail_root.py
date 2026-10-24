#!/usr/bin/env python3
"""Whiten only the small leftover gray wedge at Umi's tail attachment.

Explicit user-requested local correction. Preserves alpha and dark outlines;
the upper light-gray tail band is outside the hand-marked root-only polygon.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT_POLYGON = [(353, 343), (361, 331), (365, 338), (375, 327),
                (379, 332), (389, 327), (399, 329), (393, 342),
                (384, 352), (373, 360), (362, 361), (357, 354)]


def fix_tail_root(image):
    result = np.array(image.convert("RGBA"))
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).polygon(ROOT_POLYGON, fill=255)
    rgb = result[:, :, :3].astype(np.float32)
    luminance = rgb.mean(axis=2)
    dark = ((luminance < 120) & (result[:, :, 3] > 128)).astype(np.uint8) * 255
    protected_outline = np.asarray(Image.fromarray(dark).filter(ImageFilter.MaxFilter(3))) > 0
    selected = (np.asarray(mask) > 0) & (result[:, :, 3] > 128) & (luminance >= 110) & (luminance < 235) & ~protected_outline
    # Keep a restrained warm/cool shade variation, always within white fur.
    white = np.clip(240 + (luminance - 110) * .04, 240, 246)
    recolored = np.clip(white[:, :, None] + (rgb - luminance[:, :, None]) * .12, 0, 255).astype(np.uint8)
    result[:, :, :3][selected] = recolored[selected]
    return Image.fromarray(result), {
        "polygon": ROOT_POLYGON, "changedPixels": int(selected.sum()),
        "alphaUnchanged": True, "darkOutlinesAndOnePixelAntialiasBorderPreserved": True,
        "upperMiddleTailBandUntouched": True,
    }


def comparison(before, after, destination):
    crop = (325, 290, 425, 390)
    output = Image.new("RGB", (1240, 670), "#111b2a")
    draw = ImageDraw.Draw(output)
    path = Path("C:/Windows/Fonts/msyh.ttc")
    face = ImageFont.truetype(str(path), 20) if path.exists() else ImageFont.load_default()
    draw.text((30, 18), "局部修正前 · 尾根仍有灰楔", font=face, fill="#d8e5f5")
    draw.text((650, 18), "局部修正后 · 白根，保留轮廓", font=face, fill="#d8e5f5")
    for image, x in [(before, 20), (after, 640)]:
        enlarged = image.crop(crop).resize((600, 600), Image.Resampling.NEAREST)
        output.paste(enlarged, (x, 55), enlarged)
    output.save(destination)


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "assets/poses"
    path = out / "search.png"
    before = Image.open(path).convert("RGBA")
    backup = out / "search.before-root-fix.png"
    if not backup.exists():
        before.save(backup)
    after, report = fix_tail_root(before)
    after.save(path)
    comparison(before, after, out / "search-tail-root-comparison.png")
    metadata = json.loads((out / "search-metadata.json").read_text(encoding="utf-8"))
    metadata["localRootWhitening"] = report
    (out / "search-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
