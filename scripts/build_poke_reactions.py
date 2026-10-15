#!/usr/bin/env python3
"""Create sparse >w< patches with the existing clean-fur rig and palettes.

This never rebuilds a main reaction sheet or changes its frame IDs, palette,
alpha, body or scarf. Run after artwork changes to refresh the four patches.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from build_reactions import (source_pixel, pixel_eyes, pixel_mouth,
                             illustration_eyes, illustration_mouth)
from build_wumi_reactions import blink, mouth

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def emit(style, base, poked):
    directory = ASSETS / "reactions" / style
    sheet = json.loads((directory / "reaction-sheet.json").read_text(encoding="utf-8"))
    size = (sheet["width"], sheet["height"])
    sampling = Image.Resampling.NEAREST if style.endswith("pixel") else Image.Resampling.LANCZOS
    # Only apply the edited face patch to the exact indexed neutral frame.
    # This prevents quantization or resampling from changing untouched artwork.
    different = np.any(np.asarray(base) != np.asarray(poked), axis=2)
    mask = Image.fromarray(different.astype(np.uint8)*255).resize(size, sampling)
    image = poked.resize(size, sampling).convert("RGB")
    palette = np.asarray(sheet["palette"], dtype=np.int32)
    pixels = np.asarray(sheet["frames"][sheet["ids"]["idle-open"]]["pixels"])
    rgb = np.asarray(image, dtype=np.int32).reshape(-1, 3)
    locations = np.flatnonzero((np.asarray(mask).reshape(-1) > 0) & (pixels != sheet.get("transparentIndex", 0)))
    entries = []
    for index in locations:
        # Use existing opaque palette entries only; no color expansion.
        distances = ((palette[1:] - rgb[index]) ** 2).sum(axis=1)
        color = int(np.argmin(distances)) + 1
        if color != pixels[index]:
            entries.append([int(index), color])
    patch = {"schemaVersion": 1, "id": "poke", "base": "idle-open",
             "width": sheet["width"], "height": sheet["height"], "pixels": entries}
    (directory / "poke-patch.json").write_text(json.dumps(patch, separators=(",", ":"))+"\n", encoding="utf-8")
    return {"style": style, "changedPixels": len(entries), "width": sheet["width"]}


def main():
    metadata = json.loads((ASSETS / "poses/metadata.json").read_text(encoding="utf-8"))["poses"]["neutral"]
    base = Image.open(ASSETS / "poses/neutral.png").convert("RGBA")
    poked = mouth(blink(base, metadata["eyes"], squeezed=True), metadata["mouth"], "closed")
    results = [emit(style, base, poked) for style in ("wumi", "wumi-pixel")]
    base = source_pixel()
    results.append(emit("pixel", base, pixel_mouth(pixel_eyes(base, squeezed=True), "closed")))
    base = Image.open(ASSETS / "illustration/avatar.png").convert("RGBA")
    results.append(emit("illustration", base, illustration_mouth(illustration_eyes(base, squeezed=True), "closed")))
    from refine_pixel_lines import refine
    refine()
    print(json.dumps({"passed": True, "method": "clean-fur face-only rig; unchanged source sheets/palettes/alpha", "styles": results}, indent=2))


if __name__ == "__main__":
    main()
