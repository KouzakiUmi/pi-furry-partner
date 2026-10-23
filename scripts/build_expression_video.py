#!/usr/bin/env python3
"""Prepare and explicitly review-gate real H3 expression animation frames.

process: decode every source frame, retain independent 16-bit green-luminance
matte/alpha evidence, and sample the forward source timeline at a fixed stride.
pack: accept only an explicit, source-bound review JSON with qa.accepted=true.
No generation API, interpolation, reverse playback, local rig or image warping
is used here. Dependencies: ffmpeg/ffprobe, Pillow, NumPy; SciPy is optional.
"""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from build_watch_matte import extract_matte, resize_soft, save_rgba, composite
from build_watch_video import index_image
from expression_publication import (SOURCE_NATIVE_PROCESSING, assert_no_withdrawal,
                                    normalize_full_canvas, source_native_geometry_metrics)


ROOT = Path(__file__).resolve().parents[1]
EXPRESSION_IDS = ('joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered',
                  'surprise', 'proud', 'affection')
STYLES = (('umi', 240),)  # Original pixel animation stays frozen.
REQUIRED_REVIEW_CHECKS = (
    'continuousArticulatedMotion', 'loopAndTransition', 'foldedViewerLeftEar',
    'fourToesAndShortClaws', 'tailColorsIfVisible', 'noClippedLimbsOrScarf',
    'cleanAlphaAndFur', 'proportionsMatchReference', 'materialColorsMatchReference',
)
PROCESSING = {
    'method': 'Independent green-luminance background matte, inverse alpha, inverse RGB compositing',
    'formula': 'greenLuma=0.7152*max(0,G-max(R,B)); backgroundMatte=greenLuma/backgroundGreenLuma; alpha=1-backgroundMatte; F=(C-backgroundMatte*B)/alpha',
    'sourceMatteBits': 16, 'sourceAlphaBits': 16, 'runtimeAlphaBits': 8,
    'canvas': 'Fixed 640x640 full source canvas; same transform for every frame',
    'resize': 'Premultiplied Lanczos, identical RGB/alpha kernel',
    'perFrameAlignment': False, 'perFrameScale': False,
    'erosion': False, 'greenChannelErasure': False, 'rgbDespill': False,
    'interpolated': False, 'reversed': False, 'crossfaded': False,
    'motionRig': False, 'audioIncluded': False,
}


def processing_for_action(action):
    """Bind new expression reviews to source-native color and proportions."""
    if action == 'title-wave':
        return copy.deepcopy(PROCESSING)
    if action not in EXPRESSION_IDS:
        raise ValueError('Unknown expression action')
    return {**copy.deepcopy(PROCESSING),
            'sourceNative': copy.deepcopy(SOURCE_NATIVE_PROCESSING),
            'calibrationOrder': ['uniform-full-source-to-640'],
            'perFrameFitting': False}


def prepare_runtime_frame(rgba, action, *, already_normalized=False):
    if action not in (*EXPRESSION_IDS, 'title-wave'):
        raise ValueError('Unknown expression action')
    # The legacy flag is accepted for callers, but never bypasses validation.
    return normalize_full_canvas(rgba)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2 if pretty else None,
                      separators=None if pretty else (',', ':')) + '\n'
    temporary = path.with_name(path.name + '.partial')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)


def round_ms(seconds: Fraction) -> int:
    value = seconds * 1000
    return (value.numerator * 2 + value.denominator) // (2 * value.denominator)


def positive_fraction(value):
    try:
        result = Fraction(str(value))
        return result if result > 0 else None
    except (ValueError, ZeroDivisionError, TypeError):
        return None


def probe_video(source: Path, ffprobe='ffprobe'):
    result = subprocess.run([
        ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_frames',
        '-show_streams', '-show_entries',
        'stream=width,height,codec_name,avg_frame_rate,duration:frame=best_effort_timestamp_time,pts_time,duration_time,pkt_duration_time',
        '-of', 'json', str(source),
    ], check=True, capture_output=True, text=True)
    probe = json.loads(result.stdout)
    streams = probe.get('streams', [])
    frames = probe.get('frames', [])
    if len(streams) != 1 or len(frames) < 2:
        raise ValueError('A source with one selected video stream and at least two frames is required')
    stream = streams[0]
    width, height = int(stream['width']), int(stream['height'])
    if width != height:
        raise ValueError('Expression source must already have a square full canvas; no crop/stretch is allowed')
    timestamps = []
    for frame in frames:
        timestamp = frame.get('best_effort_timestamp_time', frame.get('pts_time'))
        if timestamp is None:
            raise ValueError('Missing real source timestamps; refusing to invent playback timing')
        timestamps.append(Fraction(str(timestamp)))
    origin = timestamps[0]
    timestamps = [value - origin for value in timestamps]
    if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
        raise ValueError('Source video timestamps must be strictly increasing')
    final_duration = positive_fraction(frames[-1].get('duration_time')) or positive_fraction(frames[-1].get('pkt_duration_time'))
    # A stream duration is a media measurement, never a target 6-second guess.
    if final_duration is None:
        stream_duration = positive_fraction(stream.get('duration'))
        if stream_duration and stream_duration > timestamps[-1]:
            final_duration = stream_duration - timestamps[-1]
        else:
            raise ValueError('Missing final source-frame duration')
    end = timestamps[-1] + final_duration
    return {
        'width': width, 'height': height, 'codec': stream.get('codec_name'),
        'fps': stream.get('avg_frame_rate'), 'frameCount': len(frames),
        'timestamps': timestamps, 'end': end,
    }


def sample_timeline(probe, stride=2):
    if not isinstance(stride, int) or stride < 1:
        raise ValueError('Stride must be a positive integer')
    indices = list(range(0, probe['frameCount'], stride))
    boundaries = [round_ms(probe['timestamps'][index]) for index in indices]
    boundaries.append(round_ms(probe['end']))
    durations = [b - a for a, b in zip(boundaries, boundaries[1:])]
    if len(indices) < 2 or any(duration <= 0 for duration in durations):
        raise ValueError('Sampling must preserve at least two distinct, positive-duration frames')
    return [dict(sourceFrame=index, atMs=boundaries[n], durationMs=durations[n])
            for n, index in enumerate(indices)]


def alpha_metrics(rgba):
    alpha = rgba[:, :, 3]
    mask = alpha >= .5
    mass = float(alpha.sum())
    height, width = alpha.shape
    if mass > 0:
        yy, xx = np.indices(alpha.shape)
        centroid = [float((xx * alpha).sum() / mass), float((yy * alpha).sum() / mass)]
    else:
        centroid = None
    points = np.argwhere(mask)
    bbox = None if not len(points) else [int(points[:, 1].min()), int(points[:, 0].min()),
                                         int(points[:, 1].max() + 1), int(points[:, 0].max() + 1)]
    edge = alpha > 180 / 255
    outer = np.zeros(alpha.shape, dtype=bool)
    outer[:2] = outer[-2:] = True
    outer[:, :2] = outer[:, -2:] = True
    return {'alphaMass': round(mass, 4), 'opaqueCoverage': round(float(mask.mean()), 6),
            'centroid': centroid, 'bbox': bbox,
            'empty': not bool(mask.any()),
            'outerTwoPixelAlphaPixels': int((edge & outer).sum()),
            'canvas': [width, height]}


def pair_metrics(before, after):
    a, b = before[:, :, 3] >= .5, after[:, :, 3] >= .5
    union = a | b
    iou = float((a & b).sum() / max(1, union.sum()))
    premul_a = before[:, :, :3] * before[:, :, 3:]
    premul_b = after[:, :, :3] * after[:, :, 3:]
    motion = float(np.abs(premul_a - premul_b)[union].mean()) if union.any() else 0.
    alpha_delta = float(np.abs(before[:, :, 3] - after[:, :, 3])[union].mean()) if union.any() else 0.
    ca, cb = alpha_metrics(before)['centroid'], alpha_metrics(after)['centroid']
    distance = math.dist(ca, cb) if ca is not None and cb is not None else None
    return {'alphaIoU': round(iou, 6), 'centroidDistancePx': None if distance is None else round(distance, 5),
            'premultipliedRgbMotion': round(motion, 7), 'alphaMotion': round(alpha_delta, 7)}


def font(size=16):
    for path in ('C:/Windows/Fonts/consola.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_previews(folder: Path, records, action):
    cell, label_height, columns = 160, 34, 8
    rows = math.ceil(len(records) / columns)
    board = Image.new('RGB', (columns * cell, rows * (cell + label_height)), '#111827')
    draw = ImageDraw.Draw(board)
    previews = []
    for n, record in enumerate(records):
        with Image.open(folder / record['file']) as opened:
            array = np.asarray(opened.convert('RGBA'), dtype=np.float64) / 255
        dark = composite(array, (11, 18, 30))
        if len(records) <= 96:
            previews.append(dark.resize((480, 480), Image.Resampling.LANCZOS))
        x, y = n % columns * cell, n // columns * (cell + label_height)
        board.paste(dark.resize((cell, cell), Image.Resampling.LANCZOS), (x, y + label_height))
        draw.text((x + 4, y + 2), f"{n:03} src {record['sourceFrame']:03}", font=font(12), fill='#e0eaff')
        draw.text((x + 4, y + 17), f"{record['atMs']}ms +{record['durationMs']}", font=font(11), fill='#8ea5c8')
    board.save(folder / 'contact-sheet.png')
    if previews:
        # GIF has a centisecond clock. Only the preview gets this quantization;
        # the production PNG manifest retains real source millisecond timing.
        ends = [r['atMs'] + r['durationMs'] for r in records]
        gif_boundaries = [0] + [int(math.floor(value / 10 + .5)) * 10 for value in ends]
        durations = [max(10, b - a) for a, b in zip(gif_boundaries, gif_boundaries[1:])]
        previews[0].save(folder / f'{action}-preview.gif', save_all=True,
                         append_images=previews[1:], duration=durations, loop=0,
                         disposal=2, optimize=False)


def process(args):
    source, output = args.source.resolve(), args.out.resolve()
    processing = processing_for_action(args.action)
    assert_no_withdrawal(source.parent, output)
    if not source.is_file():
        raise ValueError(f'Source video does not exist: {source}')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Process output must be empty; use a new versioned folder to preserve earlier evidence')
    output.mkdir(parents=True, exist_ok=True)
    probe = probe_video(source, args.ffprobe)
    records = sample_timeline(probe, args.stride)
    raw_folder, rgba_folder, matte_folder = output / 'decoded', output / 'rgba-640', output / 'matte-16'
    for directory in (raw_folder, rgba_folder, matte_folder):
        directory.mkdir()
    subprocess.run([
        args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(source),
        '-map', '0:v:0', '-fps_mode', 'passthrough', '-start_number', '0',
        str(raw_folder / 'source-%05d.png'),
    ], check=True)
    raw_files = sorted(raw_folder.glob('source-*.png'))
    if len(raw_files) != probe['frameCount']:
        raise ValueError('Decoded frame count differs from the measured timestamp count')
    chosen = {r['sourceFrame']: (n, r) for n, r in enumerate(records)}
    source_evidence, qc_frames = [], []
    first_selected = previous_selected = None
    for index, path in enumerate(raw_files):
        with Image.open(path) as opened:
            rgba, matte, detail = extract_matte(opened)
        background_file = matte_folder / f'source-{index:05d}-background-matte.png'
        alpha_file = matte_folder / f'source-{index:05d}-foreground-alpha.png'
        Image.fromarray(np.uint16(np.rint(matte * 65535))).save(background_file)
        Image.fromarray(np.uint16(np.rint((1 - matte) * 65535))).save(alpha_file)
        metrics = alpha_metrics(rgba)
        evidence = {
            'sourceFrame': index, 'atMs': float(probe['timestamps'][index] * 1000),
            'rawFile': path.relative_to(output).as_posix(), 'rawSha256': sha(path),
            'backgroundMatte': background_file.relative_to(output).as_posix(),
            'backgroundMatteSha256': sha(background_file),
            'foregroundAlpha': alpha_file.relative_to(output).as_posix(),
            'foregroundAlphaSha256': sha(alpha_file),
            'qc': metrics, 'matte': detail,
        }
        source_evidence.append(evidence)
        if index not in chosen:
            continue
        sequence_index, record = chosen[index]
        normalized = normalize_full_canvas(rgba)
        scaled = prepare_runtime_frame(normalized, args.action, already_normalized=True)
        frame_id = f'gesture-{args.action}-{sequence_index:03d}'
        png = rgba_folder / f'{frame_id}.png'
        save_rgba(scaled, png)
        record.update(id=frame_id, file=png.relative_to(output).as_posix(), sha256=sha(png))
        diagnostic = {'id': frame_id, 'sourceFrame': index, **alpha_metrics(scaled)}
        if args.action in EXPRESSION_IDS:
            diagnostic['geometryMargin'] = source_native_geometry_metrics(scaled)
        if previous_selected is not None:
            diagnostic['fromPrevious'] = pair_metrics(previous_selected, scaled)
        if first_selected is None:
            first_selected = scaled
        previous_selected = scaled
        qc_frames.append(diagnostic)
    loop = pair_metrics(previous_selected, first_selected)
    edge_frames = [r['sourceFrame'] for r in source_evidence if r['qc']['outerTwoPixelAlphaPixels']]
    empty_frames = [r['sourceFrame'] for r in source_evidence if r['qc']['empty']]
    period = sum(r['durationMs'] for r in records)
    manifest = {
        'schemaVersion': 1, 'action': args.action,
        'source': {'file': str(source), 'sha256': sha(source), 'width': probe['width'],
                   'height': probe['height'], 'codec': probe['codec'], 'fps': probe['fps'],
                   'frameCount': probe['frameCount'], 'durationMs': period,
                   'durationExactSeconds': str(probe['end'])},
        'canvas': {'width': 640, 'height': 640, 'fixed': True},
        'sampling': {'stride': args.stride, 'sourceOrder': 'strictly increasing',
                     'periodMs': period, 'frameCount': len(records),
                     'completeSourcePeriod': True, 'trimmedFrames': [],
                     'timestamps': 'best_effort_timestamp_time, source final packet duration',
                     'integerMilliseconds': 'Round cumulative source timestamps, never round each duration independently'},
        'processing': processing, 'frames': records, 'sourceFrames': source_evidence,
        'qc': {'emptySourceFrames': empty_frames, 'sourceFramesTouchingOuterTwoPixels': edge_frames,
               'selectedFramesFailingGeometryMargin': [r['sourceFrame'] for r in qc_frames
                                                       if r.get('geometryMargin', {}).get('withinMargin') is False],
               'loop': loop, 'frames': qc_frames,
               'automaticVerdict': 'Requires human visual review; diagnostics do not approve anatomy or continuity'},
        'qa': {'accepted': False, 'reason': 'Unreviewed generated video; no runtime pack may be installed'},
    }
    write(output / 'manifest.json', manifest, pretty=True)
    write(output / 'review-template.json', {
        'schemaVersion': 1, 'action': args.action,
        'manifestSha256': sha(output / 'manifest.json'), 'sourceSha256': manifest['source']['sha256'],
        'qa': {'accepted': False, 'reviewer': '', 'notes': '',
               'checks': {'continuousArticulatedMotion': None, 'loopAndTransition': None,
                          'foldedViewerLeftEar': None, 'fourToesAndShortClaws': None,
                          'tailColorsIfVisible': None, 'noClippedLimbsOrScarf': None,
                          'cleanAlphaAndFur': None, 'proportionsMatchReference': None,
                          'materialColorsMatchReference': None}},
    }, pretty=True)
    make_previews(output, records, args.action)
    print(json.dumps({'action': args.action, 'out': str(output), 'frames': len(records),
                      'periodMs': period, 'qa': {'accepted': False},
                      'emptyFrames': empty_frames, 'edgeFrames': edge_frames}, ensure_ascii=False))


def local_child(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or path == root.resolve():
        raise ValueError('A manifest evidence file escaped the prepared directory')
    return path


def validate_review(manifest_path: Path, review_path: Path):
    assert_no_withdrawal(manifest_path.parent, review_path.parent)
    manifest, review = read(manifest_path), read(review_path)
    action = manifest.get('action')
    if action not in EXPRESSION_IDS:
        raise ValueError('Unknown expression action')
    if review.get('qa', {}).get('accepted') is not True:
        raise ValueError('An explicit external review JSON with qa.accepted=true is required')
    qa = review['qa']
    if any(not isinstance(qa.get(field), str) or not qa[field].strip() for field in ('reviewer', 'notes')):
        raise ValueError('Review must identify a reviewer and explain acceptance in notes')
    checks = qa.get('checks')
    if not isinstance(checks, dict) or any(check not in checks for check in REQUIRED_REVIEW_CHECKS):
        raise ValueError('Review checklist must include every required anatomy, motion, loop and alpha check')
    for check, value in checks.items():
        if value is True:
            continue
        # This is the only non-boolean resolution: the video never reveals a
        # tail, so there is no visible tail color evidence to claim checked.
        if (check == 'tailColorsIfVisible' and isinstance(value, str)
                and value.strip().lower() in ('na: tail concealed', 'n/a: tail concealed',
                                              'na: tail concealed throughout', 'n/a: tail concealed throughout')):
            continue
        raise ValueError(f'Review checklist contains a failed or unresolved item: {check}')
    if review.get('action') != action or review.get('manifestSha256') != sha(manifest_path):
        raise ValueError('Review must identify this exact prepared action and manifest SHA-256')
    if review.get('sourceSha256') != manifest.get('source', {}).get('sha256'):
        raise ValueError('Review source SHA-256 differs from this video')
    source = Path(manifest['source']['file']).resolve()
    assert_no_withdrawal(source.parent)
    if not source.is_file() or sha(source) != manifest['source']['sha256']:
        raise ValueError('The source video changed after preparation')
    folder = manifest_path.parent
    records = manifest.get('frames', [])
    if not 2 <= len(records) <= 96 or len(records) * 240 * 240 > 6000000:
        raise ValueError('Runtime supports 2..96 selected frames and at most six million indexed pixels per action')
    if manifest.get('canvas') != {'width': 640, 'height': 640, 'fixed': True}:
        raise ValueError('Fixed 640x640 prepared canvas is required')
    if manifest.get('processing') != processing_for_action(action) or manifest['sampling'].get('completeSourcePeriod') is not True:
        raise ValueError('Processing configuration must match the current source-native pipeline; withdrawn RGB/aspect calibration is forbidden')
    stride = manifest['sampling'].get('stride')
    if type(stride) is not int or stride < 1 or [r.get('sourceFrame') for r in records] != list(range(0, manifest['source']['frameCount'], stride)):
        raise ValueError('Fixed-stride source selection must include the entire forward period without skipped motion')
    period, previous_source, previous_end = 0, -1, 0
    for n, record in enumerate(records):
        if record.get('id') != f'gesture-{action}-{n:03d}':
            raise ValueError('Unexpected or unordered frame ID')
        duration = record.get('durationMs')
        if not isinstance(duration, int) or isinstance(duration, bool) or not 40 <= duration <= 2000:
            raise ValueError('Each runtime step must last 40..2000 real-source milliseconds')
        if record.get('atMs') != previous_end or record['sourceFrame'] <= previous_source:
            raise ValueError('Frame sequence must be complete, forward, and contiguous')
        png = local_child(folder, record['file'])
        if sha(png) != record['sha256']:
            raise ValueError('A prepared RGBA frame changed after review')
        with Image.open(png) as opened:
            if opened.size != (640, 640) or opened.mode != 'RGBA':
                raise ValueError('Frame must remain 640x640 RGBA')
        previous_source, previous_end = record['sourceFrame'], previous_end + duration
        period += duration
    if not 80 <= period <= 15000 or period != manifest['sampling']['periodMs'] or period != manifest['source']['durationMs']:
        raise ValueError('Runtime period must equal the complete measured source period, at most 15 seconds')
    evidence = manifest.get('sourceFrames', [])
    if len(evidence) != manifest['source']['frameCount']:
        raise ValueError('Independent matte evidence must exist for every source frame')
    diagnostics = manifest.get('qc', {})
    if diagnostics.get('emptySourceFrames') or diagnostics.get('sourceFramesTouchingOuterTwoPixels'):
        raise ValueError('A video with empty frames or foreground touching the outer two pixels cannot be packed')
    if diagnostics.get('selectedFramesFailingGeometryMargin'):
        raise ValueError('A calibrated selected frame fails the fixed expression geometry margin')
    if any(record.get('empty') is True or record.get('outerTwoPixelAlphaPixels', 0) > 0
           for record in diagnostics.get('frames', [])):
        raise ValueError('A selected frame is empty or touches the outer two pixels')
    if len(diagnostics.get('frames', [])) != len(records):
        raise ValueError('Final selected-frame diagnostics must cover every calibrated frame')
    for record in diagnostics['frames']:
        margin = record.get('geometryMargin')
        if not isinstance(margin, dict) or margin.get('withinMargin') is not True:
            raise ValueError('A calibrated selected frame has missing or failed geometry margin diagnostics')
    for n, record in enumerate(evidence):
        if record.get('sourceFrame') != n:
            raise ValueError('Matte evidence source order is incomplete')
        frame_qc = record.get('qc', {})
        if frame_qc.get('empty') is True or frame_qc.get('outerTwoPixelAlphaPixels', 0) > 0:
            raise ValueError('A source frame is empty or touches the outer two pixels; acceptance cannot override failed QC')
        for file_key, sha_key in [('rawFile', 'rawSha256'), ('backgroundMatte', 'backgroundMatteSha256'),
                                  ('foregroundAlpha', 'foregroundAlphaSha256')]:
            evidence_path = local_child(folder, record[file_key])
            if sha(evidence_path) != record[sha_key]:
                raise ValueError('A source frame or independent matte changed after review')
            if file_key != 'rawFile':
                with Image.open(evidence_path) as opened:
                    if opened.mode not in ('I;16', 'I;16L', 'I;16B', 'I'):
                        raise ValueError('Source matte evidence must retain sixteen-bit grayscale')
    return manifest, review


def copy_preserved(source: Path, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and sha(target) != sha(source):
        raise ValueError(f'Refusing to overwrite a different preserved source: {target}')
    if not target.exists():
        shutil.copy2(source, target)


@contextmanager
def publication_lock(root):
    # All expressions update the same catalogs and HD manifest. A second
    # publisher must wait for a fresh invocation, never merge a stale snapshot.
    lock = root.resolve() / 'work' / '.h3-expression-pack.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        handle = lock.open('x', encoding='utf-8')
    except FileExistsError as error:
        raise ValueError('Another expression pack is publishing; pack actions sequentially. '
                         f'If an interrupted publisher left a lock, inspect it before removing: {lock}') from error
    try:
        with handle:
            handle.write('Exclusive H3 expression catalog / HD publication lock\n')
        yield
    finally:
        lock.unlink()


def pack(args):
    with publication_lock(args.root):
        return pack_locked(args)


def pack_locked(args):
    manifest_path, review_path, root = args.manifest.resolve(), args.review.resolve(), args.root.resolve()
    manifest, review = validate_review(manifest_path, review_path)
    action, records = manifest['action'], manifest['frames']
    animation = root / f'Hi-Res/animations-640/emotion-{action}'
    assert_no_withdrawal(animation)
    period = manifest['sampling']['periodMs']
    manifest_sha = sha(manifest_path)
    qa = {'accepted': True, 'reviewSha256': sha(review_path), 'processingManifestSha256': manifest_sha,
          'sourceSha256': manifest['source']['sha256']}
    steps = [{'id': record['id'], 'durationMs': record['durationMs']} for record in records]
    hd_clip = {'durationMs': period, 'periodMs': period, 'qa': qa,
               'frames': [{'atMs': r['atMs'], 'id': r['id']} for r in records],
               'ids': [r['id'] for r in records]}
    bank = root / 'assets/hires/umi'
    hd_manifest_path = bank / 'manifest.json'
    if not hd_manifest_path.exists():
        raise ValueError('An existing HD manifest is required; unrelated poses/animations will be preserved')
    hd_manifest = read(hd_manifest_path)
    palettes = {}
    for style, size in STYLES:
        expression_path = root / f'assets/reactions/{style}/expression-frames.json'
        sheet = read(expression_path)
        if sheet.get('width') != size or sheet.get('height') != size:
            raise ValueError('Expression palette canvas differs from runtime style')
        palette = sheet['palette']
        if not 2 <= len(palette) <= 512 or palette[0] != [0, 0, 0]:
            raise ValueError('Expression palette must preserve transparent index zero')
        if any(not isinstance(c, list) or len(c) != 3 or any(type(v) is not int or not 0 <= v <= 255 for v in c) for c in palette):
            raise ValueError('Invalid immutable expression palette')
        palettes[style] = (palette, sha(expression_path))
    # Build all expensive assets away from the runtime folders. Publishing is
    # a separate explicit CLI action, and only starts after every input check.
    with tempfile.TemporaryDirectory(prefix=f'umi-expression-{action}-') as temporary:
        stage = Path(temporary)
        for style, size in STYLES:
            palette, palette_sha = palettes[style]
            frames = []
            for record in records:
                with Image.open(local_child(manifest_path.parent, record['file'])) as opened:
                    pixels = index_image(opened.convert('RGBA'), palette, size,
                                         pixel=style.endswith('pixel'),
                                         background=[0, 0, 0] if size == 240 else None)
                frames.append({'id': record['id'], 'pixels': pixels})
            write(stage / f'{style}.json', {
                'schemaVersion': 1, 'action': action, 'width': size, 'height': size,
                'palette': palette, 'frames': frames,
                'sequence': {'periodMs': period, 'steps': steps}, 'qa': qa,
                'motion': {'bakedMotion': True}, 'paletteSourceSha256': palette_sha,
            })
        for record in records:
            with Image.open(local_child(manifest_path.parent, record['file'])) as opened:
                opened.save(stage / f"{record['id']}.webp", format='WEBP', lossless=True, exact=True, method=4)
        # The lightweight catalog preserves unrelated reviewed actions.
        catalogs = {}
        for style, _ in STYLES:
            catalog_path = root / f'assets/reactions/{style}/gesture-videos.json'
            catalog = read(catalog_path) if catalog_path.exists() else {'schemaVersion': 1, 'clips': {}}
            catalog.setdefault('clips', {})[action] = {'periodMs': period, 'frameCount': len(records), 'qa': qa}
            catalog['schemaVersion'] = 1
            catalogs[style] = catalog
        # Preserve the original green video and audit evidence separately from
        # npm runtime files. No generation credential or signed URL is copied.
        archive = root / f'Hi-Res/sources/h3-expression-{action}-{manifest["source"]["sha256"][:12]}-processing-{manifest_sha[:12]}'
        source = Path(manifest['source']['file']).resolve()
        # Recheck after encoding too: a concurrent withdrawal must not be lost.
        assert_no_withdrawal(manifest_path.parent, review_path.parent, source.parent, archive, animation)
        copy_preserved(source, archive / f'Umi-{action}-H3-source.mp4')
        copy_preserved(manifest_path, archive / 'processing-manifest.json')
        copy_preserved(review_path, archive / 'review.json')
        for record in manifest['sourceFrames']:
            for key in ('backgroundMatte', 'foregroundAlpha'):
                evidence = local_child(manifest_path.parent, record[key])
                copy_preserved(evidence, archive / record[key])
        animation.mkdir(parents=True, exist_ok=True)
        for record in records:
            shutil.copy2(local_child(manifest_path.parent, record['file']), animation / f"{record['id']}.png")
        write(animation / 'timeline.json', {
            'schemaVersion': 1, 'width': 640, 'height': 640,
            'alpha': 'continuous A8 preserved', 'qa': qa, 'processing': manifest['processing'],
            'source': {'file': f'{archive.relative_to(root).as_posix()}/Umi-{action}-H3-source.mp4',
                       'sha256': manifest['source']['sha256']},
            'clips': {action: hd_clip}, 'sequence': {'periodMs': period, 'steps': steps},
            'sourceFrames': [{'id': r['id'], 'sourceFrame': r['sourceFrame'], 'atMs': r['atMs'],
                              'durationMs': r['durationMs'], 'sha256': r['sha256']} for r in records],
        }, pretty=True)
        target = bank / f'gesture-{action}'
        target.mkdir(parents=True, exist_ok=True)
        for record in records:
            shutil.copy2(stage / f"{record['id']}.webp", target / f"{record['id']}.webp")
        for style, _ in STYLES:
            expression_path = root / f'assets/reactions/{style}/expression-frames.json'
            if sha(expression_path) != palettes[style][1]:
                raise ValueError('The immutable palette changed while packing; refusing publication')
            shutil.copy2(stage / f'{style}.json', root / f'assets/reactions/{style}/gesture-{action}-frames.json')
            write(root / f'assets/reactions/{style}/gesture-videos.json', catalogs[style])
        hd_manifest.setdefault('animations', {}).setdefault('gestures', {})[action] = hd_clip
        digest = hashlib.sha256()
        for file in sorted(bank.rglob('*.webp')):
            digest.update(file.relative_to(bank).as_posix().encode())
            digest.update(file.read_bytes())
        # Include the new timing metadata as well as image bytes in the cache
        # revision, so a timing-only reviewed update cannot retain a stale clip.
        digest.update(json.dumps(hd_manifest['animations'].get('gestures', {}), sort_keys=True,
                                 separators=(',', ':')).encode())
        hd_manifest['revision'] = digest.hexdigest()[:20]
        write(hd_manifest_path, hd_manifest)
    print(json.dumps({'action': action, 'frames': len(records), 'periodMs': period,
                      'qa': {'accepted': True}, 'root': str(root),
                      'revision': hd_manifest['revision']}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    prepare = commands.add_parser('process', help='Prepare unreviewed continuous frames and diagnostic previews')
    prepare.add_argument('--action', choices=(*EXPRESSION_IDS, 'title-wave'), required=True)
    prepare.add_argument('--source', type=Path, required=True)
    prepare.add_argument('--out', type=Path, required=True)
    prepare.add_argument('--stride', type=int, default=2)
    prepare.add_argument('--ffmpeg', default='ffmpeg')
    prepare.add_argument('--ffprobe', default='ffprobe')
    publish = commands.add_parser('pack', help='Pack only an exact-manifest external review explicitly accepted by a human')
    publish.add_argument('--manifest', type=Path, required=True)
    publish.add_argument('--review', type=Path, required=True)
    publish.add_argument('--root', type=Path, default=ROOT,
                         help='Project root; defaults to this script project, never a live plugin install')
    args = parser.parse_args()
    if args.command == 'process':
        process(args)
    else:
        pack(args)


if __name__ == '__main__':
    main()
