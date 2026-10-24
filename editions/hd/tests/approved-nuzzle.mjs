// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact user-approved full640 nuzzle and preservation of all28 prior sources.
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
const catalog=loadHistoricalColorSourceCatalog(root),clip=catalog.clips.nuzzle;assert.equal(Object.keys(catalog.clips).length,29);
assert.equal(clip.family,'action');assert.equal(clip.loop,false);assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);
assert.deepEqual(clip.paintRect,{x:0,y:0,width:640,height:640});assert.equal(clip.qa.perFrameFit,false);
assert.deepEqual(clip.qa.sourceCanvas,[640,640]);assert.deepEqual(clip.qa.pivot,[320,608]);
const ref=catalog.auxiliaryMotionProvenance.clips.nuzzle,proofPath=resolve(assets,ref.file);assert.equal(sha(bytes(proofPath)),ref.sha256);
const proof=json(proofPath);assert.equal(proof.retainedClipCount,28);assert.deepEqual(proof.newClips,['nuzzle']);
const baselinePath=resolve(assets,proof.baselineCatalog.file),baseline=json(baselinePath);assert.equal(sha(bytes(baselinePath)),proof.baselineCatalog.sha256);assert.equal(Object.keys(baseline.clips).length,28);
assert.deepEqual(catalog.idleVariants,baseline.idleVariants);
for(const[id,old]of Object.entries(baseline.clips)){
 const normalized=structuredClone(catalog.clips[id]);for(const style of Object.keys(normalized.indexed))normalized.indexed[style].sha256=old.indexed[style].sha256;assert.deepEqual(normalized,old,`${id}: all old metadata exact except binary hash`);
 assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: priorQA exact`);assert.deepEqual(catalog.clips[id].hires,old.hires,`${id}: priorHD metadata exact`);
 for(const f of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,f.file))),proof.retainedClips[id].hdFiles[f.file]);
}
const inputsPath=resolve(assets,clip.qa.inputRecord.file);assert.equal(sha(bytes(inputsPath)),clip.qa.inputRecord.sha256);const inputs=json(inputsPath),local=dirname(inputsPath);
assert.equal(inputs.historicalPathsAreBuildDependencies,false);
for(const rec of Object.values(inputs.records))assert.equal(sha(bytes(resolve(root,rec.path))),rec.sha256,rec.path);
const approval=json(resolve(local,'user-approval.json'));assert.equal(approval.userApproved,true);assert.equal(approval.action,'nuzzle');
assert.equal(sha(bytes(resolve(local,'user-approval.json'))),clip.qa.userApprovalSha256);assert.equal(approval.manifestSha256,'ad7c57fd9730b182481153163b530214d5c26a4d3184272e66b847baf4610bb2');assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
assert.equal(approval.sourceVideoSha256,'e72c5f0add9d42887c73c1eda85368caa549d23adc6f6441ae27bd1a68dd090b');assert.equal(approval.sourceVideoSha256,clip.qa.sourceVideoSha256);
assert.equal(approval.reviewEvidenceSha256,'8455e7998851787c8d6555ecd3cb47438924d683ce21d04aca230bea085c8e9c');assert.equal(approval.userQuote,'透明版可以，接入两端');
for(const r of ['A','B'])assert.equal(sha(bytes(resolve(local,`detail-output-review-${r}.json`))),approval[`review${r}Sha256`]);
const evidence=json(resolve(assets,'provenance/auxiliary/nuzzle-v9/approval-evidence-index.json'));assert.equal(evidence.userApprovalSha256,clip.qa.userApprovalSha256);assert.equal(evidence.approvalFiles.length,approval.files.length);assert.ok(evidence.approvalFiles.some(item=>item.sha256===approval.reviewEvidenceSha256));
for(const [i,item]of evidence.approvalFiles.entries()){assert.equal(item.sha256,approval.files[i].sha256);assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256,'Every exact approved file remains canonical');}
for(const item of evidence.frozenMatteReferenceInputs)assert.equal(sha(bytes(resolve(assets,item.file))),item.sha256);
assert.equal(baseline.clips.nuzzle,undefined,'Frozen28 baseline predates nuzzle approval');
const manifest=json(resolve(local,'processed-manifest.json'));assert.equal(sha(bytes(resolve(local,'processed-manifest.json'))),clip.qa.manifestSha256);assert.equal(manifest.processing.transform.perFrameFit,false);assert.equal(manifest.sampling.timeScale,1);
const raw=decodeApprovedMotionNodeResource(bytes(resolve(assets,clip.indexed.umi.file)));assert.equal(raw.width,240);assert.equal(raw.height,240);assert.equal(raw.frames.length,54);
assert.deepEqual(raw.frames.map(f=>f.sourceFrame),Array.from({length:54},(_,i)=>i*2));assert.equal(raw.frames.at(-1).atMs,4416.667);assert.equal(raw.periodMs,4458);
assert.deepEqual(raw.viewport.worldRect,[0,0,640,640]);assert.deepEqual(raw.viewport.worldAnchor,[320,608]);assert.deepEqual(raw.viewport.bitmapPivot,[320,608]);
const result=spawnSync('python',['-c',String.raw`
import sys,json,importlib.util,hashlib,numpy as np
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);a=r/'assets/animated';historical=r/'Hi-Res/production/color-consistency-20261024/source29'
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
s=mod(r/'tools/stage-motion-polish.py','verify_nuzzle_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_nuzzle_quantizer')
c=s.read(historical/'catalog.json');p=s.read(a/c['auxiliaryMotionProvenance']['clips']['nuzzle']['file']);d=s.read(a/p['derivation']['file']);clip=c['clips']['nuzzle'];raw=s.decode_indexed(historical/clip['indexed']['umi']['file'])
assert {x.name for x in (historical/clip['hires']['baseUrl']).iterdir()}=={f['file']for f in clip['hires']['frames']}
for i,f in enumerate(clip['hires']['frames']):
 im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(640,640) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
 if i%2==0:
  expected=q.indexed(im,raw['palette'],240,pixel=False);assert expected==raw['frames'][i//2]['pixels']
assert raw['viewport']['worldRect']==[0,0,640,640]
for id,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][id]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('107 exact full640RGBA +54 exact240 fixed-world quantized frames; all28 decoded data equal exceptrevision')
`,root],{encoding:'utf8',maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
console.log('Approved nuzzle: exact64658 human approval, frozen provenance, full640/240 fixed-world sampling and preserved28 sources passed.');
