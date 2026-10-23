// Actual bundled DSH controller: cycle handoff uses the selected authored media.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const {catalog,data}=approvedMotionFixture();
for (const id of ['idle-center','idle-right']) {
 const clip=structuredClone(catalog.clips.idle);clip.id=id;clip.hires.baseUrl=`hires/${id}/`;
 clip.hires.frames.forEach((f,i)=>f.id=`${id}-${i}`);
 for(const [style,meta] of Object.entries(clip.indexed)) {
  const raw=structuredClone(data[meta.file]);raw.clipId=id;raw.frames.forEach((f,i)=>f.id=`${id}-${i}`);
  meta.file=`indexed/${style}/${id}.json`;data[meta.file]=raw;
 }
 catalog.clips[id]=clip;
}
catalog.idleVariants=['idle','idle-center','idle-right'];
const names=['window','document','createImageBitmap','setTimeout','clearTimeout'];
const saved=Object.fromEntries(names.map(n=>[n,globalThis[n]])), random=Math.random;
let entry,controller,clock=0,serial=0;const timers=new Map(),requests=[];
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const sheet=JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json',import.meta.url),'utf8'));
try {
 Math.random=()=>0;
 globalThis.window={__ModuleLoader__:{load:v=>entry=v}};
 globalThis.document={hidden:false,createElement:()=>{const c={width:0,height:0};c.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return c;}};
 globalThis.createImageBitmap=async blob=>({width:896,height:896,tag:blob.path,close(){}});
 globalThis.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,due:clock+ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 const fetchImpl=async url=>{const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/animated/catalog'))return {ok:true,json:async()=>catalog};
  if(u.pathname.endsWith('/animated/asset')){const path=u.searchParams.get('path');requests.push(path);return path.endsWith('.json')?{ok:true,json:async()=>data[path]}:{ok:true,blob:async()=>({path})};}
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',companionship:'off'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>sheet};return {ok:false};};
 await import(new URL('../lib/client.js?idle-variants-integration',import.meta.url));
 controller=entry.factory(()=>({})).createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();await flush();controller.getRenderLayer();await flush();
 let previous=null;const seen=new Set();
 for(const at of [0,250,750,1000,1250,1750,2000,2250,2750,3000]) {
  clock=at;controller.notifyChange();controller.getRenderLayer();await flush();const layer=controller.getRenderLayer(),s=controller.getSnapshot().approvedMotion;
  assert.ok(s&&catalog.idleVariants.includes(s.clipId));assert.equal(layer.hiRes,true);assert.ok(layer.bitmap.tag.startsWith(`hires/${s.clipId}/`),'Native HD belongs to selected idle, not the previous clip');
  assert.deepEqual(layer.paintRect,catalog.clips.idle.paintRect);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
  if(at%1000===0){if(previous)assert.notEqual(s.clipId,previous,'Full-cycle switch avoids immediate repetition');previous=s.clipId;seen.add(s.clipId);}
  else assert.equal(s.clipId,previous,'Readiness events cannot select a new idle mid-loop');
  assert.ok(timers.size<=1);
 }
 assert.ok(seen.size>=2);assert.ok(requests.some(p=>p.startsWith('hires/idle-center/')));controller.dispose();assert.equal(timers.size,0);
 console.log('Actual DSH idle playlist: reviewed complete-loop handoff, selected HD media, fixed display matrix, no mid-cycle reroll and single-timer disposal passed.');
}finally{controller?.dispose();Math.random=random;for(const [n,v]of Object.entries(saved))if(v===undefined)delete globalThis[n];else globalThis[n]=v;}
