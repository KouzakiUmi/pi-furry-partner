"""Historical experiment invariants plus source-native production regressions."""
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from expression_geometry import (apply_expression_geometry, expression_geometry_metrics,
                                 geometry_metadata, BASELINE_Y)


class ExpressionGeometryTests(unittest.TestCase):
    def test_baseline_pixel_and_horizontal_eye_distance_are_fixed(self):
        rgba = np.zeros((640, 640, 4), dtype=np.float64)
        rgba[602, 220] = (1, 1, 1, 1)
        rgba[602, 400] = (1, 1, 1, 1)
        saved = rgba.copy()
        result = apply_expression_geometry(rgba)
        self.assertTrue(np.array_equal(rgba, saved), 'Source RGBA must remain immutable')
        self.assertTrue(np.allclose(result[602, [220, 400], 3], 1., atol=1e-6))
        x = np.where(result[:, :, 3] > .99)[1]
        self.assertEqual(set(x), {220, 400})
        self.assertEqual(int(x.max() - x.min()), 180, 'No horizontal scale or drift')
        self.assertEqual(int(np.argmax(result[:, 220, 3])), int(BASELINE_Y))

    def test_vertical_height_changes_once_about_grounded_baseline(self):
        rgba = np.zeros((640, 640, 4), dtype=np.float64)
        rgba[200:603, 200:440] = (1, 1, 1, 1)
        result = apply_expression_geometry(rgba)
        qc = expression_geometry_metrics(result, source=rgba)
        self.assertEqual(qc['bbox'][0::2], [200, 440])
        self.assertEqual(qc['bbox'][3], 603)
        self.assertLessEqual(abs(qc['bbox'][1] - 160), 1)
        self.assertAlmostEqual((qc['bbox'][3] - qc['bbox'][1]) / 403, 1.10, delta=.003)
        self.assertTrue(qc['withinMargin'])

    def test_premultiplied_sampling_keeps_hidden_green_out_of_red_edges(self):
        rgba = np.zeros((640, 640, 4), dtype=np.float64)
        rgba[:, :, 1] = 1.  # Irrelevant straight RGB beneath zero alpha.
        rgba[200:590, 200:440] = (1., 0., 0., 1.)
        rgba[199, 200:440] = (1., 0., 0., .25)
        rgba[590, 200:440] = (1., 0., 0., .25)
        result = apply_expression_geometry(rgba)
        visible = result[:, :, 3] > 1e-6
        self.assertLess(float(np.max(result[:, :, 1][visible])), 1e-6)
        self.assertTrue(np.any((result[:, :, 3] > .01) & (result[:, :, 3] < .99)))
        self.assertTrue(np.all(np.isfinite(result)))
        self.assertTrue(np.all((result >= 0) & (result <= 1)))

    def test_global_transform_does_not_refit_to_a_floating_icon(self):
        first = np.zeros((640, 640, 4), dtype=np.float64)
        first[300:320, 240:400] = (1, .5, .2, 1)
        second = first.copy()
        second[100:115, 500:520] = (.3, .6, 1, 1)
        a, b = apply_expression_geometry(first), apply_expression_geometry(second)
        self.assertTrue(np.array_equal(a[:, 240:400], b[:, 240:400]))

    def test_margin_checks_do_not_allow_a_clipped_or_vanishing_icon(self):
        rgba = np.zeros((640, 640, 4), dtype=np.float64)
        rgba[200:603, 200:440] = (1, 1, 1, 1)
        rgba[10:20, 300:320] = (1, .5, .2, 1)
        unguarded = apply_expression_geometry(rgba, check_margin=False)
        qc = expression_geometry_metrics(unguarded, source=rgba)
        self.assertFalse(qc['withinMargin'])
        self.assertFalse(qc['projectedSourceWithinMargin'])
        with self.assertRaisesRegex(ValueError, 'visible canvas margin'):
            apply_expression_geometry(rgba)

    def test_strict_float_canvas_and_immutable_metadata(self):
        for bad in [np.zeros((640, 640, 4), np.uint8), np.zeros((80, 80, 4), np.float64),
                    np.full((640, 640, 4), np.nan), np.full((640, 640, 4), 2.)]:
            with self.assertRaises(ValueError):
                apply_expression_geometry(bad)
        metadata = geometry_metadata(); metadata['scaleY'] = 9
        self.assertEqual(geometry_metadata()['scaleY'], 1.10)

    def test_static_and_video_builders_preserve_the_same_source_native_640_pixels(self):
        from build_expression_reactions import prepare_keyframe
        from build_expression_video import prepare_runtime_frame
        pixels = np.zeros((640, 640, 4), dtype=np.uint8)
        pixels[190:603, 200:440] = (250, 250, 250, 255)
        pixels[450:490, 200:440] = (10, 135, 245, 255)
        pixels[189, 200:440] = (250, 250, 250, 64)
        image = Image.fromarray(pixels)
        before = image.tobytes()
        static, margin = prepare_keyframe(image)
        video = prepare_runtime_frame(pixels.astype(np.float64) / 255, 'joy', already_normalized=True)
        self.assertTrue(np.array_equal(np.asarray(static), np.uint8(np.rint(np.clip(video, 0, 1) * 255))))
        self.assertTrue(np.array_equal(np.asarray(static), pixels), 'No material mapping or Y stretch is applied')
        self.assertTrue(margin['withinMargin'])
        self.assertEqual(image.tobytes(), before)

    def test_native_archive_is_not_replaced_by_repeated_calibration(self):
        from build_expression_reactions import preserve_native_cell
        with tempfile.TemporaryDirectory(prefix='umi-expression-native-cell-') as directory:
            path = Path(directory) / 'emotion-joy.png'
            native = Image.new('RGBA', (40, 40), (11, 21, 31, 127))
            preserve_native_cell(native, path)
            original = path.read_bytes()
            preserve_native_cell(native, path)
            self.assertEqual(path.read_bytes(), original)
            changed = native.copy(); changed.putpixel((20, 20), (11, 21, 32, 127))
            with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
                preserve_native_cell(changed, path)
            self.assertEqual(path.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
