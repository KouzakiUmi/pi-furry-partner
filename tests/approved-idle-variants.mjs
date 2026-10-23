// Review-gated playlist timing with actual decoded indexed color frames.
import assert from 'node:assert/strict';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
import { createApprovedMotionPlayer, normalizeApprovedMotionCatalog } from '../lib/approved-motion.mjs';
const {catalog,data}=approvedMotionFixture();
for (const [id,periodMs,color] of [['idle-center',800,80],['idle-right',1200,120]]) {
  const clip=structuredClone(catalog.clips.idle);
  clip.id=id;clip.periodMs=periodMs;clip.hires.baseUrl=`hires/${id}/`;
  clip.hires.frames.forEach((f,i)=>{f.id=`${id}-${i}`;f.atMs=i*periodMs/4;});
  for (const [style,meta] of Object.entries(clip.indexed)) {
    const raw=structuredClone(data[meta.file]);raw.clipId=id;raw.periodMs=periodMs;raw.palette[1]=[color,20,30];
    raw.frames.forEach((f,i)=>{f.id=`${id}-${i}`;f.atMs=i*periodMs/4;});
    meta.file=`indexed/${style}/${id}.json`;data[meta.file]=raw;
  }
  catalog.clips[id]=clip;
}
catalog.idleVariants=['idle','idle-center','idle-right','idle-center','cry','missing'];
assert.deepEqual(normalizeApprovedMotionCatalog(catalog).idleVariants,['idle','idle-center','idle-right']);
for (const mutate of [c=>c.qa.accepted=false,c=>c.loop=false,c=>c.paintRect.x++]) {
  const bad=structuredClone(catalog);mutate(bad.clips['idle-center']);
  assert.ok(!normalizeApprovedMotionCatalog(bad).idleVariants.includes('idle-center'),'Unreviewed or differently registered footage cannot join idle');
}
let time=0, draws=0;
const values=[0,.999,.999,0,.4,.6], loads=[];
const player=createApprovedMotionPlayer({catalog,now:()=>time,random:()=>values[draws++%values.length],loadIndexed:path=>{loads.push(path);return data[path];}});
const idle=()=>player.sample({phase:'idle'});
let selection=idle();assert.equal(selection.clipId,'idle');
const first=player.indexedFrame(selection);assert.equal(first.motion.scale,1);
assert.equal(player.nextSelection(selection).clipId,'idle-right');
assert.ok(loads.some(path=>path.endsWith('/idle-right.json')),'Next reviewed clip is prefetched during the current loop');
const initialDraws=draws;
for (const at of [1,250,749,999]) {time=at;selection=idle();assert.equal(selection.clipId,'idle');assert.equal(draws,initialDraws,'Never redraw randomness per frame');}
time=1000;selection=idle();assert.equal(selection.clipId,'idle-right');assert.equal(selection.elapsedMs,0);
let shown=player.indexedFrame(selection);assert.equal(shown.sheet.palette[1][0],120,'Display reads the selected authored color frames');assert.equal(shown.motion.scale,1);assert.equal(shown.motion.tilt,0);
time=2199;assert.equal(idle().clipId,'idle-right');
time=2200;selection=idle();assert.equal(selection.clipId,'idle-center');assert.equal(selection.elapsedMs,0);
shown=player.indexedFrame(selection);assert.equal(shown.sheet.palette[1][0],80);
time=3000;assert.equal(idle().clipId,'idle');
time=5000000;const beforeJump=draws;selection=idle();assert.notEqual(selection.clipId,'idle');assert.equal(draws,beforeJump+1,'A suspended view does not consume a backlog of random cycles');assert.equal(selection.elapsedMs,0);
const previous=selection.clipId;
time++;assert.equal(player.sample({phase:'thinking'}).clipId,'think');
time++;assert.notEqual(idle().clipId,previous,'Returning from a task avoids immediately repeating the last idle');
assert.equal(player.sample({phase:'idle'},{animate:false}),null);
time++;assert.ok(idle());assert.ok(player.stats().clips<=2);player.dispose();

const old=structuredClone(catalog);delete old.idleVariants;
let unexpectedDraws=0;
const compatible=createApprovedMotionPlayer({catalog:old,now:()=>time,random:()=>{unexpectedDraws++;return .9;}});
for (const at of [0,1000,1000000]) {time=at;assert.equal(compatible.sample({phase:'idle'}).clipId,'idle');}
assert.equal(unexpectedDraws,0,'Existing catalogs retain their exact single-loop clock until new artwork is accepted');compatible.dispose();
console.log('Reviewed idle playlist: complete native cycles, randomized nonrepetition, real indexed colors, registration/QA gating, next-clip prefetch, bounded late resume and original-catalog compatibility passed.');
