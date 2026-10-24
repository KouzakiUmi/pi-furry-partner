#!/usr/bin/env python3
"""Prepare the generated two-expression sheet for the local Pi companion.

Requires Pillow and numpy. No API/network calls are made. The supplied sheet is
the image-generation output; this script only crops, aligns, composites the
generated eyelid patch, rotates and exports reusable animation/frame assets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT / "assets" / "illustration"
HD_SIZE = 1024
NATIVE_SIZE = 300


def clean_alpha(image: Image.Image) -> Image.Image:
    rgba = np.array(image.convert("RGBA"))
    # The generator left a few invisible alpha 1..7 flecks outside the figure.
    # Preserve visible edge antialiasing; remove only these nearly invisible specks.
    rgba[rgba[:, :, 3] < 8] = (0, 0, 0, 0)
    return Image.fromarray(rgba)


def centroid(image: Image.Image, feature: str) -> tuple[float, float]:
    rgba = np.asarray(image)
    rgb = rgba[:, :, :3].astype(np.int16)
    height, width = rgba.shape[:2]
    y, x = np.indices((height, width))
    # Relative search windows deliberately target this supplied character sheet.
    if feature == "open-eye-star":
        mask = ((rgb[:, :, 0] > 210) & (rgb[:, :, 1] > 65) &
                (rgb[:, :, 1] < 200) & (rgb[:, :, 2] < 110) &
                (x > width * .28) & (x < width * .51) &
                (y > height * .39) & (y < height * .55))
    else:
        mask = ((rgb.max(axis=2) < 110) &
                (rgb.max(axis=2) - rgb.min(axis=2) < 30) &
                (x > width * .42) & (x < width * .52) &
                (y > height * .58) & (y < height * .63))
    mask &= rgba[:, :, 3] > 128
    yy, xx = np.where(mask)
    if len(xx) < 10:
        raise ValueError(f"Cannot locate {feature}; inspect sheet alignment first")
    return float(xx.mean()), float(yy.mean())


def normalized_poses(sheet: Image.Image):
    if sheet.width != sheet.height * 2:
        raise ValueError("Expected a two-column square-cell sprite sheet")
    side = sheet.height
    neutral = clean_alpha(sheet.crop((0, 0, side, side)))
    generated_wink = clean_alpha(sheet.crop((side, 0, side * 2, side)))
    features = ("open-eye-star", "nose")
    before = {key: {"neutral": centroid(neutral, key),
                    "wink": centroid(generated_wink, key)} for key in features}
    delta = np.mean([np.subtract(before[key]["neutral"], before[key]["wink"])
                     for key in features], axis=0)
    dx, dy = (int(round(value)) for value in delta)
    aligned_wink = Image.new("RGBA", (side, side))
    aligned_wink.alpha_composite(generated_wink, (dx, dy))

    # Keep the entire neutral silhouette, scarf, hair and other eye identical.
    # Composite only the generated right-eye expression after landmark alignment,
    # which removes pose/scale flicker between independently generated cells.
    patch_mask = Image.new("L", (side, side))
    draw = ImageDraw.Draw(patch_mask)
    draw.rounded_rectangle((side * .557, side * .383,
                            side * .764, side * .601), radius=side * .025, fill=255)
    patch_mask = patch_mask.filter(ImageFilter.GaussianBlur(side * .009))
    wink = Image.composite(aligned_wink, neutral, patch_mask)
    # Alpha and the outer contour must remain exactly the neutral pose's alpha.
    wink.putalpha(neutral.getchannel("A"))

    bbox = neutral.getbbox()
    cropped = neutral.crop(bbox)
    scale = 850 / max(cropped.size)
    size = tuple(int(round(value * scale)) for value in cropped.size)
    offset = ((HD_SIZE - size[0]) // 2, (HD_SIZE - size[1]) // 2)
    poses = []
    for pose in (neutral, wink):
        output = Image.new("RGBA", (HD_SIZE, HD_SIZE))
        output.alpha_composite(pose.crop(bbox).resize(size, Image.Resampling.LANCZOS), offset)
        poses.append(clean_alpha(output))
    after = {key: {"neutral": centroid(neutral, key),
                   "alignedWink": centroid(aligned_wink, key)} for key in features}
    return poses, {
        "sheetCellSize": side, "landmarksBefore": before,
        "winkTranslationPixels": [dx, dy], "landmarksAfter": after,
        "sourceAlphaBounds": list(bbox), "commonScale": scale,
        "commonOffset": list(offset), "commonResizedContentSize": list(size),
        "winkConstruction": "aligned generated eyelid patch over identical neutral silhouette",
    }


def master_palette(frames: list[Image.Image]) -> Image.Image:
    samples = []
    for frame in frames:
        rgba = np.asarray(frame)
        pixels = rgba[rgba[:, :, 3] >= 96, :3]
        samples.append(pixels[::3])
    rgb = np.concatenate(samples, axis=0)
    palette = Image.fromarray(rgb.reshape((-1, 1, 3))).quantize(
        colors=255, method=Image.Quantize.MEDIANCUT)
    colors = palette.getpalette()[:255 * 3]
    # Fixed-palette quantization considers all 256 entries. Make the spare entry
    # a duplicate of 254, then fold that duplicate back before reserving index 0.
    palette.putpalette(colors + colors[-3:])
    return palette


def indexed_frame(frame: Image.Image, palette: Image.Image) -> Image.Image:
    rgba = np.asarray(frame)
    mapped = np.asarray(frame.convert("RGB").quantize(
        palette=palette, dither=Image.Dither.NONE), dtype=np.uint16)
    mapped = np.minimum(mapped, 254)
    # Zero is ALWAYS transparent; all RGB palette colors begin at index one.
    indices = np.where(rgba[:, :, 3] >= 96, mapped + 1, 0).astype(np.uint8)
    result = Image.frombytes("P", frame.size, indices.tobytes())
    colors = palette.getpalette()[:255 * 3]
    result.putpalette(([0, 0, 0] + colors + [0] * 768)[:768])
    result.info["transparency"] = 0
    return result


def validate_gif(path: Path):
    with Image.open(path) as image:
        durations = []
        for i in range(image.n_frames):
            image.seek(i)
            durations.append(image.info.get("duration", 0))
        return {"size": list(image.size), "frames": image.n_frames,
                "durationMs": sum(durations), "loop": image.info.get("loop")}


def build(sheet_path: Path, output: Path, timeline_path: Path):
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(sheet_path).convert("RGBA")
    poses, alignment = normalized_poses(sheet)
    neutral, wink = poses
    neutral.save(output / "avatar.png")
    wink.save(output / "avatar-wink.png")
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    metadata = [{key: frame[key] for key in ("durationMs", "angleDeg", "wink")}
                for frame in timeline["frames"]]
    if len(metadata) != 15 or sum(frame["durationMs"] for frame in metadata) != 4800:
        raise ValueError("Expected the shared fifteen-frame, 4.8-second timeline")
    hd = [poses[bool(frame["wink"])].rotate(
        frame["angleDeg"], Image.Resampling.BICUBIC, expand=False,
        center=(HD_SIZE / 2, HD_SIZE / 2), fillcolor=(0, 0, 0, 0))
        for frame in metadata]
    native_rgba = [frame.resize((NATIVE_SIZE, NATIVE_SIZE), Image.Resampling.LANCZOS)
                   for frame in hd]
    palette = master_palette(native_rgba)
    native = [indexed_frame(frame, palette) for frame in native_rgba]
    transparency_matches = all(np.array_equal(
        np.asarray(indexed) == 0, np.asarray(rgba)[:, :, 3] < 96)
        for indexed, rgba in zip(native, native_rgba))
    rgb_palette = palette.getpalette()[:255 * 3]
    colors = [[0, 0, 0]] + [rgb_palette[i:i + 3] for i in range(0, len(rgb_palette), 3)]
    payload = {
        "schemaVersion": 1, "transparentIndex": 0,
        "width": NATIVE_SIZE, "height": NATIVE_SIZE,
        "loopDurationMs": 4800, "palette": colors,
        "frames": [{**frame, "pixels": np.asarray(indexed).reshape(-1).tolist()}
                   for frame, indexed in zip(metadata, native)],
    }
    (output / "native-frames.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    durations = [frame["durationMs"] for frame in metadata]
    hd[0].save(output / "avatar-loop.png", save_all=True, append_images=hd[1:],
               duration=durations, loop=0, disposal=0, blend=0)
    gif = [indexed_frame(frame, palette) for frame in hd]
    gif[0].save(output / "avatar-loop.gif", save_all=True, append_images=gif[1:],
                duration=durations, loop=0, disposal=2, transparency=0, optimize=False)
    contact = Image.new("RGBA", (HD_SIZE * 2, HD_SIZE))
    contact.alpha_composite(neutral)
    contact.alpha_composite(wink, (HD_SIZE, 0))
    contact.save(output / "avatar-contact-sheet.png")

    equal_alpha = np.array_equal(np.asarray(neutral)[:, :, 3], np.asarray(wink)[:, :, 3])
    clear_borders = []
    for frame in hd:
        alpha = np.asarray(frame)[:, :, 3]
        clear_borders.append(not (alpha[0].any() or alpha[-1].any() or
                                  alpha[:, 0].any() or alpha[:, -1].any()))
    gif_report = validate_gif(output / "avatar-loop.gif")
    apng_report = validate_gif(output / "avatar-loop.png")
    report = {
        "sourceSheet": str(sheet_path.resolve()), "sheetSize": list(sheet.size),
        "sheetAlphaExtrema": list(sheet.getchannel("A").getextrema()),
        "posesSize": [HD_SIZE, HD_SIZE], "poseAlphaBounds": [list(pose.getbbox()) for pose in poses],
        "posesHaveIdenticalAlpha": equal_alpha, "allRotatedFrameBordersTransparent": all(clear_borders),
        "nativeSize": [NATIVE_SIZE, NATIVE_SIZE], "paletteSize": len(colors), "transparentIndex": 0,
        "nativeTransparencyMatchesAlpha": transparency_matches,
        "nativeFrames": len(payload["frames"]), "loopDurationMs": 4800,
        "nativePixelsPerFrame": NATIVE_SIZE ** 2, "gif": gif_report,
        "apng": apng_report, "alignment": alignment,
    }
    if not equal_alpha or not all(clear_borders) or not transparency_matches:
        raise ValueError("Pose contour mismatch or clipped rotation")
    for export in (gif_report, apng_report):
        if export["frames"] != 15 or export["durationMs"] != 4800:
            raise ValueError("Animation export changed the shared timeline")
    if len(colors) > 256 or any(max(frame["pixels"]) >= len(colors) for frame in payload["frames"]):
        raise ValueError("Invalid palette indices")
    (output / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "alignment"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, default=DEFAULT_OUTPUT / "sprite-sheet.png")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeline", type=Path, default=PROJECT / "assets" / "native-frames.json")
    args = parser.parse_args()
    build(args.sheet, args.output, args.timeline)
