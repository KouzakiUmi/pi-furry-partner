"""Integrate the user's approved cape-only derivative, retaining motion clocks."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PILOT = ROOT/'work/remaster-color-audit-20261022/cape-pilot-v3'
BACKUP = ROOT/'work/remaster-color-audit-20261022/integration-before'
sys.path.insert(0, str(ROOT/'scripts'))
from export_approved_h3_actions import indexed


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def backup(path):
    target = BACKUP/path.relative_to(ROOT)
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def main():
    qa = read(PILOT/'independent-qa.json')
    assert qa['userApproved'] is True
    assert qa['userDecision'] == '还行。然后是之前的版本有一些动画效果也没有了。需要检查'
    report = read(PILOT/'review.json')
    manifest_path = ROOT/'assets/hires/umi/manifest.json'
    manifest = read(manifest_path)
    palette_sheet = read(ROOT/'assets/reactions/umi/reaction-sheet.json')
    palette = palette_sheet['palette']
    approval_hash = sha(PILOT/'independent-qa.json')
    output = {'approvalSha256': approval_hash, 'actions': {}}
    backup(manifest_path)
    for action, clip_report in report['clips'].items():
        animation = manifest['animations'][action]
        clock = next(iter(animation['clips'].values()))
        assert len(clock['frames']) == len(clip_report['frames'])
        for n, record in enumerate(clip_report['frames']):
            source = PILOT/action/'rgba'/f'{n:03}.png'
            assert sha(source) == record['candidateSha256']
            assert record['id'] == clock['frames'][n]['id']
            assert record['atMs'] == clock['frames'][n]['atMs']
            target = ROOT/f'assets/hires/umi/{action}/{record["id"]}.webp'
            backup(target)
            with Image.open(source) as image:
                image.save(target, format='WEBP', lossless=True, exact=True, method=4)
                with Image.open(target) as check:
                    assert np.array_equal(np.asarray(image.convert('RGBA')), np.asarray(check.convert('RGBA')))
        path = ROOT/f'assets/reactions/umi/{action}-frames.json'
        asset = read(path)
        backup(path)
        times = [f['atMs'] for f in clock['frames']]
        selected = []
        elapsed = 0
        for step in asset['sequence']['steps']:
            selected.append(min(range(len(times)), key=lambda i: abs(times[i]-elapsed)))
            elapsed += step['durationMs']
        selected[0] = 0
        selected[-1] = len(times)-1
        assert elapsed == clip_report['periodMs']
        by_id = {f['id']: f for f in asset['frames']}
        for step, index in zip(asset['sequence']['steps'], selected):
            with Image.open(PILOT/action/'rgba'/f'{index:03}.png') as image:
                by_id[step['id']]['pixels'] = indexed(image.convert('RGBA'), palette, palette_sheet['width'])
        derivative = {'approvalSha256': approval_hash, 'reviewSha256': sha(PILOT/'review.json'),
            'scope': qa['approvalScope'], 'sourcePreserved': True}
        asset['colorDerivative'] = derivative
        animation['colorDerivative'] = derivative
        path.write_text(json.dumps(asset, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
        output['actions'][action] = {'hdFrames': len(times), 'indexedFrames': len(selected),
            'periodMs': elapsed, 'geometryAndTimeUnchanged': True}
    manifest['revision'] = manifest['approvedStaticRevision']+'-cape-'+approval_hash[:10]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    output['manifestRevision'] = manifest['revision']
    (PILOT/'integration.json').write_text(json.dumps(output, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(output))


if __name__ == '__main__':
    main()
