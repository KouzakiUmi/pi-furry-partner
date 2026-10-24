#!/usr/bin/env python3
"""Exact indexed storage migration; never reads/reencodes HD or artwork.

python scripts/encode_indexed_binary.py --pilot idle --style umi
python scripts/encode_indexed_binary.py --apply

All original runtime JSON bytes and the original catalog are retained under
work/indexed-binary-originals. The new catalog is published atomically only
after all 57 candidates have passed independent Node/runtime verification.
"""
import argparse
from array import array
import copy
import gzip
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets/animated"
BACKUP = ROOT / "work/indexed-binary-originals"
MAGIC = b"UMIIDX01"
MAX_BYTES = 25 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def safe_file(relative):
    p = Path(relative)
    if p.is_absolute() or p.suffix != ".json" or not p.parts or p.parts[0] != "indexed" or ".." in p.parts:
        raise ValueError(f"Unsafe original indexed path: {relative}")
    resolved = (ASSETS / p).resolve()
    resolved.relative_to((ASSETS / "indexed").resolve())
    return resolved


def encode(raw):
    width, height, frames, palette = raw["width"], raw["height"], raw["frames"], raw["palette"]
    if (type(width) is not int or type(height) is not int or not 1 <= width <= 640 or not 1 <= height <= 640
            or not 2 <= len(frames) <= 256 or width * height * len(frames) > 12000000
            or type(raw.get("transparentIndex")) is not int or raw["transparentIndex"] != 0
            or not 2 <= len(palette) <= 512):
        raise ValueError("Invalid indexed dimensions/palette/transparent index")
    if any(type(c) is not list or len(c) != 3 or any(type(n) is not int or not 0 <= n <= 255 for n in c) for c in palette):
        raise ValueError("Invalid exact RGB palette")
    word = len(palette) > 256
    pixels, metadata = array("H" if word else "B"), {k: v for k, v in raw.items() if k != "frames"}
    metadata["frames"] = []
    previous = -1
    ids = set()
    for i, frame in enumerate(frames):
        values, at = frame["pixels"], frame["atMs"]
        if (not isinstance(at, (float, int)) or isinstance(at, bool) or not math.isfinite(at)
                or at <= previous or (i == 0 and at != 0) or at >= raw["periodMs"]
                or not isinstance(frame["id"], str) or not frame["id"] or frame["id"] in ids
                or len(values) != width * height
                or any(type(v) is not int or v < 0 or v >= len(palette) for v in values)):
            raise ValueError("Invalid indexed frame clock/ID/pixels")
        previous = at
        ids.add(frame["id"])
        pixels.extend(values)
        metadata["frames"].append({k: v for k, v in frame.items() if k != "pixels"})
    if word and sys.byteorder != "little":
        pixels.byteswap()
    payload = pixels.tobytes()
    header = canonical({"encoding": "u16le" if word else "u8", "data": metadata})
    if len(header) % 2:
        header += b" "
    if len(header) > 1024 * 1024:
        raise ValueError("Indexed metadata exceeds header limit")
    result = MAGIC + struct.pack("<II", len(header), len(payload)) + header + payload
    if len(result) > MAX_BYTES:
        raise ValueError("Indexed data exceeds runtime limit")
    return result, sha(payload), "u16le" if word else "u8"


def verify(encoded, expected):
    unpacked = gzip.decompress(encoded)
    if unpacked[:8] != MAGIC or len(unpacked) > MAX_BYTES:
        raise ValueError("Binary roundtrip failed")
    h, p = struct.unpack_from("<II", unpacked, 8)
    if 16 + h + p != len(unpacked):
        raise ValueError("Binary byte length mismatch")
    envelope = json.loads(unpacked[16:16+h])
    result = envelope["data"]
    pixels = array("H" if envelope["encoding"] == "u16le" else "B")
    pixels.frombytes(unpacked[16+h:])
    if pixels.itemsize == 2 and sys.byteorder != "little":
        pixels.byteswap()
    count = result["width"] * result["height"]
    for i, frame in enumerate(result["frames"]):
        frame["pixels"] = pixels[i*count:(i+1)*count].tolist()
    if result != expected:
        raise ValueError("Full metadata/palette/indices/clock comparison failed")


def backup(path, relative):
    destination = BACKUP / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if sha(destination.read_bytes()) != sha(path.read_bytes()):
            raise ValueError(f"Refusing to replace a different original backup: {destination}")
    else:
        shutil.copy2(path, destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--pilot", metavar="CLIP")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--style", default="umi", choices=["umi", "umi-pixel", "pixel", "illustration"])
    args = parser.parse_args()
    catalog_path = ASSETS / "catalog.json"
    original_bytes = catalog_path.read_bytes()
    catalog = json.loads(original_bytes)
    if catalog.get("indexedBinaryProvenance"):
        raise ValueError("Catalog is already migrated; run node tests/approved-motion-binary-pack.mjs to verify it")
    entries = {}
    for clip_id, clip in catalog["clips"].items():
        for style, entry in clip["indexed"].items():
            entries.setdefault(entry["file"], []).append((clip_id, style, entry))
    if args.pilot:
        entry = catalog["clips"][args.pilot]["indexed"][args.style]
        source = safe_file(entry["file"])
        original = source.read_bytes()
        if sha(original) != entry["sha256"]:
            raise ValueError("Pilot source hash differs from current catalog")
        raw = json.loads(original)
        binary, payload_sha, encoding = encode(raw)
        packed = gzip.compress(binary, compresslevel=6, mtime=0)
        verify(packed, raw)
        destination = ROOT / "work/indexed-binary-pilot" / f"{args.style}-{args.pilot}.uix.gz"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(packed)
        print(json.dumps({"pilot": str(destination), "source": str(source), "sourceBytes": len(original),
                          "binaryBytes": len(binary), "gzipBytes": len(packed), "encoding": encoding,
                          "payloadSha256": payload_sha, "allMetadataPaletteIndicesClockEqual": True}))
        return
    if len(catalog["clips"]) != 19 or len(entries) != 57 or sum(map(len, entries.values())) != 76:
        raise ValueError("Expected frozen 19 clips / 57 physical files / 76 logical entries")
    hashes = {name: sha(safe_file(name).read_bytes()) for name in sorted(entries)}
    for name, refs in entries.items():
        if any(entry["sha256"] != hashes[name] for _, _, entry in refs):
            raise ValueError(f"Source hash mismatch: {name}")
    revision = "animated-indexed-binary-v1-" + sha(canonical({"prior": sha(original_bytes),
        "sources": hashes, "format": "UMIIDX01+gzip6+u8/u16le"}))[:16]
    BACKUP.mkdir(parents=True, exist_ok=True)
    backup(catalog_path, "catalog.json")
    new_catalog = copy.deepcopy(catalog)
    new_catalog["revision"] = revision
    records, before_bytes, after_bytes = [], 0, 0
    for name, refs in entries.items():
        source = safe_file(name)
        original = source.read_bytes()
        backup(source, name)
        raw = json.loads(original)
        if raw["revision"] != catalog["revision"]:
            raise ValueError(f"Mixed original revisions: {name}")
        raw["revision"] = revision
        binary, payload_sha, encoding = encode(raw)
        packed = gzip.compress(binary, compresslevel=6, mtime=0)
        verify(packed, raw)
        relative = name[:-5] + ".uix.gz"
        destination = ASSETS / relative
        temporary = destination.with_name(destination.name + ".building")
        temporary.write_bytes(packed)
        temporary.replace(destination)
        record = {"sourceFile": name, "file": relative, "sourceJsonSha256": hashes[name],
                  "sha256": sha(packed), "payloadSha256": payload_sha, "encoding": encoding,
                  "sourceBytes": len(original), "gzipBytes": len(packed),
                  "frameCount": len(raw["frames"]), "fullIndicesEqual": True,
                  "paletteClockMetadataEqualExceptRevision": True}
        records.append(record)
        before_bytes += len(original)
        after_bytes += len(packed)
        for clip_id, style, _ in refs:
            target = new_catalog["clips"][clip_id]["indexed"][style]
            target.update(file=relative, sha256=record["sha256"], encoding="gzip-" + encoding,
                          sourceJsonSha256=hashes[name])
        print(f"verified {len(records):02}/57 {relative}: {len(original)} -> {len(packed)}", flush=True)
    provenance = {"schemaVersion": 1, "format": "UMIIDX01", "compression": "gzip6",
        "revision": revision, "previousRevision": catalog["revision"],
        "previousCatalogSha256": sha(original_bytes), "physicalFiles": 57, "logicalEntries": 76,
        "sourceBytes": before_bytes, "gzipBytes": after_bytes, "bytesSaved": before_bytes-after_bytes,
        "HDReencoded": False, "paletteIndicesClockExact": True, "files": records}
    provenance_relative = "provenance/indexed-binary.json"
    provenance_bytes = canonical(provenance)
    (ASSETS / provenance_relative).write_bytes(provenance_bytes)
    new_catalog["indexedBinaryProvenance"] = {"file": provenance_relative, "sha256": sha(provenance_bytes),
                                              "previousRevision": catalog["revision"]}
    candidate = ROOT / "work/indexed-binary-catalog-candidate.json"
    candidate.write_bytes(canonical(new_catalog))
    subprocess.run(["node", "tests/approved-motion-binary-pack.mjs", "--catalog", str(candidate)],
                   cwd=ROOT, check=True)
    temporary = catalog_path.with_name("catalog.json.binary-building")
    temporary.write_bytes(candidate.read_bytes())
    temporary.replace(catalog_path)
    # Only identical, explicitly backed-up original files leave the runtime tree.
    for name, expected_hash in hashes.items():
        source = safe_file(name)
        if sha((BACKUP / name).read_bytes()) != expected_hash or sha(source.read_bytes()) != expected_hash:
            raise ValueError(f"Original changed during migration; do not remove: {name}")
        source.unlink()
    report = dict(provenance, catalogSha256=sha(catalog_path.read_bytes()),
                  status="complete_exact_indices_verified_not_installed")
    (ROOT / "work/indexed-binary-validation.json").write_bytes(canonical(report))
    print(json.dumps({k: v for k, v in report.items() if k != "files"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
