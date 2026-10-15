#!/usr/bin/env python3
"""Build the supplied pixel portrait's transparent wink animation.

Requires Pillow and numpy: python -m pip install Pillow numpy
Run from any directory.  All image edits are deterministic, local code.
The eye coordinates below intentionally target this particular 100 x 100 artwork.
"""

from __future__ import annotations

import argparse
from collections import Counter, deque
import json
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFont


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = PROJECT / "assets" / "source-original.png"
GRID = 100
VARIANTS = {"small": 24, "compact": 32, "normal": 40, "large": 52}
# A long rest, a clockwise head tilt, one wink, and a soft return: 4.8 s.
TIMELINE = [
    (0, False, 2200),
    (-1, False, 100), (-2, False, 100), (-3, False, 100),
    (-4, False, 100), (-5, False, 100), (-6, False, 80),
    (-6, True, 700), (-6, False, 120),
    (-5, False, 100), (-4, False, 100), (-3, False, 100),
    (-2, False, 100), (-1, False, 100), (0, False, 700),
]


def remove_connected_background(image: Image.Image, tolerance: int = 8):
    """Remove only near-background pixels reachable from the image boundary.

    This protects similarly colored interior art.  The eight-level tolerance
    includes the source's few near-identical edge pixels without softening its
    intentionally hard pixel edges. RGB is zeroed wherever alpha is zero.
    """
    data = np.array(image.convert("RGBA"), dtype=np.uint8)
    height, width = data.shape[:2]
    corners = [tuple(data[y, x, :3]) for x, y in
               [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]]
    background = np.asarray(Counter(corners).most_common(1)[0][0], dtype=np.int16)
    candidates = np.max(np.abs(data[:, :, :3].astype(np.int16) - background), axis=2) <= tolerance
    removed = np.zeros((height, width), dtype=bool)
    pending = deque()

    def add(x, y):
        if candidates[y, x] and not removed[y, x]:
            removed[y, x] = True
            pending.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(1, height - 1):
        add(0, y)
        add(width - 1, y)
    while pending:
        x, y = pending.popleft()
        if x > 0:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y > 0:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)

    data[removed] = (0, 0, 0, 0)
    return Image.fromarray(data), {
        "backgroundRgb": [int(v) for v in background],
        "removedPixels": int(removed.sum()),
        "removedFraction": round(float(removed.mean()), 6),
        "tolerance": tolerance,
    }


def make_wink(normal: Image.Image) -> Image.Image:
    """Replace the whole viewer-right eye, including its open upper contour."""
    scale = normal.width // GRID
    if normal.width != normal.height or normal.width % GRID:
        raise ValueError("This source must be square with a size divisible by 100.")
    rgba = np.array(normal.convert("RGBA"))
    # The dark arch above the iris belongs to the OPEN eye, not an eyebrow.
    # Clear the complete eye socket, protecting the lavender fringe, slate hood
    # edge and coral blush. Filling only the iris used to leave two eyelids.
    region = rgba[38 * scale:55 * scale, 52 * scale:67 * scale]
    protected = np.zeros(region.shape[:2], dtype=bool)
    for color in ((192, 188, 206), (87, 104, 124), (229, 134, 125)):
        protected |= np.all(region[:, :, :3] == color, axis=2)
    clear = ~protected & (region[:, :, 3] > 0)
    region[clear, :3] = (255, 255, 255)
    wink = Image.fromarray(rgba)
    draw = ImageDraw.Draw(wink)
    # Keep the original stepped closed eyelid at the same eye-line position.
    eyelid = {
        (54, 51), (55, 50), (56, 49), (57, 49), (58, 49),
        (59, 50), (60, 51), (55, 51), (56, 50), (57, 50),
        (58, 50), (59, 51), (60, 52), (61, 50),
    }
    for x, y in sorted(eyelid):
        draw.rectangle((x * scale, y * scale, (x + 1) * scale - 1,
                        (y + 1) * scale - 1), fill=(47, 58, 60, 255))
    return wink


def make_frames(normal: Image.Image, wink: Image.Image):
    native = {
        False: normal.resize((GRID, GRID), Image.Resampling.NEAREST),
        True: wink.resize((GRID, GRID), Image.Resampling.NEAREST),
    }
    return [native[closed].rotate(angle, Image.Resampling.NEAREST,
                                 expand=False, center=(50, 50),
                                 fillcolor=(0, 0, 0, 0))
            for angle, closed, _ in TIMELINE]


def make_palette(frames):
    # A single exact palette means terminals and both animation formats agree.
    opaque = sorted({tuple(pixel[:3]) for frame in frames
                     for pixel in np.asarray(frame).reshape(-1, 4)
                     if pixel[3] > 0})
    palette = [[0, 0, 0]] + [[int(c) for c in pixel] for pixel in opaque]
    if len(palette) > 256:
        raise ValueError("Exact GIF palette exceeds 256 colors.")
    return palette


def indices_for(frame, palette_index):
    data = np.asarray(frame)
    return [0 if px[3] == 0 else palette_index[tuple(px[:3])]
            for px in data.reshape(-1, 4)]


def save_animations(frames, palette, out, render_size=600, stem="avatar-loop"):
    durations = [duration for _, _, duration in TIMELINE]
    preview = [frame.resize((render_size, render_size), Image.Resampling.NEAREST) for frame in frames]
    # APNG uses full replacement and clears the canvas between frames.
    # GIF disposal=2 clears the previous frame to transparency; neither
    # format leaves moving-edge trails on a transparent background.
    preview[0].save(out / f"{stem}.png", save_all=True,
                    append_images=preview[1:], duration=durations, loop=0,
                    disposal=1, blend=0, optimize=False)
    palette_index = {tuple(rgb): i for i, rgb in enumerate(palette)}
    flat_palette = [c for rgb in palette for c in rgb]
    flat_palette.extend([0] * (768 - len(flat_palette)))
    gifs = []
    for frame in preview:
        indexed = Image.new("P", frame.size, color=0)
        indexed.putpalette(flat_palette)
        indexed.putdata(indices_for(frame, palette_index))
        indexed.info["transparency"] = 0
        gifs.append(indexed)
    gifs[0].save(out / f"{stem}.gif", save_all=True,
                 append_images=gifs[1:], duration=durations, loop=0,
                 transparency=0, background=0, disposal=2, optimize=False)


def terminal_data(frames, palette):
    index = {tuple(rgb): i for i, rgb in enumerate(palette)}
    variants = {}
    for name, size in VARIANTS.items():
        variants[name] = {
            "width": size,
            "height": size,
            "frames": [
                {"durationMs": duration, "angleDeg": angle, "wink": closed,
                 "pixels": indices_for(frame.resize((size, size), Image.Resampling.NEAREST), index)}
                for frame, (angle, closed, duration) in zip(frames, TIMELINE)
            ],
        }
    return {"schemaVersion": 1, "transparentIndex": 0, "loopDurationMs": sum(t[2] for t in TIMELINE),
            "palette": palette, "variants": variants}


def save_native_frames(frames, palette, out):
    """Retain all 100 x 100 artwork pixels for terminal image protocols.

    These frames must not pass through the compact 24/32/40/52 character art.
    Sixel/Kitty/iTerm2 renderers can enlarge each native pixel by an integer
    factor with nearest-neighbor sampling without losing the original detail.
    """
    index = {tuple(rgb): i for i, rgb in enumerate(palette)}
    data = {
        "schemaVersion": 1,
        "transparentIndex": 0,
        "width": GRID,
        "height": GRID,
        "loopDurationMs": sum(t[2] for t in TIMELINE),
        "palette": palette,
        "frames": [
            {"durationMs": duration, "angleDeg": angle, "wink": closed,
             "pixels": indices_for(frame, index)}
            for frame, (angle, closed, duration) in zip(frames, TIMELINE)
        ],
    }
    (out / "native-frames.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    frame_dir = out / "hd-frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for number, frame in enumerate(frames):
        frame.resize((400, 400), Image.Resampling.NEAREST).save(frame_dir / f"frame-{number:02d}.png")
    return data


def checkerboard(size, cell=20):
    result = Image.new("RGB", size, "#edf0f6")
    draw = ImageDraw.Draw(result)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#d4dbe8")
    return result


def save_contact_sheet(normal, wink, frames, out):
    samples = [("Transparent original", normal), ("Wink eyelid", wink),
               ("Tilt + wink (-6 deg)", frames[7])]
    sheet = Image.new("RGB", (1120, 470), "#101827")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 19)
        small_font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 14)
    except OSError:
        font = small_font = ImageFont.load_default()
    for column, (label, sample) in enumerate(samples):
        x = 20 + column * 370
        bg = checkerboard((340, 340))
        bg.paste(sample.resize((340, 340), Image.Resampling.NEAREST), (0, 0),
                 sample.resize((340, 340), Image.Resampling.NEAREST))
        sheet.paste(bg, (x, 52))
        draw.text((x, 18), label, fill="#dfe8ff", font=font)
    draw.text((20, 414), "Code-generated / nearest-neighbor / transparent alpha / 4.8 s loop",
              fill="#8ba7d7", font=small_font)
    draw.text((20, 439), "Terminal: small 24x24, compact 32x32, normal 40x40, large 52x52",
              fill="#8ba7d7", font=small_font)
    sheet.save(out / "avatar-contact-sheet.png")


def verify(normal, wink, frames, data, native_data, out, removal):
    alpha = np.asarray(normal)[:, :, 3]
    before, after = np.asarray(normal), np.asarray(wink)
    changed = np.any(before != after, axis=2)
    ys, xs = np.where(changed)
    report = {
        "sourceSize": list(normal.size),
        "nativeGrid": [GRID, GRID],
        "backgroundRemoval": removal,
        "alphaValues": [int(v) for v in np.unique(alpha)],
        "opaqueBoundingBox": list(normal.getbbox()),
        "winkChangedBoundingBox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "loopDurationMs": data["loopDurationMs"],
        "frameCount": len(frames),
        "paletteColorCountIncludingTransparency": len(data["palette"]),
        "variants": {},
        "exports": {},
    }
    assert set(np.unique(alpha)) == {0, 255}, "Unexpected alpha softening."
    scale = normal.width // GRID
    assert np.array_equal(before[:, :, 3], after[:, :, 3]), "Wink changed transparency."
    eye_socket = np.zeros(before.shape[:2], dtype=bool)
    eye_socket[38 * scale:55 * scale, 52 * scale:67 * scale] = True
    assert not changed[~eye_socket].any(), "Wink modified artwork outside the right eye socket."
    for color in ((192, 188, 206), (87, 104, 124), (229, 134, 125)):
        protected = np.all(before[:, :, :3] == color, axis=2)
        assert np.array_equal(before[protected], after[protected]), "Wink modified fringe/hood/blush."
    upper = after[38 * scale:49 * scale, 52 * scale:67 * scale, :3]
    assert not np.all(upper == (47, 58, 60), axis=2).any(), "Open-eye upper contour remains."
    report["wholeEyeSocketCleaned"] = True
    report["fringeHoodBlushAndAlphaPreserved"] = True
    for name, variant in data["variants"].items():
        expected = variant["width"] * variant["height"]
        assert all(len(frame["pixels"]) == expected for frame in variant["frames"])
        assert all(0 <= p < len(data["palette"]) for frame in variant["frames"] for p in frame["pixels"])
        report["variants"][name] = {"width": variant["width"], "height": variant["height"],
                                     "terminalRowsUsingHalfBlocks": variant["height"] // 2}
    assert native_data["width"] == GRID and native_data["height"] == GRID
    assert len(native_data["frames"]) == len(frames)
    assert sum(frame["durationMs"] for frame in native_data["frames"]) == data["loopDurationMs"]
    for number, (frame, indexed_frame) in enumerate(zip(frames, native_data["frames"])):
        assert len(indexed_frame["pixels"]) == GRID * GRID
        decoded = np.zeros((GRID * GRID, 4), dtype=np.uint8)
        for offset, palette_id in enumerate(indexed_frame["pixels"]):
            if palette_id:
                decoded[offset] = [*native_data["palette"][palette_id], 255]
        assert np.array_equal(decoded.reshape(GRID, GRID, 4), np.asarray(frame)), f"native JSON differs on frame {number}"
        with Image.open(out / "hd-frames" / f"frame-{number:02d}.png") as saved_frame:
            assert saved_frame.size == (400, 400) and saved_frame.mode == "RGBA"
            assert np.array_equal(np.asarray(saved_frame), np.asarray(frame.resize((400, 400), Image.Resampling.NEAREST)))
    report["nativeFrames"] = {"filename": "native-frames.json", "width": GRID, "height": GRID,
                              "frameCount": len(frames), "decodedPixelsMatchGeneratedFrames": True,
                              "pngDirectory": "hd-frames", "pngSize": [400, 400],
                              "pngPixelsMatchGeneratedFrames": True}
    for filename in ["avatar-loop.gif", "avatar-loop.png", "avatar-loop-hd.gif", "avatar-loop-hd.png"]:
        with Image.open(out / filename) as animation:
            frame_info = []
            for i, expected in enumerate(frames):
                animation.seek(i)
                rgba = animation.convert("RGBA")
                expected = expected.resize(animation.size, Image.Resampling.NEAREST)
                # Transparent RGB is irrelevant; alpha and all visible RGB must
                # match exactly, verifying GIF disposal has no trails.
                actual_pixels, expected_pixels = np.asarray(rgba), np.asarray(expected)
                assert np.array_equal(actual_pixels[:, :, 3], expected_pixels[:, :, 3]), f"{filename} alpha differs on frame {i}"
                visible = expected_pixels[:, :, 3] > 0
                assert np.array_equal(actual_pixels[visible], expected_pixels[visible]), f"{filename} color differs on frame {i}"
                frame_info.append({"durationMs": int(animation.info["duration"]), "bbox": list(rgba.getbbox())})
            assert animation.n_frames == len(frames)
            assert sum(f["durationMs"] for f in frame_info) == data["loopDurationMs"]
            report["exports"][filename] = {"size": list(animation.size), "frameCount": animation.n_frames,
                                           "loop": animation.info.get("loop"), "frames": frame_info,
                                           "decodedPixelsMatchGeneratedFrames": True}
    (out / "avatar-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=PROJECT / "assets")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if not args.source.is_file():
        parser.error(f"Source does not exist: {args.source}")
    source_copy = args.out / "source-original.png"
    if args.source.resolve() != source_copy.resolve():
        shutil.copy2(args.source, source_copy)
    with Image.open(args.source) as source:
        normal, removal = remove_connected_background(source)
    wink = make_wink(normal)
    normal.save(args.out / "avatar.png")
    wink.save(args.out / "avatar-wink.png")
    frames = make_frames(normal, wink)
    palette = make_palette(frames)
    save_animations(frames, palette, args.out)
    save_animations(frames, palette, args.out, render_size=1000, stem="avatar-loop-hd")
    data = terminal_data(frames, palette)
    (args.out / "terminal-frames.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    native_data = save_native_frames(frames, palette, args.out)
    save_contact_sheet(normal, wink, frames, args.out)
    report = verify(normal, wink, frames, data, native_data, args.out, removal)
    print(json.dumps({"output": str(args.out.resolve()), "validation": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
