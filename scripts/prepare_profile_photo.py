#!/usr/bin/env python3
"""Prepare the README portrait from an authorized, privately stored photograph.

Requires Pillow. Supply the source file explicitly; the original is not shipped
with the project. The default crop is (left=0, top=100, right=1600, bottom=2100)
on the 1600 x 2433 source, retaining the hood ears, face and reaching paw.
Only cropping, proportional downsampling and JPEG encoding are performed.
"""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


def metadata_markers(path):
    """List JPEG application/comment segments before the compressed image data."""
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        raise ValueError("Output is not a JPEG")
    markers, position = [], 2
    while position < len(data):
        if data[position] != 0xFF:
            raise ValueError("Invalid JPEG segment boundary")
        while data[position] == 0xFF:
            position += 1
        marker = data[position]
        position += 1
        if marker in (0xDA, 0xD9):
            break
        length = int.from_bytes(data[position:position + 2], "big")
        if length < 2 or position + length > len(data):
            raise ValueError("Invalid JPEG segment length")
        if 0xE0 <= marker <= 0xEF or marker == 0xFE:
            markers.append(marker)
        position += length
    return markers


def prepare(source_path, output_path, crop, output_width):
    with Image.open(source_path) as original:
        source = ImageOps.exif_transpose(original)
        if source.size != (1600, 2433):
            raise ValueError("This crop expects the authorized 1600 x 2433 portrait")
        left, top, right, bottom = crop
        if not (0 <= left < right <= source.width and 0 <= top < bottom <= source.height):
            raise ValueError("Crop must stay within the source photograph")
        if not (1 <= output_width <= right - left):
            raise ValueError("Output width must be positive and must not upscale the crop")
        output_height = round((bottom - top) * output_width / (right - left))
        resized = source.crop(crop).convert("RGB").resize(
            (output_width, output_height), Image.Resampling.LANCZOS
        )
        # Copy only decoded RGB pixels. No EXIF/GPS, XMP, IPTC, comments, ICC
        # profile, thumbnail, original filename or other source metadata travels.
        clean = Image.new("RGB", resized.size)
        clean.paste(resized)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        clean.save(output_path, format="JPEG", quality=90, optimize=True,
                   progressive=True, subsampling=2)

    with Image.open(output_path) as exported:
        if exported.size != (output_width, output_height) or len(exported.getexif()):
            raise ValueError("Output dimensions or EXIF check failed")
        if set(exported.info) & {"exif", "xmp", "icc_profile", "comment", "photoshop"}:
            raise ValueError("Source metadata remained in the export")
    markers = metadata_markers(output_path)
    if any(marker != 0xE0 for marker in markers):
        raise ValueError("Unexpected JPEG application/comment metadata")
    return {
        "crop": list(crop),
        "sourceDimensions": [1600, 2433],
        "outputDimensions": [output_width, output_height],
        "bytes": output_path.stat().st_size,
        "sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
        "metadata": "JFIF encoding header only; no EXIF/GPS, XMP, IPTC, ICC or comments",
        "processing": "crop, proportional Lanczos downsampling, JPEG quality 90",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path,
                        help="Privately stored authorized source photograph")
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "assets/profile/umi-photo.jpg")
    parser.add_argument("--crop", type=int, nargs=4, default=(0, 100, 1600, 2100),
                        metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    parser.add_argument("--width", type=int, default=1200)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("The original must not be overwritten")
    print(json.dumps(prepare(args.source, args.output, tuple(args.crop), args.width), indent=2))


if __name__ == "__main__":
    main()
