import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEncodedSheet} from '../lib/index.js';
const names=['window','document','createImageBitmap','setTimeout','clearTimeout'];
const before=Object.fromEntries(names.map(n=>[n,globalThis[n]]));let entry,clock=0,nextId=0,controller;
const timers=new Map(),flush=async()=>{for(let n=0;n<100;n++)await Promise.resolve();};
try {
 globalThis.setTimeout=(fn,ms)=>{const id=++nextId;timers.set(id,{fn,due:clock+ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
 globalThis.document={hidden:false,createElement:()=>{const c={width:0,height:0};c.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(c.width*c.height*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return c;}};
 globalThis.createImageBitmap=async()=>({width:640,height:640,close(){}});
 await import(new URL('../lib/client.js?presentation-timing',import.meta.url));
 const plugin=entry.factory(()=>({}));
 const manifest=JSON.parse(await readFile(new URL('../assets/hires/umi/manifest.json',import.meta.url),'utf8'));
 // Explicit legacy fixture: this suite tests the old 1.30 search entrance.
 delete manifest.approvedStaticRevision;
 for(const bank of Object.values(manifest.animations||{}))if(bank&&typeof bank==='object')delete bank.approvedStaticRevision;
 const fetchImpl=async url=>{const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',companionship:'off'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>loadEncodedSheet('umi')};
  if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
  return {ok:true,blob:async()=>({})};};
 controller=plugin.createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();controller.getRenderLayer();
 controller.setDemo('searching');controller.getRenderLayer();await flush();controller.getRenderLayer();
 clock+=300;controller.notifyChange();assert.equal(controller.getRenderLayer().display.scale,1.3);
 controller.setDemo('idle');const entrance=controller.getRenderLayer();
 assert.equal(entrance.display.profile,'ordinary');assert.equal(entrance.display.scale,1,'Correct scale applies on first normal frame');
 assert.ok(entrance.display.opacity<1);
 const earliest=()=>Math.min(...[...timers.values()].map(t=>t.due));const due=earliest();
 assert.ok(due<=clock+33,'Idle handoff receives video-rate updates instead of waiting for a 240ms idle tick');
 for(let n=0;n<4;n++){clock+=5;controller.notifyChange();controller.getRenderLayer();assert.equal(earliest(),due,'Rapid readiness/input events cannot postpone the pending display deadline');}
 assert.ok(timers.size<=1,'One animation timer remains active');
 controller.dispose();assert.equal(timers.size,0);
 console.log('DSH display timing: 33ms idle entrance, fixed first-frame size, burst-resistant deadline and single-timer disposal passed.');
}finally{controller?.dispose();for(const n of names)if(before[n]===undefined)delete globalThis[n];else globalThis[n]=before[n];}
