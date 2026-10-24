#!/usr/bin/env python3
"""Crop and align the generated Umi pose sheet, entirely locally.

Run: python scripts/build_poses.py
Dependencies: Pillow and numpy. This only prepares the generated artwork; it
does not call a model/API or alter the original character design reference.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "poses"
SIZE = 640
NOSE_ANCHOR = (288, 318)
HEAD_WIDTH = 420

# Alpha gaps differ slightly from nominal 512-cell borders. These crop windows
# follow the real transparent gutters and retain all scarf tails and waving paws.
SPECS = {
    "neutral": {"rect": (0, 0, 550, 516), "noseSearch": (240, 253, 266, 274),
                "eyes": {"left": (182, 195, 228, 257), "right": (283, 195, 333, 258)},
                "mouth": (227, 273, 284, 291), "paws": (92, 407, 417, 508)},
    "think": {"rect": (550, 0, 1040, 516), "noseSearch": (718, 248, 746, 270),
              "eyes": {"left": (675, 183, 718, 244), "right": (776, 198, 825, 259)},
              "mouth": (721, 272, 755, 295), "paws": (624, 273, 909, 507)},
    "work": {"rect": (1040, 0, 1536, 516), "noseSearch": (1240, 259, 1270, 281),
             "eyes": {"left": (1184, 204, 1233, 266), "right": (1285, 204, 1336, 267)},
             "mouth": (1230, 280, 1284, 299), "paws": (1092, 385, 1430, 504)},
    "speak": {"rect": (0, 516, 535, 1024), "noseSearch": (232, 759, 260, 782),
              "eyes": {"left": (176, 704, 225, 768), "right": (278, 705, 329, 770)},
              "mouth": (218, 781, 275, 815), "paws": (19, 806, 417, 1015)},
    "happy": {"rect": (535, 516, 1048, 1024), "noseSearch": (730, 757, 759, 780),
              "eyes": {"left": (678, 705, 727, 769), "right": (779, 727, 855, 756)},
              "mouth": (720, 773, 786, 816), "paws": (587, 762, 1008, 1017)},
    "rest": {"rect": (1048, 516, 1536, 1024), "noseSearch": (1240, 764, 1269, 786),
             "eyes": {"left": (1170, 738, 1233, 767), "right": (1281, 738, 1351, 768)},
             "mouth": (1227, 784, 1280, 804), "paws": (1092, 920, 1427, 1012)},
}


def clean(image: Image.Image) -> Image.Image:
    rgba = np.array(image.convert("RGBA"))
    rgba[rgba[:, :, 3] < 16] = (0, 0, 0, 0)
    rgba[:, :, 3][rgba[:, :, 3] >= 250] = 255
    return Image.fromarray(rgba)


def find_nose(sheet: Image.Image, rect):
    x0, y0, x1, y1 = rect
    rgba = np.asarray(sheet)[y0:y1, x0:x1]
    rgb = rgba[:, :, :3].astype(np.int16)
    mask = (rgb.max(2) < 120) & ((rgb.max(2) - rgb.min(2)) < 35) & (rgba[:, :, 3] > 128)
    y, x = np.where(mask)
    if len(x) < 20:
        raise ValueError(f"No nose landmark in {rect}")
    return float(x.mean() + x0), float(y.mean() + y0)


def main():
    original = OUT / "sprite-sheet-original.png"
    sheet = clean(Image.open(original))
    if sheet.size != (1536, 1024):
        raise ValueError("The stored crop/landmark windows target the 1536x1024 generated sheet")
    sheet.save(OUT / "sprite-sheet.png")
    report = {
        "schemaVersion": 1, "character": "呜咪 / Umi", "species": "anthropomorphic wolf", "male": True,
        "identityReference": "assets/reference/wumi-character-sheet.png",
        "styleReference": "assets/illustration/avatar.png",
        "generatedUsing": "built-in image_gen, both references, transparent_background=true",
        "originalSheet": "sprite-sheet-original.png", "sheet": "sprite-sheet.png", "sheetSize": list(sheet.size),
        "alphaCleanup": {"below16": "transparent and RGB zero", "atLeast250": "fully opaque"},
        "width": SIZE, "height": SIZE, "noseAnchor": list(NOSE_ANCHOR), "targetHeadWidth": HEAD_WIDTH,
        "poses": {},
    }
    contact = Image.new("RGBA", (SIZE * 3, SIZE * 2))
    for index, (name, spec) in enumerate(SPECS.items()):
        x0, y0, x1, y1 = spec["rect"]
        cell = sheet.crop(spec["rect"])
        nose = find_nose(sheet, spec["noseSearch"])
        alpha = np.asarray(cell)[:, :, 3]
        # The full hood/cheek silhouette above the nose gives a consistent head
        # width independent of forepaw gestures or the scarf's rightward tail.
        # Stop above the nose: the success pose raises its paw beside the cheek.
        above = alpha[: int(nose[1] - y0 - 10)] >= 32
        yy, xx = np.where(above)
        head_width = int(xx.max() - xx.min() + 1)
        scale = HEAD_WIDTH / head_width
        resized = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
        offset = (round(NOSE_ANCHOR[0] - (nose[0] - x0) * scale),
                  round(NOSE_ANCHOR[1] - (nose[1] - y0) * scale))
        result = Image.new("RGBA", (SIZE, SIZE))
        result.alpha_composite(resized, offset)
        result = clean(result)
        rgba = np.asarray(result)
        border_clear = not (rgba[0, :, 3].any() or rgba[-1, :, 3].any() or
                            rgba[:, 0, 3].any() or rgba[:, -1, 3].any())
        if not border_clear:
            raise ValueError(f"{name}: content touches the 640-pixel canvas edge")
        result.save(OUT / f"{name}.png")
        contact.alpha_composite(result, ((index % 3) * SIZE, (index // 3) * SIZE))

        def mapped_box(box):
            return [round((box[0] - x0) * scale + offset[0]),
                    round((box[1] - y0) * scale + offset[1]),
                    round((box[2] - x0) * scale + offset[0]),
                    round((box[3] - y0) * scale + offset[1])]

        report["poses"][name] = {
            "file": f"{name}.png", "sourceWindow": list(spec["rect"]),
            "sourceNose": list(nose), "sourceHeadWidth": head_width,
            "scale": scale, "pasteOffset": list(offset),
            "nose": [round((nose[0] - x0) * scale + offset[0], 3),
                     round((nose[1] - y0) * scale + offset[1], 3)],
            "alphaBounds": list(result.getbbox()), "alphaExtrema": list(result.getchannel("A").getextrema()),
            "transparentPixels": int((rgba[:, :, 3] == 0).sum()),
            "borderTransparent": border_clear,
            "eyes": {eye: mapped_box(box) for eye, box in spec["eyes"].items()},
            "mouth": mapped_box(spec["mouth"]), "paws": mapped_box(spec["paws"]),
        }
    contact.save(OUT / "contact-sheet.png")
    (OUT / "metadata.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "poses.json").write_text(json.dumps({
        "schemaVersion": 1, "width": SIZE, "height": SIZE, "transparent": True,
        "poses": {name: f"{name}.png" for name in SPECS},
        "metadata": "metadata.json", "spriteSheet": "sprite-sheet.png",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "size": SIZE,
                      "poses": {key: {"nose": value["nose"], "bbox": value["alphaBounds"], "mouth": value["mouth"]}
                                for key, value in report["poses"].items()}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
