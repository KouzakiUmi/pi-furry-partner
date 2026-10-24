"""Apply verified technical indexed derivatives of the approved same-motion color source."""
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(r'D:\Software Projects\pi-furry-partner-regular')
WORK=ROOT/'work/grumpy-color-fix'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
report=read(WORK/'indexed-candidates/report.json')
evidence=read(WORK/'hd-source-reuse-report.json')['approvalEvidence']
for row in report['styles']:
    assert row['allNonPixelFieldsUnchanged'] and row['compatiblePrefix']
    target,source=Path(row['input']),Path(row['candidate'])
    assert sha(target)==row['inputSha256'] and sha(source)==row['candidateSha256']
    old,new=read(target),read(source)
    assert old['palette']==new['palette'] and old['sequence']==new['sequence']
    assert [f['id'] for f in old['frames']]==[f['id'] for f in new['frames']]
    prior=WORK/'before'/target.relative_to(ROOT)
    assert not prior.exists()
    prior.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,prior)
    new['qa'].update(colorOnlyDerivative=True,reusedApprovedColorDerivative=evidence)
    write(target,new)
    catalog_path=target.parent/'gesture-videos.json'
    prior_catalog=WORK/'before'/catalog_path.relative_to(ROOT)
    shutil.copy2(catalog_path,prior_catalog)
    catalog=read(catalog_path)
    catalog['clips']['grumpy']['qa'].update(colorOnlyDerivative=True,reusedApprovedColorDerivative=evidence)
    write(catalog_path,catalog)
report['runtimeApplied']=True
report['approvalEvidence']=evidence
report['scopeNote']='Re-export of existing approved colors using existing palettes/sampler; no new artistic correction or behavioral change.'
write(WORK/'indexed-applied-report.json',report)
print(json.dumps({'appliedStyles':[r['style'] for r in report['styles']], 'periodMs':6583,'framesPerStyle':79,'installed':False}))
