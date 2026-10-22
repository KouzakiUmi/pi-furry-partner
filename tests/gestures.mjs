import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GESTURES, GESTURE_PERIOD_MS, gestureAt, sampleGestureMotion } from '../lib/gestures.mjs';
import { createActivity } from '../lib/activity.mjs';
import { createMotionPlayer } from '../lib/motion.mjs';
import { localizeSnapshot } from '../lib/language.mjs';

assert.equal(GESTURES.length,17);
assert.equal(gestureAt('bad',0),null);
assert.equal(gestureAt('all',-1),null);
assert.equal(gestureAt('all',GESTURE_PERIOD_MS).id,'wave');
for(const g of GESTURES){
  assert.equal(gestureAt(g.id,g.durationMs),null);
  const a=sampleGestureMotion(g.id,0),b=sampleGestureMotion(g.id,g.durationMs-0.001);
  assert.equal(a.x,0);assert.equal(a.y,0);assert.equal(a.tilt,0);assert.equal(a.scale,1);
  assert.equal(b.x,0);assert.equal(b.y,0);assert.equal(b.tilt,0);
  for(let t=0;t<g.durationMs;t+=50) for(const n of Object.values(sampleGestureMotion(g.id,t))) assert.ok(Number.isFinite(n));
}
let time=0;
const activity=createActivity({now:()=>time});activity.start({wake:false});
assert.equal(activity.playGesture('all'),true);
for(let t=0;t<GESTURE_PERIOD_MS;t+=100){time=t;const s=activity.snapshot();assert.equal(s.phase,'idle');assert.equal(s.busy,false);if(s.gesture)assert.equal(localizeSnapshot(s,'en').phrase,s.gesture.words[1]);}
activity.handle('agent_start');assert.equal(activity.snapshot().gesture,null);
assert.equal(activity.playGesture('wave'),false);
activity.handle('ui_prompt_start');assert.equal(activity.playGesture('wave'),false);
activity.start({wake:false});activity.playGesture('nod');activity.noteTyping();assert.equal(activity.snapshot().gesture,null);

for(const style of ['umi','umi-pixel','pixel','illustration']){
 const sheet=JSON.parse(await readFile(new URL(`../assets/reactions/${style}/reaction-sheet.json`,import.meta.url),'utf8'));
 const original=JSON.stringify(sheet);let at=0;
 const player=createMotionPlayer({now:()=>at});
 for(const g of GESTURES){
  const index=sheet.ids[g.face]??sheet.ids['idle-open'];
  for(const fraction of [.22,.47,.73]){at+=100;const f=player.frame(sheet,index,{phase:'idle',gesture:{id:g.id,elapsedMs:g.durationMs*fraction}});assert.ok(f.frame.pixels.every(p=>p>=0&&p<sheet.palette.length));assert.ok(f.nextInMs<=50);}
 }
 const f=player.frame(sheet,sheet.ids['idle-open'],{phase:'idle',animate:false});at+=2000;
 assert.equal(player.frame(sheet,sheet.ids['idle-open'],{phase:'idle',animate:false,gesture:{id:'wave',elapsedMs:500}}).cacheKey,f.cacheKey);
 assert.equal(JSON.stringify(sheet),original);player.dispose();
}
console.log('Shared gestures: 8 motions + 9 authored expressions, both languages, task/input priority, all four styles, neutral endpoints and pause passed.');

const durations={shy:6583,cry:6583};
assert.equal(gestureAt('shy',6500,durations).durationMs,6583);
assert.equal(gestureAt('shy',6583,durations),null);
const revisedPeriod=GESTURE_PERIOD_MS+(6583-3600)+(6583-4200);
assert.equal(gestureAt('all',revisedPeriod,durations).id,'wave');
let time2=0;const metadataActivity=createActivity({now:()=>time2,gestureDurations:()=>durations});
metadataActivity.start({wake:false});metadataActivity.playGesture('cry');time2=6400;
assert.equal(metadataActivity.snapshot().gesture.id,'cry');time2=6583;
assert.equal(metadataActivity.snapshot().gesture,null);
