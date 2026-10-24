"""Reproduce approved cape correction using only tracked repository inputs."""
from pathlib import Path
import hashlib
import importlib.util
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'Hi-Res/production/ordinary-cape-20261022'
spec = importlib.util.spec_from_file_location('cape', ROOT/'tools/pilot-remaster-cape-cleanup.py')
cape = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cape)


def main():
    read = lambda p: json.loads(p.read_text(encoding='utf-8'))
    inputs, report, qa = [read(SOURCE/name) for name in ['inputs.json', 'review.json', 'independent-qa.json']]
    assert qa['userApproved'] is True
    for row in inputs['frames']:
        assert hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest() == row['sha256']
    palette = np.array(report['paletteLuminanceKnots']), np.array(report['paletteChroma'])
    count = 0
    for action, clip in report['clips'].items():
        for row in clip['frames']:
            before = np.asarray(Image.open(SOURCE/'before'/action/f'{row["id"]}.webp').convert('RGBA'))
            expected, _ = cape.transform(before, action, palette)
            actual = np.asarray(Image.open(ROOT/f'assets/hires/umi/{action}/{row["id"]}.webp').convert('RGBA'))
            assert np.array_equal(actual, expected), (action, row['id'])
            count += 1
    print(json.dumps({'verifiedFrames': count, 'externalInputs': False, 'userApproved': True}))


if __name__ == '__main__':
    main()
