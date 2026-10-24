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
 await import(new URL('../lib/client.js?tool-error-integration',import.meta.url));
 async function fresh(){controller?.dispose();assert.equal(timers.size,0);clock=0;cold=false;pending.splice(0).forEach(r=>r());await flush();controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();await paint(0);}
 function event(type,data={}){controller.bridge.handleSessionEvent({sessionId:'dwell-test',type,data});controller.notifyChange();}
 function start(name,id=name,ptc=false){event(ptc?'tool/ptc-dispatch-start':'tool/call',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,name,arguments:{}}:{callId:id,name,arguments:'{}'});}
 function end(id,ptc=false){event(ptc?'tool/ptc-dispatch':'tool/result',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,isError:false,content:[]}:{message:{role:'tool',toolCallId:id,isError:false,content:[]}});}
 function facts(phase,count=0){const s=controller.getSnapshot().snapshot;assert.equal(s.phase,phase);assert.equal(s.toolCount,count);return s;}
 async function paint(at){while(clock<at){clock=Math.min(at,clock+40);controller.notifyChange();controller.getRenderLayer();await flush();}controller.notifyChange();controller.getRenderLayer();await flush();controller.getRenderLayer();await flush();const s=controller.getSnapshot(),stats=controller.cacheStats();assert.ok(timers.size<=1,'One live controller timer');assert.ok(stats.approved.clips<=2);assert.ok(stats.approvedHiResClips<=2);assert.ok(stats.approvedHiResDownloads<=stats.maxApprovedHiResDownloadsPerClip*stats.maxApprovedHiResClips);assert.ok(stats.approvedHiResBytes<=stats.maxApprovedHiResBytes);return s.approvedMotion;}
 function clip(v,id){assert.equal(v?.clipId,id);}
 async function longTool(name='edit'){await fresh();event('turn/start');start(name);await paint(0);if(name==='edit'||name==='bash')await paint(400);await paint(2000);end(name);facts('thinking');assert.equal(controller.getSnapshot().snapshot.pendingNextState?.remainingMs,2000);return await paint(2000);}
 const gap=()=>controller.getSnapshot().snapshot.pendingNextState;

 const fail=(id,result={isError:true,content:[]})=>event('tool/result',{message:{role:'tool',toolCallId:id,...result}});
 async function failed(result){await fresh();event('turn/start');start('bash','broken');await paint(20);fail('broken',result);await paint(20);const s=controller.getSnapshot();facts('thinking');assert.equal(s.snapshot.busy,true);assert.equal(s.snapshot.reaction,'error');assert.equal(s.snapshot.face,'error');assert.equal(s.approvedMotion,null);assert.equal(s.snapshot.pendingNextState,null);assert.equal(s.requestedFace,'error');return s;}
 for(const result of [{isError:true,content:[{type:'text',text:'tool infrastructure failure'}]},{isError:false,content:[{type:'text',text:'(no output)\n[exit code: 1]'}]},{isError:false,structuredContent:{exit_code:2},content:[]}]){await failed(result);await paint(1819);assert.equal(controller.getSnapshot().snapshot.reaction,'error');await paint(1820);assert.equal(controller.getSnapshot().snapshot.reaction,undefined);facts('thinking');}
 await failed();clock=100;start('edit','next');await paint(100);facts('editing',1);assert.equal(controller.getSnapshot().snapshot.reaction,'error');clock=150;event('step/start');event('assistant/live-chunk',{chunk:{type:'reasoning-delta',text:'thinking'}});await paint(150);assert.equal(controller.getSnapshot().snapshot.reaction,'error');await paint(1820);facts('editing',1);assert.equal(controller.getSnapshot().snapshot.reaction,undefined);clip(await paint(1820),'work-enter');
 for(const target of ['text','prompt','cancel','reset']){await failed();clock=100;if(target==='text')event('assistant/live-chunk',{chunk:{type:'text-delta',text:'answer'}});else if(target==='prompt')start('ask_user_question','question');else if(target==='cancel')event('turn/end',{reason:{kind:'aborted'}});else controller.bridge.reset();controller.notifyChange();await paint(100);assert.notEqual(controller.getSnapshot().snapshot.reaction,'error',`${target} overrides error`);}
 for(const [name,result]of [['bash',{isError:false,content:[{type:'text',text:'error: example\nexit 1\n[exit code: 0]'}]}],['read',{isError:false,content:[{type:'text',text:'sample\n[exit code: 1]'}]}]]){await fresh();event('turn/start');start(name);await paint(20);fail(name,result);await paint(20);assert.notEqual(controller.getSnapshot().snapshot.reaction,'error');}
 await fresh();event('turn/start');start('read','a');start('bash','b');await paint(20);fail('b',{isError:false,content:[{type:'text',text:'failed\n[exit code: 1]'}]});await paint(20);facts('reading',1);assert.equal(controller.getSnapshot().snapshot.reaction,'error');clock=200;fail('b');fail('unknown');await paint(200);assert.equal(controller.activity.toolErrorRemainingMs(),1620);await paint(1820);facts('reading',1);assert.equal(controller.getSnapshot().snapshot.reaction,undefined);
 await fresh();event('turn/start');start('run_code','parent');start('bash','parent:ptc:1',true);await paint(20);event('tool/ptc-dispatch',{rootCallId:'parent',parentCallId:'parent',subCallId:'parent:ptc:1',name:'bash',isError:false,content:[{type:'text',text:'(no output)\n[exit code: 1]'}]});await paint(20);facts('running',1);assert.equal(controller.getSnapshot().snapshot.reaction,'error');assert.equal(controller.getSnapshot().snapshot.toolName,'run_code');await paint(1820);facts('running',1);assert.equal(controller.getSnapshot().snapshot.reaction,undefined);
 await fresh();controller.applySettingsLocal({animation:false});event('turn/start');start('bash');await paint(20);fail('bash');await paint(20);assert.equal(controller.getSnapshot().snapshot.face,'error');assert.equal(controller.getSnapshot().requestedFace,'error');assert.equal(timers.size,1,'Paused error schedules only its finite expiry with existing timer');clock=1820;const due=[...timers.entries()].filter(([,job])=>job.due<=clock);assert.equal(due.length,1);for(const[id,job]of due){timers.delete(id);job.fn();}await flush();assert.equal(controller.getSnapshot().snapshot.reaction,undefined);assert.equal(controller.getSnapshot().snapshot.phase,'thinking');assert.equal(controller.getSnapshot().visual.frame.id,'think');assert.equal(timers.size,0);
 controller.dispose();assert.equal(timers.size,0);console.log('Actual DSH bundle tool-error integration: native durable exit1/isError, truthful phase/count, finite readable override, new tool continuity, preemption, no false positives, parallel/dedupe, and paused expiry passed.');
}finally{controller?.dispose();pending.splice(0).forEach(r=>r());await flush();Math.random=oldRandom;for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
