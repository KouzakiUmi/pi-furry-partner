import assert from 'node:assert/strict';
import {withGestureVideoFrames, createGestureVideoCache, normalizeGestureVideoCatalog, reviewedHiResGesture} from '../lib/gesture-video.mjs';
import {createMotionPlayer} from '../lib/motion.mjs';
const base={width:4,height:4,palette:[[0,0,0],[255,255,255],[30,80,130]],transparentIndex:0,
 ids:{'idle-open':0},frames:[{id:'idle-open',pixels:Array(16).fill(1)}],motion:{ears:false,paws:false}};
const original=JSON.stringify(base);
const asset={qa:{accepted:true},action:'wave',width:4,height:4,frames:[0,1,2].map(n=>({id:`gesture-wave-00${n}`,pixels:Array(16).fill(n%2+1)})),
 sequence:{periodMs:250,steps:[0,1,2].map((n)=>({id:`gesture-wave-00${n}`,durationMs:[83,84,83][n]}))}};
const sheet=withGestureVideoFrames(base,asset);
assert.equal(sheet.frames.length,4);assert.equal(JSON.stringify(base),original);assert.equal(withGestureVideoFrames(sheet,asset),sheet);
assert.equal(withGestureVideoFrames(base,{...asset,action:'bad'}),base);
assert.equal(withGestureVideoFrames(base,{...asset,sequence:{...asset.sequence,periodMs:300}}),base);
let now=0;const player=createMotionPlayer({now:()=>now});
for(const [elapsed,step]of [[0,0],[82,0],[83,1],[166,1],[167,2],[249,2]]){
 now=elapsed;
 const f=player.frame(sheet,0,{phase:'idle',gesture:{id:'wave',elapsedMs:elapsed}});
 assert.equal(f.motion.gestureSequenceStep,step);assert.equal(f.transitioning,false);
 assert.equal(f.motion.x,0);assert.equal(f.motion.earLeft,0);assert.equal(f.motion.wave,0);assert.equal(f.motion.scale,1);
 assert.deepEqual([...f.frame.pixels],asset.frames[step].pixels);
}
now=300;const still=player.frame(sheet,0,{phase:'idle',animate:false});now=500;
assert.equal(player.frame(sheet,0,{phase:'idle',animate:false,gesture:{id:'wave',elapsedMs:0}}).cacheKey,still.cacheKey);
player.dispose();
console.log('Whole-frame gestures: validated immutable packs, exact chronological timing, no warps/blends and pause passed.');

// Explicit review gates and safe IDs keep rejected/prospective assets dormant.
assert.equal(withGestureVideoFrames(base,{...asset,qa:{accepted:false}}),base);
assert.equal(withGestureVideoFrames(base,{...asset,qa:undefined}),base);
for(const bad of ['../shy','shy/../../poses','SHY','wave-x'])assert.equal(withGestureVideoFrames(base,{...asset,action:bad}),base);
const metadata={periodMs:250,frameCount:3,qa:{accepted:true}};
assert.deepEqual(normalizeGestureVideoCatalog({clips:{wave:metadata,shy:{...metadata,qa:{accepted:false}},'../cry':metadata}}).clips,{wave:metadata});
assert.equal(withGestureVideoFrames(base,asset,{...metadata,periodMs:251}),base);
let loads=0;
const cached=createGestureVideoCache({load:(_style,id)=>{
 loads++;
 return {...asset,action:id,frames:asset.frames.map(f=>({...f,id:f.id.replace('wave',id)})),
  sequence:{...asset.sequence,steps:asset.sequence.steps.map(f=>({...f,id:f.id.replace('wave',id)}))}};
}});
for(const id of ['joy','shy','cry','proud','surprise','sad','grumpy','flustered','affection']) {
 const view=cached.sheet(base,'umi',id,metadata);
 assert.equal(view.frames.length,4,'Each view contains just base plus its current video');
 assert.equal(view.frames[0],base.frames[0]);
 assert.ok(view.frames[1].pixels instanceof Uint8Array);
 assert.ok(cached.stats().clips<=2);
}
assert.equal(loads,9);
const current=cached.sheet(base,'umi','affection',metadata);assert.equal(loads,9);
assert.equal(cached.sheet(base,'umi','affection',metadata),current);
cached.sheet(base,'umi','joy',metadata);assert.equal(loads,10,'Evicted clip loads again rather than retaining all nine');
const wideBase={...base,palette:Array.from({length:288},(_,i)=>[i%256,0,0])};
const wideAsset={...asset,frames:asset.frames.map(f=>({...f,pixels:Array(16).fill(280)}))};
const wide=withGestureVideoFrames(wideBase,wideAsset);
assert.ok(wide.frames[1].pixels instanceof Uint16Array);assert.equal(wide.frames[1].pixels[0],280);
const hd={qa:{accepted:true},periodMs:250,durationMs:250,ids:['gesture-shy-000','gesture-shy-001'],frames:[{atMs:0,id:'gesture-shy-000'},{atMs:125,id:'gesture-shy-001'}]};
assert.equal(reviewedHiResGesture('shy',hd),hd);
assert.equal(reviewedHiResGesture('shy',{...hd,qa:{accepted:false}}),null);
assert.equal(reviewedHiResGesture('shy',{...hd,ids:['../000','gesture-shy-001']}),null);
assert.equal(reviewedHiResGesture('shy',{...hd,frames:[hd.frames[1],hd.frames[0]]}),null);
console.log('Gesture review gates, safe frame IDs, nine-action bounded clip LRU and >256-color typed pixels passed.');

assert.equal(withGestureVideoFrames(base,{...asset,sequence:{...asset.sequence,steps:[...asset.sequence.steps].reverse()}}),base,'Only forward captured-frame order is accepted');
