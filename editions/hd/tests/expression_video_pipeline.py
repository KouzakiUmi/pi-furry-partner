#!/usr/bin/env python3
"""Meaningful offline acceptance checks for the reviewed H3 asset pipeline.

Uses a tiny real lossless video, never a generation API or an installed plugin.
"""
import argparse
import copy
from fractions import Fraction
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_expression_video as pipeline


class ExpressionVideoPipelineTests(unittest.TestCase):
    def test_source_native_pipeline_preserves_expression_and_title_pixels(self):
        rgba = np.zeros((640, 640, 4), dtype=np.float64)
        rgba[300:603, 250:400] = (.15, .5, .9, 1.)
        original = rgba.copy()
        expected = rgba.copy()
        title = pipeline.prepare_runtime_frame(rgba, 'title-wave')
        self.assertTrue(np.array_equal(title, expected), 'Title-wave keeps the original full-canvas resize only')
        self.assertTrue(np.array_equal(pipeline.prepare_runtime_frame(expected, 'title-wave', already_normalized=True), expected))
        self.assertEqual(pipeline.processing_for_action('title-wave'), pipeline.PROCESSING)
        for action in pipeline.EXPRESSION_IDS:
            config = pipeline.processing_for_action(action)
            self.assertNotIn('fixedCalibrations', config)
            self.assertFalse(config['sourceNative']['colorCorrection'])
            self.assertFalse(config['sourceNative']['nonUniformScale'])
            self.assertEqual(config['calibrationOrder'], ['uniform-full-source-to-640'])
        expression = pipeline.prepare_runtime_frame(rgba, 'shy')
        self.assertTrue(np.array_equal(expression, title))
        self.assertTrue(np.array_equal(expression, original), '640 source colors, alpha and geometry remain exact')
        self.assertTrue(np.array_equal(original, rgba), 'No source frame is mutated by a calibration')
        with self.assertRaisesRegex(ValueError, 'Unknown expression'):
            pipeline.processing_for_action('not-an-expression')

    def test_shared_catalog_publication_is_exclusive_and_releases_on_failure(self):
        with tempfile.TemporaryDirectory(prefix='umi-expression-lock-') as directory:
            root = Path(directory)
            with pipeline.publication_lock(root):
                with self.assertRaisesRegex(ValueError, 'pack actions sequentially'):
                    with pipeline.publication_lock(root):
                        self.fail('Concurrent publication must not enter')
            self.assertFalse((root / 'work/.h3-expression-pack.lock').exists())
            with self.assertRaisesRegex(RuntimeError, 'simulated failure'):
                with pipeline.publication_lock(root):
                    raise RuntimeError('simulated failure')
            with pipeline.publication_lock(root):
                pass

    def test_real_pts_rounding_preserves_end_and_final_odd_frame(self):
        probe = {'frameCount': 7, 'timestamps': [Fraction(n, 24) for n in range(7)], 'end': Fraction(7, 24)}
        result = pipeline.sample_timeline(probe)
        self.assertEqual([r['sourceFrame'] for r in result], [0, 2, 4, 6])
        self.assertEqual([r['durationMs'] for r in result], [83, 84, 83, 42])
        self.assertEqual(sum(r['durationMs'] for r in result), 292)

    def test_green_luminance_is_inverted_without_white_fur_erasure(self):
        data = np.zeros((32, 32, 3), dtype=np.uint8)
        data[:] = (0, 255, 0)
        data[8:24, 8:24] = (255, 255, 255)
        data[8:24, 24] = (127, 255, 127)
        rgba, matte, _ = pipeline.extract_matte(Image.fromarray(data))
        self.assertAlmostEqual(float(matte[0, 0]), 1.)
        self.assertAlmostEqual(float(rgba[16, 16, 3]), 1.)
        self.assertTrue(np.allclose(rgba[16, 24, :3], (1, 1, 1)))
        self.assertGreater(float(rgba[16, 24, 3]), .49)
        self.assertLess(float(rgba[16, 24, 3]), .51)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg and ffprobe are required')
    def test_decode_review_gate_source_tamper_and_both_runtime_packs(self):
        with tempfile.TemporaryDirectory(prefix='umi-expression-pipeline-test-') as directory:
            folder = Path(directory)
            raw = folder / 'input'
            raw.mkdir()
            for n in range(6):
                image = Image.new('RGB', (64, 64), (0, 255, 0))
                draw = ImageDraw.Draw(image)
                draw.ellipse((16 + n, 12, 42 + n, 54), fill=(255, 255, 255))
                draw.rectangle((26 + n, 26, 30 + n, 31), fill=(20, 40, 80))
                image.save(raw / f'{n:03}.png')
            source = folder / 'source.mp4'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-framerate', '24',
                            '-i', str(raw / '%03d.png'), '-c:v', 'libx264rgb', '-crf', '0',
                            '-preset', 'ultrafast', str(source)], check=True)
            prepared = folder / 'prepared'
            pipeline.process(argparse.Namespace(source=source, out=prepared, action='shy', stride=2,
                                                ffmpeg='ffmpeg', ffprobe='ffprobe'))
            manifest_path = prepared / 'manifest.json'
            manifest = pipeline.read(manifest_path)
            self.assertEqual(manifest['source']['frameCount'], 6)
            self.assertEqual([r['sourceFrame'] for r in manifest['frames']], [0, 2, 4])
            self.assertEqual([r['durationMs'] for r in manifest['frames']], [83, 84, 83])
            self.assertEqual(manifest['sampling']['periodMs'], 250)
            self.assertFalse(manifest['qa']['accepted'])
            self.assertEqual(manifest['processing'], pipeline.processing_for_action('shy'))
            self.assertTrue(all(r['geometryMargin']['withinMargin'] for r in manifest['qc']['frames']))
            self.assertEqual(manifest['qc']['selectedFramesFailingGeometryMargin'], [])
            self.assertEqual(len(manifest['sourceFrames']), 6)
            self.assertEqual(len(list((prepared / 'matte-16').glob('*.png'))), 12)
            self.assertTrue((prepared / 'contact-sheet.png').exists())
            self.assertTrue((prepared / 'shy-preview.gif').exists())
            with Image.open(prepared / manifest['sourceFrames'][0]['foregroundAlpha']) as alpha:
                self.assertIn(alpha.mode, ('I;16', 'I'))
                self.assertGreater(np.asarray(alpha).max(), 255)
            review_path = prepared / 'review.json'
            review = pipeline.read(prepared / 'review-template.json')
            pipeline.write(review_path, review)
            with self.assertRaisesRegex(ValueError, 'qa.accepted=true'):
                pipeline.validate_review(manifest_path, review_path)
            review['qa'] = {'accepted': True, 'reviewer': 'offline synthetic test; not production art',
                            'notes': 'Synthetic moving ellipse tests pipeline mechanics only; this does not review character art.',
                            'checks': {check: True for check in pipeline.REQUIRED_REVIEW_CHECKS}}
            review['qa']['checks']['tailColorsIfVisible'] = 'NA: tail concealed'
            pipeline.write(review_path, review)
            pipeline.validate_review(manifest_path, review_path)
            for adjacent in (prepared, source.parent):
                withdrawal = adjacent / 'withdrawal-record.json'
                pipeline.write(withdrawal, {'schemaVersion': 1, 'status': 'withdrawn-user-rejected', 'deploymentAllowed': False})
                with self.assertRaisesRegex(ValueError, 'withdrawn'):
                    pipeline.validate_review(manifest_path, review_path)
                withdrawal.unlink()
            for check in ('fourToesAndShortClaws', 'proportionsMatchReference', 'materialColorsMatchReference'):
                for state in (False, None, 'pending'):
                    contradictory = copy.deepcopy(review)
                    contradictory['qa']['checks'][check] = state
                    pipeline.write(review_path, contradictory)
                    with self.assertRaisesRegex(ValueError, 'failed or unresolved'):
                        pipeline.validate_review(manifest_path, review_path)
            missing = copy.deepcopy(review)
            del missing['qa']['checks']['loopAndTransition']
            pipeline.write(review_path, missing)
            with self.assertRaisesRegex(ValueError, 'every required'):
                pipeline.validate_review(manifest_path, review_path)
            for field in ('reviewer', 'notes'):
                missing = copy.deepcopy(review)
                missing['qa'][field] = '   '
                pipeline.write(review_path, missing)
                with self.assertRaisesRegex(ValueError, 'reviewer.*notes'):
                    pipeline.validate_review(manifest_path, review_path)
            pipeline.write(review_path, review)
            original_manifest = manifest_path.read_bytes()
            obsolete = copy.deepcopy(manifest)
            obsolete['processing'] = pipeline.PROCESSING
            pipeline.write(manifest_path, obsolete)
            obsolete_review = copy.deepcopy(review)
            obsolete_review['manifestSha256'] = pipeline.sha(manifest_path)
            pipeline.write(review_path, obsolete_review)
            with self.assertRaisesRegex(ValueError, 'source-native'):
                pipeline.validate_review(manifest_path, review_path)
            manifest_path.write_bytes(original_manifest)
            for defective in ('empty', 'edge', 'source-edge', 'final-margin', 'missing-margin'):
                failed = copy.deepcopy(manifest)
                if defective == 'empty':
                    failed['qc']['emptySourceFrames'] = [2]
                elif defective == 'edge':
                    failed['qc']['sourceFramesTouchingOuterTwoPixels'] = [2]
                elif defective == 'source-edge':
                    failed['sourceFrames'][2]['qc']['outerTwoPixelAlphaPixels'] = 1
                elif defective == 'final-margin':
                    failed['qc']['frames'][0]['geometryMargin']['withinMargin'] = False
                else:
                    del failed['qc']['frames'][0]['geometryMargin']
                pipeline.write(manifest_path, failed)
                failed_review = copy.deepcopy(review)
                failed_review['manifestSha256'] = pipeline.sha(manifest_path)
                pipeline.write(review_path, failed_review)
                with self.assertRaisesRegex(ValueError, 'empty|outer two pixels|geometry margin'):
                    pipeline.validate_review(manifest_path, review_path)
            manifest_path.write_bytes(original_manifest)
            pipeline.write(review_path, review)
            first_png = prepared / manifest['frames'][0]['file']
            saved = first_png.read_bytes()
            first_png.write_bytes(saved + b'changed')
            with self.assertRaisesRegex(ValueError, 'RGBA frame changed'):
                pipeline.validate_review(manifest_path, review_path)
            first_png.write_bytes(saved)
            project = folder / 'project'
            palette = [[0, 0, 0], [255, 255, 255], [20, 40, 80]]
            palette_hashes = {}
            for style, size in pipeline.STYLES:
                path = project / f'assets/reactions/{style}/expression-frames.json'
                pipeline.write(path, {'width': size, 'height': size, 'palette': palette})
                palette_hashes[style] = pipeline.sha(path)
                pipeline.write(project / f'assets/reactions/{style}/gesture-videos.json',
                               {'schemaVersion': 1, 'clips': {'wave': {'periodMs': 400, 'frameCount': 4, 'qa': {'accepted': True}}}})
            hd_path = project / 'assets/hires/umi/manifest.json'
            pipeline.write(hd_path, {'schemaVersion': 1, 'width': 640, 'height': 640,
                                     'poses': ['existing-pose'], 'revision': 'before',
                                     'animations': {'search': {'frames': ['existing-search']}}})
            before_publish = hd_path.read_bytes()
            withdrawal = project / 'Hi-Res/animations-640/emotion-shy/withdrawal-record.json'
            pipeline.write(withdrawal, {'schemaVersion': 1, 'status': 'withdrawn-user-rejected', 'deploymentAllowed': False})
            with self.assertRaisesRegex(ValueError, 'withdrawn'):
                pipeline.pack(argparse.Namespace(manifest=manifest_path, review=review_path, root=project))
            self.assertEqual(hd_path.read_bytes(), before_publish)
            self.assertFalse(list((project / 'Hi-Res/sources').glob('*')))
            withdrawal.unlink()
            pipeline.pack(argparse.Namespace(manifest=manifest_path, review=review_path, root=project))
            for style, size in pipeline.STYLES:
                path = project / f'assets/reactions/{style}/expression-frames.json'
                self.assertEqual(pipeline.sha(path), palette_hashes[style])
                pack = pipeline.read(project / f'assets/reactions/{style}/gesture-shy-frames.json')
                self.assertEqual(pack['palette'], palette)
                self.assertEqual(len(pack['frames'][0]['pixels']), size * size)
                self.assertTrue(pack['qa']['accepted'])
                self.assertEqual(pack['sequence']['periodMs'], 250)
                self.assertEqual([s['durationMs'] for s in pack['sequence']['steps']], [83, 84, 83])
                self.assertEqual([f['id'] for f in pack['frames']], [f'gesture-shy-{i:03}' for i in range(3)])
                catalog = pipeline.read(project / f'assets/reactions/{style}/gesture-videos.json')
                self.assertIn('wave', catalog['clips'])
                self.assertEqual(catalog['clips']['shy']['frameCount'], 3)
            hd = pipeline.read(hd_path)
            self.assertEqual(hd['poses'], ['existing-pose'])
            self.assertEqual(hd['animations']['search'], {'frames': ['existing-search']})
            self.assertEqual([f['atMs'] for f in hd['animations']['gestures']['shy']['frames']], [0, 83, 167])
            self.assertNotEqual(hd['revision'], 'before')
            self.assertEqual(len(list((project / 'assets/hires/umi/gesture-shy').glob('*.webp'))), 3)
            self.assertEqual(len(list((project / 'Hi-Res/animations-640/emotion-shy').glob('*.png'))), 3)
            preserved = list((project / 'Hi-Res/sources').glob('h3-expression-shy-*'))
            self.assertEqual(len(preserved), 1)
            self.assertEqual(pipeline.sha(preserved[0] / 'Umi-shy-H3-source.mp4'), pipeline.sha(source))
            self.assertEqual(len(list((preserved[0] / 'matte-16').glob('*.png'))), 12)
            self.assertIn('-processing-' + pipeline.sha(manifest_path)[:12], preserved[0].name)
            archived_manifest = (preserved[0] / 'processing-manifest.json').read_bytes()
            archived_review = (preserved[0] / 'review.json').read_bytes()
            # Identical source video can have a separately reviewed derivative.
            # Its new processing-manifest SHA gets its own immutable archive.
            revised = copy.deepcopy(manifest)
            revised['qa']['reason'] = 'A separately reviewed calibrated derivative of the same source'
            pipeline.write(manifest_path, revised)
            revised_review = copy.deepcopy(review)
            revised_review['manifestSha256'] = pipeline.sha(manifest_path)
            revised_review['qa']['notes'] += ' Second immutable processing record.'
            pipeline.write(review_path, revised_review)
            pipeline.pack(argparse.Namespace(manifest=manifest_path, review=review_path, root=project))
            self.assertEqual(len(list((project / 'Hi-Res/sources').glob('h3-expression-shy-*'))), 2)
            self.assertEqual((preserved[0] / 'processing-manifest.json').read_bytes(), archived_manifest)
            self.assertEqual((preserved[0] / 'review.json').read_bytes(), archived_review)

    def test_terminal_edge_coverage_and_pixel_binary_are_distinct(self):
        # At the outside boundary, a white pixel with 25% coverage should be
        # represented by a dark gray on the terminal, while pixel-art uses its
        # original binary visibility decision. Opaque interior white survives.
        image = Image.new('RGBA', (3, 3), (255, 255, 255, 64))
        image.putpixel((1, 1), (255, 255, 255, 255))
        palette = [[0, 0, 0], [255, 255, 255], [64, 64, 64]]
        terminal = pipeline.index_image(image, palette, 3, background=[0, 0, 0])
        pixel = pipeline.index_image(image, palette, 3, pixel=True)
        self.assertEqual(terminal[0], 2)
        self.assertEqual(pixel[0], 0)
        self.assertEqual(terminal[4], 1)
        self.assertEqual(pixel[4], 1)


if __name__ == '__main__':
    unittest.main()
