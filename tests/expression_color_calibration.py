#!/usr/bin/env python3
"""Color-only invariants and fixed-frame stability; no asset rebuilding."""
import json
from pathlib import Path
import sys
import unittest
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from expression_color_calibration import calibrate_expression_rgb, CALIBRATION_METADATA


class ExpressionColorCalibrationTests(unittest.TestCase):
    def test_fixed_material_values_without_geometry_or_alpha_changes(self):
        data = np.zeros((64, 64, 4), dtype=np.float64)
        data[:, :, 3] = np.arange(64)[:, None] / 63
        data[5, 5, :3] = np.array([55, 61, 71]) / 255  # hood, away from face
        data[55, 10, :3] = np.array([163, 157, 153]) / 255
        data[55, 45, :3] = np.array([59, 157, 250]) / 255
        before = data.copy()
        result = calibrate_expression_rgb(data)
        self.assertTrue(np.array_equal(data, before))
        self.assertTrue(np.array_equal(result[:, :, 3], before[:, :, 3]))
        self.assertEqual(result.shape, data.shape)
        self.assertEqual(result.dtype, data.dtype)
        self.assertTrue(np.allclose(result[55, 10, :3] * 255, [155, 154, 158], atol=.1))
        self.assertTrue(np.allclose(result[55, 45, :3] * 255, [114.39, 166.3, 238.54], atol=.1))
        self.assertTrue((result[5, 5, :3] > data[5, 5, :3]).all())

    def test_no_per_frame_fit_and_no_flattening(self):
        a = np.ones((64, 64, 4), dtype=np.float64)
        b = a.copy(); b[:, :, :3] = [0, 1, 0]
        for frame in (a, b):
            for x in range(10, 30):
                frame[55, x, :3] = np.array([150 + (x - 10) * .5, 144 + (x - 10) * .5, 140 + (x - 10) * .5]) / 255
        corrected_a, corrected_b = calibrate_expression_rgb(a), calibrate_expression_rgb(b)
        self.assertTrue(np.array_equal(corrected_a[55, 10:30], corrected_b[55, 10:30]))
        self.assertEqual(len(np.unique(corrected_a[55, 10:30, :3], axis=0)), 20)
        self.assertTrue((np.diff(corrected_a[55, 10:30, :3], axis=0) > 0).all())

    def test_all_nine_artworks_preserve_alpha_white_black_orange_and_pink(self):
        files = sorted((ROOT / 'assets/poses/expressions').glob('emotion-*.png'))
        self.assertEqual(len(files), 9)
        for path in files:
            data = np.asarray(Image.open(path).convert('RGBA'), dtype=np.float64) / 255
            corrected = calibrate_expression_rgb(data)
            rgb = data[:, :, :3] * 255
            orange = (rgb[:, :, 0] > 220) & (rgb[:, :, 1] > 60) & (rgb[:, :, 1] < 185) & (rgb[:, :, 2] < 100)
            pink = (rgb[:, :, 0] > 180) & (rgb[:, :, 0] - rgb[:, :, 1] > 28) & (rgb[:, :, 0] - rgb[:, :, 2] > 10)
            white = rgb.min(2) > 210
            black = rgb.max(2) <= 45
            reserved = orange | pink | white | black | (data[:, :, 3] == 0)
            self.assertTrue(np.array_equal(data[:, :, 3], corrected[:, :, 3]), path.name)
            self.assertTrue(np.array_equal(data[:, :, :3][reserved], corrected[:, :, :3][reserved]), path.name)
        json.dumps(CALIBRATION_METADATA)


if __name__ == '__main__':
    unittest.main()
