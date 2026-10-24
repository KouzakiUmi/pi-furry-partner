import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expressionFaceFor } from '../lib/expressions.mjs';
import { loadEncodedSheet } from '../lib/index.js';
import { normalizeStyle } from '../lib/styles.mjs';
import { FULL_ANIMATION_EDITION } from '../lib/build-profile.mjs';

for (const style of ['umi','umi-pixel','illustration','pixel']) {
 const sheet=loadEncodedSheet(style);
 for(const face of ['happy','happy-blink']) {
  assert.equal(expressionFaceFor(sheet,face,{phase:'success',blink:face.endsWith('-blink')}),face,
   `${style}: automatic success must preserve both original frames, even when emotion-joy exists`);
 }
 for(const [face,snapshot] of [['concern',{phase:'waiting'}],['concern-blink',{phase:'waiting',blink:true}]]) {
  if(sheet.ids[face]!==undefined && sheet.ids.concern!==undefined && sheet.ids['concern-blink']!==undefined)
   assert.equal(expressionFaceFor(sheet,face,snapshot),face,'Task-state frame pairs stay paired');
 }
 if(sheet.ids['emotion-joy']!==undefined)
  assert.equal(expressionFaceFor(sheet,'emotion-joy',{phase:'success',gesture:{id:'joy'}}),'emotion-joy',
   'Explicit expression gestures are not removed');
 const a=sheet.frames[sheet.ids.happy],b=sheet.frames[sheet.ids['happy-blink']];
 assert.ok(a&&b);
 assert.equal(normalizeStyle(style), 'umi');
 assert.notDeepEqual(a.pixels,b.pixels,'Canonical illustration and historical aliases preserve real open/blink artwork');
}

const globals={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,controller,clock=0;const drawn=new Set();
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
try {
 globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
 globalThis.document={hidden:false,createElement:()=>{const canvas={width:0,height:0};canvas.getContext=()=>({drawImage(){},putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)})});return canvas}};
 globalThis.createImageBitmap=async()=>({width:640,height:640,close(){}});
 await import(new URL('../lib/client.js?ordinary-frame-animation',import.meta.url));
 const plugin=entry.factory(()=>({}));
 const manifest=JSON.parse(await readFile(new URL('../assets/hires/umi/manifest.json',import.meta.url),'utf8'));
 manifest.animations={};
 const sheet={...loadEncodedSheet('umi'),gestureCatalog:{schemaVersion:1,clips:{}}};
 sheet.motion={...sheet.motion,stateLoops:{}};
 const fetchImpl=async url=>{const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',companionship:'off',animation:true,language:'en'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>sheet};
  if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
  return {ok:true,blob:async()=>({})};
 };
 controller=plugin.createMascotController({fetchImpl,now:()=>clock});await controller.init();await flush();
 controller.activity.start({wake:false});controller.notifyChange();
 // Enter success shortly before the existing blink clock's 4.93-second beat.
 for(clock=1000;clock<=4000;clock+=1000)controller.notifyChange();
 clock=4800;controller.notifyChange();controller.activity.handle('agent_start');controller.activity.handle('agent_settled');
 for(clock=4800;clock<=5150;clock+=50){controller.notifyChange();await flush();const s=controller.getSnapshot();
  assert.equal(s.snapshot.phase,'success');
  controller.getRenderLayer();await flush();
  const l=controller.getRenderLayer();drawn.add(l.displayKey);
  assert.equal(l.hiRes,true);assert.equal(l.display.scale,1);assert.equal(l.display.y,0);
 }
 assert.ok(drawn.has('poses/happy')&&drawn.has('poses/happy-blink'),`Actual HD controller must draw both frames, got ${[...drawn]}`);
 // Check the actual generated DSH client, not only the pure motion function.
 clock=6000;controller.activity.start({wake:false});controller.notifyChange();
 const transforms=new Set();
 for(clock=6000;clock<=10200;clock+=200){
  controller.notifyChange();await flush();controller.getRenderLayer();await flush();
  const layer=controller.getRenderLayer();
  transforms.add(JSON.stringify(layer.transform));
  assert.equal(layer.display.scale,1,'Simple motion must not change the registered display scale');
  assert.ok(!layer.transform || layer.transform.scale===1,'Idle body motion does not resize the character');
 }
 if(!FULL_ANIMATION_EDITION) assert.ok(transforms.size>1,'Ordinary bundled HD client must retain simple body movement');
 else assert.equal(transforms.size,1,'Complete animation fallback does not add ordinary movement');
 controller.applySettingsLocal({animation:false});controller.notifyChange();await flush();
 const paused=JSON.stringify(controller.getRenderLayer().transform);
 clock+=5000;controller.notifyChange();await flush();
 assert.equal(JSON.stringify(controller.getRenderLayer().transform),paused,'Paused HD body movement stays frozen');
}finally{
 controller?.dispose();for(const[k,v]of Object.entries(globals))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}
console.log('Ordinary frame animation: legacy task-state pairs survive static expression remapping; actual HD success plays open/blink with fixed scale.');
