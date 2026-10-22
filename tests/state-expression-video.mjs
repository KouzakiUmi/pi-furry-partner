import assert from 'node:assert/strict';
import {createActivity} from '../lib/activity.mjs';
import {createMotionPlayer} from '../lib/motion.mjs';
import {renderDock} from '../lib/editor-layout.mjs';
import {stateExpressionVideo, createGestureVideoCache} from '../lib/gesture-video.mjs';

// Small captured-frame fixtures isolate lifecycle/priority from changing art.
const ids=['idle-open','happy','concern','wait','rest','work','watch','search','think','poke','listen',
  'emotion-joy','emotion-surprise','emotion-flustered'];
const base={width:4,height:4,palette:Array.from({length:12},(_,i)=>[i*20,i*10,i*5]),transparentIndex:0,
 ids:Object.fromEntries(ids.map((id,i)=>[id,i])),frames:ids.map(id=>({id,pixels:Array(16).fill(1)})),motion:{ears:false,paws:false}};
const metadata={qa:{accepted:true},periodMs:1000,frameCount:10};
const catalog={clips:Object.fromEntries(['joy','surprise','flustered'].map(id=>[id,metadata]))};
const pack=id=>({action:id,width:4,height:4,qa:{accepted:true},frames:Array.from({length:10},(_,i)=>({id:`gesture-${id}-${String(i).padStart(3,'0')}`,pixels:Array(16).fill(i+2)})),
 sequence:{periodMs:1000,steps:Array.from({length:10},(_,i)=>({id:`gesture-${id}-${String(i).padStart(3,'0')}`,durationMs:100}))}});
const cache=createGestureVideoCache({load:(_style,id)=>pack(id)});
let time=1000;
const activity=createActivity({now:()=>time,gestureDurations:()=>catalog,random:()=>.2});
const player=createMotionPlayer({now:()=>time});
function paint(snapshot,{animate=true,selectedCatalog=catalog}={}) {
 const before=JSON.stringify(snapshot),intent=stateExpressionVideo(snapshot,selectedCatalog);
 const sheet=cache.sheet(base,'test',intent?.id,selectedCatalog?.clips?.[intent?.id]);
 const visualGesture=snapshot.gesture || (intent && sheet.motion?.gestureVideos?.[intent.id] ? intent : null);
 let displayed;
 renderDock({geometry:{columns:16,captionColumns:16,rows:1},sheet,snapshot,visualGesture,motionPlayer:player,animate,
  theme:{fg:(_color,text)=>text},visibleWidth:text=>[...text].length,truncateToWidth:(text,n)=>[...text].slice(0,n).join(''),
  renderAvatar:frame=>{displayed=frame.sheet.frames[frame.frameIndex];return ['x'.repeat(16)]}});
 assert.equal(JSON.stringify(snapshot),before,'Visual selection cannot mutate task facts or text');
 return {intent,displayed};
}

activity.start({wake:false});activity.handle('agent_start');time=1100;activity.handle('agent_settled');
time=1400;let snap=activity.snapshot();
assert.equal(snap.phaseElapsedMs,0,'Fixture deliberately delays the first render');
assert.equal(snap.expressionElapsedMs,300,'Completion uses its event clock, not the first render');
assert.equal(paint(snap).displayed.id,'gesture-joy-003');
time=1500;snap=activity.snapshot();assert.equal(paint(snap).displayed.id,'gesture-joy-004');
assert.equal(snap.gesture,null);assert.equal(snap.gestureMode,undefined);assert.equal(snap.busy,false);
const paused=paint(snap,{animate:false}).displayed;
time=1600;assert.equal(paint(activity.snapshot(),{animate:false}).displayed.cacheKey,paused.cacheKey,'Pause preserves the exact captured frame');
time=3699;snap=activity.snapshot();assert.equal(snap.phase,'success');
assert.equal(paint(snap).displayed.id,'gesture-joy-009','A state outliving a short film holds its final frame rather than looping');
time=3700;snap=activity.snapshot();assert.equal(snap.phase,'idle');assert.equal(stateExpressionVideo(snap,catalog),null,'A long clip cannot extend the 2600ms completion');

time=5000;activity.start({wake:false});activity.handle('agent_start');activity.handle('ui_prompt_start');activity.snapshot();
time=8000;activity.handle('message_end',{message:{role:'assistant',stopReason:'error'}});
time=8200;snap=activity.snapshot();
assert.ok(snap.phaseElapsedMs>2000);assert.equal(snap.expressionElapsedMs,200);
assert.equal(paint(snap).displayed.id,'gesture-flustered-002','Warning has its own clock inside a continuing question');
assert.equal(snap.awaitingUser,true);assert.equal(snap.busy,true);
time=8500;activity.handle('message_end',{message:{role:'assistant',stopReason:'error'}});
time=8600;snap=activity.snapshot();assert.equal(snap.expressionElapsedMs,100);assert.equal(paint(snap).displayed.id,'gesture-flustered-001','A new warning restarts only its visual age');
activity.noteTyping();snap=activity.snapshot();assert.equal(snap.reaction,'listening');assert.equal(stateExpressionVideo(snap,catalog),null);
activity.clearTyping();time=10299;snap=activity.snapshot();assert.equal(snap.phase,'waiting');assert.ok(stateExpressionVideo(snap,catalog));
time=10300;snap=activity.snapshot();assert.equal(snap.phase,'waiting');assert.equal(snap.awaitingUser,true);assert.equal(stateExpressionVideo(snap,catalog),null,'The warning ends after 1800ms while its question stays open');

time=20000;activity.start({wake:false});activity.handle('ui_prompt_start');activity.snapshot();
time=30001;assert.equal(activity.snapshot().drowsy,true);activity.handle('ui_prompt_end');
snap=activity.snapshot();assert.equal(snap.reaction,'startled');assert.equal(snap.phase,'idle');
assert.equal(paint(snap).displayed.id,'gesture-surprise-000','Startled explicitly permits a reviewed whole-frame state clip');
time=30201;snap=activity.snapshot();assert.equal(snap.expressionElapsedMs,200);assert.equal(paint(snap).displayed.id,'gesture-surprise-002');
time=30650;snap=activity.snapshot();assert.equal(snap.reaction,'startled');assert.ok(stateExpressionVideo(snap,catalog));
time=30651;snap=activity.snapshot();assert.equal(snap.reaction,undefined);assert.equal(stateExpressionVideo(snap,catalog),null,'The 650ms startle never borrows the full film duration');

const success={phase:'success',visualPhase:'success',face:'happy',phaseElapsedMs:240,expressionElapsedMs:240,gesture:null};
for(const reaction of ['poked','listening'])assert.equal(stateExpressionVideo({...success,reaction},catalog),null);
for(const phase of ['reading','editing','running','searching','compacting','speaking']) {
 assert.equal(stateExpressionVideo({...success,visualPhase:phase,reaction:'startled',face:'concern'},catalog),null,'Real work and its display hold always win');
}
assert.equal(stateExpressionVideo({...success,drowsy:true},catalog),null);
assert.equal(stateExpressionVideo(success,{clips:{joy:{...metadata,qa:{accepted:false}}}}),null);
assert.equal(stateExpressionVideo(success,{clips:{}}),null);
assert.equal(paint(success,{selectedCatalog:{clips:{}}}).displayed.id,'emotion-joy','Missing/unreviewed clips retain the authored static fallback');
const missing=createGestureVideoCache({load:()=>{throw new Error('Absent optional clip')}});
assert.equal(missing.sheet(base,'test','joy',metadata),base,'An accepted catalog alone does not fabricate an available clip');
time=40000;activity.start({wake:false});assert.equal(activity.playGesture('joy'),true);
snap=activity.snapshot();assert.equal(snap.gesture.id,'joy');assert.equal(stateExpressionVideo(snap,catalog),null,'Manual/full-cycle gestures are a different lifecycle');
time=40999;assert.equal(activity.snapshot().gesture.id,'joy');time=41000;assert.equal(activity.snapshot().gesture,null);
player.dispose();cache.clear();missing.clear();
console.log('State H3 bridge: real completion/warning/startle event ages, Pi dock captured pixels, original 2600/1800/650ms lifetimes, independent manual state, pause and interaction/work/review fallbacks passed.');
