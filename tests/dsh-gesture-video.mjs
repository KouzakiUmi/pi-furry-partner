import assert from 'node:assert/strict';
import { EXPRESSIONS } from '../lib/expressions.mjs';
const before={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,clock=0,closed=0,created=0;
const actions=EXPRESSIONS.map(e=>e.id), requests=[];
const palette=Array.from({length:288},(_,i)=>[i%256,(i*7)%256,(i*11)%256]);
const metadata={periodMs:6400,frameCount:4,qa:{accepted:true}};
const pixels=n=>{
 const b=Buffer.alloc(32);for(let i=0;i<16;i++)b.writeUInt16LE(n,i*2);return b.toString('base64');
};
const sheet={width:4,height:4,palette,pixelsEncoding:'u16le',transparentIndex:0,
 ids:{'idle-open':0,'idle-blink':1,...Object.fromEntries(actions.map((id,i)=>[`emotion-${id}`,i+2]))},
 frames:['idle-open','idle-blink',...actions.map(id=>`emotion-${id}`)].map(id=>({id,pixels:pixels(280)})),
 motion:{ears:false,paws:false},gestureCatalog:{schemaVersion:1,clips:Object.fromEntries(actions.map(id=>[id,metadata]))}};
function pack(id){return {action:id,width:4,height:4,palette,pixelsEncoding:'u16le',qa:{accepted:true},
 frames:Array.from({length:4},(_,i)=>({id:`gesture-${id}-00${i}`,pixels:pixels(280+i)})),
 sequence:{periodMs:6400,steps:Array.from({length:4},(_,i)=>({id:`gesture-${id}-00${i}`,durationMs:1600}))}};}
function clip(id){return {periodMs:6400,durationMs:6400,qa:{accepted:true},
 ids:Array.from({length:40},(_,i)=>`gesture-${id}-${String(i).padStart(3,'0')}`),
 frames:Array.from({length:40},(_,i)=>({id:`gesture-${id}-${String(i).padStart(3,'0')}`,atMs:i*160}))};}
const manifest={width:640,height:640,poses:['idle-open','idle-blink'],motion:{ears:false,paws:false},
 animations:{gestures:Object.fromEntries(actions.map(id=>[id,clip(id)]))}};
globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
globalThis.document={hidden:false,createElement:()=>{
 const canvas={width:0,height:0};
 canvas.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return canvas;
}};
globalThis.createImageBitmap=async blob=>{created++;return {width:640,height:640,tag:blob.tag,close(){closed++;}}};
const fetchImpl=async url=>{
 const u=new URL(String(url),'http://localhost');requests.push(u);
 if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',language:'en',companionship:'off'})};
 if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>sheet};
 if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
 if(u.pathname.endsWith('/gesture'))return {ok:true,json:async()=>pack(u.searchParams.get('action'))};
 return {ok:true,blob:async()=>({tag:`${u.searchParams.get('kind')}/${u.searchParams.get('id')}`})};
};
const flush=async()=>{for(let n=0;n<80;n++)await Promise.resolve();};
let controller;
try {
 await import(new URL('../lib/client.js?gesture-video-integration',import.meta.url));
 const plugin=entry.factory(()=>({}));controller=plugin.createMascotController({fetchImpl,now:()=>clock});
 await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();
 assert.equal(requests.filter(u=>u.pathname.endsWith('/gesture')).length,0,'Idle startup never fetches nine video clips');
 for(const action of actions) {
  assert.equal(controller.playGesture(action),true);await flush();
  assert.ok(controller.cacheStats().gestureClips<=2);
  for(let i=0;i<34;i++) {
   clock+=160;controller.notifyChange();const layer=controller.getRenderLayer();await flush();
   assert.equal(controller.getSnapshot().gesture.id,action,'Metadata duration keeps the action past its old 3600ms lifetime');
   assert.equal(controller.getSnapshot().visual.motion.scale,1);
   assert.equal(controller.getSnapshot().visual.motion.x,0);assert.equal(controller.getSnapshot().visual.motion.earLeft,0);
   assert.ok(controller.getSnapshot().visual.frame.pixels instanceof Uint16Array);
   assert.ok(controller.getSnapshot().visual.frame.pixels[0]>=280,'u16le survives the single-clip API');
   assert.equal(controller.getSnapshot().visual.transitioning,false);
   if(layer?.bitmap?.tag?.startsWith('gesture-'))assert.equal(layer.transform,null,'HD video must not receive an extra transform');
   assert.ok(controller.cacheStats().hiResFrames<=96);
  }
  controller.playGesture('off');
 }
 assert.equal(requests.filter(u=>u.pathname.endsWith('/gesture')).length,9);
 assert.ok(created>96);assert.ok(closed>20,'Evicted HD frames release decoded bitmap resources');
 assert.equal(controller.cacheStats().gestureClips,2);
 assert.equal(controller.playGesture('shy'),true);await flush();clock+=200;controller.notifyChange();
 const elapsed=controller.getSnapshot().gesture.elapsedMs;
 controller.applySettingsLocal({animation:false});clock+=1000;controller.notifyChange();
 assert.equal(controller.getSnapshot().gesture.elapsedMs,elapsed,'Pause freezes gesture clock');
 controller.applySettingsLocal({animation:true});controller.activity.handle('agent_start');controller.notifyChange();
 assert.equal(controller.getSnapshot().gesture,null,'Real work immediately wins over a video');

 // Real lifecycle states borrow a clip purely for drawing. They do not become
 // manual tours, change task facts/copy, or wait for the 6400ms film to finish.
 const advance=ms=>{while(ms>0){const part=Math.min(ms,200);clock+=part;ms-=part;controller.notifyChange();}};
 const stateEvent=(type,event={})=>{controller.activity.handle(type,event);controller.notifyChange();};
 const frameLayer=async()=>{controller.getRenderLayer();await flush();return controller.getRenderLayer();};
 controller.activity.start({wake:false});controller.notifyChange();
 controller.bridge.handleSessionEvent({sessionId:'real-state',type:'turn/start'});controller.notifyChange();
 controller.bridge.handleSessionEvent({sessionId:'real-state',type:'turn/end',data:{reason:{kind:'complete'}}});controller.notifyChange();await flush();
 let state=controller.getSnapshot();
 assert.equal(state.snapshot.phase,'success');assert.equal(state.snapshot.busy,false);
 assert.equal(state.snapshot.gesture,null);assert.equal(state.gesture,null);assert.equal(state.visualGesture.source,'state');assert.equal(state.visualGesture.id,'joy');
 assert.match((await frameLayer()).bitmap.tag,/^gesture-joy\/gesture-joy-000$/);
 advance(320);await flush();state=controller.getSnapshot();
 assert.equal(state.visualGesture.elapsedMs,320,'State frame age advances without restarting on redraw');
 assert.match((await frameLayer()).bitmap.tag,/gesture-joy-002$/);assert.equal((await frameLayer()).transform,null);
 const sourceState=JSON.stringify(state.snapshot);controller.getRenderLayer();assert.equal(JSON.stringify(controller.getSnapshot().snapshot),sourceState);
 controller.playGesture('off');assert.equal(controller.getSnapshot().snapshot.gestureMode,undefined);assert.equal(controller.getSnapshot().visualGesture.id,'joy','Manual off cannot alter the genuine completion lifecycle');
 advance(2279);assert.equal(controller.getSnapshot().snapshot.phase,'success');
 advance(1);assert.equal(controller.getSnapshot().snapshot.phase,'idle');assert.equal(controller.getSnapshot().visualGesture,null,'Completion is still exactly 2600ms');
 assert.ok(!controller.getRenderLayer()?.bitmap?.tag?.startsWith('gesture-joy/'),'An expired state film cannot be held over the next real pose while HD loads');

 controller.activity.start({wake:false});stateEvent('agent_start');stateEvent('tool_execution_start',{toolCallId:'question',toolName:'ask_user'});
 advance(2000);while(!controller.getSnapshot().snapshot.blink)advance(20);
 stateEvent('message_end',{message:{role:'assistant',stopReason:'error'}});await flush();
 state=controller.getSnapshot();const warningCopy=state.snapshot.phrase;
 assert.equal(state.snapshot.phase,'waiting');assert.equal(state.snapshot.toolName,'ask_user');assert.equal(state.snapshot.toolCount,1);assert.equal(state.snapshot.busy,true);
 assert.equal(state.visualGesture.id,'flustered');assert.equal(state.visualGesture.elapsedMs,0,'A warning starts from its own event, not a long-running question clock');
 assert.equal(state.snapshot.blink,true);assert.equal(state.requestedFace,'emotion-flustered','A phase blink must not erase the warning selected from raw state');
 assert.match((await frameLayer()).bitmap.tag,/^gesture-flustered\/gesture-flustered-000$/);
 advance(320);await flush();state=controller.getSnapshot();assert.equal(state.visualGesture.elapsedMs,320);assert.equal(state.snapshot.phrase,warningCopy);
 assert.match((await frameLayer()).bitmap.tag,/gesture-flustered-002$/);
 controller.bridge.syncInputDraft('I am answering');controller.notifyChange();
 assert.equal(controller.getSnapshot().snapshot.reaction,'listening');assert.equal(controller.getSnapshot().visualGesture,null,'Typing wins over a warning film');
 controller.bridge.syncInputDraft('');controller.notifyChange();
 const warningAge=controller.getSnapshot().snapshot.expressionElapsedMs;
 if(warningAge<1799)advance(1799-warningAge);
 assert.equal(controller.getSnapshot().visualGesture.id,'flustered');advance(1);
 assert.equal(controller.getSnapshot().snapshot.phase,'waiting');assert.equal(controller.getSnapshot().snapshot.awaitingUser,true);
 assert.equal(controller.getSnapshot().visualGesture,null,'Warning disappears at 1800ms without closing the ask_user tool');

 controller.activity.start({wake:false});stateEvent('ui_prompt_start');advance(10001);
 assert.equal(controller.getSnapshot().snapshot.drowsy,true);stateEvent('ui_prompt_end');await flush();
 assert.equal(controller.getSnapshot().snapshot.reaction,'startled');assert.equal(controller.getSnapshot().visualGesture.id,'surprise');
 assert.match((await frameLayer()).bitmap.tag,/^gesture-surprise\/gesture-surprise-000$/);
 advance(320);await flush();assert.match((await frameLayer()).bitmap.tag,/gesture-surprise-002$/);
 advance(329);assert.equal(controller.getSnapshot().visualGesture.id,'surprise');advance(1);
 assert.equal(controller.getSnapshot().snapshot.reaction,undefined);assert.equal(controller.getSnapshot().visualGesture,null,'The surprise film cannot outlive the 650ms startle');
 controller.activity.start({wake:false});stateEvent('agent_start');stateEvent('agent_settled');await flush();
 controller.poke();assert.equal(controller.getSnapshot().snapshot.reaction,'poked');assert.equal(controller.getSnapshot().visualGesture,null,'Poke always keeps its own expression');
 controller.activity.start({wake:false});stateEvent('agent_start');stateEvent('tool_execution_start',{toolCallId:'edit',toolName:'edit_file'});stateEvent('tool_execution_end',{toolCallId:'edit'});
 assert.equal(controller.getSnapshot().snapshot.visualPhase,'editing');assert.equal(controller.getSnapshot().visualGesture,null,'A true short editing hold never becomes a state expression video');
 controller.dispose();assert.equal(controller.cacheStats().gestureClips,0);assert.equal(controller.cacheStats().hiResFrames,0);
 console.log('DSH H3 integration: bounded on-demand clips, u16/no warp/blend, manual timing/pause, plus real completion/warning/startle HD frames with unchanged 2600/1800/650ms lifetimes and typing/poke/work priority passed.');
} finally {
 controller?.dispose();for(const[k,v]of Object.entries(before))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}
