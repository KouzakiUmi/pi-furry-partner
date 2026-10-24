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
await (await import('./native-interaction-fixture.mjs')).addNativeInteractionClips(catalog,data);
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
 await import(new URL('../lib/client.js?native-interactions',import.meta.url));
 async function fresh(){controller?.dispose();assert.equal(timers.size,0);clock=0;cold=false;pending.splice(0).forEach(r=>r());await flush();controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();await paint(0);}
 function event(type,data={}){controller.bridge.handleSessionEvent({sessionId:'dwell-test',type,data});controller.notifyChange();}
 function start(name,id=name,ptc=false){event(ptc?'tool/ptc-dispatch-start':'tool/call',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,name,arguments:{}}:{callId:id,name,arguments:'{}'});}
 function end(id,ptc=false){event(ptc?'tool/ptc-dispatch':'tool/result',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,isError:false,content:[]}:{message:{role:'tool',toolCallId:id,isError:false,content:[]}});}
 function facts(phase,count=0){const s=controller.getSnapshot().snapshot;assert.equal(s.phase,phase);assert.equal(s.toolCount,count);return s;}
 async function paint(at){while(clock<at){clock=Math.min(at,clock+40);controller.notifyChange();controller.getRenderLayer();await flush();}controller.notifyChange();controller.getRenderLayer();await flush();controller.getRenderLayer();await flush();const s=controller.getSnapshot(),stats=controller.cacheStats();assert.ok(timers.size<=1,'One live controller timer');assert.ok(stats.approved.clips<=2);assert.ok(stats.approvedHiResClips<=2);assert.ok(stats.approvedHiResDownloads<=stats.maxApprovedHiResDownloadsPerClip*stats.maxApprovedHiResClips);assert.ok(stats.approvedHiResBytes<=stats.maxApprovedHiResBytes);return s.approvedMotion;}
 function clip(v,id){assert.equal(v?.clipId,id);}
 async function longTool(name='edit'){await fresh();event('turn/start');start(name);await paint(0);if(name==='edit'||name==='bash')await paint(400);await paint(2000);end(name);facts('thinking');assert.equal(controller.getSnapshot().snapshot.pendingNextState?.remainingMs,2000);return await paint(2000);}
 const gap=()=>controller.getSnapshot().snapshot.pendingNextState;

 const snap=()=>controller.getSnapshot().snapshot;
 await fresh();controller.activity.start({wake:true});controller.notifyChange();let s=await paint(0);clip(s,'wave');assert.equal(s.frame.sourceFrame,0);assert.equal(s.loop,false);assert.equal(snap().bubble.includes('z'),false);s=await paint(4417);assert.equal(s.frame.sourceFrame,106);assert.equal(snap().interaction.id,'wave');await paint(4458);assert.equal(snap().interaction,null);assert.equal(snap().phase,'idle');
 await fresh();let previous;for(let i=0;i<4;i++){const at=i*5000;await paint(at);controller.poke();s=await paint(at);assert.ok(['bounce','ear-flick'].includes(s.clipId));assert.notEqual(s.clipId,previous);previous=s.clipId;const epoch=snap().interaction.epoch;controller.poke();assert.equal(snap().interaction.epoch,epoch);s=await paint(at+4417);assert.equal(s.frame.sourceFrame,106);await paint(at+4458);assert.equal(snap().interaction,null);assert.equal(snap().phase,'idle');}
 await fresh();event('turn/start');start('read');await paint(20);controller.poke();s=await paint(20);assert.ok(['head-shake','ear-flick'].includes(s.clipId));facts('reading',1);assert.equal(snap().pokeContext,'busy');event('assistant/live-chunk',{chunk:{type:'text-delta',text:'answer'}});await paint(20);assert.equal(snap().interaction,null);facts('reading',1);assert.equal(snap().reaction,undefined);
 await fresh();event('turn/start');start('ask_user_question','question');await paint(20);controller.poke();s=await paint(20);assert.ok(['head-shake','ear-flick'].includes(s.clipId));facts('waiting',1);assert.equal(snap().pokeContext,'waiting');event('turn/end',{reason:{kind:'aborted'}});await paint(20);assert.equal(snap().interaction,null);facts('cancelled');
 await fresh();controller.activity.start({wake:true});controller.notifyChange();clip(await paint(0),'wave');event('turn/start');start('edit');await paint(20);assert.equal(snap().interaction,null);clip(await paint(20),'work-enter');
 await fresh();controller.applySettingsLocal({animation:false});controller.poke();s=await paint(0);assert.ok(['bounce','ear-flick'].includes(s.clipId));assert.equal(controller.getSnapshot().settings.animation,false);assert.equal(timers.size,1);s=await paint(4417);assert.equal(s.frame.sourceFrame,106);await paint(4458);assert.equal(snap().interaction,null);assert.equal(controller.getSnapshot().approvedMotion,null);assert.equal(timers.size,0,'Paused finite interaction stops its sole timer');
 await fresh();controller.poke();await paint(0);controller.applySettingsLocal({enabled:false});assert.equal(snap().interaction,null);controller.applySettingsLocal({enabled:true});await paint(100);assert.equal(snap().interaction,null);
 controller.dispose();assert.equal(timers.size,0);console.log('Actual DSH native welcome/context-poke: real107-frame4458ms timeline, no translation, full once, task interrupts, paused once/static, disabled cleanup and single timer passed.');
}finally{controller?.dispose();pending.splice(0).forEach(r=>r());await flush();Math.random=oldRandom;for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
