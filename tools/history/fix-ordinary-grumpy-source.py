"""Reuse an already approved color-only derivative; never repaint or alter motion."""
from pathlib import Path
import hashlib, json, shutil
import numpy as np
from PIL import Image

ROOT = Path(r'D:\Software Projects\pi-furry-partner-regular')
ANIMATED = Path(r'D:\Software Projects\pi-furry-partner\work\animated-remake-20261021')
WORK = ROOT / 'work/grumpy-color-fix'
REVIEW = Path(r'D:\Software Projects\pi-furry-partner\work\pv-adventure-20261021\public\ordinary-grumpy-color-review')
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def main():
    manifest_path = ROOT / 'assets/hires/umi/manifest.json'
    bank = read(manifest_path)
    clip = bank['animations']['gestures']['grumpy']
    approved = read(ANIMATED / 'assets/animated/catalog.json')['clips']['grumpy']
    assert approved['qa']['colorOnlyDerivative'] is True
    assert approved['qa']['colorApprovalEvidence'] == 'color-batch-03-idle-grumpy'
    assert clip['qa']['sourceSha256'] == approved['qa']['sourceVideoSha256']
    assert clip['qa']['processingManifestSha256'] == approved['qa']['motionManifestSha256']
    assert clip['periodMs'] == approved['periodMs'] == 6583
    records = approved['hires']['frames']
    assert len(records) == len(clip['frames']) == 158
    backup = WORK / 'before'
    assert not (backup / 'assets/hires/umi/manifest.json').exists(), 'Never overwrite backup/history'
    backup_manifest = backup / 'assets/hires/umi/manifest.json'
    backup_manifest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, backup_manifest)
    rows = []
    for n, (old, new) in enumerate(zip(clip['frames'], records)):
        assert old['id'] == f'gesture-grumpy-{n:03}'
        assert abs(old['atMs'] - new['atMs']) < 0.01
        target = ROOT / f"assets/hires/umi/gesture-grumpy/{old['id']}.webp"
        source = ANIMATED / 'assets/animated/hires/grumpy' / new['file']
        assert sha(source) == new['webpSha256']
        a, b = np.array(Image.open(target).convert('RGBA')), np.array(Image.open(source).convert('RGBA'))
        assert a.shape == b.shape == (640,640,4)
        assert np.array_equal(a[:,:,3], b[:,:,3]), 'Alpha/geometry must remain exact'
        prior = backup / target.relative_to(ROOT)
        prior.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, prior)
        for kind, path in [('before', prior), ('after', source)]:
            review_file = REVIEW / kind / f'{n:03}.webp'
            review_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, review_file)
        rows.append({'id':old['id'], 'atMs':old['atMs'], 'beforeSha256':sha(target),
                     'afterSha256':sha(source), 'alphaExactlyUnchanged':True})
    # Verification above completes for the whole clip before source replacement.
    for row, rec in zip(rows, records):
        shutil.copy2(ANIMATED / 'assets/animated/hires/grumpy' / rec['file'],
                     ROOT / f"assets/hires/umi/gesture-grumpy/{row['id']}.webp")
    evidence = {k: approved['qa'][k] for k in ['colorApprovalEvidence','colorApprovalSha256',
                 'colorReviewIndexSha256','manifestSha256','userApprovalSha256']}
    clip['qa'].update(colorOnlyDerivative=True, reusedApprovedColorDerivative=evidence)
    bank['revision'] += '-grumpy-color-b03'
    write(manifest_path, bank)
    report = {'scope':'ordinary HD remaster grumpy only', 'method':'Exact copies of existing approved color-only WebP derivative',
              'newArtGeneration':False, 'newColorCorrection':False, 'alphaExactlyUnchangedFrames':158,
              'periodMs':6583, 'frameOrderAndTimestampsUnchanged':True, 'cacheRevision':bank['revision'],
              'approvalEvidence':evidence, 'newUserReview':'pending', 'installed':False, 'frames':rows}
    write(WORK / 'hd-source-reuse-report.json', report)
    write(REVIEW / 'manifest.json', {'periodMs':6583,'frames':[{'id':f'{n:03}', 'atMs':r['atMs']} for n,r in enumerate(rows)]})
    for name in ['idle-open','emotion-grumpy']:
        shutil.copy2(ROOT / f'assets/hires/umi/poses/{name}.webp', REVIEW / f'{name}.webp')
    shutil.copy2(Path(r'D:\Software Projects\pi-furry-partner\Hi-Res\sources\character-design-reference-20261021\Umi-design-Ver1.1-session-cache.png'), REVIEW/'source-card.png')
    print(json.dumps({k:v for k,v in report.items() if k!='frames'},ensure_ascii=False))

if __name__ == '__main__': main()
