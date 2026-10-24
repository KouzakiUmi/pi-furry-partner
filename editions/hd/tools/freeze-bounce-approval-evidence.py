"""Complete the canonical approved-file graph without changing runtime payloads.

Run once after integrate-approved-bounce.py --apply. Existing frozen records are
read only; missing reviewed inputs get uniquely named supplemental copies.
"""
from pathlib import Path
import hashlib,json,shutil
R=Path(__file__).resolve().parents[1];A=R/'assets/animated'
D=A/'provenance/auxiliary/bounce-v5/clips/bounce'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
approval=read(D/'user-approval.json');records=read(D/'inputs.json')['records']
by_sha={v['sha256']:R/v['path'] for v in records.values()}
entries=[]
def freeze(file,expected):
    source=Path(file);assert sha(source)==expected,source
    dest=by_sha.get(expected)
    if dest is None:
        dest=D/'approved-evidence'/f'{expected[:16]}-{source.name}'
        dest.parent.mkdir(exist_ok=True)
        if dest.exists():assert sha(dest)==expected
        else:shutil.copy2(source,dest)
        by_sha[expected]=dest
    assert sha(dest)==expected
    return {'originalFile':str(source),'file':dest.relative_to(A).as_posix(),'sha256':expected}
for item in approval['files']:entries.append(freeze(item['file'],item['sha256']))
manifest=read(D/'processed-manifest.json')
deps=[freeze(x['file'],x['sha256']) for x in manifest['processing']['matteHelper']['referenceInputs']]
out=D.parent.parent/'approval-evidence-index.json';assert not out.exists()
data={'schemaVersion':1,'userApprovalSha256':sha(D/'user-approval.json'),'approvalFiles':entries,'frozenMatteReferenceInputs':deps,
      'sourceHistoricalPathsAreBuildDependencies':False,
      'reproductionCommands':['python work/motion-polish-20261023/process-bounce-v5-purple.py bounce',
        'python work/motion-polish-20261023/apply-bounce-v5-key-edge.py bounce purple',
        'python work/motion-polish-20261023/restore-bounce-v5-face-core.py bounce',
        'python work/motion-polish-20261023/check-bounce-v5-detail.py bounce'],
      'commandPathPolicy':'Original command paths document the source production run. Canonical helpers/inputs and source.mp4 are frozen here; runtime uses only canonical HD/indexed assets. No claim that archival scripts automatically relocate historical paths.',
      'runtimePixelsChanged':False,'existingFrozenRecordsChanged':False}
out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'file':str(out),'sha256':sha(out),'approvedFiles':len(entries)}))
