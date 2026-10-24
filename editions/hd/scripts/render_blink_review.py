#!/usr/bin/env python3
"""Refresh closed-eye review images from the final shipped reaction sheets.

The old comparison's top row is an archived historical reference, never an
animation source. The CURRENT row and current-only images always decode the
reaction-sheet.json present at render time. This command does not rebuild or
alter character pixels, palettes, source poses, or the installed extension.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
KEYS = ("idle-blink", "think-blink", "work-blink", "talk-blink",
        "happy-blink", "rest", "wait-blink")
BG = "#080f1c"
WIDTH = len(KEYS) * 240


def font(size, bold=False):
    for path in (f"C:/Windows/Fonts/{'msyhbd.ttc' if bold else 'msyh.ttc'}",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def decode(data, key):
    frame = data["frames"][data["ids"][key]]
    image = Image.new("RGBA", (data["width"], data["height"]))
    transparent = data.get("transparentIndex", 0)
    image.putdata([(*data["palette"][index], 0 if index == transparent else 255)
                   for index in frame["pixels"]])
    return image


def face_box(data):
    scale = data["width"] / 640
    return tuple(round(value * scale) for value in (158, 178, 438, 370))


def draw_cell(result, data, key, x, y):
    """Use exact indexed pixels for the enlarged face and the complete pose."""
    image = decode(data, key)
    face = image.crop(face_box(data)).resize((228, 157), Image.Resampling.NEAREST)
    result.paste(face, (x + 6, y), face)
    sampling = Image.Resampling.NEAREST if data["style"].endswith("pixel") else Image.Resampling.LANCZOS
    art = image.resize((230, 230), sampling)
    result.paste(art, (x + 5, y + 156), art)


def row_labels(draw, y, label, color):
    for column, key in enumerate(KEYS):
        x = column * 240
        draw.rounded_rectangle((x + 6, y - 2, x + 233, y + 48), 5,
                               fill="#101827", outline=color)
        draw.text((x + 14, y), label, font=font(16, True), fill=color)
        draw.text((x + 14, y + 24), key, font=font(14), fill="#bdd3ef")


def current_image(data, source_sha):
    result = Image.new("RGB", (WIDTH, 594), BG)
    draw = ImageDraw.Draw(result)
    draw.text((24, 16), "当前闭眼动作 · CURRENT", font=font(26, True), fill="#e5edf5")
    draw.text((24, 59), "直接读取最终 reaction-sheet.json；上方为眼部放大，下方为同一帧全身。",
              font=font(16), fill="#95aac4")
    row_labels(draw, 100, "CURRENT / 当前", "#9bd6c4")
    for column, key in enumerate(KEYS):
        draw_cell(result, data, key, column * 240, 160)
    draw.text((24, 562), f"{data['style']} · {data['width']}px · sheet SHA256 {source_sha}",
              font=font(13), fill="#95aac4")
    return result


def proof(before, after, target, *, source_sha=None):
    """Keep old evidence, while always reading CURRENT pixels from ``after``.

    ``before`` may be a historical sheet supplied by the patch builder, or
    None when refreshing an existing comparison. The original PNG is archived
    once and its old top row is reused without recoloring or resampling it.
    """
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    archive = target.with_name("blink-historical-reference.png")
    if target.exists() and not archive.exists():
        shutil.copyfile(target, archive)
    historical = Image.open(archive).convert("RGB") if archive.exists() else None
    if historical is not None and historical.size != (WIDTH, 1000):
        raise ValueError("The archived reference must be the original 1680x1000 comparison")
    if historical is None and before is None:
        raise ValueError("A historical sheet or original comparison is required")
    if historical is None:
        historical = Image.new("RGB", (WIDTH, 1000), BG)
        for column, key in enumerate(KEYS):
            draw_cell(historical, before, key, column * 240, 134)
        historical.save(archive)
    if source_sha is None:
        sheet_path = target.parent / "reaction-sheet.json"
        if sheet_path.exists() and json.loads(sheet_path.read_bytes()) == after:
            source_sha = hashlib.sha256(sheet_path.read_bytes()).hexdigest()
        else:
            source_sha = hashlib.sha256(json.dumps(after, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    result = Image.new("RGB", (WIDTH, 1110), BG)
    draw = ImageDraw.Draw(result)
    draw.text((24, 16), "闭眼动作核对 · 旧版参考 / 当前最终帧", font=font(26, True), fill="#e5edf5")
    draw.text((24, 59), "红色 OLD 是历史问题示例；绿色 CURRENT 才是当前使用的动作，请勿混用。",
              font=font(16), fill="#95aac4")
    row_labels(draw, 100, "OLD / 旧版（仅供对照）", "#ed9fa7")
    for column, key in enumerate(KEYS):
        x = column * 240
        if historical is not None:
            # The original comparison's exact old face and body remain intact.
            result.paste(historical.crop((x, 134, x + 240, 520)), (x, 160))
        else:
            draw_cell(result, before, key, x, 160)
    draw.line((16, 566, WIDTH - 16, 566), fill="#34465f", width=1)
    row_labels(draw, 590, "CURRENT / 当前最终帧", "#9bd6c4")
    for column, key in enumerate(KEYS):
        draw_cell(result, after, key, column * 240, 650)
    draw.text((24, 1064), f"当前：{after['style']} · {after['width']}px · sheet SHA256 {source_sha}",
              font=font(13), fill="#95aac4")
    result.save(target)
    current_image(after, source_sha).save(target.with_name("blink-current.png"))
    return {"comparison": str(target), "current": str(target.with_name("blink-current.png")),
            "historicalReference": str(archive) if archive.exists() else None,
            "sheetSha256": source_sha, "currentFrames": list(KEYS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path,
                        help="Also save current-only deliverable images into this directory")
    args = parser.parse_args()
    if args.output_root:
        args.output_root.mkdir(parents=True, exist_ok=True)
    reports = []
    for style in ("wumi", "wumi-pixel"):
        folder = ROOT / "assets/reactions" / style
        sheet = folder / "reaction-sheet.json"
        original = sheet.read_bytes()
        data = json.loads(original)
        digest = hashlib.sha256(original).hexdigest()
        report = proof(None, data, folder / "blink-before-after.png", source_sha=digest)
        assert sheet.read_bytes() == original, "Review rendering must never change the sheet"
        if args.output_root:
            name = "Umi-closed-eyes-current-pixel.png" if style.endswith("pixel") else "Umi-closed-eyes-current.png"
            deliverable = args.output_root / name
            shutil.copyfile(folder / "blink-current.png", deliverable)
            report["deliverable"] = str(deliverable)
        reports.append(report)
    print(json.dumps({"passed": True, "method": "Current-only review decoded from final sheets; archived OLD row preserved", "styles": reports},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
