import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadStateLoops, withStateLoopFrames, normalizeStateLoopCatalog, reviewedHiResStateLoop, stateLoopFamily} from '../lib/state-loop.mjs';
import {createMotionPlayer} from '../lib/motion.mjs';
import {loadEncodedSheet, loadHiResManifest, loadHiResFrame} from '../lib/index.js';

const revision='test-state-revision';
const qa={accepted:true,approvedStaticRevision:revision,processingManifestSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),
  approvedSourceSha256:'759ef974e7ac320463d04188432f17559c58484e34530e2111d2e0b6f7566927',reviewSha256:'c'.repeat(64)};
const palette=[[0,0,0],[255,255,255],[30,80,130]];
const poses=['idle-open','idle-blink','idle-wink','think','work','listen','wait','rest','talk-closed','emotion-grumpy'];
const base={width:2,height:2,palette,approvedStaticRevision:revision,transparentIndex:0,
  ids:Object.fromEntries(poses.map((id,i)=>[id,i])),frames:poses.map(id=>({id,pixels:[1,1,1,1]})),
  motion:{approvedWholeFrames:true,ears:false,paws:false}};
const frames=[{id:'state-idle-000',pixels:[1,2,1,2]},{id:'state-idle-001',pixels:[2,1,2,1]}];
const asset={schemaVersion:1,state:'idle',approvedStaticRevision:revision,width:2,height:2,palette,frames,
  sequence:{periodMs:200,steps:frames.map(f=>({id:f.id,durationMs:100}))},qa};
const metadata={periodMs:200,frameCount:2,approvedStaticRevision:revision,qa};
const catalog={schemaVersion:1,approvedStaticRevision:revision,clips:{idle:metadata}};
const copy=value=>JSON.parse(JSON.stringify(value));
for(const mutate of [a=>a.qa.accepted=false,a=>a.qa.reviewSha256='bad',a=>a.qa.approvedSourceSha256='d'.repeat(64),
  a=>a.approvedStaticRevision='old',a=>a.qa.processingManifestSha256='e'.repeat(64),a=>a.palette.reverse(),
  a=>a.frames[0].pixels[0]=999,a=>a.sequence.steps[0].durationMs=0]) {
  const bad=copy(asset);mutate(bad);assert.equal(withStateLoopFrames(base,bad,metadata),base);
}
assert.deepEqual(normalizeStateLoopCatalog({...catalog,approvedStaticRevision:'old'},revision).clips,{});
assert.deepEqual(normalizeStateLoopCatalog({...catalog,clips:{unknown:metadata}},revision).clips,{});
const sheet=loadStateLoops(base,catalog,()=>asset);
assert.equal(sheet.frames.length,base.frames.length+2);
assert.equal(sheet.frames[0],base.frames[0]);
let clock=0;const player=createMotionPlayer({now:()=>clock});
const at=(ms,id='idle-open',opts={})=>{clock=ms;return player.frame(sheet,sheet.ids[id],{phase:'idle',...opts});};
assert.equal(at(0).frame.id,'state-idle-000');
assert.equal(at(150,'idle-blink',{blink:true}).frame.id,'state-idle-001','Blink does not select static or reset state clock');
assert.equal(at(250,'idle-wink').frame.id,'state-idle-000','The state loops rather than clamping the last frame');
const frozen=at(275,'idle-open',{animate:false});
assert.equal(frozen.frame.id,'idle-open','Animation-off chooses the approved open-eye static, not an independent blink');
assert.equal(at(1000,'idle-blink',{animate:false}).frame.id,frozen.frame.id);
assert.equal(at(1100).motion.stateLoopElapsedMs,0,'Resume starts a coherent idle cycle after the approved static');
assert.equal(at(1150,'emotion-grumpy',{gesture:{id:'grumpy',elapsedMs:0}}).motion.stateLoopId,undefined);
assert.equal(at(1200).motion.stateLoopElapsedMs,0,'Return from gesture starts one new state epoch');
for(const [phase,id] of [['speaking','talk-closed'],['thinking','think'],['reading','work'],['editing','work'],
 ['listening','listen'],['waiting','wait'],['waking','idle-open'],['dozing','rest'],['startled','idle-open'],['running','idle-open']]) {
 const value=at(clock+100,id,{phase});assert.notEqual(value.motion.stateLoopId,'idle',phase+' must preempt idle');
}
assert.equal(stateLoopFamily('idle','emotion-grumpy'),null);
const hd={periodMs:200,durationMs:200,approvedStaticRevision:revision,qa,ids:frames.map(f=>f.id),frames:frames.map((f,i)=>({id:f.id,atMs:i*100}))};
assert.equal(reviewedHiResStateLoop('idle',hd,revision),hd);
const bad=copy(hd);bad.frames[1].atMs=0;assert.equal(reviewedHiResStateLoop('idle',bad,revision),null);
assert.equal(reviewedHiResStateLoop('idle',hd,'old'),null);

// Actual optional installed repository packs: validate all four styles, exact
// authored pixels, their period, and HD allowlisting without rewriting assets.
for(const style of ['umi','umi-pixel','pixel','illustration']) {
 const packet=loadEncodedSheet(style);
 const staticFrames=JSON.parse(readFileSync(new URL(`../assets/reactions/${style}/reaction-sheet.json`,import.meta.url)));
 for(const name of ['idle-open','idle-blink','watch','search'])
  assert.ok(packet.frames.some(f=>f.id===name),'Original static '+name+' remains available');
 const installed=packet.motion?.stateLoops?.idle;
 assert.ok(installed,'Current approved idle pack must load for '+style);
 if(installed) {
  assert.equal(installed.qa.accepted,true);assert.equal(installed.approvedStaticRevision,staticFrames.approvedStaticRevision);
  assert.equal(installed.qa.processingManifestSha256,'e9264bdb4ef0f42a43c0c58df89c4265a29794800ac97b5a0eb0f8d3bb30f96b');
  assert.ok(packet.frames.some(f=>f.id==='state-idle-000'));
 }
}
const bank=loadHiResManifest();
if(bank.animations.stateLoops?.idle) {
 assert.ok(reviewedHiResStateLoop('idle',bank.animations.stateLoops.idle,bank.approvedStaticRevision));
 assert.ok(loadHiResFrame('state-idle','state-idle-000'));
 assert.equal(loadHiResFrame('state-idle','state-idle-999'),null);
}
assert.equal(loadHiResFrame('state-unknown','state-unknown-000'),null);
player.dispose();
console.log('State-loop: QA/revision/source gates, blink-stable looping, priority, pause/resume, four-style packs and HD allowlisting passed.');
