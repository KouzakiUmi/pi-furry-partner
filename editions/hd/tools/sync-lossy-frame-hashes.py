"""Bind the lossy re-encoded hi-res bytes into catalog.json.

Only the three byte-derived fields move: webpSha256, decodedRgbaSha256 and
sourceAsset.{webpSha256,decodedRgbaSha256}. Approval identifiers stay untouched:
rgbaSha256, approvedPngSha256, catalog.revision and every other field.

Run after tools/reencode-approved-hires.py --apply:
  python tools/sync-lossy-frame-hashes.py
"""
from pathlib import Path
from copy import deepcopy
from io import BytesIO
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANIMATED = ROOT / 'assets/animated'
RECORD = ANIMATED / 'provenance/lossy-q90-reencode.json'
MOVING = {'webpSha256', 'decodedRgbaSha256', 'sourceAsset'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    catalog_path = ANIMATED / 'catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    original = deepcopy(catalog)
    record = json.loads(RECORD.read_text(encoding='utf-8'))['frames']
    updated = 0
    for clip, value in catalog['clips'].items():
        for frame in value['hires']['frames']:
            entry = record[f'{clip}/{frame["file"]}']
            path = ANIMATED / value['hires']['baseUrl'] / frame['file']
            raw = path.read_bytes()
            with Image.open(BytesIO(raw)) as image:
                decoded = sha(image.convert('RGBA').tobytes())
            frame['webpSha256'] = sha(raw)
            frame['decodedRgbaSha256'] = decoded
            frame['sourceAsset'] = {'path': path.relative_to(ROOT).as_posix(),
                                    'webpSha256': frame['webpSha256'],
                                    'decodedRgbaSha256': frame['decodedRgbaSha256']}
            assert frame['webpSha256'] == entry['afterWebpSha256'], f'{clip}/{frame["file"]}: record mismatch'
            assert frame['decodedRgbaSha256'] == entry['afterDecodedRgbaSha256'], f'{clip}/{frame["file"]}: decoded mismatch'
            updated += 1
    for clip, value in catalog['clips'].items():
        for frame, old in zip(value['hires']['frames'], original['clips'][clip]['hires']['frames']):
            for key in old:
                if key in MOVING:
                    continue
                assert frame[key] == old[key], f'{clip}/{frame["file"]}: {key} changed'
            assert frame.get('rgbaSha256') == old.get('rgbaSha256'), f'{clip}/{frame["file"]}: approval identifier changed'
            assert frame.get('approvedPngSha256') == old.get('approvedPngSha256')
    for key in original:
        if key == 'clips':
            continue
        assert catalog[key] == original[key], f'{key} changed'
    assert catalog['revision'] == original['revision']
    # Bytes, not text: Path.write_text would turn the line feed into CRLF on
    # Windows and this catalog is marked -text, so that CRLF would be committed.
    payload = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + "\n"
    catalog_path.write_bytes(payload.encode('utf-8'))
    print(json.dumps({'passed': True, 'frames': updated, 'catalogSha256': sha(catalog_path.read_bytes()),
                      'revision': catalog['revision']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
