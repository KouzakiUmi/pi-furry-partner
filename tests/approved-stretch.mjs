// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact user-approved full896 stretch and preservation of all23 prior sources.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadHistoricalColorSourceCatalog,readHistoricalColorSource} from './historical-color-source.mjs';
import {decodeApprovedMotionNodeResource} from '../lib/approved-motion-node.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=resolve(root,'assets/animated');
const bytes=p=>readHistoricalColorSource(root,p),sha=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(bytes(p));
const catalog=loadHistoricalColorSourceCatalog(root),clip=catalog.clips.stretch;assert.ok(Object.keys(catalog.clips).length>=27);
assert.equal(clip.family,'action');assert.equal(clip.loop,false);assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);
assert.deepEqual(clip.paintRect,{x:-128,y:-128,width:896,height:896});assert.equal(clip.qa.perFrameFit,false);
assert.deepEqual(clip.qa.sourceCanvas,[896,896]);assert.deepEqual(clip.qa.pivot,[448,736]);
const ref=catalog.auxiliaryMotionProvenance.clips.stretch,proofPath=resolve(assets,ref.file);assert.equal(sha(bytes(proofPath)),ref.sha256);
const proof=json(proofPath);assert.equal(proof.retainedClipCount,23);assert.deepEqual(proof.newClips,['stretch']);
const baselinePath=resolve(assets,proof.baselineCatalog.file),baseline=json(baselinePath);assert.equal(sha(bytes(baselinePath)),proof.baselineCatalog.sha256);assert.equal(Object.keys(baseline.clips).length,23);
assert.deepEqual(catalog.idleVariants,baseline.idleVariants);
for(const[id,old]of Object.entries(baseline.clips)){
 assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: priorQA exact`);assert.deepEqual(catalog.clips[id].hires,old.hires,`${id}: priorHD metadata exact`);
 for(const f of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,f.file))),proof.retainedClips[id].hdFiles[f.file]);
}
const inputsPath=resolve(assets,clip.qa.inputRecord.file);assert.equal(sha(bytes(inputsPath)),clip.qa.inputRecord.sha256);const inputs=json(inputsPath),local=dirname(inputsPath);
assert.equal(inputs.historicalPathsAreBuildDependencies,false);
for(const rec of Object.values(inputs.records))assert.equal(sha(bytes(resolve(root,rec.path))),rec.sha256,rec.path);
const approval=json(resolve(local,'user-approval.json'));assert.equal(approval.userApproved,true);assert.equal(approval.action,'stretch');
assert.equal(sha(bytes(resolve(local,'user-approval.json'))),clip.qa.userApprovalSha256);assert.equal(approval.manifestSha256,'80e799989b9aa5cc03f11b68c792dee0f2fd9e0e0e38308c6c15f58413d913cd');assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
assert.equal(approval.sourceVideoSha256,'68cff5cc15ba0ea4b46a9dcfd3938603c0821287600b8d36cd032a2bd3f944ea');assert.equal(approval.sourceVideoSha256,clip.qa.sourceVideoSha256);
assert.equal(approval.reviewEvidenceSha256,'0d13bbeafae6ad28753569794db27d49356b6540b1fcef3d1760051fad794d56');assert.equal(sha(bytes(resolve(local,'peek-stretch-v2-final-review-evidence.json'))),approval.reviewEvidenceSha256);
for(const r of ['A','B'])assert.equal(sha(bytes(resolve(local,`detail-output-review-${r}.json`))),approval[`review${r}Sha256`]);
const manifest=json(resolve(local,'processed-manifest.json'));assert.equal(sha(bytes(resolve(local,'processed-manifest.json'))),clip.qa.manifestSha256);assert.equal(manifest.processing.transform.perFrameFit,false);assert.equal(manifest.sampling.timeScale,1);
const raw=decodeApprovedMotionNodeResource(bytes(resolve(assets,clip.indexed.umi.file)));assert.equal(raw.width,336);assert.equal(raw.height,336);assert.equal(raw.frames.length,54);
assert.deepEqual(raw.frames.map(f=>f.sourceFrame),Array.from({length:54},(_,i)=>i*2));assert.equal(raw.frames.at(-1).atMs,4416.667);assert.equal(raw.periodMs,4458);
assert.deepEqual(raw.viewport.worldRect,[-128,-128,896,896]);assert.deepEqual(raw.viewport.worldAnchor,[320,608]);assert.deepEqual(raw.viewport.bitmapPivot,[448,736]);
const result=spawnSync('python',['-c',String.raw`
import sys,json,importlib.util,hashlib,numpy as np
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);a=r/'assets/animated';historical=r/'Hi-Res/production/color-consistency-20261024/source29'
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
s=mod(r/'tools/stage-motion-polish.py','verify_stretch_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_stretch_quantizer')
c=s.read(historical/'catalog.json');p=s.read(a/c['auxiliaryMotionProvenance']['clips']['stretch']['file']);d=s.read(a/p['derivation']['file']);clip=c['clips']['stretch'];raw=s.decode_indexed(historical/clip['indexed']['umi']['file']);outside=0
assert {x.name for x in (historical/clip['hires']['baseUrl']).iterdir()}=={f['file']for f in clip['hires']['frames']}
for i,f in enumerate(clip['hires']['frames']):
 im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(896,896) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
 if i%2==0:
  expected=q.indexed(im,raw['palette'],336,pixel=False);assert expected==raw['frames'][i//2]['pixels'];v=np.array(expected).reshape(336,336);outside+=int(np.count_nonzero(v[:,:48]))+int(np.count_nonzero(v[:,288:]))
assert outside>100,'Real stretched paws have pixels outside the old640world crop; full336source is necessary'
for id,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][id]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('107 exact full896RGBA +54 exact336 full-source quantized frames; all23 decoded data equal exceptrevision; preserved pixels beyond old640world:',outside)
`,root],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
console.log('Approved stretch: exact50097 human approval, frozen provenance, full896/336 no-crop sampling and preserved23 sources passed.');
