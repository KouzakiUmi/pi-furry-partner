#!/usr/bin/env python3
"""Normalize the generated hidden-head searching pose; no API calls.

Requires Pillow and numpy. Tail coordinates are in the final 640-pixel canvas.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "poses"


def clean(image):
    rgba = np.array(image.convert("RGBA"))
    rgba[rgba[:, :, 3] < 8] = (0, 0, 0, 0)
    return Image.fromarray(rgba)


def main():
    # Perspective/anatomy is edited by built-in image_gen. This script only
    # normalizes the approved RGBA asset and records its animation landmarks.
    source = clean(Image.open(OUT / "search-generated-perspective.png"))
    bounds = source.getbbox()
    crop = source.crop(bounds)
    scale = min(480 / crop.width, 530 / crop.height)
    size = (round(crop.width * scale), round(crop.height * scale))
    offset = ((640 - size[0]) // 2, 610 - size[1])
    normalized = Image.new("RGBA", (640, 640))
    normalized.alpha_composite(crop.resize(size, Image.Resampling.LANCZOS), offset)
    normalized = clean(normalized)
    normalized.save(OUT / "search.png")
    alpha = np.asarray(normalized)[:, :, 3]
    clear = not (alpha[0].any() or alpha[-1].any() or alpha[:, 0].any() or alpha[:, -1].any())
    metadata = {
        "schemaVersion": 1, "pose": "search", "file": "search.png",
        "sourceFile": "search-generated-perspective.png", "promptFile": "search-perspective-prompt.txt",
        "identityReference": "assets/reference/wumi-character-sheet.png",
        "styleReference": "neutral.png", "editTargetReference": "search.before-perspective.png",
        "generatedUsing": "built-in image_gen with transparent_background=true",
        "width": 640, "height": 640, "sourceSize": list(source.size),
        "sourceAlphaBounds": list(bounds), "scale": scale,
        "contentSize": list(size), "pasteOffset": list(offset),
        "alphaBounds": list(normalized.getbbox()), "alphaExtrema": list(normalized.getchannel("A").getextrema()),
        "borderTransparent": clear,
        "localRootWhiteningApplied": False,
        "rootTreatment": "image-generated anatomical perspective repair: substantial white root blends into the rear rump; one curved volumetric tail tapers toward its deep-gray tip; no painted polygon patch",
        "perspectiveRepair": "Only the tail and its rump attachment were edited; head remains buried, papers/hood/scarf/paw composition and colors retained. The normalized sprite is slightly shorter due to the foreshortened tail.",
        "recolorPromptFile": "search-recolor-prompt.txt",
        "tailColorOrderTipToRoot": ["deep gray", "light gray", "white"],
        "tailColorSamples": {"tip": {"point": [350, 180], "rgb": list(normalized.getpixel((350, 180))[:3])},
                             "middle": {"point": [447, 248], "rgb": list(normalized.getpixel((447, 248))[:3])},
                             "root": {"point": [463, 327], "rgb": list(normalized.getpixel((463, 327))[:3])}},
        "tail": {
            "roi": [280, 95, 535, 405],
            "pivot": [425, 362],
            "root": [425, 362],
            "tip": [399, 109],
            "maskPolygon": [[424, 363], [406, 351], [391, 336], [396, 314],
                            [391, 291], [377, 279], [354, 286], [351, 274],
                            [329, 277], [308, 265], [291, 246], [283, 223],
                            [284, 198], [289, 172], [300, 151], [315, 133],
                            [338, 116], [365, 103], [405, 96], [415, 104],
                            [403, 120], [405, 139], [418, 151], [434, 148],
                            [438, 171], [457, 187], [476, 214], [491, 190],
                            [504, 191], [502, 222], [516, 252], [530, 260],
                            [530, 291], [532, 304], [523, 326], [511, 348],
                            [491, 367], [470, 380], [452, 378], [438, 370],
                            [442, 389], [430, 401], [411, 390], [414, 373]],
            "spine": [[425, 362], [452, 345], [476, 320], [484, 295],
                      [465, 251], [438, 230], [407, 218], [377, 207],
                      [350, 188], [340, 166], [350, 143], [373, 123], [399, 109]],
            "spineOrder": "root-to-tip; all coordinates are in the final 640-square canvas",
            "rootPinned": False,
            "rootFlexible": True,
            "rootBlendNormalized": 48 / 640,
            "transparentMaskPaddingSourcePx": 10,
            "recommendedAngleDeg": [-9, 9],
            "note": "Phase-lagged wave along the same tail spine; the root flexes about one native pixel and blends smoothly into a small upper-white-rump region. Lower rump, hood, scarf, paw and pile base stay still."
        },
        "papers": [
            {"id":"left-loose","polygon":[[99,490],[139,464],[183,482],[173,501],[142,511]],"pivot":[170,500],"paddingNormalized":3/640,"angle":1,"amplitude":1,"phaseOffset":0},
            {"id":"upper-loose","polygon":[[184,480],[240,470],[287,481],[275,518],[221,514],[214,495],[177,505]],"pivot":[247,514],"paddingNormalized":2/640,"angle":1,"amplitude":1,"phaseOffset":7},
            {"id":"front-loose","polygon":[[282,520],[382,540],[412,581],[327,588],[303,569]],"pivot":[327,580],"paddingNormalized":2/640,"angle":1,"amplitude":1,"phaseOffset":15},
        ],
        "paperMotion": {"periodMs":2400,"phaseOffsetsSteps":[0,7,15],"fixedPileBaseFromSourceY":602,"description":"Three asynchronous loose pages; one native pixel and one degree at most. Lower document stack is fixed."},
        "searchHead": [
            {"id":"hood","polygon":[[181,399],[207,405],[256,429],[286,416],[324,413],[356,413],[378,437],[389,471],[386,507],[358,533],[323,537],[288,525],[246,517],[210,510],[182,491],[175,459]],"pivot":[299,519],"paddingNormalized":14/640,"amplitude":1.4,"nodAmplitude":.8,"angle":1,"phaseOffset":0},
            {"id":"neck-scarf","polygon":[[255,417],[281,404],[315,397],[347,401],[376,414],[389,436],[376,455],[359,442],[338,422],[310,420],[286,427]],"pivot":[370,449],"paddingNormalized":8/640,"amplitude":.65,"nodAmplitude":.35,"angle":.6,"phaseOffset":2},
        ],
        "searchOcclusion": [
            [[99,490],[139,464],[183,482],[173,501],[142,511]],
            [[184,480],[240,470],[287,481],[275,518],[221,514],[214,495],[177,505]],
            [[137,513],[237,492],[263,572],[168,577]],
            [[78,519],[138,511],[182,516],[240,510],[275,516],[330,520],[381,496],[409,504],[429,550],[457,574],[558,579],[470,608],[198,610],[78,598]],
        ],
        "burrowMotion":{"periodMs":2400,"headSwayNativePx":1.4,"nodNativePx":.8,"hoodAngleDeg":1,"scarfFollowSteps":2,"description":"Local hood and upper neck burrow behind foreground papers. Feathered attachment, fixed body and gray paw; no full-canvas sway."},
        "noseAlignment": "not applicable: head buried behind papers",
    }
    metadata["tail"]["spineNormalized"] = [[x / 640, y / 640] for x, y in metadata["tail"]["spine"]]
    if not clear:
        raise ValueError("Normalized search sprite touches the canvas edge")
    previous_path = OUT / "search.before-perspective.png"
    if previous_path.exists():
        previous = Image.open(previous_path).convert("RGBA")
        old_mask = np.asarray(previous)[:, :, 3] > 96
        new_mask = alpha > 96
        metadata["geometryComparedWithBeforePerspectiveRepair"] = {
            "file": previous_path.name,
            "alphaIoU": float((old_mask & new_mask).sum() / (old_mask | new_mask).sum()),
            "alphaBoundsUnchanged": previous.getbbox() == normalized.getbbox(),
            "tailRoiUnchanged": False, "tailPivotUnchanged": False,
        }
    (OUT / "search-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: metadata[key] for key in ("file", "width", "height", "alphaBounds", "borderTransparent", "tail")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
