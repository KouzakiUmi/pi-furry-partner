// Actual built controller: delayed HD uses the indexed loop clock; idle never
// masks typing/listening, tools or gestures while their next HD frame loads.
import assert from 'node:assert/strict';
import {loadEncodedSheet,loadEncodedGesture,loadHiResManifest} from '../lib/index.js';
const before={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,wall=0,controller;
const pending=new Map();
const response=tag=>({ok:true,blob:async()=>({tag})});
globalThis.window={__ModuleLoader__:{load:value=>entry=value}};
globalThis.document={hidden:false,createElement:()=>{
 const canvas={width:0,height:0};canvas.getContext=()=>({drawImage:b=>{canvas.tag=b.tag;},
  getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return canvas;
}};
globalThis.createImageBitmap=async b=>({width:640,height:640,tag:b.tag,close(){}});
const packet=loadEncodedSheet('umi'),manifest=loadHiResManifest();
const clip=manifest.animations.stateLoops.idle;
assert.ok(clip,'Approved idle must be installed in repository for this integration test');
const fetchImpl=async url=>{
 const u=new URL(String(url),'http://localhost');
 if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',animation:true,companionship:'off'})};
 if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>packet};
 if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
 if(u.pathname.endsWith('/gesture'))return {ok:true,json:async()=>loadEncodedGesture('umi',u.searchParams.get('action'))};
 const tag=u.searchParams.get('kind')+'/'+u.searchParams.get('id');
 if(tag.startsWith('state-idle/')||tag==='poses/idle-open'||tag==='poses/listen'||tag==='poses/listen-blink'||tag.startsWith('watch/'))
  return new Promise(resolve=>pending.set(tag,()=>resolve(response(tag))));
 return response(tag);
};
const flush=async()=>{for(let n=0;n<100;n++)await Promise.resolve();};
const paint=async()=>{controller.getRenderLayer();await flush();return controller.getRenderLayer();};
const hdId=elapsed=>clip.frames.filter(f=>f.atMs<=elapsed).at(-1).id;
try {
 await import(new URL('../lib/client.js?state-loop-controller',import.meta.url));
 controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>wall});
 await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();
 let layer=await paint();assert.equal(layer.hiRes,false);assert.equal(controller.getSnapshot().visual.frame.id,'state-idle-000');
 const start=controller.getSnapshot().visual.motion.stateLoopElapsedMs;
 const target=clip.periodMs*3+170;
 // Exercise normal visible ticks; the controller deliberately clamps a single
 // long wall-clock jump so a suspended page does not fast-forward animation.
 while(wall<target){wall=Math.min(target,wall+83);controller.notifyChange();controller.getRenderLayer();}
 layer=await paint();
 let snap=controller.getSnapshot();assert.equal(snap.visual.motion.stateLoopId,'idle');
 assert.equal(snap.visual.motion.stateLoopElapsedMs,(start+wall)%clip.periodMs,'Three laps preserve one clock despite independent blinks');
 assert.match(snap.visual.frame.id,/^state-idle-/);assert.equal(layer.hiRes,false);
 const tag='state-idle/'+hdId(snap.visual.motion.stateLoopElapsedMs);assert.ok(pending.has(tag));
 pending.get(tag)();await flush();layer=await paint();assert.equal(layer.bitmap.tag,tag);assert.equal(layer.hiRes,true);
 controller.applySettingsLocal({animation:false});layer=await paint();
 assert.equal(controller.getSnapshot().visual.frame.id,'idle-open');assert.equal(layer.hiRes,false,'Slow static HD uses approved static indexed, not held loop');
 pending.get('poses/idle-open')();await flush();layer=await paint();assert.equal(layer.bitmap.tag,'poses/idle-open');
 wall+=2000;controller.notifyChange();assert.equal((await paint()).bitmap.tag,'poses/idle-open');
 controller.applySettingsLocal({animation:true});layer=await paint();
 snap=controller.getSnapshot();assert.equal(snap.visual.motion.stateLoopElapsedMs,0);
 pending.get('state-idle/'+hdId(0))();await flush();assert.equal((await paint()).hiRes,true);
 controller.bridge.syncInputDraft('typing now');controller.notifyChange();layer=await paint();snap=controller.getSnapshot();
 assert.equal(snap.snapshot.reaction,'listening');assert.equal(snap.visual.motion.stateLoopId,undefined);
 assert.equal(layer.hiRes,false,'A delayed listen HD image must not hold the old idle loop');
 assert.match(snap.visual.frame.id,/^listen/);
 controller.bridge.syncInputDraft('');controller.activity.start({wake:false});controller.notifyChange();await paint();
 assert.equal(controller.playGesture('grumpy'),true);controller.notifyChange();await paint();
 assert.equal(controller.getSnapshot().visual.motion.stateLoopId,undefined,'Manual grumpy overrides idle');
 controller.playGesture('off');controller.activity.start({wake:false});controller.notifyChange();await paint();
 controller.activity.handle('agent_start');controller.activity.handle('tool_execution_start',{toolCallId:'state-loop-tool',toolName:'bash'});
 wall+=1000;controller.notifyChange();layer=await paint();snap=controller.getSnapshot();
 assert.equal(snap.visual.motion.stateLoopId,undefined);assert.match(snap.visual.frame.id,/^watch/);
 assert.equal(layer.hiRes,false,'A delayed running/watch HD frame must not hold the old idle loop');
 console.log('DSH state-loop: three laps, blink clock, HD/indexed matching, idle-open pause/resume, delayed listening/tool preemption and manual gesture priority passed.');
} finally {
 controller?.dispose();for(const[k,v]of Object.entries(before))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}
