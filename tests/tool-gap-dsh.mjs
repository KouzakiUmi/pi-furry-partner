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
 await import(new URL('../lib/client.js?tool-gap-integration',import.meta.url));
 async function fresh(){controller?.dispose();assert.equal(timers.size,0);clock=0;cold=false;pending.splice(0).forEach(r=>r());await flush();controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();controller.activity.start({wake:false});controller.notifyChange();await paint(0);}
 function event(type,data={}){controller.bridge.handleSessionEvent({sessionId:'dwell-test',type,data});controller.notifyChange();}
 function start(name,id=name,ptc=false){event(ptc?'tool/ptc-dispatch-start':'tool/call',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,name,arguments:{}}:{callId:id,name,arguments:'{}'});}
 function end(id,ptc=false){event(ptc?'tool/ptc-dispatch':'tool/result',ptc?{rootCallId:'root',parentCallId:'root',subCallId:id,isError:false,content:[]}:{message:{role:'tool',toolCallId:id,isError:false,content:[]}});}
 function facts(phase,count=0){const s=controller.getSnapshot().snapshot;assert.equal(s.phase,phase);assert.equal(s.toolCount,count);return s;}
 async function paint(at){while(clock<at){clock=Math.min(at,clock+40);controller.notifyChange();controller.getRenderLayer();await flush();}controller.notifyChange();controller.getRenderLayer();await flush();controller.getRenderLayer();await flush();const s=controller.getSnapshot(),stats=controller.cacheStats();assert.ok(timers.size<=1,'One live controller timer');assert.ok(stats.approved.clips<=2);assert.ok(stats.approvedHiResClips<=2);assert.ok(stats.approvedHiResDownloads<=stats.maxApprovedHiResDownloadsPerClip*stats.maxApprovedHiResClips);assert.ok(stats.approvedHiResBytes<=stats.maxApprovedHiResBytes);return s.approvedMotion;}
 function clip(v,id){assert.equal(v?.clipId,id);}
 async function longTool(name='edit'){await fresh();event('turn/start');start(name);await paint(0);if(name==='edit'||name==='bash')await paint(400);await paint(2000);end(name);facts('thinking');assert.equal(controller.getSnapshot().snapshot.pendingNextState?.remainingMs,2000);return await paint(2000);}
 const gap=()=>controller.getSnapshot().snapshot.pendingNextState;
 for(const name of ['edit','read','bash']){
  await longTool(name);const expected=name==='read'?'watch':'work';
  clock=2200;event('step/start',{turn:1,step:2});event('assistant/live-chunk',{chunk:{type:'block-start',blockType:'text'}});event('assistant/live-chunk',{chunk:{type:'text-delta',text:''}});event('assistant/live-chunk',{chunk:{type:'reasoning-delta',text:''}});event('assistant/live-chunk',{chunk:{type:'block-start',blockType:'tool_call'}});
  await paint(2500);event('assistant/live-chunk',{chunk:{type:'block-end',block:{type:'text'}}});facts('thinking');assert.equal(gap().remainingMs,1500,'Placeholders cannot clear or renew tool-end deadline');clip(await paint(3999),expected);facts('thinking');assert.equal(gap().remainingMs,1);
  const expired=await paint(4000);assert.equal(gap(),null);clip(expired,name==='read'?'think':'work-exit');if(name!=='read')clip(await paint(4400),'think');
 }
 checks.push('Long edit/read/bash end with real thinking/toolCount0, preserve visual until end+2000, ignore step/block/empty-delta/text-end, expire exactly once at2000');
 for(const [first,next]of[['edit','edit'],['edit','bash'],['read','read'],['read','view_file']]){
  const before=await longTool(first);const oldAge=before.playbackMs,epoch=before.playbackEpoch;await paint(3000);start(next,'next');const resumed=await paint(3000);facts(next==='bash'?'running':first==='read'?'reading':'editing',1);assert.equal(gap(),null);clip(resumed,first==='read'?'watch':'work');assert.equal(resumed.playbackMs,oldAge+1000,'Same visual action keeps its source clock');assert.equal(resumed.playbackEpoch,epoch,'No keyboard enter/exit or source reset between continuous tools');
 }
 checks.push('Consecutive edit/edit, edit/bash and read/read/view share their existing work/watch source clock and playback epoch');
 for(const delta of ['reasoning-delta','text-delta']){await longTool();await paint(2500);event('assistant/live-chunk',{chunk:{type:delta,text:'x'}});await paint(2500);assert.equal(gap(),null);facts(delta==='text-delta'?'speaking':'thinking');if(delta==='text-delta')assert.equal(controller.getSnapshot().approvedMotion,null);}
 await longTool('read');await paint(2500);controller.bridge.syncConversationState({sessionId:'dwell-test',busy:true,partial:{content:'x'}});controller.notifyChange();await paint(2500);assert.equal(gap(),null,'First nonempty partial is real text, not a text_start placeholder');facts('speaking');
 await longTool();await paint(3999);start('read','boundary');assert.equal(gap(),null);facts('reading',1);await paint(4000);assert.equal(gap(),null,'Old deadline cannot reappear after new real state');
 checks.push('Actual nonempty reasoning/text/first partial and a real tool at1999ms cancel old gap without stale expiry');
 for(const target of ['prompt','complete','error','aborted']){await longTool();await paint(2500);if(target==='prompt')start('ask_user_question','ask');else event('turn/end',{reason:{kind:target}});const s=await paint(2500);assert.equal(gap(),null);if(target==='prompt'){facts('waiting',1);clip(s,'wait');}else{facts(target==='complete'?'success':target==='error'?'error':'cancelled');assert.equal(controller.getSnapshot().snapshot.busy,false);if(target==='error')assert.equal(s,null);}}
 await fresh();event('turn/start');start('read','a');start('edit','b');await paint(2000);end('b');facts('reading',1);assert.equal(gap(),null,'Remaining parallel tool is a real state, not a gap');end('a');facts('thinking');assert.equal(gap().remainingMs,2000);
 checks.push('Prompt/terminal/error/abort clear pending gap; parallel completion reveals remaining real tool');
 for(const mode of ['pause','hidden']){await longTool('read');if(mode==='pause')controller.applySettingsLocal({animation:false});else{globalThis.document.hidden=true;controller.notifyChange();}clock=3999;controller.notifyChange();assert.equal(gap()?.remainingMs,1,'Wall gap ages even while animation is frozen');assert.equal(timers.size,0);clock=4000;controller.notifyChange();assert.equal(gap(),null);if(mode==='pause')controller.applySettingsLocal({animation:true});else globalThis.document.hidden=false;clip(await paint(4000),'think');}
 checks.push('Paused/hidden animation does not extend wall-clock2s gap; no background timer and no old tool replay on resume');
 await fresh();
 const partial={blocks:[{type:'tool_use',id:'stream-read',name:'read_file',status:'running'}]};
 function syncPartial(extra={}){controller.bridge.syncConversationState({sessionId:'dwell-test',busy:true,status:'tool_calling',partial,...extra});controller.notifyChange();}
 syncPartial({runningCalls:{}});facts('editing',1);await paint(400);
 syncPartial({partial:null,runningCalls:{}});facts('thinking');assert.equal(gap(),null);
 event('assistant/live-chunk',{chunk:{type:'text-delta',text:'Answer'}});
 facts('speaking');assert.equal(await paint(420),null,'Real answer immediately preempts a discarded partial');
 await fresh();syncPartial();facts('editing',1);await paint(400);
 syncPartial();facts('reading',1);const promoted=await paint(2000);clip(promoted,'watch');
 for(const at of [2100,2200,2300]){syncPartial();facts('reading',1);const next=await paint(at);clip(next,'watch');assert.equal(next.playbackEpoch,promoted.playbackEpoch);assert.equal(next.playbackMs,promoted.playbackMs+at-2000);}
 syncPartial({partial:null});facts('thinking');assert.equal(gap()?.remainingMs,2000);
 checks.push('Discarded partials release live facts and allow immediate speech; legacy partials retain continuous watch playback across repeated snapshots');
 controller.dispose();assert.equal(timers.size,0);console.log(`DSH tool-gap integration passed: ${checks.join('; ')}.`);
}finally{controller?.dispose();pending.splice(0).forEach(r=>r());await flush();Math.random=oldRandom;for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
