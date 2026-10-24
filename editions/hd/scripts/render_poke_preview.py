#!/usr/bin/env python3
"""Compose the exported real Umi reaction pixels into an offline comparison GIF."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def font(size, bold=False):
    names = ["msyhbd.ttc", "msyh.ttc"] if bold else ["msyh.ttc", "msyhbd.ttc"]
    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.truetype("DejaVuSans.ttf", size)


def main(folder, output):
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    views = manifest["contexts"]
    pixels = np.fromfile(folder / "pixels.bin", dtype=np.uint8).reshape(
        len(manifest["timeline"]), len(views), manifest["height"], manifest["width"])
    images = []
    for i, moment in enumerate(manifest["timeline"]):
        image = Image.new("RGB", (1200, 650), "#0b121e")
        draw = ImageDraw.Draw(image)
        draw.text((32, 22), "轻轻戳一下呜咪", font=font(29, True), fill="#e5edf5")
        draw.text((34, 69), "同一次小互动，三种不同回应 · 不打断 agent 工作", font=font(16), fill="#95abc7")
        for column, (context, value) in enumerate(zip(views, moment["views"])):
            left, top = 24 + column * 392, 111
            draw.rounded_rectangle((left, top, left + 368, 603), 14, fill="#111d2d", outline="#344b65")
            draw.text((left + 20, top + 18), context["label"], font=font(20, True), fill="#a4caef")
            draw.text((left + 20, top + 51), context["english"], font=font(13), fill="#738da9")
            bubble = str(value["bubble"])
            bubble_width = draw.textlength(bubble, font=font(17))
            draw.rounded_rectangle((left + 35, top + 84, left + 333, top + 126), 6, fill="#182c43", outline="#6486ac")
            draw.text((left + 184 - bubble_width / 2, top + 92), bubble, font=font(17), fill="#c6ddf2")
            palette = np.asarray(value["palette"], dtype=np.uint8)
            rgba = np.zeros((manifest["height"], manifest["width"], 4), dtype=np.uint8)
            rgba[..., :3] = palette[pixels[i, column]]
            rgba[..., 3] = np.where(pixels[i, column] == 0, 0, 255)
            sprite = Image.fromarray(rgba, "RGBA").resize((320, 320), Image.Resampling.LANCZOS)
            image.paste(sprite, (left + 24, top + 133), sprite)
            text = value["phrase"]
            lines, line = [], ""
            for char in text:
                if draw.textlength(line + char, font=font(15)) > 328:
                    lines.append(line)
                    line = ""
                line += char
            if line:
                lines.append(line)
            for row, line in enumerate(lines[:2]):
                draw.text((left + 20, top + 443 + row * 23), line, font=font(15), fill="#bacde2")
            if manifest["pokeAtMs"] <= moment["atMs"] < manifest["pokeAtMs"] + 350:
                draw.rounded_rectangle((left + 268, top + 40, left + 349, top + 73), 7, fill="#bcd6ec")
                draw.text((left + 278, top + 47), "戳一下", font=font(14, True), fill="#16334d")
        draw.text((28, 620), "实际 activity / renderDock / motion 帧 · 离线效果预览，非终端截图 · 角色与动画保留全部版权", font=font(13), fill="#7c96b1")
        images.append(image)
    reference = Image.new("RGB", (1200 * 4, 650 * 4))
    for slot, index in enumerate(np.linspace(0, len(images) - 1, 16, dtype=int)):
        reference.paste(images[index], (slot % 4 * 1200, slot // 4 * 650))
    palette = reference.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in images]
    output.parent.mkdir(parents=True, exist_ok=True)
    indexed[0].save(output, save_all=True, append_images=indexed[1:], duration=manifest["stepMs"], loop=0, disposal=1, optimize=True)
    with Image.open(output) as result:
        duration = 0
        for frame in range(result.n_frames):
            result.seek(frame)
            duration += result.info.get("duration", 0)
        assert duration == manifest["durationMs"]
    contact = Image.new("RGB", (2400, 1300))
    for slot, at_ms in enumerate((400, 900, 1150, 2200)):
        contact.paste(images[at_ms // manifest["stepMs"]], (slot % 2 * 1200, slot // 2 * 650))
    contact_path = output.with_name(output.stem + "-contact.png")
    contact.save(contact_path)
    print(json.dumps({"gif": str(output), "contact": str(contact_path), "durationMs": duration, "frames": len(images), "dimensions": [1200, 650], "bytes": output.stat().st_size, "realActivityContextsPreserved": True}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    main(args.input, args.output)
