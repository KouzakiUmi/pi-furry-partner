"""Re-encode approved HD hi-res frames to lossy WebP with byte-identical alpha.

Follows docs/lossy-hd-frame-reencode.md. The approval chain stays valid because
alpha never changes and the pre-compression bytes are recorded per frame.

  python tools/reencode-approved-hires.py --check            # sample, write nothing
  python tools/reencode-approved-hires.py --apply --workers 4
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import argparse
import hashlib
import json
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANIMATED = ROOT / 'assets/animated'
RECORD = ANIMATED / 'provenance/lossy-q90-reencode.json'
QUALITY = 90
MIN_PSNR = 35.0
MAX_DE = 2.2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rgba(raw):
    with Image.open(BytesIO(raw)) as image:
        return np.asarray(image.convert('RGBA'), dtype=np.uint8)


def encode(frame):
    out = BytesIO()
    Image.fromarray(frame).save(
        out, 'WEBP', lossless=False, quality=QUALITY, method=6, exact=True, alpha_quality=100)
    return out.getvalue()


def lab(frame):
    """sRGB -> CIE L*a*b* (D65), vectorised, no external dependency."""
    rgb = frame[:, :, :3].astype(np.float64) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    x = linear @ np.array([0.4124564, 0.3575761, 0.1804375])
    y = linear @ np.array([0.2126729, 0.7151522, 0.0721750])
    z = linear @ np.array([0.0193339, 0.1191920, 0.9503041])
    white = np.array([0.95047, 1.0, 1.08883])
    t = np.stack([x, y, z], axis=-1) / white
    f = np.where(t > 0.008856, np.cbrt(t), (7.787 * t) + (16.0 / 116.0))
    return np.stack([(116.0 * f[..., 1]) - 16.0, 500.0 * (f[..., 0] - f[..., 1]),
                     200.0 * (f[..., 1] - f[..., 2])], axis=-1)


def metrics(reference, actual):
    """Alpha-weighted RGB PSNR (dB) and alpha-weighted CIELAB dE76."""
    alpha = reference[:, :, 3].astype(np.float64) / 255.0
    weight = float(alpha.sum())
    assert weight > 0
    delta = (reference[:, :, :3].astype(np.float64) - actual[:, :, :3].astype(np.float64)) ** 2
    mse = float((delta.sum(axis=-1) * alpha).sum() / (weight * 3.0))
    psnr = 100.0 if mse == 0 else float(10.0 * np.log10((255.0 ** 2) / mse))
    de = np.sqrt(((lab(reference) - lab(actual)) ** 2).sum(axis=-1))
    return psnr, float((de * alpha).sum() / weight)


def frame_tasks(catalog):
    for clip, value in catalog['clips'].items():
        base = ANIMATED / value['hires']['baseUrl']
        for frame in value['hires']['frames']:
            yield clip, frame, base / frame['file']


def reencode(task):
    clip, frame, path = task
    before = path.read_bytes()
    assert sha(before) == frame['webpSha256'], f'{clip}/{frame["file"]}: catalog hash mismatch before encode'
    source = rgba(before)
    after = encode(source)
    decoded = rgba(after)
    if not np.array_equal(source[:, :, 3], decoded[:, :, 3]):
        raise AssertionError(f'{clip}/{frame["file"]}: alpha changed')
    psnr, de = metrics(source, decoded)
    return {'clip': clip, 'file': frame['file'], 'path': path, 'bytes': after,
            'beforeBytes': len(before), 'beforeWebpSha256': sha(before),
            'beforeDecodedRgbaSha256': sha(source.tobytes()),
            'afterWebpSha256': sha(after), 'afterDecodedRgbaSha256': sha(decoded.tobytes()),
            'width': int(source.shape[1]), 'height': int(source.shape[0]),
            'psnr': psnr, 'de': de}


def summarize(rows):
    before = sum(r['beforeBytes'] for r in rows)
    after = sum(len(r['bytes']) for r in rows)
    return {'frames': len(rows), 'beforeBytes': before, 'afterBytes': after,
            'ratio': round(before / after, 3) if after else None,
            'psnrMin': round(min(r['psnr'] for r in rows), 2),
            'psnrMean': round(float(np.mean([r['psnr'] for r in rows])), 2),
            'deMax': round(max(r['de'] for r in rows), 3),
            'deMean': round(float(np.mean([r['de'] for r in rows])), 3)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--stride', type=int, default=11, help='--check sampling stride')
    args = parser.parse_args()
    if args.apply and RECORD.exists():
        sys.exit(f'{RECORD.relative_to(ROOT)} already exists; refusing a second lossy pass')
    catalog = json.loads((ANIMATED / 'catalog.json').read_text(encoding='utf-8'))
    tasks = list(frame_tasks(catalog))
    sample = tasks if args.apply else [t for i, t in enumerate(tasks) if i % args.stride == 0]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(reencode, sample))
    scope = summarize(rows)
    if args.apply:
        # Refuse the whole batch before touching a single frame: a rejected
        # frame would otherwise leave the tree half re-encoded with a record
        # that blocks the next run.
        over = [r for r in rows if r['psnr'] < MIN_PSNR or r['de'] > MAX_DE]
        if over:
            sys.exit(f'{len(over)} frames exceed the acceptance bounds; nothing was written')
        for row in rows:
            row['path'].write_bytes(row['bytes'])
        record = {'schemaVersion': 1, 'encoder': {'format': 'WEBP', 'lossless': False, 'quality': QUALITY,
                  'method': 6, 'exact': True, 'alpha_quality': 100},
                  'acceptance': {'alphaByteIdentical': True, 'alphaWeightedPsnrMinDb': MIN_PSNR,
                                 'alphaWeightedDe76Max': MAX_DE},
                  'summary': scope,
                  'frames': {f'{r["clip"]}/{r["file"]}': {
                      'beforeWebpSha256': r['beforeWebpSha256'],
                      'beforeDecodedRgbaSha256': r['beforeDecodedRgbaSha256'],
                      'afterWebpSha256': r['afterWebpSha256'],
                      'afterDecodedRgbaSha256': r['afterDecodedRgbaSha256']} for r in rows}}
        RECORD.write_bytes((json.dumps(record, ensure_ascii=False, sort_keys=True, indent=1) + "\n").encode('utf-8'))
    print(json.dumps({'mode': 'apply' if args.apply else 'check', **scope,
                      'record': str(RECORD.relative_to(ROOT))}, ensure_ascii=False))
    if args.check:
        print(json.dumps({'worst': sorted(
            [{'clip': r['clip'], 'file': r['file'], 'psnr': round(r['psnr'], 2), 'de': round(r['de'], 3)} for r in rows],
            key=lambda item: item['psnr'])[:5]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
