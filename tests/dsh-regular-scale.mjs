import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {presentationProfile,presentationMatrix,createPresentationPlayer} from '../lib/dsh-presentation.mjs';
import {loadEncodedSheet} from '../lib/index.js';

for(const style of ['umi','umi-pixel']) {
 const p=createPresentationPlayer();let time=0;
 for(const id of ['idle-open','idle-blink','idle-wink','idle-open','talk-closed','talk-small','talk-medium','talk-wide','talk-wide-blink','talk-blink','idle-open']) {
  const profile=presentationProfile(style,'search-video-000',`poses/${id}`,true);
  const d=p.sample(style,profile,time+=50);
  assert.equal(d.scale,1,'Blink/mouth frames cannot resize the whole character');
  assert.equal(608*d.scale+d.y,608,'Support point stays planted');
  assert.equal(320*d.scale+d.x,320,'Horizontal support stays planted');
  assert.equal(d.opacity,1,'Blink/mouth handoff never starts a fade');assert.equal(d.transitioning,false);
 }
 for(const key of ['watch','poses/watch','poses/watch-000','poses/watch-blink'])assert.equal(presentationProfile(style,'idle-open',key,false).id,'watch');
 for(const key of ['search','poses/search','poses/search-video-000'])assert.equal(presentationProfile(style,'idle-open',key,false).id,'search');
 assert.equal(presentationProfile(style,'search-video-000','poses/idle-open',false).id,'ordinary','Held actual layer wins over requested action');
 assert.deepEqual(presentationMatrix(presentationProfile(style,'idle-open','watch',true)),{scale:1,x:0,y:0},'Registered video never receives static pose calibration');
}

// Actual bundled controller: registered manifest must not mark an unregistered
// indexed fallback as registered, nor rescale a held image to the requested pose.
const saved={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,controller;const pending=new Map();let clock=0;
const flush=async()=>{for(let n=0;n<100;n++)await Promise.resolve();};
try {
 globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
 globalThis.document={hidden:false,createElement:()=>{const c={width:0,height:0};c.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(c.width*c.height*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});return c;}};
 globalThis.createImageBitmap=async()=>({width:640,height:640,close(){}});
 await import(new URL('../lib/client.js?regular-scale',import.meta.url));const plugin=entry.factory(()=>({}));
 const manifest=JSON.parse(await readFile(new URL('../assets/hires/umi/manifest.json',import.meta.url),'utf8'));manifest.animations={};
 const sheet=loadEncodedSheet('umi');delete sheet.approvedStaticRevision;sheet.gestureCatalog={schemaVersion:1,clips:{}};
 const fetchImpl=async url=>{const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',language:'en',companionship:'off'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>sheet};
  if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
  const key=`${u.searchParams.get('kind')}/${u.searchParams.get('id')}`;
  return new Promise(resolve=>pending.set(key,()=>resolve({ok:true,blob:async()=>({})})));
 };
 controller=plugin.createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();
 const indexed=controller.getRenderLayer();assert.equal(indexed.hiRes,false);assert.equal(indexed.registered,false);assert.equal(indexed.display.profile,'ordinary','Global HD manifest cannot register actual legacy fallback');
 pending.get(indexed.displayKey)();await flush();
 const hd=controller.getRenderLayer();assert.equal(hd.registered,true);assert.equal(hd.display.profile,'ordinary');
 controller.activity.noteTyping();clock=300;controller.notifyChange();
 const held=controller.getRenderLayer();assert.equal(held.bitmap,hd.bitmap);assert.equal(held.display.profile,hd.display.profile,'Delayed listening request retains actual idle profile');
 controller.applySettingsLocal({style:'umi-pixel'});const migrated=controller.getRenderLayer();assert.equal(controller.getSnapshot().settings.style,'umi');assert.equal(migrated.hiRes,true,'Legacy alias keeps the same illustrated HD family');
 controller.dispose();console.log('DSH regular scale: unchanged registered display matrices/support, identical idle/mouth transition group, actual-layer registration, delayed HD/held/style and legacy fallbacks passed.');
} finally {controller?.dispose();for(const [k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
