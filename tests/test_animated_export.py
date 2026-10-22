"""Contract tests for root registration, frozen sources, and transition clocks."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("animated_export", SCRIPTS / "export_animated_pack.py")
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class AnimatedExportContractTests(unittest.TestCase):
    def test_padding_does_not_change_character_pixels_or_root(self):
        logical = Image.new("RGBA", (640, 640))
        # Distinct opaque and fractional-alpha pixels detect resampling/offsets.
        for x, y, color in [(320, 608, (23, 65, 183, 255)), (310, 599, (245, 39, 90, 128)), (329, 607, (1, 2, 3, 7))]:
            logical.putpixel((x, y), color)
        padded = Image.new("RGBA", (896, 896))
        padded.paste(logical, (128, 96))
        registered = exporter.world_viewport(padded, exporter.paint_rect([896, 896], [448, 704]))
        self.assertTrue(np.array_equal(np.array(logical), np.array(registered)))
        self.assertEqual(registered.getpixel((320, 608)), (23, 65, 183, 255))

    def test_think_has_no_vertical_translation(self):
        source = Image.new("RGBA", (896, 896))
        source.putpixel((448, 608), (40, 70, 120, 255))
        view = exporter.world_viewport(source, exporter.paint_rect([896, 896], [448, 608]))
        self.assertEqual(view.getpixel((320, 608)), (40, 70, 120, 255))
        self.assertEqual(view.getbbox(), (320, 608, 321, 609))

    def test_offscreen_drop_stays_in_source_without_changing_body_scale(self):
        source = Image.new("RGBA", (896, 896))
        source.putpixel((448, 704), (220, 220, 220, 255))
        source.putpixel((448, 870), (30, 130, 240, 255))
        rect = exporter.paint_rect([896, 896], [448, 704])
        geometry = exporter.frame_geometry(np.array(source), rect)
        self.assertEqual(geometry["outsideViewportPixelsAlpha128"], 1)
        self.assertEqual(geometry["outsideViewportBoundsAlpha128"], [320, 774, 321, 775])
        self.assertEqual(exporter.world_viewport(source, rect).getbbox(), (320, 608, 321, 609))
        self.assertEqual(source.getpixel((448, 870)), (30, 130, 240, 255))

    def test_transition_400ms_has_eight_slots_and_both_endpoints(self):
        frames = [{"atMs": i * 400 / 24, "sourceFrame": round(i * 106 / 23)} for i in range(24)]
        chosen, boundaries = exporter.sample_slots(frames, 400, 20)
        self.assertEqual(len(chosen), 8)
        self.assertEqual((frames[chosen[0]]["sourceFrame"], frames[chosen[-1]]["sourceFrame"]), (0, 106))
        self.assertTrue(all(b > a for a, b in zip(chosen, chosen[1:])))
        self.assertEqual([b - a for a, b in zip(boundaries, boundaries[1:])], [50] * 8)

    def test_changed_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.png"
            source.write_bytes(b"approved source bytes")
            expected = exporter.sha(source)
            source.write_bytes(b"changed source bytes")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                exporter.bound_hash(source, expected, "approved source")

    def test_existing_webp_pixel_mismatch_is_not_silently_reencoded(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "rgba").mkdir()
            (folder / "webp").mkdir()
            video = folder / "source.mp4"
            video.write_bytes(b"frozen video placeholder")
            source = Image.new("RGBA", (640, 640), (20, 30, 40, 255))
            png = folder / "rgba/000.png"
            source.save(png)
            Image.new("RGBA", source.size, (80, 90, 100, 255)).save(folder / "webp/000.webp", lossless=True, exact=True)
            manifest = {"canvas": [640, 640], "pivot": [320, 608], "periodMs": 100,
                        "source": {"file": str(video), "sha256": exporter.sha(video)},
                        "frames": [{"id": "000", "file": "000.png", "sha256": exporter.sha(png), "sourceFrame": 0, "atMs": 0}]}
            clip = {"id": "idle", "folder": folder, "manifest": manifest, "record": {}}
            with self.assertRaisesRegex(ValueError, "existing WebP is not exact visible RGBA"):
                exporter.verify_clip(clip, folder)

    def test_hidden_rgb_difference_is_disclosed_without_touching_source(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "rgba").mkdir()
            (folder / "webp").mkdir()
            video = folder / "source.mp4"
            video.write_bytes(b"frozen video placeholder")
            source = Image.new("RGBA", (640, 640), (123, 45, 67, 0))
            source.putpixel((320, 608), (20, 30, 40, 255))
            frames = []
            before = {}
            for i in range(2):
                name = f"{i:03}"
                png, webp = folder / f"rgba/{name}.png", folder / f"webp/{name}.webp"
                source.save(png)
                source.save(webp, lossless=True, exact=False)
                before[png], before[webp] = exporter.sha(png), exporter.sha(webp)
                frames.append({"id": name, "file": png.name, "sha256": before[png], "sourceFrame": i, "atMs": i * 50})
            manifest = {"canvas": [640, 640], "pivot": [320, 608], "periodMs": 100,
                        "source": {"file": str(video), "sha256": exporter.sha(video)}, "frames": frames}
            clip = {"id": "idle", "folder": folder, "manifest": manifest, "record": {},
                    "manifestSha": "0" * 64, "approvalSha": "1" * 64, "approvalKind": "test"}
            audit = exporter.verify_clip(clip, folder)
            self.assertEqual(audit["existingSourceWebpFrames"], 2)
            self.assertTrue(all(f["transparentRgbOnlyMismatch"] > 0 for f in audit["frames"]))
            self.assertEqual({p: exporter.sha(p) for p in before}, before)


if __name__ == "__main__":
    unittest.main()
