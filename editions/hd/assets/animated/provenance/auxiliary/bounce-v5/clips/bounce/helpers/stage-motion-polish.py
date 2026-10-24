#!/usr/bin/env python3
"""Create a NEW, isolated motion-polish build checkout; never installs/releases.

python tools/stage-motion-polish.py --stage-root work/motion-polish-stage \
    --version 2.5.1-preview.1

The approved selection is an explicit input to this one-time staging operation.
Generated packages subsequently use canonical assets/provenance in the stage,
not the generation jobs, another worktree, or historical work directories.
Existing destinations are always refused, including empty directories. A failed
stage is preserved for diagnosis; this tool never deletes a directory.
"""
from array import array
import argparse
import copy
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import struct
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANIMATED = ROOT / "assets/animated"
COPY_FOLDERS = ("lib", "scripts", "tools", "assets", "tests", "build", "docs", "prompts", "themes")
PROVENANCE = "provenance/motion-polish"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical(value) + b"\n")


def local(root, name):
    require(isinstance(name, str) and name and not Path(name).is_absolute(), f"Expected relative path: {name}")
    path = (root / name).resolve()
    require(path.is_relative_to(root.resolve()), f"Path escapes root: {name}")
    return path


def checked(path, expected):
    require(path.is_file() and file_sha(path) == expected, f"Missing/hash mismatch: {path}")
    return path


def rgba(path):
    with Image.open(path) as image:
        return image.convert("RGBA")


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def decode_indexed(path):
    data = gzip.decompress(path.read_bytes())
    require(data[:8] == b"UMIIDX01", f"Unknown binary: {path}")
    header_length, payload_length = struct.unpack_from("<II", data, 8)
    require(len(data) == 16 + header_length + payload_length, f"Invalid binary length: {path}")
    envelope = json.loads(data[16:16 + header_length])
    require(envelope["encoding"] in ("u8", "u16le"), f"Unknown pixel encoding: {path}")
    values = array("H" if envelope["encoding"] == "u16le" else "B")
    values.frombytes(data[16 + header_length:])
    if values.itemsize == 2 and sys.byteorder != "little":
        values.byteswap()
    raw = envelope["data"]
    count = raw["width"] * raw["height"]
    require(len(values) == count * len(raw["frames"]), f"Bad pixel count: {path}")
    for index, frame in enumerate(raw["frames"]):
        frame["pixels"] = values[index * count:(index + 1) * count].tolist()
    return raw


def safe_destination(path):
    stage = path.resolve()
    require(stage != ROOT and not ROOT.is_relative_to(stage), "Stage cannot be the repository or an ancestor")
    require(not stage.exists() and not stage.is_symlink(), "Refusing an existing stage destination")
    for folder in COPY_FOLDERS:
        require(not stage.is_relative_to((ROOT / folder).resolve()), f"Stage cannot be inside copied {folder}/")
    return stage


def preflight(selection_path):
    selection = read(selection_path)
    catalog_path = ANIMATED / "catalog.json"
    checked(catalog_path, selection["formalCatalogSha256"])
    catalog = read(catalog_path)
    require(selection.get("status") == "APPROVED_19_CLIP_SELECTION_READY_FOR_TWO_PLATFORM_STAGING", "Selection is not closed/approved")
    require(set(selection["clips"]) == set(catalog["clips"]) and len(catalog["clips"]) == 19, "Expected the complete 19-clip selection")
    require(catalog["logicalCanvas"] == {"width": 640, "height": 640} and catalog["anchor"] == [320, 608], "Unexpected logical world")
    plans = {}
    for action, choice in selection["clips"].items():
        require(re.fullmatch(r"[a-z][a-z-]*", action), f"Unsafe clip id: {action}")
        old = catalog["clips"][action]
        require(set(old["indexed"]) == {"umi", "illustration"}, f"Unexpected/pixel styles: {action}")
        require(old["indexed"]["umi"]["file"] == old["indexed"]["illustration"]["file"], f"Broken alias: {action}")
        indexed_path = local(ANIMATED, old["indexed"]["umi"]["file"])
        checked(indexed_path, old["indexed"]["umi"]["sha256"])
        baseline = decode_indexed(indexed_path)
        require(baseline["revision"] == catalog["revision"], f"Mixed revision: {action}")
        # Keep palettes, not nineteen Python pixel lists, alive during preflight.
        plan = {"choice": choice, "old": old, "baseline": {"palette": baseline["palette"]}, "indexedPath": indexed_path}
        if choice["selection"] == "retain-formal":
            require(sha(canonical(old)) == choice["formalClipSnapshotSha256"], f"Retained clip changed: {action}")
            require(old["qa"]["sourceVideoSha256"] == choice["sourceVideoSha256"], f"Wrong retained source: {action}")
            for frame in old["hires"]["frames"]:
                checked(local(ANIMATED, old["hires"]["baseUrl"] + frame["file"]), frame["webpSha256"])
        else:
            require(choice["selection"] == "approved-new" and choice.get("technicalCloseoutPending") is False, f"Unapproved selection: {action}")
            job = local(ROOT, choice["job"])
            processed = local(job, choice["processedVariant"])
            manifest_path = checked(processed / "manifest.json", choice["processedManifestSha256"])
            manifest = read(manifest_path)
            approval_path = checked(job / "user-approval.json", choice["userApprovalSha256"])
            approval = read(approval_path)
            require(approval.get("humanAccepted") is True, f"Missing human acting acceptance: {action}")
            source = checked(job / Path(manifest["source"]["file"]).name, choice["sourceVideoSha256"])
            require(manifest["source"]["sha256"] == choice["sourceVideoSha256"], f"Manifest source mismatch: {action}")
            technical = None
            if choice.get("technicalApprovalFile"):
                technical = checked(local(ROOT, choice["technicalApprovalFile"]), choice["technicalUserApprovalSha256"])
                decision = read(technical)
                require(decision.get("humanAccepted") is True and decision["actions"][action]["manifestSha256"] == choice["processedManifestSha256"], f"Wrong technical approval: {action}")
            else:
                require(choice["processedManifestSha256"] in json.dumps(approval), f"Acting approval does not bind this output: {action}")
                require((approval.get("approvedProcessedVariant") or approval.get("processedVariant")) == choice["processedVariant"], f"Wrong approved variant: {action}")
            frames = manifest["frames"]
            require(len(frames) == choice["nativeFrames"] == 107 and manifest["fps"] == choice["fps"] == 24, f"Unexpected native sampling: {action}")
            require(manifest["periodMs"] == choice["periodMs"] == 4458, f"Unexpected native period: {action}")
            rect = choice["paintRect"]
            require(all(type(rect[k]) is int for k in ("x", "y", "width", "height")), f"Non-integer paint rect: {action}")
            require(manifest["canvas"] == [rect["width"], rect["height"]], f"Paint rect scales source: {action}")
            require([manifest["pivot"][0] + rect["x"], manifest["pivot"][1] + rect["y"]] == choice["worldAnchor"] == [320, 608], f"Anchor drift: {action}")
            require(manifest.get("processing", {}).get("transform", {}).get("perFrameFit") is False, f"Per-frame fit not explicitly disabled: {action}")
            sampling = manifest.get("sampling", {})
            require(not any(sampling.get(k, False) for k in ("reverse", "interpolation", "crossfade")) and sampling.get("timeScale", 1) == 1, f"Native timeline altered: {action}")
            previous = -1
            ids = set()
            for index, frame in enumerate(frames):
                require(frame["id"] not in ids and re.fullmatch(r"\d{3}", frame["id"]), f"Invalid frame id: {action}")
                require(frame["file"] == frame["id"] + ".png" and frame["sourceFrame"] == index, f"Unexpected source frame mapping: {action}")
                require(previous < frame["atMs"] < manifest["periodMs"] and (index != 0 or frame["atMs"] == 0), f"Invalid frame clock: {action}")
                ids.add(frame["id"])
                previous = frame["atMs"]
                png = checked(processed / "rgba" / frame["file"], frame["sha256"])
                webp = processed / "webp" / (frame["id"] + ".webp")
                image = rgba(png)
                require(list(image.size) == manifest["canvas"] and rgba(webp).tobytes() == image.tobytes(), f"PNG/WebP full RGBA mismatch: {action}/{frame['id']}")
            plan.update(job=job, processed=processed, manifest=manifest, approval=approval_path, technical=technical, source=source)
            if choice.get("stationaryOverlay"):
                overlay_record = choice["stationaryOverlay"]
                overlay = checked(local(ROOT, overlay_record["file"]), overlay_record["sha256"])
                require(action == "wait" and rect == {"x": -128, "y": -96, "width": 896, "height": 896} and rgba(overlay).size == (640, 640), "Unexpected fixed overlay registration")
                plan["overlay"] = overlay
        plans[action] = plan
    require(sum(v["choice"]["selection"] == "approved-new" for v in plans.values()) == 12, "Expected 12 new / 7 retained")
    return selection, catalog, plans


def copy_checkout(stage, new_ids, catalog):
    def ignore(directory, names):
        parent = Path(directory).resolve()
        skipped = {n for n in names if n in {"__pycache__", ".git", "node_modules"} or n.endswith((".pyc", ".log")) or (parent / n).is_symlink()}
        if parent == (ANIMATED / "hires").resolve():
            skipped.update(new_ids)
        elif parent == (ANIMATED / "indexed").resolve():
            skipped.update(set(names) - {"umi"})
        elif parent == (ANIMATED / "indexed/umi").resolve():
            expected = {Path(c["indexed"]["umi"]["file"]).name for c in catalog["clips"].values()}
            skipped.update(set(names) - expected)
        return skipped
    stage.mkdir(parents=True, exist_ok=False)
    for folder in COPY_FOLDERS:
        source = ROOT / folder
        if source.is_dir():
            shutil.copytree(source, stage / folder, ignore=ignore)
    for source in ROOT.iterdir():
        allowed_dotfile = source.name in {".gitignore", ".gitattributes"}
        if source.is_file() and not source.is_symlink() and (not source.name.startswith(".") or allowed_dotfile):
            shutil.copy2(source, stage / source.name)


def record_inputs(stage, action, plan):
    destination = stage / "assets/animated" / PROVENANCE / "clips" / action
    destination.mkdir(parents=True)
    sources = [(plan["source"], "source.mp4"), (plan["approval"], "user-approval.json"),
               (plan["processed"] / "manifest.json", "processed-manifest.json")]
    for name in ("reference.png", "registered-reference.png", "prompt.txt", "spec.json", "motion-contract.json", "input-preparation.json"):
        if (plan["job"] / name).exists():
            sources.append((plan["job"] / name, name))
    if plan["technical"]:
        sources.append((plan["technical"], "technical-user-approval.json"))
    if plan.get("overlay"):
        sources.append((plan["overlay"], "fixed-question-world.png"))
    # Preserve review/guard records, not videos or arbitrary historical trees.
    for directory, prefix in ((plan["job"], ""), (plan["processed"], "processed-")):
        for source in directory.glob("*.json"):
            if any(word in source.name for word in ("review", "report", "guard", "core")):
                sources.append((source, prefix + source.name))
    records = {}
    for source, name in sources:
        target = destination / name
        require(not target.exists(), f"Duplicate evidence filename: {name}")
        shutil.copy2(source, target)
        records[name] = {"path": target.relative_to(stage).as_posix(), "sha256": file_sha(target)}
    write(destination / "inputs.json", {"selection": plan["choice"], "records": records,
          "historicalPathsAreBuildDependencies": False})
    return records


def fixed_overlay(image, overlay):
    """Only nonzero-alpha approved world-overlay pixels may affect the source."""
    before = np.asarray(image)
    layer = Image.new("RGBA", image.size)
    layer.paste(overlay, (128, 96))
    active = np.asarray(layer.getchannel("A")) > 0
    composed = np.asarray(Image.alpha_composite(image, layer))
    output = before.copy()
    output[active] = composed[active]
    require(np.array_equal(output[~active], before[~active]), "Overlay changed unrelated source pixels")
    return Image.fromarray(output)


def world_frame(image, rect):
    # This is fixed transparent cropping/padding, never source fitting/resizing.
    world = Image.new("RGBA", (640, 640))
    world.paste(image, (rect["x"], rect["y"]))
    return world


def new_clip(stage, action, plan, revision, indexer):
    choice, manifest, old = plan["choice"], plan["manifest"], plan["old"]
    rect = choice["paintRect"]
    records = record_inputs(stage, action, plan)
    qa = {"accepted": True, "approvalEvidence": "motion-polish-exact-human-approved-selection",
          "manifestSha256": choice["processedManifestSha256"], "motionManifestSha256": choice["processedManifestSha256"],
          "sourceVideoSha256": choice["sourceVideoSha256"], "userApprovalSha256": choice["userApprovalSha256"],
          "perFrameFit": False, "worldScale": 1, "sourceCanvas": manifest["canvas"], "pivot": manifest["pivot"],
          "technicalUserApprovalSha256": choice.get("technicalUserApprovalSha256"),
          "inputRecord": {"file": f"{PROVENANCE}/clips/{action}/inputs.json",
                          "sha256": file_sha(stage / "assets/animated" / PROVENANCE / "clips" / action / "inputs.json")},
          "webpPolicy": "Exact approved full RGBA; fixed approved overlay only for wait; no artistic recolor"}
    clip = {"id": action, "family": old["family"], "loop": old["loop"], "periodMs": manifest["periodMs"],
            "frameCount": len(manifest["frames"]), "paintRect": copy.deepcopy(rect), "qa": qa,
            "hires": {"baseUrl": f"hires/{action}/", "frames": []}, "indexed": {}}
    raw = {"schemaVersion": 1, "clipId": action, "revision": revision, "width": 240, "height": 240,
           "frameCount": 54, "loop": clip["loop"], "periodMs": clip["periodMs"], "transparentIndex": 0,
           "palette": copy.deepcopy(plan["baseline"]["palette"]), "qa": copy.deepcopy(qa), "frames": [],
           "viewport": {"worldRect": [0, 0, 640, 640], "sourceScale": 1,
                        "policy": "Fixed approved paintRect in640world, then uniform240 derivative; no fit"}}
    overlay = rgba(plan["overlay"]) if plan.get("overlay") else None
    frame_evidence, sampling = [], []
    target = stage / "assets/animated/hires" / action
    target.mkdir(parents=True, exist_ok=False)
    for index, frame in enumerate(manifest["frames"]):
        png = plan["processed"] / "rgba" / frame["file"]
        original = rgba(png)
        image = fixed_overlay(original, overlay) if overlay is not None else original
        name = frame["id"] + ".webp"
        destination = target / name
        if overlay is None:
            shutil.copy2(plan["processed"] / "webp" / name, destination)
        else:
            image.save(destination, "WEBP", lossless=True, quality=100, method=4, exact=True)
        decoded = rgba(destination)
        require(decoded.size == image.size and decoded.tobytes() == image.tobytes(), f"Staged fullRGBA changed: {action}/{name}")
        rgba_sha, webp_sha = sha(image.tobytes()), file_sha(destination)
        asset = {"path": destination.relative_to(stage).as_posix(), "webpSha256": webp_sha, "decodedRgbaSha256": rgba_sha}
        clip["hires"]["frames"].append({"id": frame["id"], "file": name, "sourceFrame": frame["sourceFrame"],
            "atMs": frame["atMs"], "durationMs": frame.get("durationMs", (manifest["frames"][index + 1]["atMs"] if index + 1 < len(manifest["frames"]) else manifest["periodMs"]) - frame["atMs"]),
            "webpSha256": webp_sha, "decodedRgbaSha256": rgba_sha, "rgbaSha256": rgba_sha,
            "approvedPngSha256": frame["sha256"], "sourceAsset": asset})
        proof = {"id": frame["id"], "sourceFrame": frame["sourceFrame"], "atMs": frame["atMs"], "sourceDurationMs": frame.get("durationMs"),
                 "approvedPngSha256": frame["sha256"], "approvedPngDecodedRgbaSha256": sha(original.tobytes()),
                 "stagedWebpSha256": webp_sha, "stagedDecodedRgbaSha256": rgba_sha,
                 "pngWebpFullRgbaEqual": True, "directCopyApprovedWebp": overlay is None,
                 "pngWebpComparisonBaseline": "approvedPngRgba" if overlay is None else "approvedPngPlusFixedOverlayRgba",
                 "expectedPreparedRgbaSha256": rgba_sha}
        frame_evidence.append(proof)
        if index % 2 == 0:
            pixels = indexer.indexed(world_frame(image, rect), raw["palette"], 240, pixel=False)
            raw["frames"].append({"id": f"{len(raw['frames']):03}", "atMs": frame["atMs"],
                                  "sourceFrame": frame["sourceFrame"], "sourceIndex": index, "pixels": pixels})
            sampling.append({**proof, "sourceIndex": index, "indexedFrame": len(raw["frames"]) - 1,
                             "targetTickMs": index * 1000 / 24, "sourceAtMs": frame["atMs"]})
    require(len(raw["frames"]) == 54 and raw["frames"][-1]["sourceFrame"] == 106, "Lost native last pose")
    require({p.name for p in target.iterdir()} == {f["file"] for f in clip["hires"]["frames"]}, f"Stale HD frames: {action}")
    proof = {"selection": choice, "records": records, "paintRect": rect, "logicalWorld": [640, 640],
             "anchor": [320, 608], "hdFrames": frame_evidence, "indexedSampling": sampling,
             "samplingPolicy": "Native24fps every second frame0,2,...106; exact sourceatMs, original4458ms period; final41.333ms hold is legal. No retime/interpolation/forced endpoint.",
             "paletteSha256": sha(canonical(raw["palette"])), "opaqueSourceArtRecolored": False}
    if overlay is not None:
        proof["stationaryOverlay"] = {"sourcePng": records["fixed-question-world.png"],
              "worldCanvas": [640, 640], "sourceCanvas": manifest["canvas"], "sourceOffset": [128, 96],
              "operation": "Approved RGBA over source only where overlayalpha>0; other sourceRGBA unchanged"}
    return clip, raw, proof


def version_stage(stage, version):
    if version is None:
        return
    require(re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version), "Invalid staging version")
    package = read(stage / "package.json")
    package["version"] = version
    write(stage / "package.json", package)
    editions = read(stage / "build/editions.json")
    for edition in editions["editions"].values():
        edition["version"] = version
    write(stage / "build/editions.json", editions)
    for name in ("README.md", "README.en.md"):
        path = stage / name
        if path.exists():
            path.write_text(f"> Local motion-polish staging candidate {version}; not installed or published.\n\n" + path.read_text(encoding="utf-8"), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage-root", type=Path, required=True)
    parser.add_argument("--selection", type=Path, default=ROOT / "work/motion-polish-20261023/approved-selection.json")
    parser.add_argument("--version", help="Stage-only package/edition version and local README notice")
    args = parser.parse_args()
    require(args.version is None or re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", args.version), "Invalid staging version")
    stage = safe_destination(args.stage_root)
    selection_path = args.selection.resolve()
    selection, baseline_catalog, plans = preflight(selection_path)
    revision = "animated-motion-polish-v1-" + sha(canonical({"selection": file_sha(selection_path), "baseline": selection["formalCatalogSha256"], "format": "nativeHD+12fps-even-source+UMIIDX01-gzip6"}))[:16]
    encoder = module(ROOT / "scripts/encode_indexed_binary.py", "motion_polish_encoder")
    indexer = module(ROOT / "scripts/export_approved_h3_actions.py", "motion_polish_indexer")
    new_ids = {a for a, p in plans.items() if p["choice"]["selection"] == "approved-new"}
    copy_checkout(stage, new_ids, baseline_catalog)
    assets = stage / "assets/animated"
    provenance_dir = assets / PROVENANCE
    provenance_dir.mkdir(parents=True)
    shutil.copy2(selection_path, provenance_dir / "approved-selection.json")
    shutil.copy2(ANIMATED / "catalog.json", provenance_dir / "baseline-catalog.json")
    shutil.copy2(local(ANIMATED, baseline_catalog["indexedBinaryProvenance"]["file"]), provenance_dir / "baseline-indexed-binary.json")
    catalog = copy.deepcopy(baseline_catalog)
    catalog["revision"] = revision
    clips, binary_records = {}, []
    for action, plan in plans.items():
        retained = action not in new_ids
        if retained:
            clip = copy.deepcopy(plan["old"])
            baseline = decode_indexed(plan["indexedPath"])
            raw = copy.deepcopy(baseline)
            raw["revision"] = revision
            compare = {**raw, "revision": baseline_catalog["revision"]}
            require(compare == baseline, f"Retained metadata/pixels changed: {action}")
            proof = {"selection": plan["choice"], "retainedHdBytesExact": True,
                     "retainedIndexedDecodedEqualExceptTopLevelRevision": True,
                     "oldQaPreserved": True, "paletteSha256": sha(canonical(raw["palette"]))}
            source_json_sha = clip["indexed"]["umi"]["sourceJsonSha256"]
        else:
            clip, raw, proof = new_clip(stage, action, plan, revision, indexer)
            source_json_sha = sha(canonical(raw))
        binary, payload_sha, encoding = encoder.encode(raw)
        packed = gzip.compress(binary, compresslevel=6, mtime=0)
        encoder.verify(packed, raw)
        file = plan["old"]["indexed"]["umi"]["file"]
        destination = local(assets, file)
        destination.write_bytes(packed)
        require(decode_indexed(destination) == raw, f"Written indexed roundtrip mismatch: {action}")
        entry = {"file": file, "sha256": sha(packed), "sourceJsonSha256": source_json_sha,
                 "encoding": "gzip-" + encoding, "width": raw["width"], "height": raw["height"], "frameCount": len(raw["frames"])}
        if retained:
            for style in clip["indexed"]:
                # Only binary-container metadata changes; decoded data/QA does not.
                clip["indexed"][style].update(sha256=entry["sha256"], encoding=entry["encoding"])
            for frame in clip["hires"]["frames"]:
                checked(local(assets, clip["hires"]["baseUrl"] + frame["file"]), frame["webpSha256"])
        else:
            clip["indexed"] = {"umi": entry, "illustration": {**entry, "aliasOf": "umi"}}
        catalog["clips"][action] = clip
        record = {"file": file, "sha256": sha(packed), "payloadSha256": payload_sha, "encoding": encoding,
                  "frameCount": len(raw["frames"]), "sourceJsonSha256": source_json_sha,
                  "indexedPreEncodingCanonicalJsonSha256": sha(canonical(raw)),
                  "fullIndicesEqual": True, "paletteClockMetadataEqualExceptRevision": True,
                  "comparisonBaseline": "priorRuntimeDecodedExceptRevision" if retained else "newApprovedDerivativePreEncodingJson",
                  "gzipBytes": len(packed), "sourceBytes": len(canonical(raw))}
        binary_records.append(record)
        proof.update(indexed=record, fullRgbaHdVerified=True, perFrameFit=False)
        clips[action] = proof
        write(provenance_dir / "clips" / action / "derivation.json", proof)
        print(f"staged {action}: {len(clip['hires']['frames'])} HD / {len(raw['frames'])} indexed", flush=True)
    motion = {"schemaVersion": 1, "revision": revision, "selectionSha256": file_sha(selection_path),
              "baselineCatalogSha256": selection["formalCatalogSha256"], "newClips": 12, "retainedClips": 7,
              "logicalCanvas": [640, 640], "anchor": [320, 608], "perFrameFit": False,
              "newPixelAnimation": False, "historicalPathsAreBuildDependencies": False, "clips": clips,
              "indexedQuantizer": {"file": "scripts/export_approved_h3_actions.py", "sha256": file_sha(ROOT / "scripts/export_approved_h3_actions.py"),
                                   "method": "Existing indexed(pixel=False): fixed old palette; partialalpha black composite; fixedworld640 thenLANCZOS240"},
              "runtimeInstalled": False, "publiclyReleased": False}
    write(assets / "provenance/motion-polish.json", motion)
    catalog["motionPolishProvenance"] = {"file": "provenance/motion-polish.json", "sha256": file_sha(assets / "provenance/motion-polish.json")}
    indexed_provenance = {"schemaVersion": 1, "format": "UMIIDX01", "compression": "gzip6", "revision": revision,
        "previousRevision": baseline_catalog["revision"], "previousCatalogSha256": selection["formalCatalogSha256"],
        "physicalFiles": 19, "logicalEntries": 38, "HDReencoded": False,
        "HDReencodedScope": "Indexed encoding phase never modifies prepared HD. Wait approved-overlay preparation is separately bound in motion-polish provenance.",
        "paletteIndicesClockExact": True, "comparisonScope": "Each binary exactly equals its declared pre-encoding data;7old also equal prior decodeddata except top-levelrevision.12new explicitly derive approvedHD.",
        "motionPolishProvenance": catalog["motionPolishProvenance"], "files": binary_records}
    write(assets / "provenance/indexed-binary.json", indexed_provenance)
    catalog["indexedBinaryProvenance"] = {"file": "provenance/indexed-binary.json", "sha256": file_sha(assets / "provenance/indexed-binary.json"), "previousRevision": baseline_catalog["revision"]}
    for name in ("colorApproval", "codecProvenance"):
        catalog[name]["retainedFormalClipsOnly"] = sorted(set(plans) - new_ids)
    write(assets / "catalog.json", catalog)
    version_stage(stage, args.version)
    write(stage / "motion-polish-stage.json", {"status": "isolated_staging_only_not_installed_not_released", "revision": revision,
          "catalogSha256": file_sha(assets / "catalog.json"), "selectionSha256": file_sha(selection_path),
          "version": args.version, "clips": 19, "newClips": 12, "retainedFormalClips": 7})
    print(json.dumps({"stageRoot": str(stage), "revision": revision, "catalogSha256": file_sha(assets / "catalog.json"),
                      "installed": False, "released": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
