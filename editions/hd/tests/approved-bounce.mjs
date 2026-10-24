// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact user-approved full896 bounce and preservation of all27 prior sources.
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
const catalog=loadHistoricalColorSourceCatalog(root),clip=catalog.clips.bounce;assert.ok(Object.keys(catalog.clips).length>=28);
assert.equal(clip.family,'action');assert.equal(clip.loop,false);assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);
assert.deepEqual(clip.paintRect,{x:-128,y:-128,width:896,height:896});assert.equal(clip.qa.perFrameFit,false);
assert.deepEqual(clip.qa.sourceCanvas,[896,896]);assert.deepEqual(clip.qa.pivot,[448,736]);
const ref=catalog.auxiliaryMotionProvenance.clips.bounce,proofPath=resolve(assets,ref.file);assert.equal(sha(bytes(proofPath)),ref.sha256);
const proof=json(proofPath);assert.equal(proof.retainedClipCount,27);assert.deepEqual(proof.newClips,['bounce']);
const baselinePath=resolve(assets,proof.baselineCatalog.file),baseline=json(baselinePath);assert.equal(sha(bytes(baselinePath)),proof.baselineCatalog.sha256);assert.equal(Object.keys(baseline.clips).length,27);
assert.deepEqual(catalog.idleVariants,baseline.idleVariants);
for(const[id,old]of Object.entries(baseline.clips)){
 const normalized=structuredClone(catalog.clips[id]);for(const style of Object.keys(normalized.indexed))normalized.indexed[style].sha256=old.indexed[style].sha256;assert.deepEqual(normalized,old,`${id}: all old metadata exact except binary hash`);
 assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: priorQA exact`);assert.deepEqual(catalog.clips[id].hires,old.hires,`${id}: priorHD metadata exact`);
 for(const f of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,f.file))),proof.retainedClips[id].hdFiles[f.file]);
}
const inputsPath=resolve(assets,clip.qa.inputRecord.file);assert.equal(sha(bytes(inputsPath)),clip.qa.inputRecord.sha256);const inputs=json(inputsPath),local=dirname(inputsPath);
assert.equal(inputs.historicalPathsAreBuildDependencies,false);
for(const rec of Object.values(inputs.records))assert.equal(sha(bytes(resolve(root,rec.path))),rec.sha256,rec.path);
const approval=json(resolve(local,'user-approval.json'));assert.equal(approval.userApproved,true);assert.equal(approval.action,'bounce');
assert.equal(sha(bytes(resolve(local,'user-approval.json'))),clip.qa.userApprovalSha256);assert.equal(approval.manifestSha256,'ce50e9baecec18d7ab2b03973044c33080653305b0173231c38951ab82cc0e4c');assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
assert.equal(approval.sourceVideoSha256,'fda9a64fb785bed16280ebd59df435bdd5ca275540b8b32f7054a15f429a37d6');assert.equal(approval.sourceVideoSha256,clip.qa.sourceVideoSha256);
assert.equal(approval.reviewEvidenceSha256,'5e7e24389577cb9fe41b377a7e4401b88ed2d3322789e5cd2b1dc41884a81370');assert.equal(sha(bytes(resolve(local,'bounce-v5-transparent-final-review-20261024-evidence.json'))),approval.reviewEvidenceSha256);
for(const r of ['A','B'])assert.equal(sha(bytes(resolve(local,`detail-output-review-${r}.json`))),approval[`review${r}Sha256`]);
const evidence=json(resolve(assets,'provenance/auxiliary/bounce-v5/approval-evidence-index.json'));assert.equal(evidence.userApprovalSha256,clip.qa.userApprovalSha256);assert.equal(evidence.approvalFiles.length,approval.files.length);
for(const [i,item]of evidence.approvalFiles.entries()){assert.equal(item.sha256,approval.files[i].sha256);assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256,'Every exact approved file remains canonical');}
for(const item of evidence.frozenMatteReferenceInputs)assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256);
assert.equal(baseline.clips.nuzzle,undefined,'Frozen bounce baseline predates nuzzle approval');
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
s=mod(r/'tools/stage-motion-polish.py','verify_bounce_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_bounce_quantizer')
c=s.read(historical/'catalog.json');p=s.read(a/c['auxiliaryMotionProvenance']['clips']['bounce']['file']);d=s.read(a/p['derivation']['file']);clip=c['clips']['bounce'];raw=s.decode_indexed(historical/clip['indexed']['umi']['file']);outside=0
assert {x.name for x in (historical/clip['hires']['baseUrl']).iterdir()}=={f['file']for f in clip['hires']['frames']}
for i,f in enumerate(clip['hires']['frames']):
 im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(896,896) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
 if i%2==0:
  expected=q.indexed(im,raw['palette'],336,pixel=False);assert expected==raw['frames'][i//2]['pixels'];v=np.array(expected).reshape(336,336);outside+=int(np.count_nonzero(v[:,:48]))+int(np.count_nonzero(v[:,288:]))
assert raw['viewport']['worldRect']==[-128,-128,896,896]
for id,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][id]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('107 exact full896RGBA +54 exact336 full-source quantized frames; all27 decoded data equal exceptrevision; preserved pixels beyond old640world:',outside)
`,root],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
console.log('Approved bounce: exact62731 human approval, frozen provenance, full896/336 no-crop sampling and preserved27 sources passed.');
