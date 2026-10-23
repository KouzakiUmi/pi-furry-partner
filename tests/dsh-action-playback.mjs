// Actual built controller: approved static on animation-off, shared search clock.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEncodedSheet} from '../lib/index.js';
const before={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,clock=0,controller,releaseStaticWatch;
globalThis.window={__ModuleLoader__:{load:value=>entry=value}};
globalThis.document={hidden:false,createElement:()=>{
  const canvas={width:0,height:0};
  canvas.getContext=()=>({drawImage:bmp=>{canvas.tag=bmp.tag;},
    getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});
  return canvas;
}};
globalThis.createImageBitmap=async blob=>({width:640,height:640,tag:blob.tag,close(){}});
const flush=async()=>{for(let n=0;n<80;n++)await Promise.resolve();};
try {
  await import(new URL('../lib/client.js?action-playback',import.meta.url));
  const plugin=entry.factory(()=>({}));
  const manifest=JSON.parse(readFileSync(new URL('../assets/hires/umi/manifest.json',import.meta.url),'utf8'));
  const clip={durationMs:1000,fps:10,frames:Array.from({length:10},(_,n)=>({atMs:n*100,id:String(n).padStart(3,'0')}))};
  // Explicit tiny timeline fixture isolates clock/selection from whether the
  // replacement search clip is installed or still awaiting rhythm approval.
  manifest.animations={gestures:{},watch:{frames:clip.frames.map(f=>f.id),clips:{running:clip}},
    search:{frames:clip.frames.map(f=>f.id),clips:{searching:clip,compacting:clip}}};
  const packet=loadEncodedSheet('umi');
  const fetchImpl=async url=>{
    const u=new URL(String(url),'http://localhost');
    if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',language:'en',animation:true,companionship:'off'})};
    if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>packet};
    if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
    if(u.searchParams.get('kind')==='poses'&&u.searchParams.get('id')==='watch')
      return new Promise(resolve=>{releaseStaticWatch=()=>resolve({ok:true,blob:async()=>({tag:'poses/watch'})});});
    return {ok:true,blob:async()=>({tag:`${u.searchParams.get('kind')}/${u.searchParams.get('id')}`})};
  };
  controller=plugin.createMascotController({fetchImpl,now:()=>clock});
  await controller.init();await flush();
  controller.activity.start({wake:false});controller.activity.handle('agent_start');
  controller.activity.handle('tool_execution_start',{toolCallId:'watch',toolName:'bash'});
  controller.notifyChange();controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'watch/000');
  clock=300;controller.notifyChange();controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'watch/003');
  controller.applySettingsLocal({animation:false});await flush();
  assert.equal(controller.getRenderLayer().hiRes,false,
    'A delayed static HD image uses the approved indexed static instead of holding the previous video');
  releaseStaticWatch();await flush();
  assert.equal(controller.getRenderLayer().displayKey,'poses/watch');
  const frozen=controller.getRenderLayer().bitmap;
  clock=1400;controller.notifyChange();await flush();
  assert.equal(controller.getRenderLayer().bitmap,frozen,'Animation-off uses approved static watch across later renders');
  controller.applySettingsLocal({animation:true});controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'watch/000','Resuming from static starts this action coherently');
  controller.activity.handle('tool_execution_end',{toolCallId:'watch'});
  controller.activity.handle('tool_execution_start',{toolCallId:'search',toolName:'search'});
  controller.notifyChange();controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'search/000');
  clock=1700;controller.notifyChange();controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'search/003');
  controller.activity.handle('session_before_compact');controller.notifyChange();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'search/003','Search to compaction does not restart frame zero');
  clock=1900;controller.notifyChange();controller.getRenderLayer();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'search/005');
  controller.activity.handle('session_compact');controller.notifyChange();await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag,'search/005','Compaction back to search retains the same clip clock');
  controller.applySettingsLocal({animation:false});await flush();
  assert.equal(controller.getRenderLayer().displayKey,'poses/search');
  clock=2800;controller.notifyChange();await flush();
  assert.equal(controller.getRenderLayer().displayKey,'poses/search');
  assert.equal(controller.getRenderLayer().transform,null);
  console.log('DSH actual bundle: action HD playback, static watch/search when animation is off, coherent resume and continuous search/compaction handoff passed.');
} finally {
  controller?.dispose();
  for(const[k,v]of Object.entries(before))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}
