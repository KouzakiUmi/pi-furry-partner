#!/usr/bin/env python3
"""Composite exported production animation pixels into labelled effect previews.

The Node companion exports actual activity/dock/motion output. Pillow draws only
the illustrative input scene and text; it does not animate or replace the sprite.
Requires Pillow and numpy. No browser, terminal capture or API request.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


BG = "#0b121e"
PANEL = "#101827"
TEXT = "#e5edf5"
MUTED = "#9bacc2"
BLUE = "#89b4e6"
TONES = {"accent": BLUE, "warning": "#e6c68e", "success": "#9bd6c4", "error": "#ec8b91"}
CANVAS = (1120, 650)


def font(size=16, bold=False):
    names = ["msyhbd.ttc", "msyh.ttc"] if bold else ["msyh.ttc", "msyhbd.ttc"]
    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


FONTS = {size: font(size) for size in (11, 12, 13, 14, 15, 16, 18, 26)}
BOLD = {size: font(size, True) for size in (14, 16, 18, 26)}
MONO = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 14) if Path("C:/Windows/Fonts/consola.ttf").exists() else FONTS[14]
SYMBOL = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", 14) if Path("C:/Windows/Fonts/seguisym.ttf").exists() else FONTS[14]
BUBBLE_SYMBOL = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", 15) if Path("C:/Windows/Fonts/seguisym.ttf").exists() else FONTS[15]


def text(draw, xy, value, fill=MUTED, size=14, bold=False):
    draw.text(xy, str(value), fill=fill, font=(BOLD if bold else FONTS)[size])


def baseline(controls, waiting=False):
    image = Image.new("RGB", CANVAS, BG)
    d = ImageDraw.Draw(image)
    text(d, (32, 23), "呜咪 · 输入框左侧状态角色", TEXT, 26, True)
    text(d, (34, 73), "效果预览 · 同一套真实活动与动作代码驱动 · 离线生成", "#8fa6c2", 13)
    d.rounded_rectangle((26, 116, 1094, 608), radius=14, fill=PANEL, outline="#33465f", width=2)
    d.rounded_rectangle((28, 118, 1092, 158), radius=12, fill="#152235")
    for x, color in [(50, "#d1848b"), (68, "#d3b87f"), (86, "#83b6a8")]:
        d.ellipse((x - 5, 132, x + 5, 142), fill=color)
    text(d, (116, 126), "pi · MiniMax-M3.1-Flash-Preview · minimax-cn", "#849bb7", 13)
    text(d, (50, 182), "示例对话", "#6e87a5", 12)
    text(d, (50, 212), "› 帮我把这个项目的启动体验做得更清晰。", "#c1d7ef", 16)
    text(d, (50, 248), "呜咪　我会先了解现有结构，再把合适的调整落到代码里。", MUTED, 15)
    text(d, (86, 282), "你可以继续补充想法，我会留在输入框旁边。", MUTED, 15)
    d.rectangle((292, 429, 1055, 546), fill="#101b2b", outline="#59708c", width=1)
    text(d, (309, 459), "接下来，想一起做点什么？", "#718ba9", 18)
    d.line((308, 504, 1039, 504), fill="#334761", width=1)
    toolbar_left, toolbar_right = 310, 1039
    cell_width = (toolbar_right - toolbar_left) / max(1, controls.get("width", 90))
    for item in controls["buttons"]:
        label = item["label"]
        x = toolbar_left + item.get("start", 0) * cell_width
        text(d, (x, 515), label, "#a6bedb" if item["enabled"] else "#546a84", 12)
    d.line((292, 568, 1055, 568), fill="#283b54", width=1)
    text(d, (292, 579), "示例状态 · F:/Projects/your-project (main)", "#7590b0", 11)
    text(d, (805, 579), "本地帧 · 不发送模型请求", "#7590b0", 11)
    caption = ("等待演示省略中间 7.8 秒；打盹仍由真实十秒计时触发。本图为效果预览，不是实际终端截图。"
               if waiting else "角色固定在输入框旁；状态只在输入框顶边显示。本图为效果预览，不是实际终端截图。")
    text(d, (32, 626), caption, "#819bb9", 12)
    return image


def rgba_sprite(indices, palette, transparent=0):
    rgb = np.asarray(palette, dtype=np.uint8)[indices]
    alpha = np.where(indices == transparent, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack((rgb, alpha)))


def paw_glyph(draw, x, y, color):
    # A font-independent rendering of the paired paw-print emoji, avoiding a
    # missing-glyph square in offline Pillow exports on different machines.
    for dx, dy in [(-4, -4), (4, 4)]:
        cx, cy = x + dx, y + dy
        draw.ellipse((cx-2.5,cy,cx+2.5,cy+3.5),fill=color)
        for tx,ty in [(-3,-2),(0,-3),(3,-2)]:
            draw.ellipse((cx+tx-1,cy+ty-1,cx+tx+1,cy+ty+1),fill=color)


def scene(base, indices, metadata, palette, transparent):
    image = base.copy().convert("RGBA")
    image.alpha_composite(rgba_sprite(indices, palette, transparent), (48, 340))
    d = ImageDraw.Draw(image)
    color = TONES[metadata["color"]]
    # Draw the exact production activityBorder output in one native border row.
    # There is no extra status row or second Working caption above the input.
    d.rectangle((293, 418, 1054, 438), fill=PANEL)
    x = 296
    for character in metadata["borderText"]:
        point = ord(character)
        wide = (0x1100 <= point <= 0x115f or 0x2e80 <= point <= 0xa4cf or
                0xac00 <= point <= 0xd7a3 or 0xf900 <= point <= 0xfaff or 0xff01 <= point <= 0xff60)
        face = FONTS[14] if wide else SYMBOL if 0x2800 <= point <= 0x28ff else MONO
        d.text((x, 420), character, font=face, fill="#59708c" if character == "─" else color)
        x += 16 if wide else 8
    # Complete closed caption with a centered phrase and one paw emoji on
    # either side, matching the production three-row dock caption.
    d.rounded_rectangle((76, 309, 260, 345), radius=3, fill="#15253a", outline="#7e9fc7", width=1)
    bubble = str(metadata.get("bubble", ""))
    bubble_font = BUBBLE_SYMBOL if bubble in ("♪", "✓", "▱", "▰") else FONTS[15]
    while d.textlength(bubble, font=bubble_font) > 120:
        bubble = bubble[:-2] + "…" if len(bubble) > 1 else ""
    length = d.textlength(bubble, font=bubble_font)
    group_width = 16 + 6 + length + 6 + 16
    left = 168 - group_width / 2
    paw_glyph(d, left + 8, 326, "#b4cfea")
    d.text((left + 22, 317), bubble, fill="#b4cfea", font=bubble_font)
    paw_glyph(d, left + group_width - 8, 326, "#b4cfea")
    return image.convert("RGB")


def comparison(manifest, folder, output):
    image = Image.new("RGB", (1120, 1000), BG)
    d = ImageDraw.Draw(image)
    text(d, (36, 28), "同一只呜咪，两种画风", TEXT, 26, True)
    text(d, (38, 80), "相同思考与大开口姿态 · 像素版保留颗粒，80 × 80 原生图按整数四倍放大", "#91a9c5", 14)
    text(d, (70, 125), "呜咪角色版 · wumi", BLUE, 18, True)
    text(d, (596, 125), "呜咪像素版 · wumi-pixel · 48 色", BLUE, 18, True)
    for item in manifest["comparisons"]:
        column = 0 if item["style"] == "wumi" else 1
        row = 0 if item["id"] == "think" else 1
        left, top = 40 + column * 532, 160 + row * 400
        d.rounded_rectangle((left, top, left + 508, top + 380), radius=14, fill="#101b2b", outline="#2d445e", width=1)
        title = "思考 · 爪托下巴" if row == 0 else "说话 · 大 O 与轻点单颗虎牙"
        text(d, (left + 22, top + 16), title, "#bfd2e9", 14)
        values = np.fromfile(folder / item["file"], dtype=np.uint8).reshape((item["height"], item["width"]))
        sprite = rgba_sprite(values, item["palette"])
        method = Image.Resampling.NEAREST if column == 1 else Image.Resampling.LANCZOS
        sprite = sprite.resize((320, 320), method)
        image.paste(sprite, (left + 94, top + 48), sprite)
    text(d, (39, 963), "直接使用交付反应帧；旧 pixel / illustration 风格仍保留。", "#819bb9", 13)
    image.save(output / "style-comparison.png")


def encode_clip(manifest, frames_info, pixels, base, destination):
    # A shared palette prevents frame-to-frame color changes. Sample the actual
    # scene across every phase and all speech shapes before quantizing exports.
    reference = Image.new("RGB", (CANVAS[0] * 4, CANVAS[1] * 4), BG)
    selected = np.linspace(0, len(frames_info) - 1, 16, dtype=int)
    for slot, index in enumerate(selected):
        reference.paste(scene(base, pixels[index], frames_info[index], manifest["palette"], manifest["transparentIndex"]),
                        ((slot % 4) * CANVAS[0], (slot // 4) * CANVAS[1]))
    palette = reference.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    frames = []
    for index, info in enumerate(frames_info):
        rendered = scene(base, pixels[index], info, manifest["palette"], manifest["transparentIndex"])
        frames.append(rendered.quantize(palette=palette, dither=Image.Dither.NONE))
    durations = [item["durationMs"] for item in frames_info]
    frames[0].save(destination, save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, disposal=1, optimize=True)
    with Image.open(destination) as exported:
        total = 0
        for index in range(exported.n_frames):
            exported.seek(index)
            total += exported.info.get("duration", 0)
        gif = {"width": exported.width, "height": exported.height, "frames": exported.n_frames,
               "durationMs": total, "bytes": destination.stat().st_size,
               "loop": exported.info.get("loop")}
    if total != sum(durations):
        raise ValueError("GIF export changed the production animation timeline")
    return gif


def tail_preview(manifest, folder, output):
    loops = manifest["tailLoops"]
    native = [np.fromfile(folder / item["framesFile"], dtype=np.uint8).reshape(
        (len(item["frames"]), item["height"], item["width"])) for item in loops]
    frames = []
    for index in range(24):
        image = Image.new("RGB", (760, 500), BG)
        d = ImageDraw.Draw(image)
        text(d, (26, 20), "翻资料 · 轻拱脑袋与波浪甩尾", TEXT, 26, True)
        text(d, (28, 66), "头部轻拱、散纸错拍，尾根柔软带动中段和尾尖；2.4 秒真实循环。", MUTED, 13)
        d.line((380, 103, 380, 448), fill="#2d445e", width=1)
        for column, item in enumerate(loops):
            text(d, (34 + column * 380, 102), f"{item['style']} · {index * 100} ms", BLUE, 14)
            sprite = rgba_sprite(native[column][index], item["palette"], item["transparentIndex"])
            sprite = sprite.resize((320, 320), Image.Resampling.NEAREST if column else Image.Resampling.LANCZOS)
            image.paste(sprite, (30 + column * 380, 130), sprite)
        text(d, (28, 473), "实际 motion.mjs 帧 · 80px 像素版按四倍放大 · 效果预览，非终端截图", MUTED, 12)
        frames.append(image)
    contact = Image.new("RGB", (1520, 1000), BG)
    for slot, index in enumerate((0, 6, 12, 18)):
        contact.paste(frames[index], ((slot % 2) * 760, (slot // 2) * 500))
    contact.save(output / "tail-wave-contact.png")
    palette = contact.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    path = output / "tail-wave-preview.gif"
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=100, loop=0, disposal=1, optimize=True)
    with Image.open(path) as image:
        total = 0
        for index in range(image.n_frames):
            image.seek(index); total += image.info.get("duration", 0)
        result = {"width": image.width, "height": image.height, "frames": image.n_frames,
                  "durationMs": total, "loop": image.info.get("loop"), "bytes": path.stat().st_size,
                  "styles": [{key: item[key] for key in ("style", "periodMs", "rootPinned", "rootFlexible", "spinePoints", "distinctFrames")} for item in loops],
                  "contactSize": [1520, 1000], "contactPhasesMs": [0, 600, 1200, 1800]}
    if result["frames"] != 24 or total != 2400:
        raise ValueError("The independent tail export must preserve its complete real motion period")
    return result


def main(folder: Path, output: Path):
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    count = len(manifest["frames"])
    pixels = np.fromfile(folder / manifest["framesFile"], dtype=np.uint8).reshape(
        (count, manifest["characterHeight"], manifest["characterWidth"]))
    base = baseline(manifest["controls"])
    gif = encode_clip(manifest, manifest["frames"], pixels, base, output / "editor-preview.gif")
    if gif["durationMs"] != manifest["checks"]["durationMs"] or gif["frames"] < 100:
        raise ValueError("Main preview lost its complete production animation timeline")
    thinking_start = next(item["startMs"] for item in manifest["segments"] if item["phase"] == "thinking")
    still = next(i for i, info in enumerate(manifest["frames"])
                 if info["phase"] == "thinking" and info["atMs"] >= thinking_start + 1000)
    scene(base, pixels[still], manifest["frames"][still], manifest["palette"], manifest["transparentIndex"]).save(output / "editor-preview.png")
    comparison(manifest, folder, output)
    waiting = manifest["waiting"]
    waiting_pixels = np.fromfile(folder / waiting["framesFile"], dtype=np.uint8).reshape(
        (len(waiting["frames"]), manifest["characterHeight"], manifest["characterWidth"]))
    waiting_gif = encode_clip(manifest, waiting["frames"], waiting_pixels,
                              baseline(manifest["controls"], waiting=True), output / "waiting-preview.gif")
    if waiting_gif["frames"] < 30:
        raise ValueError("Waiting preview lost its wait, doze or startled motion")
    tail = tail_preview(manifest, folder, output)
    result = {"schemaVersion": 1, "passed": True, "notATerminalScreenshot": True,
              "frameGeneration": manifest["checks"], "sourceHashes": manifest["provenance"],
              "timeline": manifest["segments"], "gif": gif,
              "waiting": {"gif": waiting_gif, "timeline": waiting["segments"], "checks": waiting["checks"]},
              "tailWave": tail,
              "controls": manifest["controls"],
              "png": {"size": list(CANVAS), "phase": "thinking", "atMs": manifest["frames"][still]["atMs"]},
              "comparison": {"size": [1120, 1000], "styles": ["wumi", "wumi-pixel"], "poses": ["think", "talk-wide"], "pixelScale": "nearest-neighbor integer 4x"}}
    (output / "tests/motion-preview-validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"outputs": [str(output / name) for name in ("editor-preview.gif", "editor-preview.png", "style-comparison.png", "waiting-preview.gif", "tail-wave-preview.gif", "tail-wave-contact.png")],
                      "gif": gif, "waitingGif": waiting_gif, "tailWave": tail}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    main(args.input, args.output)
