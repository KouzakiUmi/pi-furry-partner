#!/usr/bin/env python3
"""WITHDRAWN experiment: material mapping rejected by the user for color pollution.

This historical diagnostic is not a production color transform. Do not import
it from builders or apply it to new art. It remains for reproducing withdrawn
evidence only. The original experiment took normalized full-canvas float RGBA
before a separate aspect correction. It is not an approved fix for new artwork.
Title branding and original idle/happy references were outside its scope.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CALIBRATION_METADATA = {
    'schemaVersion': 1,
    'id': 'umi-expression-material-color-v1',
    'status': 'withdrawn-user-rejected',
    'deploymentAllowed': False,
    'method': 'Fixed soft RGB material domains; preserved texture and alpha; no per-frame fitting',
    'scope': 'Nine authored expression keyframes and their H3 action video derivatives only',
    'excluded': ['original idle/happy art', 'title PNG', 'title wave animation', 'other existing states'],
    'referenceSpace': 'Normalized full 640px source canvas before aspect correction',
    'referenceSources': {
        'Hi-Res/poses-640/idle-open.png': '5496de55395de32dac62ce6b91a2ec79458ad955c6ae52e23233c174ba0980cc',
        'Hi-Res/poses-640/happy.png': '2799483443901667ecd1f671416de2f659e13222541073b6a7971306e1ac6338',
    },
    'paw': {'rgbDelta255': [-8, -3, 5], 'warmthRminusB255': [2, 7],
            'luminanceFadeIn255': [100, 135], 'luminanceFadeOut255': [185, 205],
            'chromaFadeOut255': [24, 38]},
    'navy': {'rgbLift255': [16, 24, 39], 'blueMinusRedFadeIn255': [4, 10],
             'blueMinusRedFadeOut255': [46, 66], 'greenMinusRedFadeIn255': [1, 4],
             'luminanceFadeIn255': [28, 48], 'luminanceFadeOut255': [115, 145],
             'tonalLiftWeight': '.58 + .42*smoothstep(40,80,luminance255)',
             'faceProtection': {'center': [.45, .54], 'radii': [.26, .21],
                                'ellipseRadiusFade': [.85, 1.12]}},
    'scarf': {'redTowardBlue': .29, 'greenTowardBlue': .10, 'blueAwayFromRed': .06,
              'lowerCanvasYFade': [.60, .66], 'blueMinusRedFadeIn255': [55, 90],
              'blueMinusGreenFadeIn255': [22, 50], 'greenMinusRedFadeIn255': [25, 65],
              'blueFadeIn255': [135, 175], 'redFadeIn255': [22, 50]},
    'preservation': {'alpha': 'bit-for-bit input alpha', 'black': 'RGB max<=45/255 remains exact',
                     'whiteFur': 'Bright neutral pixels outside all material domains',
                     'orangeEyeStars': 'Warm saturated orange outside all material domains',
                     'pinkPads': 'Warm saturated pink outside all material domains',
                     'warmAccentsExact': 'R>175/255 and R-G>18/255 and R-B>7/255 remain exact',
                     'shading': 'No palette flattening, blur, histogram matching or frame statistics'},
    'perFrameStatistics': False, 'changesGeometry': False, 'changesAlpha': False,
}


def _smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def _weights(rgb):
    r, g, b = rgb[:, :, 0] * 255, rgb[:, :, 1] * 255, rgb[:, :, 2] * 255
    luminance = .2126 * r + .7152 * g + .0722 * b
    chroma = (rgb.max(2) - rgb.min(2)) * 255
    yy = (np.arange(rgb.shape[0], dtype=np.float64) + .5) / rgb.shape[0]
    xx = (np.arange(rgb.shape[1], dtype=np.float64) + .5) / rgb.shape[1]
    x, y = xx[None, :], yy[:, None]
    paw = (_smooth(2, 7, r - b) * (1 - _smooth(24, 38, chroma))
           * _smooth(100, 135, luminance) * (1 - _smooth(185, 205, luminance)))
    scarf = (_smooth(.60, .66, y) * _smooth(55, 90, b - r)
             * _smooth(22, 50, b - g) * _smooth(25, 65, g - r)
             * _smooth(135, 175, b) * _smooth(22, 50, r))
    face_radius = np.sqrt(((x - .45) / .26) ** 2 + ((y - .54) / .21) ** 2)
    outside_face = _smooth(.85, 1.12, face_radius)
    navy = (_smooth(4, 10, b - r) * (1 - _smooth(46, 66, b - r))
            * _smooth(1, 4, g - r) * _smooth(28, 48, luminance)
            * (1 - _smooth(115, 145, luminance))
            * (.58 + .42 * _smooth(40, 80, luminance))
            * outside_face * (1 - scarf))
    return paw, navy, scarf


def calibrate_expression_rgb(rgba):
    """Return same-shape/dtype float RGBA with one fixed material mapping.

    Input must be a normalized full source canvas, before aspect correction.
    No frame ID, temporal state, fitted statistics or mutable cache is used.
    Original alpha and completely transparent RGB are retained exactly.
    """
    source = np.asarray(rgba)
    if source.ndim != 3 or source.shape[2] != 4 or source.dtype.kind != 'f':
        raise ValueError('Expected HxWx4 float RGBA in the 0..1 range')
    if not np.isfinite(source).all() or source.min() < 0 or source.max() > 1:
        raise ValueError('RGBA must contain finite normalized values')
    output = source.copy()
    rgb = source[:, :, :3].astype(np.float64, copy=False)
    paw, navy, scarf = _weights(rgb)
    delta = (paw[:, :, None] * (np.array([-8, -3, 5], dtype=float) / 255)
             + navy[:, :, None] * (np.array([16, 24, 39], dtype=float) / 255))
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    blue_change = np.stack((.29 * (b - r), .10 * (b - g), -.06 * (b - r)), axis=2)
    delta += scarf[:, :, None] * blue_change
    # Stable pixel-domain protection, not a frame-wise feature detector. The
    # dark line and alpha planes are never changed by material calibration.
    warm_accent = (r > 175 / 255) & (r - g > 18 / 255) & (r - b > 7 / 255)
    eligible = (source[:, :, 3] > 0) & (rgb.max(2) > 45 / 255) & ~warm_accent
    corrected = np.clip(rgb + delta, 0, 1)
    output[:, :, :3] = np.where(eligible[:, :, None], corrected, rgb)
    return output


def _composite(image, color=(16, 23, 35)):
    bg = Image.new('RGBA', image.size, (*color, 255))
    bg.alpha_composite(image.convert('RGBA'))
    return bg.convert('RGB')


def _font(size):
    for file in ('C:/Windows/Fonts/consola.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if Path(file).exists():
            return ImageFont.truetype(file, size)
    return ImageFont.load_default()


def _sample(image, name):
    a = np.asarray(image.convert('RGBA'))
    rgb = a[:, :, :3].astype(float)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    y, x = np.indices(a.shape[:2])
    opaque = a[:, :, 3] > 230
    lum = .2126 * r + .7152 * g + .0722 * b
    masks = {
        'navy': opaque & (y < 390) & (lum > 35) & (lum < 125) & (b - r > 4)
                & (b - r < 55) & (g - r > 0) & (b - g < 30),
        'pawGray': opaque & (y > 460) & (lum > 80) & (lum < 195)
                   & ((rgb.max(2) - rgb.min(2)) < 25) & (x > 100) & (x < 490),
        'scarfBlue': opaque & (y > (350 if name in ('idle', 'happy') else 420)) & (y < 550)
                     & (b > 145) & (b - r > 65) & (g > 60) & (g < b * .9),
    }
    return {label: {'pixels': int(mask.sum()), 'medianRgb': np.median(rgb[mask], axis=0).round(1).tolist()}
            for label, mask in masks.items() if mask.any()}


def preview(output):
    """Write only candidate review outputs; production assets are read-only."""
    output = output.resolve()
    if output == ROOT or output.is_relative_to(ROOT / 'assets') or output.is_relative_to(ROOT / 'Hi-Res'):
        raise ValueError('Candidate preview must stay outside production/source asset directories')
    output.mkdir(parents=True, exist_ok=True)
    idle = Image.open(ROOT / 'Hi-Res/poses-640/idle-open.png').convert('RGBA')
    happy = Image.open(ROOT / 'Hi-Res/poses-640/happy.png').convert('RGBA')
    candidates = [('joy', idle, ROOT / 'assets/poses/expressions/emotion-joy.png'),
                  ('shy', happy, ROOT / 'assets/poses/expressions/emotion-shy.png'),
                  ('proud', idle, ROOT / 'assets/poses/expressions/emotion-proud.png'),
                  ('H3-cry-021', idle, ROOT / 'Hi-Res/animations-640/emotion-cry/gesture-cry-021.png')]
    cell, title_height = 400, 54
    board = Image.new('RGB', (cell * 3, (cell + title_height) * len(candidates)), '#101723')
    draw = ImageDraw.Draw(board)
    report = {'metadata': CALIBRATION_METADATA,
              'referenceSamples': {'idle': _sample(idle, 'idle'), 'happy': _sample(happy, 'happy')},
              'candidates': [], 'productionAssetsChanged': False}
    for row, (name, reference, path) in enumerate(candidates):
        new = Image.open(path).convert('RGBA')
        rgba = np.asarray(new, dtype=np.float64) / 255
        corrected = calibrate_expression_rgb(rgba)
        result = Image.fromarray(np.uint8(np.rint(corrected * 255)))
        result.save(output / f'{name}-color-candidate.png')
        for column, (label, image) in enumerate([('Original reference', reference), (f'New: {name}', new), ('Fixed color candidate', result)]):
            x, y = column * cell, row * (cell + title_height)
            board.paste(_composite(image).resize((cell, cell), Image.Resampling.LANCZOS), (x, y + title_height))
            draw.text((x + 12, y + 12), label, font=_font(19), fill='#dce7fa')
        changed = np.abs(corrected[:, :, :3] - rgba[:, :, :3]).max(2)
        rgb255 = rgba[:, :, :3] * 255
        warm_orange = (rgb255[:, :, 0] > 220) & (rgb255[:, :, 1] > 60) & (rgb255[:, :, 1] < 185) & (rgb255[:, :, 2] < 100)
        pink = (rgb255[:, :, 0] > 180) & (rgb255[:, :, 0] - rgb255[:, :, 1] > 28) & (rgb255[:, :, 0] - rgb255[:, :, 2] > 10)
        white = rgb255.min(2) > 210
        dark = rgb255.max(2) <= 45
        report['candidates'].append({'id': name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'before': _sample(new, name), 'after': _sample(result, name),
            'alphaIdentical': bool(np.array_equal(rgba[:, :, 3], corrected[:, :, 3])),
            'orangeStarChangedPixels': int((warm_orange & (changed > 1e-12)).sum()),
            'pinkPadChangedPixels': int((pink & (changed > 1e-12)).sum()),
            'brightWhiteChangedPixels': int((white & (changed > 1e-12)).sum()),
            'blackChangedPixels': int((dark & (changed > 1e-12)).sum()),
            'changedPixels': int((changed > 1e-12).sum())})
    board.save(output / 'original-new-fixed-color.png')
    (output / 'color-calibration-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'preview': str(output / 'original-new-fixed-color.png'),
                      'report': str(output / 'color-calibration-report.json'), 'productionAssetsChanged': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', type=Path, required=True, help='Candidate outputs only; original art/runtime assets stay untouched')
    args = parser.parse_args()
    preview(args.preview)
