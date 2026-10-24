import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEncodedSheet} from '../lib/index.js';
const before={window:globalThis.window,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
let entry,closed=0,created=0,clock=0;
const pending=new Map();
const response=(tag)=>({ok:true,blob:async()=>({tag})});
globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
globalThis.document={hidden:false,createElement:()=>{
 created++;
 const canvas={width:0,height:0};
 canvas.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)}),
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}});
 return canvas;
}};
globalThis.createImageBitmap=async blob=>({width:640,height:640,tag:blob.tag,close(){closed++;}});
let controller;
const flush=async()=>{for(let n=0;n<70;n++)await Promise.resolve();};
try{
 await import(new URL('../lib/client.js?hires-integration',import.meta.url));
 const plugin=entry.factory(()=>({}));
 const manifest=JSON.parse(await readFile(new URL('../assets/hires/umi/manifest.json',import.meta.url),'utf8'));
 // This fixture exercises the static HD fallback and delayed ordinary poses.
 // Reviewed H3 playback has its own real bundle/clip test. Isolate both API
 // metadata sources so installed video assets cannot silently change which
 // image family this delay/size/disposal test is requesting.
 manifest.animations={gestures:{}};
 const fallbackSheet={...loadEncodedSheet('umi'),gestureCatalog:{schemaVersion:1,clips:{}}};
 fallbackSheet.motion={...fallbackSheet.motion,stateLoops:{}};
 let gestureRequests=0;
 const poseRequests=[];
 const fetchImpl=async(url)=>{
  const u=new URL(String(url),'http://localhost');
  if(u.pathname.endsWith('/config'))return {ok:true,json:async()=>({style:'umi',language:'en'})};
  if(u.pathname.endsWith('/sheet'))return {ok:true,json:async()=>fallbackSheet};
  if(u.pathname.endsWith('/manifest'))return {ok:true,json:async()=>manifest};
  if(u.pathname.endsWith('/gesture')){gestureRequests++;throw new Error('Static fallback fixture must not request an H3 clip');}
  const kind=u.searchParams.get('kind'),id=u.searchParams.get('id'),tag=`${kind}/${id}`;
  if(kind==='poses')poseRequests.push(id);
  assert.ok(u.searchParams.get('v'),'Every image request has a cache revision');
  if(tag==='poses/listen'||tag==='poses/listen-blink'||(kind==='watch'&&id!=='000')){
   return new Promise(resolve=>pending.set(tag,()=>resolve(response(tag))));
  }
  return response(tag);
 };
 controller=plugin.createMascotController({fetchImpl,now:()=>clock});
 await controller.init();await flush();
 assert.deepEqual([...new Set(poseRequests)].sort(),['idle-blink','idle-open','talk-closed'],
  'Startup does not decode all unused legacy HD fallback poses');
 controller.activity.start({wake:false});controller.notifyChange();
 const idle=controller.getRenderLayer();assert.equal(idle.hiRes,true);assert.equal(idle.width,640);
 assert.equal(controller.playGesture('shy'),true);
 controller.getRenderLayer();await flush();
 clock=250;controller.notifyChange();
 assert.equal(controller.getSnapshot().requestedFace,'emotion-shy');
 const shipped=JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json',import.meta.url),'utf8'));
 if(shipped.approvedStaticRevision) {
  assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),shipped.frames[shipped.ids['emotion-shy']].pixels,
   'Bundled client decodes the complete current approved frame without index truncation or local repainting');
 } else assert.ok(controller.getSnapshot().visual.frame.pixels.some(p=>p>255),'Bundled client preserves appended color indices above one byte');
 const shy=controller.getRenderLayer();assert.equal(shy.hiRes,true);assert.notEqual(shy.bitmap,idle.bitmap);
 controller.playGesture('off');controller.notifyChange();await flush();
 const restoredIdle=controller.getRenderLayer();
 controller.activity.noteTyping();clock=300;controller.notifyChange();
 assert.equal(controller.getRenderLayer().bitmap,restoredIdle.bitmap,'Delayed listening frame holds displayed 640px pose instead of a different-sized fallback');
 assert.ok(pending.has('poses/listen'));
 pending.get('poses/listen')();await flush();clock=400;controller.notifyChange();
 const listen=controller.getRenderLayer();assert.equal(listen.hiRes,true);assert.notEqual(listen.bitmap,idle.bitmap);
 controller.activity.handle('agent_start');controller.activity.handle('tool_execution_start',{toolCallId:'run',toolName:'bash'});
 clock=600;controller.notifyChange();controller.getRenderLayer();await flush();
 const watch=controller.getRenderLayer();assert.equal(watch.hiRes,true);
 clock=1600;controller.notifyChange();
 const delayed=controller.getRenderLayer();assert.equal(delayed.bitmap,watch.bitmap,'Missing next watch frame keeps previous HD frame');
 // Calibrate only the actual displayed family. Video frame IDs cannot restart
 // the transition, and the tail must use the expanded paint surface.
 controller.activity.handle('tool_execution_end',{toolCallId:'run'});
 controller.activity.handle('tool_execution_start',{toolCallId:'search',toolName:'search'});
 clock=1700;controller.notifyChange();controller.getRenderLayer();await flush();
 controller.getRenderLayer();clock=2000;controller.notifyChange();
 const search=controller.getRenderLayer();assert.equal(search.display.profile,manifest.approvedStaticRevision?'ordinary':'search');
 assert.equal(search.display.scale,manifest.approvedStaticRevision?1:1.3);
 assert.equal(search.display.x,manifest.approvedStaticRevision?0:-148);assert.equal(search.display.y,manifest.approvedStaticRevision?0:-152);
 clock=2200;controller.notifyChange();await flush();
 assert.equal(controller.getRenderLayer().display.scale,manifest.approvedStaticRevision?1:1.3,'An internal search frame does not auto-fit or restart display scaling');
 controller.applySettingsLocal({style:'umi-pixel'});
 assert.equal(controller.getSnapshot().settings.style,'umi','Legacy pixel preference migrates to illustration');
 assert.equal(controller.getRenderLayer().hiRes,true,'A historical alias does not switch to a missing pixel bank');
 const revision=controller.getSnapshot().revision;
 controller.dispose();
 const canvases=created;
 for(const resolve of pending.values())resolve();await flush();
 assert.equal(created,canvases,'Late requests cannot allocate canvases after disposal');
 assert.equal(controller.getSnapshot().revision,revision);
 assert.equal(controller.getRenderLayer(),null);
 assert.ok(closed>0,'Decoded image resources are released');
 assert.equal(gestureRequests,0,'Explicitly absent reviewed-video metadata retains the static HD fallback');
 console.log('DSH static HD fallback integration: actual bundled controller, isolated no-video metadata, delayed poses/watch frames, revision URLs, style switch and disposal passed.');
}finally{
 controller?.dispose();
 for(const[k,v]of Object.entries(before))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}
