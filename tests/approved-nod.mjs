// Historical source approval/unchanged-pixel assertions remain bound to frozen source29.
// Exact approved source/pixels and real manual/automatic activity clocks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {loadHistoricalColorSourceCatalog,readHistoricalColorSource} from './historical-color-source.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';
import { createActivity } from '../lib/activity.mjs';
import { AUTO_GESTURE_IDS } from '../lib/gestures.mjs';
import { createApprovedMotionPlayer } from '../lib/approved-motion.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),assets=resolve(root,'assets/animated');
const bytes=p=>readHistoricalColorSource(root,p),sha=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(bytes(p));
const catalog=loadHistoricalColorSourceCatalog(root),clip=catalog.clips.nod;
assert.ok(Object.keys(catalog.clips).length>=27);assert.equal(clip.family,'action');
assert.equal(clip.periodMs,4458);assert.equal(clip.frameCount,107);assert.deepEqual(clip.paintRect,{x:0,y:0,width:640,height:640});
assert.deepEqual(clip.qa.sourceCanvas,[640,640]);assert.deepEqual(clip.qa.pivot,[320,608]);assert.equal(clip.qa.perFrameFit,false);
const proofRef=catalog.auxiliaryMotionProvenance.clips.nod,proofPath=resolve(assets,proofRef.file);
assert.equal(sha(bytes(proofPath)),proofRef.sha256);const proof=json(proofPath);
const baseline=json(resolve(assets,proof.baselineCatalog.file));assert.equal(sha(bytes(resolve(assets,proof.baselineCatalog.file))),proof.baselineCatalog.sha256);
assert.equal(Object.keys(baseline.clips).length,19,'The frozen historical19 baseline is preserved');
assert.deepEqual(Object.keys(proof.retainedClips).sort(),Object.keys(baseline.clips).sort());
for(const[id,old]of Object.entries(baseline.clips)){
  assert.deepEqual(catalog.clips[id].qa,old.qa,`${id}: originalQA unchanged`);
  for(const frame of old.hires.frames)assert.equal(sha(bytes(resolve(assets,old.hires.baseUrl,frame.file))),proof.retainedClips[id].hdFiles[frame.file],`${id}: originalHD bytes unchanged`);
}
const inputs=json(resolve(root,clip.qa.inputRecord.file.startsWith('assets/')?clip.qa.inputRecord.file:'assets/animated/'+clip.qa.inputRecord.file));
const inputBase=resolve(assets,'provenance/auxiliary/nod-v1/clips/nod');
assert.equal(sha(bytes(resolve(inputBase,'inputs.json'))),clip.qa.inputRecord.sha256);
const approval=json(resolve(inputBase,'user-approval.json')),manifestBytes=bytes(resolve(inputBase,'processed-manifest.json'));
assert.equal(sha(bytes(resolve(inputBase,'user-approval.json'))),clip.qa.userApprovalSha256);assert.equal(approval.userApproved,true);
assert.equal(sha(manifestBytes),clip.qa.manifestSha256);assert.equal(approval.manifestSha256,clip.qa.manifestSha256);
for(const[key,file]of [['reviewASha256','detail-output-review-A.json'],['reviewBSha256','detail-output-review-B.json']])assert.equal(sha(bytes(resolve(inputBase,file))),approval[key]);
assert.equal(clip.qa.sourceVideoSha256,'cc8bea3affde81debe5223b43d8c7d31e1e7afd71a6a837e17445d9ac3127379');
const raw=decodeApprovedMotionNodeResource(bytes(resolve(assets,clip.indexed.umi.file)));
assert.equal(raw.frames.length,54);assert.deepEqual(raw.frames.map(f=>f.sourceFrame),Array.from({length:54},(_,i)=>i*2));
assert.equal(raw.frames.at(-1).sourceFrame,106);assert.equal(raw.frames.at(-1).atMs,4416.667);
let clock=0;const activity=createActivity({now:()=>clock,autoGestures:true,gestureDurations:()=>({clips:catalog.clips})});
const player=createApprovedMotionPlayer({catalog,now:()=>clock,loadIndexed:p=>decodeApprovedMotionNodeResource(bytes(resolve(assets,p)))});
activity.start({wake:false});activity.snapshot();assert.equal(activity.playGesture('nod'),true);
const seen=new Set();for(clock=0;clock<4458;clock+=100){const s=activity.snapshot();assert.equal(s.gesture.id,'nod');assert.equal(s.gesture.durationMs,4458);const v=player.indexedFrame(player.sample(s));seen.add(sha(Buffer.from(v.frame.pixels)));assert.equal(v.motion.scale,1);assert.equal(v.motion.tilt,0);}
assert.ok(seen.size>20,'Real nod indexed pixels change throughout its source timeline');
clock=4457;assert.equal(activity.snapshot().gesture.id,'nod');clock=4458;assert.equal(activity.snapshot().gesture,null);
clock=0;activity.start({wake:false});activity.snapshot();const start=45000+AUTO_GESTURE_IDS.indexOf('nod')*120000;
clock=start+3000;assert.equal(activity.snapshot().gesture.id,'nod');clock=start+4457;assert.equal(activity.snapshot().gesture.id,'nod');clock=start+4458;assert.equal(activity.snapshot().gesture,null);
player.dispose();
const verification=spawnSync('python',['-c',String.raw`
import sys,json,hashlib,importlib.util,numpy as np
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]);a=r/'assets/animated';historical=r/'Hi-Res/production/color-consistency-20261024/source29'
def mod(p,n):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
s=mod(r/'tools/stage-motion-polish.py','verify_nod_stage');q=mod(r/'scripts/export_approved_h3_actions.py','verify_nod_quantizer')
c=s.read(historical/'catalog.json');raw=s.decode_indexed(historical/c['clips']['nod']['indexed']['umi']['file']);p=s.read(a/'provenance/auxiliary/nod-v1/integration.json');d=s.read(a/p['derivation']['file'])
for i,f in enumerate(c['clips']['nod']['hires']['frames']):
 im=Image.open(historical/f['sourceAsset']['path'].removeprefix('assets/animated/')).convert('RGBA');assert im.size==(640,640) and hashlib.sha256(im.tobytes()).hexdigest()==d['hdFrames'][i]['approvedPngDecodedRgbaSha256']
 if i%2==0:assert q.indexed(im,raw['palette'],240,pixel=False)==raw['frames'][i//2]['pixels']
for action,e in p['retainedClips'].items():
 old=s.decode_indexed(historical/c['clips'][action]['indexed']['umi']['file']);old['revision']=p['previousRevision'];assert s.sha(s.canonical(old))==e['beforeCanonicalDecodedSha256']
print('107 approved nod HD fullRGBA and54 exact existing-quantizer frames; all19 decoded payloads identical exceptrevision')
`,root],{encoding:'utf8',maxBuffer:1024*1024});
assert.equal(verification.status,0,verification.stderr);console.log(verification.stdout.trim());
console.log('Approved nod: exact approval/provenance, all107HD/54Pi pixels, manual/automatic4458ms duration and unchanged19-clips passed.');
