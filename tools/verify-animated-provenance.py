"""Verify local animation sources and bound evidence without historical paths.

Run from any directory: python tools/verify-animated-provenance.py
Requires Pillow for the decoded RGBA checks; never modifies repository files.
"""
from pathlib import Path, PurePosixPath
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANIMATED = ROOT / 'assets/animated'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def local_path(relative, parent):
    assert isinstance(relative, str) and '\\' not in relative and ':' not in relative, relative
    part = PurePosixPath(relative)
    assert not part.is_absolute() and '..' not in part.parts, relative
    path = (parent / relative).resolve()
    assert path.is_relative_to(parent.resolve()), relative
    return path


def main():
    catalog = json.loads((ANIMATED / 'catalog.json').read_text(encoding='utf-8'))
    policy = catalog['sourceAssetPolicy']
    assert policy['historicalPathsAreBuildDependencies'] is False
    evidence = []
    for name in ('colorApproval', 'codecProvenance', 'indexedBinaryProvenance'):
        record = catalog[name]
        path = local_path(record['file'], ANIMATED)
        actual = sha(path.read_bytes())
        assert actual == record['sha256'], f'{name}: evidence hash mismatch'
        evidence.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': actual})
    count = 0
    for clip, value in catalog['clips'].items():
        hires = value['hires']
        for frame in hires['frames']:
            source = frame['sourceAsset']
            expected = f"assets/animated/{hires['baseUrl']}{frame['file']}"
            assert source['path'] == expected, f'{clip}/{frame["id"]}: wrong local source'
            path = local_path(source['path'], ROOT)
            assert source['webpSha256'] == frame['webpSha256']
            assert source['decodedRgbaSha256'] == frame['decodedRgbaSha256']
            assert sha(path.read_bytes()) == source['webpSha256'], f'{path}: WebP hash mismatch'
            with Image.open(path) as image:
                actual = sha(image.convert('RGBA').tobytes())
            assert actual == source['decodedRgbaSha256'], f'{path}: decoded RGBA hash mismatch'
            count += 1
    print(json.dumps({'passed': True, 'clips': len(catalog['clips']), 'frames': count,
                      'historicalPathsRead': False, 'evidence': evidence}, indent=2))


if __name__ == '__main__':
    main()
