// Actual DSH bundle: frame boundaries, not polling or future-decode repaint bursts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const {catalog,data}=approvedMotionFixture();
const idle=catalog.clips.idle;
idle.hires.frames=Array.from({length:24},(_,i)=>({id:`idle-${i}`,file:`${String(i).padStart(3,'0')}.webp`,atMs:i*1000/24}));idle.frameCount=24;
for(const meta of Object.values(idle.indexed)) {meta.frameCount=12;data[meta.file].frames=Array.from({length:12},(_,i)=>({id:`idle-${i}`,atMs:i*1000/12,pixels:[0,1,i%2?2:1,0]}));}
const names=['window','document','createImageBitmap','setTimeout','clearTimeout'];
const saved=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
const timers=new Map();let clock=0,serial=0,entry,controller,updates=0;
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const sheet=JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json',import.meta.url),'utf8'));
try {
 globalThis.window={__ModuleLoader__:{load:value=>entry=value}};
 globalThis.document={hidden:false,createElement:()=>{const canvas={width:0,height:0};canvas.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return canvas;}};
 globalThis.createImageBitmap=async blob=>({width:896,height:896,tag:blob.path,close(){}});
 globalThis.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,due:clock+ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 const fetchImpl=async url=>{const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/animated/catalog'))return {ok:true,json:async()=>catalog};
  if(u.pathname.endsWith('/animated/asset')){const path=u.searchParams.get('path');return path.endsWith('.json')?{ok:true,json:async()=>data[path]}:{ok:true,blob:async()=>({path})};}
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',companionship:'off'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>sheet};return {ok:false};};
 await import(new URL('../lib/client.js?approved-boundary-timing',import.meta.url));
 controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();await flush();controller.subscribe(()=>updates++);
 controller.getRenderLayer();await flush();
 assert.ok(updates<=1,'Decoding future prefetch frames does not repaint the current frame');
 assert.equal(controller.getRenderLayer().bitmap.tag,'hires/idle/000.webp');
 const next=()=>{assert.equal(timers.size,1);return [...timers.values()][0].due;};
 assert.equal(next(),42,'24fps next boundary replaces the old33ms same-frame poll');
 const ticks=[];
 for(let frame=1;frame<24;frame++) {
  const [id,timer]=timers.entries().next().value;timers.delete(id);clock=timer.due;timer.fn();ticks.push(clock);
  controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,`hires/idle/${String(frame).padStart(3,'0')}.webp`);
  assert.ok(Math.abs(clock-frame*1000/24)<1,'Each paint deadline is within1ms of its captured timestamp');
 }
 assert.equal(ticks.length,23,'One scheduled tick per new HD frame');
 const deadline=next();for(let i=0;i<5;i++){controller.notifyChange();controller.getRenderLayer();assert.equal(next(),deadline,'Input/readiness bursts cannot postpone the pending frame');}
 globalThis.createImageBitmap=undefined;
 controller.applySettingsLocal({style:'umi-pixel'});controller.applySettingsLocal({style:'umi'});await flush();controller.getRenderLayer();
 // An earlier already-armed deadline may fire once; afterwards unsupported HD
 // must use the12fps indexed boundary rather than keep polling at24fps.
 for(let n=0;n<2;n++){const [id,timer]=timers.entries().next().value;timers.delete(id);clock=timer.due;timer.fn();controller.getRenderLayer();await flush();}
 assert.ok(next()-clock>=82&&next()-clock<=84,'Unavailable native HD follows indexed frame timing');
 controller.dispose();assert.equal(timers.size,0);
 //100ms native decode latency can sustain24fps with four parallel requests.
 // Pumping the bounded runway must not wait for an indexed repaint to refill it.
 clock=0;const pending=[];
 globalThis.createImageBitmap=blob=>new Promise(resolve=>pending.push({due:clock+100,resolve:()=>resolve({width:896,height:896,tag:blob.path,close(){}})}));
 controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();await flush();controller.getRenderLayer();await flush();
 let warmSamples=0,warmHD=0;
 for(clock=20;clock<=1500;clock+=20){
  const ready=pending.filter(job=>job.due<=clock);for(const job of ready){pending.splice(pending.indexOf(job),1);job.resolve();}await flush();
  controller.notifyChange();const layer=controller.getRenderLayer();await flush();
  const stats=controller.cacheStats();assert.ok(stats.approvedHiResDownloads<=4);assert.ok(stats.approvedHiResBytes<=stats.maxApprovedHiResBytes);
  if(clock>=500){warmSamples++;if(layer.hiRes)warmHD++;}
 }
 assert.equal(warmHD,warmSamples,'A sustainable100ms decode pipeline stays HD after warmup rather than repeatedly falling back');
 controller.dispose();for(const job of pending)job.resolve();await flush();assert.equal(timers.size,0);
 console.log('Approved DSH timing:24fps boundaries without33ms duplicate polls, no future-decode repaint bursts, stable deadlines, indexed-only cadence, sustainable100ms decode runway and disposal passed.');
}finally{controller?.dispose();for(const [name,value]of Object.entries(saved))if(value===undefined)delete globalThis[name];else globalThis[name]=value;}
