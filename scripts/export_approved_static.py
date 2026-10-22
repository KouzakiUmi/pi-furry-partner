#!/usr/bin/env python3
"""Export frozen, user-approved complete images. No drawing, local patches or API calls.

One common 456/1086 scale is used by portraits, including listen. Search uses
the same fixed reference/native/canonical chain as its full-motion clip.
Each static has one fixed baseline translation; video must reuse its base pose's
recorded transform, never fit individual video frames. Original approved files
and their approval manifest are never changed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
APPROVED = ROOT / 'Hi-Res/approved-static-20261018'
MANIFEST = APPROVED / 'manifest.json'
REPORT = ROOT / 'work/approved-static-replacement-20261018'
SCALE = 456 / 1086
CANVAS = 640
BASELINE = 608
X_OFFSET = 92


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def family(name):
    if name.startswith('talk-'):
        return 'talk'
    if name.startswith('idle-'):
        return 'idle'
    return name.removesuffix('-blink')


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def backup(target):
    if target.exists():
        dest = REPORT / 'before' / target.relative_to(ROOT)
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, dest)


def write_json(target, data):
    backup(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(json_bytes(data))


def save_image(target, image, **options):
    backup(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, **options)


def prepare():
    manifest = read(MANIFEST)
    assert manifest['status'] == 'ALL_STATIC_ARTWORK_USER_APPROVED'
    assert len(manifest['records']) == 40 and len({r['id'] for r in manifest['records']}) == 40
    revision = sha(MANIFEST)[:20]
    images, records = {}, {}
    for record in manifest['records']:
        source = APPROVED / record['file']
        assert sha(source) == record['sha256'], f"Frozen source changed: {record['id']}"
        original = Image.open(source).convert('RGBA')
        assert original.size == (1086, 1448)
        mask = original.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
        bounds = mask.getbbox()
        assert bounds
        if record['id'] == 'search':
            # Fixed full-clip union calibration. The same original was placed
            # at [256,128] on the H3 1280 reference, then returned at 768px.
            # Preserve that exact sequence of uniform resizes and translations
            # instead of rounding a fractional effective size independently.
            reference = Image.new('RGBA', (1280,1280))
            reference.alpha_composite(original.resize((768,1024), Image.Resampling.LANCZOS), (256,128))
            native = reference.resize((768,768), Image.Resampling.LANCZOS)
            normalized = Image.new('RGBA', (CANVAS,CANVAS))
            normalized.alpha_composite(native, (-132,-39))
            scale = 1024 / 1448 * .6
            width, height = 1086*scale, 1448*scale
            offset_x, offset_y = 256*.6-132, 128*.6-39
        else:
            width, height = 456, 608
            scale = width / 1086
            offset_x = X_OFFSET
            offset_y = round(BASELINE - bounds[3] * scale)
            scaled = original.resize((width, height), Image.Resampling.LANCZOS)
            normalized = Image.new('RGBA', (CANVAS, CANVAS))
            normalized.alpha_composite(scaled, (offset_x, offset_y))
        # Clipping the empty/very-low-alpha canvas margin is harmless. Any
        # newly clipped visible artwork is a failed export, not a repair.
        assert bounds[1] * scale + offset_y >= 0
        assert bounds[3] * scale + offset_y <= CANVAS
        assert bounds[0] * scale + offset_x >= 0 and bounds[2] * scale + offset_x <= CANVAS
        name = record['id']
        images[name] = normalized
        records[name] = {
            'id': name, 'source': str(source), 'sourceSha256': record['sha256'],
            'family': family(name), 'sourceCanvas': [1086, 1448],
            'canonicalCanvas': [640, 640], 'scale': scale,
            'resizedSourceCanvas': [width, height], 'offset': [offset_x, offset_y],
            'sourceVisibleBoundsAlpha128': list(bounds),
            'supportBaseline': BASELINE,
            'registration': 'Fixed per-static/family calibration; no per-video-frame fitting',
            'sourceTouchesCanvasAlpha128': [edge for edge, touched in
                [('left',bounds[0]==0),('top',bounds[1]==0),('right',bounds[2]==1086),('bottom',bounds[3]==1448)] if touched],
            'sourceTruncationNotReconstructed': True,
        }
        if name == 'search':
            records[name]['referenceTransform'] = {'resizedSource':[768,1024], 'referenceCanvas':[1280,1280],
                'referenceOffset':[256,128], 'nativeCanvas':[768,768], 'nativeToCanonicalScale':1,
                'nativeToCanonicalOffset':[-132,-39], 'reason':'One fixed full-motion-union fit, with rump near ordinary body center'}
    return manifest, revision, images, records


def indexed_sheet(images, style, size, colors, revision):
    pixel = style in ('pixel', 'umi-pixel')
    resized = {name: im.resize((size, size), Image.Resampling.NEAREST if pixel else Image.Resampling.LANCZOS)
               for name, im in images.items()}
    # Quantize visible pixels only; hidden RGB and transparent canvas must not
    # consume the palette or turn into a white background.
    samples = np.concatenate([np.asarray(im)[:, :, :3][np.asarray(im)[:, :, 3] >= 128]
                              for im in resized.values()])
    height = math.ceil(len(samples) / 1024)
    atlas = np.zeros((height * 1024, 3), dtype=np.uint8)
    atlas[:len(samples)] = samples
    quantized = Image.fromarray(atlas.reshape(height, 1024, 3)).quantize(
        colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    flat = quantized.getpalette()[:colors * 3]
    palette = [[0, 0, 0]] + [flat[n:n+3] for n in range(0, len(flat), 3)]
    frames = []
    previews = {}
    color_array = np.asarray(palette, dtype=np.uint8)
    for name, image in resized.items():
        pixels = np.asarray(image.convert('RGB').quantize(palette=quantized, dither=Image.Dither.NONE)).astype(np.uint16) + 1
        pixels[np.asarray(image)[:, :, 3] < 128] = 0
        assert pixels.max() < len(palette)
        frame = {'id': name, 'pixels': pixels.reshape(-1).tolist()}
        frames.append(frame)
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        rgba[:, :, :3] = color_array[pixels]
        rgba[:, :, 3] = np.where(pixels, 255, 0)
        previews[name] = Image.fromarray(rgba)
    sheet = {'schemaVersion': 1, 'style': style, 'width': size, 'height': size,
             'transparentIndex': 0, 'palette': palette, 'frames': frames,
             'ids': {frame['id']: n for n, frame in enumerate(frames)},
             'approvedStaticRevision': revision,
             'sourceManifestSha256': sha(MANIFEST),
             'motion': {'ears': False, 'paws': False, 'approvedWholeFrames': True},
             'export': {'alpha': '1-bit coverage at 128', 'dither': False,
                        'sampling': 'nearest' if pixel else 'lanczos', 'completeApprovedImages': True}}
    return sheet, previews


def header(sheet, title_id='title'):
    frame = sheet['frames'][sheet['ids'][title_id]]
    return {'schemaVersion': 1, 'width': sheet['width'], 'height': sheet['height'],
            'transparentIndex': 0, 'palette': sheet['palette'], 'loopDurationMs': 4800,
            'approvedStaticRevision': sheet['approvedStaticRevision'],
            'frames': [{'pixels': frame['pixels'], 'durationMs': 4800, 'angleDeg': 0, 'wink': False}]}


def sample_indices(pixels, source_size, size):
    source = np.asarray(pixels).reshape(source_size, source_size)
    coords = np.minimum(source_size - 1, ((np.arange(size) + .5) * source_size / size).astype(int))
    return source[np.ix_(coords, coords)].reshape(-1).tolist()


def review_contact(images):
    names = ['idle-open', 'idle-blink', 'listen', 'listen-blink', 'think', 'work', 'watch', 'search', 'title']
    contact = Image.new('RGB', (960, 1020), '#18202a')
    draw = ImageDraw.Draw(contact)
    for n, name in enumerate(names):
        im = images[name].resize((320, 320), Image.Resampling.LANCZOS)
        cell = Image.new('RGBA', (320, 320), '#18202a'); cell.alpha_composite(im)
        x, y = n % 3 * 320, n // 3 * 340
        contact.paste(cell.convert('RGB'), (x, y)); draw.line((x, y+304, x+319, y+304), fill='#506070')
        draw.text((x+8, y+320), name, fill='white')
    contact.save(REPORT / 'canonical-review.jpg', quality=92)


def update_search_only(revision, images, registration):
    """Change the fixed search calibration without invalidating video palettes."""
    document = read(APPROVED / 'runtime-registration.json')
    assert document['approvedStaticRevision'] == revision
    document['records']['search'] = registration['search']
    document['searchCalibration'] = 'Fixed approved source/reference/native chain; native scale 1 and offset [-132,-39]; full motion union fits; no extra display zoom'
    write_json(APPROVED / 'runtime-registration.json', document)
    image = images['search']
    save_image(ROOT / 'Hi-Res/poses-640/search.png', image)
    save_image(ROOT / 'assets/poses/search.png', image)
    save_image(ROOT / 'assets/hires/umi/poses/search.webp', image, format='WEBP', lossless=True, exact=True, method=4)
    for style in ['umi']:
        folder = ROOT / f'assets/reactions/{style}'
        sheet = read(folder / 'reaction-sheet.json')
        assert sheet['approvedStaticRevision'] == revision
        palette = Image.new('P', (1, 1))
        flat = [c for color in sheet['palette'][1:] for c in color]
        palette.putpalette(flat + [0] * (768 - len(flat)))
        size = sheet['width']
        resized = image.resize((size, size), Image.Resampling.NEAREST if style in ('pixel','umi-pixel') else Image.Resampling.LANCZOS)
        indices = np.asarray(resized.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE)).astype(np.uint16) + 1
        indices[np.asarray(resized)[:,:,3] < 128] = 0
        # Padded palette entries duplicate black. Restrict quantization to the
        # published palette; every opaque color must decode in the same bank.
        indices[indices >= len(sheet['palette'])] = 1
        sheet['frames'][sheet['ids']['search']] = {'id': 'search', 'pixels': indices.reshape(-1).tolist()}
        write_json(folder / 'reaction-sheet.json', sheet)
        rgba = np.zeros((size,size,4), dtype=np.uint8)
        rgba[:,:,:3] = np.asarray(sheet['palette'],dtype=np.uint8)[indices]
        rgba[:,:,3] = np.where(indices,255,0)
        save_image(folder / 'search.png', Image.fromarray(rgba))
    hires_path = ROOT / 'assets/hires/umi/manifest.json'
    hires = read(hires_path)
    hires['registration'] = document
    write_json(hires_path, hires)
    report = read(REPORT / 'export-record.json')
    report['sourceToRuntime']['search'] = registration['search']
    report['searchCalibration'] = document['searchCalibration']
    write_json(REPORT / 'export-record.json', report)
    review_contact(images)
    print(json.dumps({'searchUpdated': True, 'scale': registration['search']['scale'], 'offset': registration['search']['offset'], 'palettesPreserved': True}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Write reviewed static runtime exports to this checkout')
    parser.add_argument('--search-only', action='store_true', help='Update only fixed search registration/exports using published palettes')
    args = parser.parse_args()
    manifest, revision, images, registration = prepare()
    if not args.apply:
        print(json.dumps({'ready': True, 'revision': revision, 'count': len(images),
                          'scale': SCALE, 'watch': registration['watch']['offset'],
                          'search': registration['search']['offset']}))
        return
    if not args.search_only:
        existing = ROOT / 'assets/hires/umi/manifest.json'
        if existing.exists() and read(existing).get('approvedStaticRevision'):
            raise SystemExit('Approved runtime bank already exists. Full rebuild would replace shared video palettes/selection; use --search-only for the explicit calibration update or stage a separate reviewed rebuild.')
    REPORT.mkdir(parents=True, exist_ok=True)
    if args.search_only:
        update_search_only(revision, images, registration)
        return
    registration_document = {'schemaVersion': 1, 'approvedStaticRevision': revision,
                             'sourceManifestSha256': sha(MANIFEST), 'records': registration,
                             'limitations': ['Source edge truncation is not reconstructed',
                               'Translation aligns visible support baseline; anatomy and mouth pixels are not repainted',
                               'Small source shape differences remain; live switching requires separate review']}
    write_json(APPROVED / 'runtime-registration.json', registration_document)
    for name, image in images.items():
        save_image(ROOT / f'Hi-Res/poses-640/{name}.png', image)
        save_image(ROOT / f'assets/poses/{name}.png', image)
        if name.startswith('emotion-'):
            save_image(ROOT / f'assets/poses/expressions/{name}.png', image)
        save_image(ROOT / f'assets/hires/umi/poses/{name}.webp', image,
                   format='WEBP', lossless=True, exact=True, method=4)
    banks = {}
    for style, size, colors in [('umi', 240, 255)]:
        sheet, previews = indexed_sheet(images, style, size, colors, revision)
        banks[style] = sheet
        folder = ROOT / f'assets/reactions/{style}'
        write_json(folder / 'reaction-sheet.json', sheet)
        for name, image in previews.items():
            save_image(folder / f'{name}.png', image)
        # Preserve dormant old video PNGs/JSONs. Runtime revision guards prevent
        # them from overriding the new bank until a matching sequence is exported.
        write_json(folder / 'gesture-videos.json', {'schemaVersion': 1, 'clips': {},
                   'approvedStaticRevision': revision, 'reason': 'Old emotion/H3 clips remain withdrawn'})
    hires_path = ROOT / 'assets/hires/umi/manifest.json'
    hires = read(hires_path)
    hires['poses'] = sorted(images)
    hires['width'] = hires['height'] = 640
    hires['anchor'] = {'name': 'registered-support', 'x': 320, 'y': BASELINE}
    hires['motion'] = {'ears': False, 'paws': False, 'approvedWholeFrames': True}
    hires['animations'] = {'gestures': {}}
    hires.pop('expressions', None)
    hires['approvedStaticRevision'] = revision
    hires['registration'] = registration_document
    hires['revision'] = revision
    hires['staticSourceManifestSha256'] = sha(MANIFEST)
    hires['disabledPriorAnimations'] = 'Old watch/search files preserved; selection disabled pending new reviewed clips'
    write_json(hires_path, hires)
    save_image(ROOT / 'assets/branding/umi-title.png', images['title'])
    title_path = ROOT / 'assets/branding/title.json'
    branding = read(title_path)
    if branding.get('animation'):
        branding['animation'].setdefault('qa', {})['accepted'] = False
        branding['animation']['disabledReason'] = 'Superseded by user-approved static artwork; old video retained dormant'
    branding['static'] = {'file': 'umi-title.png', 'sha256': sha(ROOT / 'assets/branding/umi-title.png'),
                          'approvedStaticRevision': revision, 'sourceSha256': registration['title']['sourceSha256']}
    write_json(title_path, branding)
    # Original pixel/header bytes are frozen; illustration export never regenerates them.
    write_json(ROOT / 'assets/illustration/native-frames.json', header(banks['umi']))
    report = {'schemaVersion': 1, 'approvedStaticRevision': revision, 'count': 40,
              'sourceManifestSha256': sha(MANIFEST), 'sourceToRuntime': registration,
              'styles': {s: {'width': b['width'], 'paletteSize': len(b['palette']), 'frames': len(b['frames'])} for s, b in banks.items()},
              'oldWatchSearchVideosDeleted': False, 'liveInstalled': False,
              'sourceArtworkRedrawn': False, 'continuousSwitchingApproved': False}
    write_json(REPORT / 'export-record.json', report)
    # Review fixed-coordinate output, never an independently auto-fitted gallery.
    review_contact(images)
    print(json.dumps({'applied': True, 'revision': revision, 'states': len(images), 'report': str(REPORT)}))


if __name__ == '__main__':
    main()
