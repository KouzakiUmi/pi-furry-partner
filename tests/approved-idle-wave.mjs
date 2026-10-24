// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact new approved assets and preservation of all20 prior runtime payloads.
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
const catalog=loadHistoricalColorSourceCatalog(root);assert.ok(Object.keys(catalog.clips).length>=27);
assert.deepEqual(catalog.idleVariants,['idle','idle-center','idle-right']);
const ref=catalog.auxiliaryMotionProvenance.clips.wave,proofFile=resolve(assets,ref.file);
assert.equal(sha(bytes(proofFile)),ref.sha256);const proof=json(proofFile);
assert.equal(proof.retainedClipCount,20);assert.deepEqual(proof.newClips,['idle-center','idle-right','wave']);
const baseline=json(resolve(assets,proof.baselineCatalog.file));assert.equal(Object.keys(baseline.clips).length,20);
assert.equal(sha(bytes(resolve(assets,proof.baselineCatalog.file))),proof.baselineCatalog.sha256);
for(const[id,old]of Object.entries(baseline.clips)){
 assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: originalQA exact`);
 assert.deepEqual(catalog.clips[id].hires,old.hires,`${id}: originalHD metadata exact`);
 for(const frame of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,frame.file))),proof.retainedClips[id].hdFiles[frame.file],`${id}: originalHD bytes`);
}
for(const id of proof.newClips){
 const clip=catalog.clips[id];assert.equal(clip.family,id==='wave'?'action':'state');assert.equal(clip.loop,id!=='wave');
 assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);assert.deepEqual(clip.paintRect,{x:0,y:0,width:640,height:640});
 assert.equal(clip.qa.perFrameFit,false);assert.deepEqual(clip.qa.pivot,[320,608]);assert.deepEqual(clip.qa.sourceCanvas,[640,640]);
 assert.equal(catalog.auxiliaryMotionProvenance.clips[id].sha256,ref.sha256);
 const inputsPath=resolve(assets,clip.qa.inputRecord.file);assert.equal(sha(bytes(inputsPath)),clip.qa.inputRecord.sha256);const inputs=json(inputsPath);
 assert.equal(inputs.historicalPathsAreBuildDependencies,false);
 for(const item of Object.values(inputs.records))assert.equal(sha(bytes(resolve(root,item.path))),item.sha256,`${id}: frozen input ${item.path}`);
 const local=dirname(inputsPath),approval=json(resolve(local,'user-approval.json'));
 assert.equal(approval.userApproved,true);assert.equal(sha(bytes(resolve(local,'user-approval.json'))),clip.qa.userApprovalSha256);
 assert.equal(approval.sourceVideoSha256,clip.qa.sourceVideoSha256);assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
 const manifest=json(resolve(local,'processed-manifest.json'));assert.equal(manifest.source.sha256,clip.qa.sourceVideoSha256);assert.equal(manifest.processing.transform.perFrameFit,false);assert.equal(manifest.sampling.timeScale,1);assert.equal(manifest.sampling.reverse,false);assert.equal(manifest.sampling.interpolation,false);
 assert.equal(sha(bytes(resolve(local,'processed-manifest.json'))),clip.qa.manifestSha256);
 const review=id==='wave'?'output-review':'detail-output-review';
 for(const r of ['A','B']){
  const path=resolve(local,`${review}-${r}.json`);assert.equal(sha(bytes(path)),approval[`review${r}Sha256`]);assert.equal(json(path).readyForUserReview,true);
 }
 const raw=decodeApprovedMotionNodeResource(bytes(resolve(assets,clip.indexed.umi.file)));
 assert.equal(raw.frames.length,54);assert.equal(raw.loop,clip.loop);assert.equal(raw.periodMs,4458);
 assert.deepEqual(raw.frames.map(f=>f.sourceFrame),Array.from({length:54},(_,i)=>i*2));assert.equal(raw.frames.at(-1).atMs,4416.667);
 const derivRef=proof.derivations[id];assert.equal(sha(bytes(resolve(assets,derivRef.file))),derivRef.sha256);
 const deriv=json(resolve(assets,derivRef.file));assert.equal(deriv.hdFrames.length,107);assert.equal(deriv.indexedSampling.length,54);
}
const validation=spawnSync('python',['-c',String.raw`
import sys,json,importlib.util,hashlib
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);a=r/'assets/animated';historical=r/'Hi-Res/production/color-consistency-20261024/source29'
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
s=mod(r/'tools/stage-motion-polish.py','verify_idle_wave_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_idle_wave_quantizer')
c=s.read(historical/'catalog.json');p=s.read(a/c['auxiliaryMotionProvenance']['clips']['wave']['file'])
for action in p['newClips']:
 clip=c['clips'][action];raw=s.decode_indexed(historical/clip['indexed']['umi']['file']);d=s.read(a/p['derivations'][action]['file'])
 assert {x.name for x in (historical/clip['hires']['baseUrl']).iterdir()}=={f['file'] for f in clip['hires']['frames']}
 for i,f in enumerate(clip['hires']['frames']):
  im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(640,640) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
  if i%2==0:assert q.indexed(im,raw['palette'],240,pixel=False)==raw['frames'][i//2]['pixels']
for action,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][action]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('321 approved HD frames fullRGBA +162 same-quantizer Pi frames; all20 prior decoded payloads equal exceptrevision')
`,root],{encoding:'utf8',maxBuffer:1024*1024});
assert.equal(validation.status,0,validation.stderr);console.log(validation.stdout.trim());
console.log('Approved idle/wave: exact human approval graph, canonical inputs, prior20QA/HD/data preservation and107/54 native-clock derivatives passed.');
