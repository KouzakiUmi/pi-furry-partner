#!/usr/bin/env python3
"""Refresh only the two sleeping eye shadows with the final fixed palettes.

The runtime rest frame is shared by startup, waiting-doze and cancelled states.
Keep every other frame, all lids, gray brows, mouth, body and alpha unchanged.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
from build_wumi_reactions import blink, decode, rest_shadow_mask, rest_hair_mask
from build_waiting import quantize_fixed

ROOT = Path(__file__).resolve().parents[1]


def main():
    metadata = json.loads((ROOT / "assets/poses/metadata.json").read_text(encoding="utf-8"))
    base = Image.open(ROOT / "assets/poses/rest.png").convert("RGBA")
    revised = blink(base, metadata["poses"]["rest"]["eyes"])
    # Touch only the detached creases; the actual eyelid geometry is already
    # correct. This cannot regress the final pixel-mouth or other face rigs.
    mask = rest_shadow_mask(base.size)
    hair = rest_hair_mask(base.size)
    reports = []
    for style in ("wumi", "wumi-pixel"):
        directory = ROOT / "assets/reactions" / style
        path = directory / "reaction-sheet.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        frame = data["frames"][data["ids"]["rest"]]
        old = np.asarray(frame["pixels"], dtype=np.uint8)
        replacement = np.asarray(quantize_fixed(revised, data), dtype=np.uint8)
        coverage = np.asarray(mask.resize((data["width"], data["height"]), Image.Resampling.BOX)).reshape(-1) > 0
        protected = np.asarray(hair.resize((data["width"], data["height"]), Image.Resampling.BOX)).reshape(-1) > 0
        coverage[protected] = False
        result = old.copy()
        result[coverage] = replacement[coverage]
        assert np.array_equal(old == 0, result == 0), "Silhouette alpha changed"
        assert np.array_equal(old[~coverage], result[~coverage]), "Pixels outside the two crease patches changed"
        frame["pixels"] = result.tolist()
        changed = (old != result).reshape(data["height"], data["width"])
        ys, xs = np.where(changed)
        reports.append({"style": style, "changedPixels": int(changed.sum()),
                        "bounds": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None,
                        "otherFramesPaletteAndMotionUnchanged": True,
                        "eyelidsGrayBrowsMouthAndBodyUnchanged": True,
                        "alphaUnchanged": True})
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        decode(data, "rest").save(directory / "rest.png")
    report = {"passed": True, "method": "Authored clean-fur donor in two sleeping eye-crease masks; no repaint of real brows or lids", "styles": reports}
    (ROOT / "tests/rest-eye-shadow-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
