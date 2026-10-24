// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact user-approved fixed640 head-shake and preservation of all25 prior sources.
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
const catalog=loadHistoricalColorSourceCatalog(root),clip=catalog.clips['head-shake'];assert.ok(Object.keys(catalog.clips).length>=27);
assert.equal(clip.family,'action');assert.equal(clip.loop,false);assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);
assert.deepEqual(clip.paintRect,{x:0,y:0,width:640,height:640});assert.equal(clip.qa.perFrameFit,false);
assert.deepEqual(clip.qa.sourceCanvas,[640,640]);assert.deepEqual(clip.qa.pivot,[320,608]);
const ref=catalog.auxiliaryMotionProvenance.clips['head-shake'],proofPath=resolve(assets,ref.file);assert.equal(sha(bytes(proofPath)),ref.sha256);
const proof=json(proofPath);assert.equal(proof.retainedClipCount,25);assert.deepEqual(proof.newClips,['head-shake']);
const baselinePath=resolve(assets,proof.baselineCatalog.file),baseline=json(baselinePath);assert.equal(sha(bytes(baselinePath)),proof.baselineCatalog.sha256);assert.equal(Object.keys(baseline.clips).length,25);assert.equal(baseline.clips['ear-flick'],undefined,'The frozen head-shake integration did not include rejected ear v1 or then-unapproved ear v2');
assert.deepEqual(catalog.idleVariants,baseline.idleVariants);
for(const[id,old]of Object.entries(baseline.clips)){
 assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: priorQA exact`);assert.deepEqual(catalog.clips[id].hires,old.hires,`${id}: priorHD metadata exact`);
 const normalized=structuredClone(catalog.clips[id]);for(const style of Object.keys(normalized.indexed))normalized.indexed[style].sha256=old.indexed[style].sha256;assert.deepEqual(normalized,old,`${id}: all prior clip metadata exact except regenerated binary hash`);
 for(const f of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,f.file))),proof.retainedClips[id].hdFiles[f.file]);
}
const inputsPath=resolve(assets,clip.qa.inputRecord.file);assert.equal(sha(bytes(inputsPath)),clip.qa.inputRecord.sha256);const inputs=json(inputsPath),local=dirname(inputsPath);
assert.equal(inputs.historicalPathsAreBuildDependencies,false);
for(const rec of Object.values(inputs.records))assert.equal(sha(bytes(resolve(root,rec.path))),rec.sha256,rec.path);
const approval=json(resolve(local,'user-approval.json'));assert.equal(approval.userApproved,true);assert.equal(approval.action,'head-shake');
const evidence=json(resolve(assets,'provenance/auxiliary/head-shake-v1/approval-evidence-index.json'));assert.equal(evidence.userApprovalSha256,clip.qa.userApprovalSha256);assert.equal(evidence.approvalFiles.length,approval.files.length);
for(const [i,item]of evidence.approvalFiles.entries()){assert.equal(item.sha256,approval.files[i].sha256);assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256,'Every approved evidence file is independently available under canonical assets');}
for(const item of evidence.frozenMatteReferenceInputs)assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256);
assert.equal(evidence.runtimePixelsChanged,false);
assert.equal(sha(bytes(resolve(local,'user-approval.json'))),clip.qa.userApprovalSha256);assert.equal(approval.manifestSha256,'837834bc0997f337a5cc886b75f3e6f4b6e30795b3b1ff178ecfd24cd3f0d1df');assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
assert.equal(approval.sourceVideoSha256,'c6366814b7d0b560af2434c5d0afb3dea2d9a09af4c5d443d4aa11c936ef0ef6');assert.equal(approval.sourceVideoSha256,clip.qa.sourceVideoSha256);
assert.equal(approval.reviewEvidenceSha256,'5d462c220735c954b396905ccd0af3461a0d0a516ad53bad936d8f9e1ea7a67c');assert.equal(sha(bytes(resolve(local,'ear-head-final-review-evidence.json'))),approval.reviewEvidenceSha256);
for(const r of ['A','B'])assert.equal(sha(bytes(resolve(local,`detail-output-review-${r}.json`))),approval[`review${r}Sha256`]);
const manifest=json(resolve(local,'processed-manifest.json'));assert.equal(sha(bytes(resolve(local,'processed-manifest.json'))),clip.qa.manifestSha256);assert.equal(manifest.processing.transform.perFrameFit,false);assert.equal(manifest.sampling.timeScale,1);
const raw=decodeApprovedMotionNodeResource(bytes(resolve(assets,clip.indexed.umi.file)));assert.equal(raw.width,240);assert.equal(raw.height,240);assert.equal(raw.frames.length,54);
assert.deepEqual(raw.frames.map(f=>f.sourceFrame),Array.from({length:54},(_,i)=>i*2));assert.equal(raw.frames.at(-1).atMs,4416.667);assert.equal(raw.periodMs,4458);
assert.deepEqual(raw.viewport.worldRect,[0,0,640,640]);
const result=spawnSync('python',['-c',String.raw`
import sys,json,importlib.util,hashlib,numpy as np
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);a=r/'assets/animated';historical=r/'Hi-Res/production/color-consistency-20261024/source29'
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
s=mod(r/'tools/stage-motion-polish.py','verify_head-shake_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_head-shake_quantizer')
c=s.read(historical/'catalog.json');p=s.read(a/c['auxiliaryMotionProvenance']['clips']['head-shake']['file']);d=s.read(a/p['derivation']['file']);clip=c['clips']['head-shake'];raw=s.decode_indexed(historical/clip['indexed']['umi']['file'])
assert {x.name for x in (historical/clip['hires']['baseUrl']).iterdir()}=={f['file']for f in clip['hires']['frames']}
for i,f in enumerate(clip['hires']['frames']):
 im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(640,640) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
 if i%2==0:
  expected=q.indexed(im,raw['palette'],240,pixel=False);assert expected==raw['frames'][i//2]['pixels']

for id,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][id]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('107 exact640RGBA +54 exact240 quantized frames; all25 decoded data equal exceptrevision')
`,root],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
console.log('Approved head-shake: exact60034 human approval, frozen provenance, 640/240 fixed-world sampling and preserved25 sources passed.');
