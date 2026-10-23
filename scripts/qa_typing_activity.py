"""Fixed-ROI RGB-motion diagnostics; never typing/anatomy/loop approval.

Usage: python scripts/qa_typing_activity.py JOB [--processed processed]
Reads raw decoded PNGs and source fps/PTS from that processing manifest. Writes
only JOB/qa-paw-activity.json. No media processing, fitting, generation or API.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


# Anatomical labels are deliberately avoided: left/right mean IMAGE sides.
# Calibrated once against v4compact raw 00073.png (768x768), not per frame.
ROIS = {"imageLeft": (0.27, 0.74, 0.46, 0.81),
        "imageRight": (0.54, 0.74, 0.72, 0.81)}
PIXEL_CHANGE_THRESHOLD = 3.0  # mean absolute RGB delta, in 8-bit units


def summarize(pairs):
    if not pairs:
        return {"pairCount": 0, "medianMeanAbsoluteRgbDelta": None,
                "meanAbsoluteRgbDelta": None, "medianChangedPixelFraction": None}
    return {
        "pairCount": len(pairs),
        "medianMeanAbsoluteRgbDelta": float(np.median([p["meanAbsoluteRgbDelta"] for p in pairs])),
        "meanAbsoluteRgbDelta": float(np.mean([p["meanAbsoluteRgbDelta"] for p in pairs])),
        "medianChangedPixelFraction": float(np.median([p["changedPixelFraction"] for p in pairs])),
    }


def analyze(job, processed="processed", fps_override=None):
    job = Path(job).resolve()
    folder = (job / processed).resolve()
    if not folder.is_relative_to(job):
        raise ValueError("processed directory must be inside the job")
    frames = sorted((folder / "decoded").glob("*.png"))
    if len(frames) < 3:
        raise ValueError("Need at least three raw decoded PNGs")
    # Refuse lexicographic surprises, missing frames and accidental frame subsets.
    indices = [int(p.stem) for p in frames]
    if indices != list(range(len(frames))):
        raise ValueError("decoded frame names must be zero-based contiguous indices")
    manifest_file = folder / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {}
    source = manifest.get("source", {})
    fps = fps_override if fps_override is not None else source.get("fps")
    if not isinstance(fps, (float, int)) or isinstance(fps, bool) or not math.isfinite(fps) or fps <= 0:
        raise ValueError("Measured source fps required: manifest.source.fps or explicit --fps; never assume canonical fps")
    pts = manifest.get("sampling", {}).get("sourcePtsSeconds", [])
    pts_valid = (len(pts) == len(frames) and all(isinstance(v, (int, float)) and math.isfinite(v) for v in pts)
                 and all(b > a for a, b in zip(pts, pts[1:])))
    if pts_valid:
        times = np.asarray(pts, dtype=float)
        timing_basis = "source PTS from processing manifest"
    else:
        times = np.arange(len(frames), dtype=float) / fps
        timing_basis = "constant-rate approximation from measured source fps; source PTS unavailable/mismatched"
    times -= times[0]
    duration = float(times[-1] + np.median(np.diff(times)))
    baseline_start, baseline_end = max(0.5, duration * 0.2), min(duration - 1, duration * 0.7)
    if baseline_end <= baseline_start:
        raise ValueError("Source too short for a separate middle baseline and final-second comparison")
    with Image.open(frames[0]) as first:
        width, height = first.size
    boxes = {side: (math.floor(x0*width), math.floor(y0*height), math.ceil(x1*width), math.ceil(y1*height))
             for side, (x0, y0, x1, y1) in ROIS.items()}
    previous, measurements = None, {side: [] for side in ROIS}
    for i, frame in enumerate(frames):
        with Image.open(frame) as image:
            if image.size != (width, height):
                raise ValueError(f"Raw frame dimensions changed at {frame.name}")
            rgb = image.convert("RGB")
            current = {side: np.asarray(rgb.crop(box), dtype=np.float32) for side, box in boxes.items()}
        if previous is not None:
            for side in ROIS:
                delta = np.abs(current[side] - previous[side]).mean(axis=2)
                measurements[side].append({
                    "fromFrame": i-1, "toFrame": i, "atSeconds": float(times[i]),
                    "pairIntervalSeconds": float(times[i]-times[i-1]),
                    "meanAbsoluteRgbDelta": float(delta.mean()),
                    "changedPixelFraction": float(np.mean(delta > PIXEL_CHANGE_THRESHOLD)),
                })
        previous = current
    output = {
        "schemaVersion": 1, "diagnosticOnly": True,
        "status": "DIAGNOSTIC_ONLY_NO_AUTOMATIC_PASS", "job": str(job),
        "rawDecodedDirectory": str(folder / "decoded"), "frameCount": len(frames),
        "canvas": [width, height], "sourceFps": fps, "sourceMetadata": source,
        "fpsOrigin": "explicit measured override" if fps_override is not None else "manifest.source.fps",
        "timingBasis": timing_basis, "durationSeconds": duration,
        "manifestSha256": hashlib.sha256(manifest_file.read_bytes()).hexdigest() if manifest_file.exists() else None,
        "windowSeconds": 0.5, "pixelChangeThresholdRgb8": PIXEL_CHANGE_THRESHOLD,
        "middleBaselineSeconds": [baseline_start, baseline_end],
        "lastSecondSeconds": [max(0, duration-1), duration],
        "roiCalibration": "Fixed once against v4compact raw 00073.png; image-side toe/key regions, no fitting/tracking/registration",
        "rois": {}, "warnings": [],
        "limitations": [
            "RGB change measures motion/appearance only: cannot identify typing, correct contact, global acting or anatomy.",
            "Compression, moving light, torso/paw drift and keyboard movement can raise activity without toe presses.",
            "A fixed ROI can miss a moving toe; visually confirm applicability for each differently framed source.",
            "Low motion may be intentional. Warning thresholds are heuristics, never automatic rejection or acceptance.",
            "Adjacent-pair deltas depend on source timing; inspect pair intervals before comparing different videos.",
            "Loop seam is not measured; full chronological and normal-speed human review remains required.",
        ],
    }
    for side, pairs in measurements.items():
        middle = summarize([p for p in pairs if baseline_start <= p["atSeconds"] < baseline_end])
        ending = summarize([p for p in pairs if duration-1 <= p["atSeconds"] < duration])
        windows = []
        for n in range(math.ceil(duration / 0.5)):
            start, end = n*0.5, min((n+1)*0.5, duration)
            windows.append({"startSeconds": start, "endSeconds": end,
                            **summarize([p for p in pairs if start <= p["atSeconds"] < end])})
        baseline = middle["medianMeanAbsoluteRgbDelta"]
        last = ending["medianMeanAbsoluteRgbDelta"]
        ratio = last / baseline if baseline is not None and baseline > 1e-9 else None
        warning = None
        if baseline is None or baseline < 0.5:
            warning = "LOW_BASELINE_MOTION_COMPARISON_UNRELIABLE"
        elif last is not None and last <= max(0.5, baseline*0.2) and ending["medianChangedPixelFraction"] <= max(0.02, middle["medianChangedPixelFraction"]*0.25):
            warning = "NEAR_FREEZE_WARNING_DIAGNOSTIC_ONLY"
        if warning:
            output["warnings"].append({"roi": side, "warning": warning})
        output["rois"][side] = {
            "normalizedBox": ROIS[side], "pixelBoxExclusive": boxes[side],
            "middleBaseline": middle, "lastSecond": ending,
            "lastToMiddleMedianDeltaRatio": ratio, "warning": warning,
            "windows": windows, "perFramePairs": pairs,
        }
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job", type=Path)
    parser.add_argument("--processed", default="processed")
    parser.add_argument("--fps", type=float, help="Measured source fps only, if source manifest is unavailable")
    args = parser.parse_args()
    report = analyze(args.job, args.processed, args.fps)
    destination = args.job.resolve() / "qa-paw-activity.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print(json.dumps({"report": str(destination), "diagnosticOnly": True,
                      "warnings": report["warnings"], "rois": {
                          side: {"middle": data["middleBaseline"], "lastSecond": data["lastSecond"],
                                 "lastToMiddleRatio": data["lastToMiddleMedianDeltaRatio"]}
                          for side, data in report["rois"].items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
