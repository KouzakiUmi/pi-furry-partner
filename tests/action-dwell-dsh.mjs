// Actual DSH bundle + real event payloads; all media are tiny offline fixtures.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {approvedMotionFixture} from './approved-motion-fixture.mjs';
const {catalog,data}=approvedMotionFixture();
for(const id of ['idle-center','idle-right']){
 const c=structuredClone(catalog.clips.idle);c.id=id;c.hires.baseUrl=`hires/${id}/`;c.hires.frames.forEach((f,i)=>f.id=`${id}-${i}`);
 for(const [style,m]of Object.entries(c.indexed)){const r=structuredClone(data[m.file]);r.clipId=id;r.frames.forEach((f,i)=>f.id=`${id}-${i}`);m.file=`indexed/${style}/${id}.json`;data[m.file]=r;}catalog.clips[id]=c;
}
catalog.idleVariants=['idle','idle-center','idle-right'];
const authoredIdle=JSON.parse(await readFile(new URL('../assets/animated/catalog.json',import.meta.url),'utf8'));
for(const id of catalog.idleVariants){const c=catalog.clips[id],original=authoredIdle.clips[id];c.periodMs=original.periodMs;c.hires.frames=original.hires.frames.map(f=>({id:f.id,file:f.file,atMs:f.atMs,sourceFrame:f.sourceFrame}));c.frameCount=c.hires.frames.length;
 for(const m of Object.values(c.indexed)){const raw=data[m.file];raw.periodMs=c.periodMs;raw.frames=c.hires.frames.filter(f=>f.sourceFrame%2===0).map(f=>({id:f.id,atMs:f.atMs,sourceFrame:f.sourceFrame,pixels:[0,1,2,0]}));m.frameCount=raw.frames.length;}}
const names=['window','document','createImageBitmap','setTimeout','clearTimeout'];
const saved=Object.fromEntries(names.map(k=>[k,globalThis[k]])),oldRandom=Math.random;
const sheet=JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json',import.meta.url),'utf8'));
let clock=0,entry,controller,serial=0,cold=false;const timers=new Map(),pending=[];
const flush=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
const checks=[];
try{
 Math.random=()=>0;
 globalThis.window={__ModuleLoader__:{load:v=>entry=v}};
 globalThis.document={hidden:false,createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
 globalThis.createImageBitmap=async b=>({width:896,height:896,tag:b.path,close(){}});
 globalThis.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,due:clock+ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
 const fetchImpl=async(url,options={})=>{
  const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/animated/catalog'))return{ok:true,json:async()=>catalog};
  if(u.pathname.endsWith('/animated/asset')){const p=u.searchParams.get('path');if(cold&&p.includes('/work'))await new Promise(resolve=>pending.push(resolve));return p.endsWith('.json')?{ok:true,json:async()=>data[p]}:{ok:true,blob:async()=>({path:p})};}
  if(u.pathname.endsWith('/config'))return{ok:true,json:async()=>({style:'umi',companionship:'off'})};
  if(u.pathname.endsWith('/sheet'))return{ok:true,json:async()=>sheet};return{ok:false};
 };
 await import(new URL('../lib/client.js?action-dwell-integration',import.meta.url));
 async function fresh(){controller?.dispose();assert.equal(timers.size,0);clock=0;cold=false;pending.splice(0).forEach(r=>r());await flush();controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();await paint(0);}
 function event(type,data={}){controller.bridge.handleSessionEvent({sessionId:'dwell-test',type,data});controller.notifyChange();}
 function start(name,id=name,ptc=false){event(ptc?'tool/ptc-dispatch-start':'tool/call',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,name,arguments:{}}:{callId:id,name,arguments:'{}'});}
 function end(id,ptc=false){event(ptc?'tool/ptc-dispatch':'tool/result',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,isError:false,content:[]}:{message:{role:'tool',toolCallId:id,isError:false,content:[]}});event('assistant/live-chunk',{chunk:{type:'reasoning-delta',text:'x'}});}
 function facts(phase,count=0){const s=controller.getSnapshot().snapshot;assert.equal(s.phase,phase);assert.equal(s.toolCount,count);return s;}
 async function paint(at){while(clock<at){clock=Math.min(at,clock+40);controller.notifyChange();controller.getRenderLayer();await flush();}controller.notifyChange();controller.getRenderLayer();await flush();controller.getRenderLayer();await flush();const s=controller.getSnapshot(),stats=controller.cacheStats();assert.ok(timers.size<=1,'One live controller timer');assert.ok(stats.approved.clips<=2);assert.ok(stats.approvedHiResClips<=2);assert.ok(stats.approvedHiResDownloads<=stats.maxApprovedHiResDownloadsPerClip*stats.maxApprovedHiResClips);assert.ok(stats.approvedHiResBytes<=stats.maxApprovedHiResBytes);return s.approvedMotion;}
 function clip(v,id){assert.equal(v?.clipId,id);}
 for(const name of ['edit','bash'])for(const finishAt of [0,20]){
  await fresh();event('turn/start');start(name);clock=finishAt;end(name);event('step/start',{turn:1,step:2});event('assistant/live-chunk',{chunk:{type:'reasoning-delta',text:'x'}});facts('thinking');
  const first=finishAt;clip(await paint(first),'work-enter');clip(await paint(first+399),'work-enter');clip(await paint(first+400),'work');clip(await paint(first+1199),'work');facts('thinking');clip(await paint(first+1200),'work-exit');clip(await paint(first+1600),'think');
 }
 checks.push('Same-tick and20ms edit/bash get full400ms enter,800ms loop,400ms exit without forging real thinking/toolCount');
 for(const [name,id]of [['read','watch'],['grep','search']]){
  await fresh();event('turn/start');start(name);end(name);facts('thinking');clip(await paint(0),id);clip(await paint(1199),id);clip(await paint(1200),'think');
 }
 await fresh();event('turn/start');event('compaction/start');event('compaction/end');clip(await paint(0),'search');clip(await paint(1199),'search');clip(await paint(1200),'think');
 checks.push('Short reading/search/compaction keep their reviewed media for1200ms');
 await fresh();event('turn/start');start('read','parallel-read');start('edit','parallel-edit');await paint(0);end('parallel-edit');facts('reading',1);end('parallel-read');facts('thinking');await paint(400);assert.equal(controller.getSnapshot().snapshot.toolName,'');
 await fresh();event('turn/start');start('edit','ptc-edit',true);end('ptc-edit',true);facts('thinking');clip(await paint(0),'work-enter');
 checks.push('Official message.toolCallId and PTC subCallId end independent calls; no prior tool survives in real state');
 for(const interrupt of ['waiting','speaking','reading']){
  await fresh();event('turn/start');start('edit');end('edit');await paint(0);
  if(interrupt==='waiting')start('ask_user_question','ask');
  if(interrupt==='speaking')event('assistant/live-chunk',{chunk:{type:'text-delta',text:'x'}});
  if(interrupt==='reading')start('read','next-read');
  const s=await paint(20);facts(interrupt,interrupt==='speaking'?0:1);
  if(interrupt==='speaking')assert.equal(s,null);else if(interrupt==='waiting')clip(s,'wait');else{clip(s,'work-enter');clip(await paint(400),'work');clip(await paint(1200),'work-exit');clip(await paint(1600),'watch');}
 }
 checks.push('Waiting/speech immediately preempt visual hold; ordinary next read queues after minimum work+exit with live facts');
 await fresh();event('turn/start');start('edit');await paint(0);clock=20;end('edit');event('turn/end',{reason:{kind:'completed'}});facts('success');assert.equal(controller.getSnapshot().snapshot.busy,false);clip(await paint(20),'work-enter');clip(await paint(400),'work');clip(await paint(1200),'work-exit');const joy=await paint(1600);clip(joy,'joy');assert.equal(joy.playbackMs,0,'Success begins from its own first visible frame');clip(await paint(2799),'joy');assert.ok(catalog.idleVariants.includes((await paint(2800)).clipId));
 for(const outcome of ['error','aborted']){await fresh();event('turn/start');start('edit');await paint(0);clock=20;end('edit');event('turn/end',{reason:{kind:outcome}});const s=await paint(20);facts(outcome==='error'?'error':'cancelled');assert.equal(controller.getSnapshot().snapshot.busy,false);if(outcome==='error')assert.equal(s,null);else clip(s,'rest');}
 checks.push('Normal success keeps finite keyboard cleanup then its own1200ms celebration, with real busy=false; error/cancellation interrupt immediately');
 await fresh();cold=true;event('turn/start');start('edit');end('edit');await paint(0);await paint(500);clock=600;cold=false;pending.splice(0).forEach(r=>r());await flush();
 const firstReady=600;const first=await paint(firstReady);clip(first,'work-enter');assert.ok(first.playbackMs<50,'Cold work entry starts at first presentation');
 clip(await paint(firstReady+399),'work-enter');clip(await paint(firstReady+400),'work');clip(await paint(firstReady+1199),'work');clip(await paint(firstReady+1200),'work-exit');facts('thinking');
 checks.push('Cold indexed/HD cannot consume visible dwell before readiness; caches/downloads/timer remain bounded');
 await fresh();const seen=new Set();let previous;const period=authoredIdle.clips.idle.periodMs;
 for(let cycle=0;cycle<3;cycle++)for(const offset of [0,250,4417,period-1]){const at=cycle*period+offset,s=await paint(at);assert.ok(catalog.idleVariants.includes(s.clipId));if(offset===0){if(previous)assert.notEqual(s.clipId,previous);previous=s.clipId;seen.add(previous);assert.equal(s.frame.sourceFrame,0);}else assert.equal(s.clipId,previous);if(offset>=4417){assert.equal(s.frame.sourceFrame,106,'Native idle must reach original source106 before its4458ms boundary');const layer=controller.getRenderLayer();assert.ok(layer.bitmap.tag.endsWith('/106.webp'),'Actual HD idle source106 is painted');}}
 assert.ok(seen.size>=2);controller.dispose();assert.equal(timers.size,0);checks.push('Idle variants switch only at whole authored loops; dispose removes timer');
 console.log(`DSH default1200ms action dwell integration passed: ${checks.join('; ')}.`);
}finally{controller?.dispose();pending.splice(0).forEach(r=>r());await flush();Math.random=oldRandom;for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
