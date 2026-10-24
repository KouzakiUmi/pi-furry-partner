// Real exported resources through the host, runtime and shipped DSH bundle.
// Only bitmap decoding is mocked; dimensions come from each actual WebP header.
import assert from 'node:assert/strict';
import { setImmediate as nextTurn, setTimeout as wait } from 'node:timers/promises';
import { loadAnimatedCatalog, loadAnimatedAsset, loadEncodedSheet } from '../lib/index.js';
import { createApprovedMotionPlayer, normalizeApprovedMotionCatalog } from '../lib/approved-motion.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';

const catalog = loadAnimatedCatalog();
const normalized = normalizeApprovedMotionCatalog(catalog);
assert.equal(Object.keys(normalized.clips).length, 29);
assert.deepEqual(normalized.anchor, [320, 608]);
assert.equal(normalized.chain.enterDurationMs, 400);
assert.equal(normalized.chain.exitDurationMs, 400);
const before = Object.fromEntries(['window', 'document', 'createImageBitmap'].map(k => [k, globalThis[k]]));
let entry, controller, clock = 0, closed = 0, blockThink = false;
const nativeRandom=Math.random;let forcedRandom=0;Math.random=()=>forcedRandom;
const pending = [], requests = new Set(), routed = new Set();
function dimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  for (let at = 12; at + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', at, at + 4), length = bytes.readUInt32LE(at + 4), p = at + 8;
    if (kind === 'VP8X') return [bytes.readUIntLE(p + 4, 3) + 1, bytes.readUIntLE(p + 7, 3) + 1];
    if (kind === 'VP8L') { assert.equal(bytes[p], 0x2f); const bits = bytes.readUInt32LE(p + 1); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    at = p + length + (length % 2);
  }
  throw new Error('Expected native lossless WebP dimensions');
}
globalThis.window = { __ModuleLoader__: { load: item => entry = item } };
globalThis.document = { hidden: false, createElement: () => {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(value) { canvas.pixels=Uint8ClampedArray.from(value.data); } });
  return canvas;
} };
globalThis.createImageBitmap = async blob => {
  const [width, height] = dimensions(blob.bytes);
  return { width, height, tag: blob.path, close() { closed++; } };
};
async function fetchImpl(url) {
  const u = new URL(String(url), 'http://localhost');
  if (u.pathname.endsWith('/animated/catalog')) return { ok: true, json: async () => loadAnimatedCatalog() };
  if (u.pathname.endsWith('/animated/asset')) {
    const path = u.searchParams.get('path');
    assert.equal(u.searchParams.get('v'), catalog.revision, 'Host assets use the catalog revision cache key');
    const asset = loadAnimatedAsset(path, u.searchParams.get('v'));
    assert.ok(asset, `Actual host permits and reads ${path}`);
    assert.match(asset.etag, /^"[a-f0-9]{64}"$/);
    requests.add(path);
    const response = { ok: true, json: async () => JSON.parse(asset.bytes),
      arrayBuffer: async () => asset.bytes.buffer.slice(asset.bytes.byteOffset,asset.bytes.byteOffset+asset.bytes.byteLength),
      blob: async () => ({ bytes: asset.bytes, path }) };
    if (blockThink && path.startsWith('hires/think/')) return new Promise(resolve => pending.push(() => resolve(response)));
    return response;
  }
  if (u.pathname.endsWith('/config')) return { ok: true, json: async () => ({ style: 'umi', enabled: true, animation: true, language: 'en', companionship: 'off' }) };
  if (u.pathname.endsWith('/sheet')) return { ok: true, json: async () => loadEncodedSheet(u.searchParams.get('style') || 'umi') };
  return { ok: false };
}
async function until(check, message) {
  // Real gzip streams run in the worker pool; event-loop turns are not a time budget.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (check()) return; await wait(5); }
  assert.ok(check(), message);
}
function bounded() {
  const stats = controller.cacheStats();
  assert.ok(stats.approved.clips <= 2, 'Indexed clip LRU remains at most two');
  assert.ok(stats.approvedHiResClips <= 2, 'HD clip LRU remains at most two');
}
function reset() {
  controller.applySettingsLocal({ animation: false });
  controller.setDemo('off'); controller.playGesture('off');
  clock += 10000; controller.activity.start({ wake: false });
  controller.applySettingsLocal({ animation: true, enabled: true, style: 'umi' });
  controller.notifyChange();
}
async function indexed(id) {
  if(id==='idle')id=controller.getSnapshot().approvedMotion?.clipId||'idle';
  await until(() => controller.getSnapshot().visual?.approvedMotion?.clipId === id, `Actual indexed ${id} loaded`);
  bounded();
}
async function hd(id) {
  if(id==='idle')id=controller.getSnapshot().approvedMotion?.clipId||'idle';
  await indexed(id);
  await until(() => { const layer = controller.getRenderLayer(); return layer?.hiRes && layer.approvedClipId === id; }, `Actual native ${id} loaded`);
  const layer = controller.getRenderLayer(), clip = catalog.clips[id], rect = clip.paintRect;
  assert.deepEqual(layer.paintRect, rect, `${id} uses fixed native paintRect`);
  assert.equal(layer.width, rect.width); assert.equal(layer.height, rect.height);
  assert.equal(layer.registered, true); assert.equal(layer.transform, null);
  assert.equal(layer.display.scale, 1); assert.equal(layer.display.x, 0); assert.equal(layer.display.y, 0);
  assert.equal(rect.x, 320 - clip.qa.pivot[0]); assert.equal(rect.y, 608 - clip.qa.pivot[1]);
  bounded(); routed.add(id);
  return layer;
}
try {
  await import(new URL('../lib/client.js?actual-approved-pack', import.meta.url));
  const plugin = entry.factory(() => ({}));
  controller = plugin.createMascotController({ fetchImpl, now: () => clock });
  await controller.init(); await controller.ensureApprovedCatalog();
  reset(); await hd('idle');
  for (const [demo, id] of [['thinking', 'think'], ['waiting', 'wait'], ['cancelled', 'rest'], ['reading', 'watch'], ['searching', 'search']]) {
    reset(); controller.setDemo(demo); await hd(id);
  }
  reset(); controller.activity.noteTyping(); controller.notifyChange(); await hd('listen');
  reset(); controller.activity.handle('tool_execution_start', { toolCallId: 'pack-edit', toolName: 'edit' }); controller.notifyChange();
  const enterAt = clock;
  await hd('work-enter');
  assert.equal(controller.getSnapshot().snapshot.phase, 'editing');
  clock = enterAt + 399; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-enter');
  clock = enterAt + 400; controller.notifyChange(); await hd('work');
  controller.activity.handle('tool_execution_end', { toolCallId: 'pack-edit' });
  controller.activity.handle('message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'x' } });
  clock = enterAt + 450; controller.notifyChange();
  assert.notEqual(controller.getSnapshot().snapshot.phase, 'editing', 'Real tool state finishes before its visual exit');
  await hd('work');
  clock = enterAt + 1199; controller.notifyChange();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work', 'A completed short edit still presents readable typing');
  clock = enterAt + 1200; controller.notifyChange(); const exitAt = clock;
  await hd('work-exit');
  clock = exitAt + 399; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-exit');
  clock = exitAt + 400; controller.notifyChange(); await indexed('think');
  for (const id of ['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']) {
    reset(); assert.equal(controller.playGesture(id), true); await hd(id);
  }


  // Exercise the shipped renderer with a native 896 canvas and explicit overflow.
  const effects = [], drawCalls = [], drawing = { clearRect() {}, save() {}, restore() {}, scale() {}, translate() {}, drawImage: (...args) => drawCalls.push(args.slice(1)) };
  const canvas = { width: 0, height: 0, getContext: () => drawing };
  const React = { createElement: (type, props) => ({ type, props }), useRef: () => ({ current: canvas }), useEffect: cb => effects.push(cb), useSyncExternalStore: (_, get) => get() };
  const node = plugin.createMascotComponents(React, controller).MascotCanvas({ size: 196, desktop: true });
  canvas.width = node.props.width; canvas.height = node.props.height; effects.splice(0).forEach(cb => cb());
  const { x, y, width, height } = catalog.clips.affection.paintRect;
  assert.deepEqual(drawCalls[0], [x, y, width, height], 'Actual canvas paints native scale with world translation');

  const paintCurrentCanvas=()=>{
    const current=plugin.createMascotComponents(React,controller).MascotCanvas({size:196,desktop:true});
    canvas.width=current.props.width;canvas.height=current.props.height;effects.splice(0).forEach(cb=>cb());return drawCalls.at(-1);
  };
  const advanceTo=target=>{while(clock<target){clock+=Math.min(500,target-clock);controller.notifyChange();}};
  const advanceMediaTo=async target=>{while(clock<target){clock+=Math.min(40,target-clock);controller.notifyChange();controller.getRenderLayer();await nextTurn();}};
  // All three real approved idle sources finish native cycles before handoff.
  reset();const idleSeen=new Set();let idleStart=clock;
  for(let cycle=0;cycle<7;cycle++){
    const id=controller.getSnapshot().approvedMotion.clipId;assert.ok(catalog.idleVariants.includes(id));idleSeen.add(id);
    await hd(id);const raw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips[id].indexed.umi.file,catalog.revision).bytes);
    assert.equal(controller.getSnapshot().approvedMotion.elapsedMs,0);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(raw.frames[0].pixels),`${id}: actual indexed first pixels`);
    await advanceMediaTo(idleStart+3000);await indexed(id);assert.equal(controller.getSnapshot().approvedMotion.clipId,id);
    await advanceMediaTo(idleStart+4417);await indexed(id);assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
    await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/${id}/106.webp`,`${id}: native HD last frame106`);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(raw.frames.at(-1).pixels),`${id}: actual indexed last pixels`);
    await advanceMediaTo(idleStart+4457);assert.equal(controller.getSnapshot().approvedMotion.clipId,id);
    forcedRandom=cycle%2?0:.999;
    await advanceMediaTo(idleStart+4458);assert.notEqual(controller.getSnapshot().approvedMotion.clipId,id,'Only full-cycle boundary selects a different approved idle');idleStart=clock;
  }
  assert.deepEqual([...idleSeen].sort(),catalog.idleVariants.slice().sort());
  // Real approved nod must outlive the old2600ms default and reach source106.
  reset(); assert.equal(controller.playGesture('nod'), true); const nodAt=clock;
  await hd('nod');
  const nodFirst=Array.from(controller.getSnapshot().visual.frame.pixels);
  assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  advanceTo(nodAt+3000);await indexed('nod');
  assert.equal(controller.getSnapshot().gesture.id,'nod');
  assert.notDeepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),nodFirst,'Actual nod pixels change, beyond merely selecting its ID');
  advanceTo(nodAt+4417);await indexed('nod');
  assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  advanceTo(nodAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  // Desktop autonomous scheduling also uses catalog duration, not default nod.
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const autoDeadline=clock+700000;while(clock<autoDeadline&&controller.getSnapshot().pet?.gestureId!=='nod')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'nod','Autonomous desktop sequence reaches nod');
  const autoNodAt=clock;
  advanceTo(autoNodAt+3000);await indexed('nod');
  assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  advanceTo(autoNodAt+4417);await indexed('nod');
  assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  advanceTo(autoNodAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'nod');
  controller.applySettingsLocal({companionship:'off'});
  // Wave uses the exact approved action, for both commands and desktop auto.
  reset();assert.equal(controller.playGesture('wave'),true);const waveAt=clock;await hd('wave');
  const waveFirst=Array.from(controller.getSnapshot().visual.frame.pixels);
  await advanceMediaTo(waveAt+3000);await indexed('wave');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  assert.notDeepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),waveFirst);
  await advanceMediaTo(waveAt+4417);await indexed('wave');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/wave/106.webp','Manual wave reaches native HD source106');
  await advanceMediaTo(waveAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const waveDeadline=clock+700000;while(clock<waveDeadline&&controller.getSnapshot().pet?.gestureId!=='wave')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'wave');const autoWaveAt=clock;await hd('wave');
  await advanceMediaTo(autoWaveAt+3000);await indexed('wave');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoWaveAt+4417);await indexed('wave');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/wave/106.webp','Autonomous wave reaches native HD source106');
  await advanceMediaTo(autoWaveAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'wave');controller.applySettingsLocal({companionship:'off'});
  // Exact approved peek, nativeHD and indexed pixels, manual and autonomous.
  reset();assert.equal(controller.playGesture('peek'),true);const peekAt=clock;await hd('peek');
  const peekRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips.peek.indexed.umi.file,catalog.revision).bytes);
  for(const authored of peekRaw.frames){
    await advanceMediaTo(peekAt+Math.ceil(authored.atMs));await indexed('peek');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([0,42,60,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/peek/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual peek HD reaches approved source pose');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:0,y:0,width:640,height:640});assert.equal(layer.width,640);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  await advanceMediaTo(peekAt+4457);assert.equal(controller.getSnapshot().gesture.id,'peek');
  await advanceMediaTo(peekAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const peekDeadline=clock+1400000;while(clock<peekDeadline&&controller.getSnapshot().pet?.gestureId!=='peek')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'peek');const autoPeekAt=clock;await hd('peek');
  await advanceMediaTo(autoPeekAt+3500);await indexed('peek');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoPeekAt+4417);await indexed('peek');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/peek/106.webp','Autonomous peek reaches native source106');
  await advanceMediaTo(autoPeekAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'peek');controller.applySettingsLocal({companionship:'off'});
  // Exact approved head-shake, nativeHD and indexed pixels, manual and autonomous.
  reset();assert.equal(controller.playGesture('head-shake'),true);const headAt=clock;await hd('head-shake');
  const headRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips['head-shake'].indexed.umi.file,catalog.revision).bytes);
  for(const authored of headRaw.frames){
    await advanceMediaTo(headAt+Math.ceil(authored.atMs));await indexed('head-shake');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([0,42,60,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/head-shake/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual head-shake HD reaches approved source pose');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:0,y:0,width:640,height:640});assert.equal(layer.width,640);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  await advanceMediaTo(headAt+4457);assert.equal(controller.getSnapshot().gesture.id,'head-shake');
  await advanceMediaTo(headAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const headDeadline=clock+1400000;while(clock<headDeadline&&controller.getSnapshot().pet?.gestureId!=='head-shake')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'head-shake');const autoHeadAt=clock;await hd('head-shake');
  await advanceMediaTo(autoHeadAt+3500);await indexed('head-shake');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoHeadAt+4417);await indexed('head-shake');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/head-shake/106.webp','Autonomous head-shake reaches native source106');
  await advanceMediaTo(autoHeadAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'head-shake');controller.applySettingsLocal({companionship:'off'});
  // Exact approved ear-flick, nativeHD and indexed pixels, manual and autonomous.
  reset();assert.equal(controller.playGesture('ear-flick'),true);const earAt=clock;await hd('ear-flick');
  const earRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips['ear-flick'].indexed.umi.file,catalog.revision).bytes);
  for(const authored of earRaw.frames){
    await advanceMediaTo(earAt+Math.ceil(authored.atMs));await indexed('ear-flick');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([0,42,60,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/ear-flick/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual ear-flick HD reaches approved source pose');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:0,y:0,width:640,height:640});assert.equal(layer.width,640);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  await advanceMediaTo(earAt+4457);assert.equal(controller.getSnapshot().gesture.id,'ear-flick');
  await advanceMediaTo(earAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const earDeadline=clock+1400000;while(clock<earDeadline&&controller.getSnapshot().pet?.gestureId!=='ear-flick')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'ear-flick');const autoEarAt=clock;await hd('ear-flick');
  await advanceMediaTo(autoEarAt+3500);await indexed('ear-flick');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoEarAt+4417);await indexed('ear-flick');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/ear-flick/106.webp','Autonomous ear-flick reaches native source106');
  await advanceMediaTo(autoEarAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'ear-flick');controller.applySettingsLocal({companionship:'off'});
  // Full896 stretch: real HD/native registration and all54 indexed fallback
  // frames retain both extended paws, without changing the world display scale.
  reset();assert.equal(controller.playGesture('stretch'),true);const stretchAt=clock;await hd('stretch');
  const stretchRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips.stretch.indexed.umi.file,catalog.revision).bytes);
  for(const authored of stretchRaw.frames){
    await advanceMediaTo(stretchAt+Math.ceil(authored.atMs));await indexed('stretch');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([42,78,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/stretch/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual full896 HD reaches critical stretch pose');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:-128,y:-128,width:896,height:896});
      assert.equal(layer.width,896);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  assert.deepEqual(paintCurrentCanvas(),[-128,-128,896,896],'Actual DSH canvas keeps full registered896 source instead of fitting it to640');
  await advanceMediaTo(stretchAt+4457);assert.equal(controller.getSnapshot().gesture.id,'stretch');
  await advanceMediaTo(stretchAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();const nativeBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=undefined;
  assert.equal(controller.playGesture('stretch'),true);const fallbackAt=clock;await indexed('stretch');
  for(const authored of stretchRaw.frames){
    await advanceMediaTo(fallbackAt+Math.ceil(authored.atMs));await indexed('stretch');
    const layer=controller.getRenderLayer();assert.equal(layer.hiRes,false);assert.deepEqual(layer.paintRect,{x:-128,y:-128,width:896,height:896});
    assert.equal(layer.bitmap.width,336);assert.equal(layer.bitmap.height,336);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    let alphaPixels=0;for(let i=3;i<layer.bitmap.pixels.length;i+=4)if(layer.bitmap.pixels[i])alphaPixels++;
    assert.equal(alphaPixels,authored.pixels.reduce((n,v)=>n+(v!==0),0),'Actual fallback bitmap preserves every full336 foreground pixel including outer paws');
  }
  assert.deepEqual(paintCurrentCanvas(),[-128,-128,896,896],'Indexed fallback uses the same world rect and physical scale as native HD');
  globalThis.createImageBitmap=nativeBitmap;
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const stretchDeadline=clock+1400000;while(clock<stretchDeadline&&controller.getSnapshot().pet?.gestureId!=='stretch')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'stretch');const autoStretchAt=clock;await hd('stretch');
  await advanceMediaTo(autoStretchAt+3000);await indexed('stretch');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoStretchAt+4417);await indexed('stretch');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/stretch/106.webp','Autonomous stretch reaches native source106');
  await advanceMediaTo(autoStretchAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'stretch');controller.applySettingsLocal({companionship:'off'});
  // Full896 bounce: real HD/native registration and all54 indexed fallback
  // frames retain both extended paws, without changing the world display scale.
  reset();assert.equal(controller.playGesture('bounce'),true);const bounceAt=clock;await hd('bounce');
  const bounceRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips.bounce.indexed.umi.file,catalog.revision).bytes);
  for(const authored of bounceRaw.frames){
    await advanceMediaTo(bounceAt+Math.ceil(authored.atMs));await indexed('bounce');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([42,78,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/bounce/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual full896 HD reaches critical bounce pose');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:-128,y:-128,width:896,height:896});
      assert.equal(layer.width,896);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  assert.deepEqual(paintCurrentCanvas(),[-128,-128,896,896],'Actual DSH canvas keeps full registered896 source instead of fitting it to640');
  await advanceMediaTo(bounceAt+4457);assert.equal(controller.getSnapshot().gesture.id,'bounce');
  await advanceMediaTo(bounceAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();const bounceNativeBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=undefined;
  assert.equal(controller.playGesture('bounce'),true);const bounceFallbackAt=clock;await indexed('bounce');
  for(const authored of bounceRaw.frames){
    await advanceMediaTo(bounceFallbackAt+Math.ceil(authored.atMs));await indexed('bounce');
    const layer=controller.getRenderLayer();assert.equal(layer.hiRes,false);assert.deepEqual(layer.paintRect,{x:-128,y:-128,width:896,height:896});
    assert.equal(layer.bitmap.width,336);assert.equal(layer.bitmap.height,336);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    let alphaPixels=0;for(let i=3;i<layer.bitmap.pixels.length;i+=4)if(layer.bitmap.pixels[i])alphaPixels++;
    assert.equal(alphaPixels,authored.pixels.reduce((n,v)=>n+(v!==0),0),'Actual fallback bitmap preserves every full336 foreground pixel including outer paws');
  }
  assert.deepEqual(paintCurrentCanvas(),[-128,-128,896,896],'Indexed fallback uses the same world rect and physical scale as native HD');
  globalThis.createImageBitmap=bounceNativeBitmap;
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const bounceDeadline=clock+1400000;while(clock<bounceDeadline&&controller.getSnapshot().pet?.gestureId!=='bounce')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'bounce');const autoBounceAt=clock;await hd('bounce');
  await advanceMediaTo(autoBounceAt+3500);await indexed('bounce');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoBounceAt+4417);await indexed('bounce');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/bounce/106.webp','Autonomous bounce reaches native source106');
  await advanceMediaTo(autoBounceAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'bounce');controller.applySettingsLocal({companionship:'off'});
  // The accepted nuzzle uses all native frames and the original fixed640 world.
  reset();assert.equal(controller.playGesture('nuzzle'),true);const nuzzleAt=clock;await hd('nuzzle');
  const nuzzleRaw=decodeApprovedMotionNodeResource(loadAnimatedAsset(catalog.clips.nuzzle.indexed.umi.file,catalog.revision).bytes);
  assert.equal(nuzzleRaw.frames.length,54);assert.equal(nuzzleRaw.width,240);assert.equal(nuzzleRaw.height,240);
  assert.deepEqual(catalog.clips.nuzzle.qa.pivot,[320,608]);
  for(const [i,authored] of nuzzleRaw.frames.entries()){
    assert.equal(authored.sourceFrame,i*2);
    await advanceMediaTo(nuzzleAt+Math.ceil(authored.atMs));await indexed('nuzzle');
    assert.equal(controller.getSnapshot().gesture.durationMs,4458);
    assert.equal(controller.getSnapshot().visual.frame.sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels),Array.from(authored.pixels));
    if([0,36,54,106].includes(authored.sourceFrame)){
      await until(()=>controller.getRenderLayer()?.bitmap?.tag===`hires/nuzzle/${String(authored.sourceFrame).padStart(3,'0')}.webp`,'Actual nuzzle reaches the accepted HD source frame');
      const layer=controller.getRenderLayer();assert.deepEqual(layer.paintRect,{x:0,y:0,width:640,height:640});
      assert.equal(layer.width,640);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    }
  }
  assert.deepEqual(paintCurrentCanvas(),[0,0,640,640]);
  await advanceMediaTo(nuzzleAt+4457);assert.equal(controller.getSnapshot().gesture.id,'nuzzle');
  assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await advanceMediaTo(nuzzleAt+4458);assert.equal(controller.getSnapshot().gesture,null);
  reset();const nuzzleNativeBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=undefined;
  assert.equal(controller.playGesture('nuzzle'),true);const nuzzleFallbackAt=clock;await indexed('nuzzle');
  for(const authored of nuzzleRaw.frames){
    await advanceMediaTo(nuzzleFallbackAt+Math.ceil(authored.atMs));await indexed('nuzzle');
    const layer=controller.getRenderLayer();assert.equal(layer.hiRes,false);assert.equal(layer.paintRect,undefined,'Default640 indexed world uses the normal canvas branch');
    assert.equal(layer.bitmap.width,240);assert.equal(layer.bitmap.height,240);assert.equal(layer.display.scale,1);assert.equal(layer.transform,null);
    let alphaPixels=0;for(let i=3;i<layer.bitmap.pixels.length;i+=4)if(layer.bitmap.pixels[i])alphaPixels++;
    assert.equal(alphaPixels,authored.pixels.reduce((n,v)=>n+(v!==0),0),'Every nuzzle foreground pixel reaches the real indexed fallback');
  }
  assert.deepEqual(paintCurrentCanvas(),[0,0,640,640],'Normal indexed branch paints the full fixed640 world');
  globalThis.createImageBitmap=nuzzleNativeBitmap;
  reset();controller.applySettingsLocal({companionship:'lively'});controller.notifyChange();
  const nuzzleDeadline=clock+1400000;while(clock<nuzzleDeadline&&controller.getSnapshot().pet?.gestureId!=='nuzzle')advanceTo(clock+500);
  assert.equal(controller.getSnapshot().pet?.gestureId,'nuzzle');const autoNuzzleAt=clock;await hd('nuzzle');
  await advanceMediaTo(autoNuzzleAt+3500);await indexed('nuzzle');assert.equal(controller.getSnapshot().gesture.durationMs,4458);
  await advanceMediaTo(autoNuzzleAt+4417);await indexed('nuzzle');assert.equal(controller.getSnapshot().visual.frame.sourceFrame,106);
  await until(()=>controller.getRenderLayer()?.bitmap?.tag==='hires/nuzzle/106.webp','Autonomous nuzzle reaches native source106');
  await advanceMediaTo(autoNuzzleAt+4458);assert.notEqual(controller.getSnapshot().gesture?.id,'nuzzle');controller.applySettingsLocal({companionship:'off'});
  assert.deepEqual([...routed].sort(),Object.keys(catalog.clips).sort(),'All29 approved clips route through actual DSH');

  // Deliberately delay current HD: indexed must show this clip, not held old HD.
  blockThink = true; reset(); controller.setDemo('thinking'); await indexed('think');
  let layer = controller.getRenderLayer();
  assert.equal(layer.hiRes, false); assert.ok(layer.displayKey.endsWith('/think'));
  for (const style of ['umi-pixel', 'pixel', 'wumi-pixel']) {
    controller.applySettingsLocal({ style }); await controller.ensureSheet(style);
    assert.equal(controller.getSnapshot().settings.style, 'umi', 'Old styles migrate before asset selection');
    await indexed('think');
    assert.equal(controller.getSnapshot().visual.sheet.width, catalog.clips.think.indexed.umi.width);
    controller.applySettingsLocal({ animation: false });
    assert.equal(controller.getSnapshot().visual.sheet.width, 240);
    assert.equal(controller.getSnapshot().visual.approvedMotion, undefined);
    controller.applySettingsLocal({ animation: true });
  }
  blockThink = false; pending.splice(0).forEach(resolve => resolve()); await nextTurn();
  controller.applySettingsLocal({ style: 'illustration' });
  assert.equal(controller.getSnapshot().settings.style, 'umi', 'Historical illustration alias resolves to the illustrated DSH rendition');
  // Both illustration IDs read the same approved pixels; unmigrated old IDs remain rejected by the lower-level player.
  const player = createApprovedMotionPlayer({ catalog, now: () => clock,
    loadIndexed: async (path, { revision }) => {
      const response=await fetchImpl(`/animated/asset?path=${path}&v=${revision}`);
      return path.endsWith('.json')?response.json():decodeApprovedMotionNodeResource(await response.arrayBuffer());
    } });
  try {
    for (const style of ['umi', 'illustration']) {
      const selection = player.sample({ phase: 'thinking' }, { style });
      await until(() => Boolean(player.indexedFrame(selection, style)), `${style} actual Pi resource loads`);
      const visual = player.indexedFrame(selection, style);
      assert.equal(visual.sheet.width, catalog.clips.think.indexed[style].width);
      assert.equal(visual.motion.scale, 1); assert.equal(visual.transitioning, false);
      assert.ok(player.stats().clips <= 2);
    }
    for (const style of ['umi-pixel', 'pixel']) {
      const before = requests.size;
      assert.equal(player.sample({ phase: 'editing' }, { style }), null);
      assert.equal(player.sample({ phase: 'idle' }, { style, animate: false }), null);
      assert.equal(player.stats().keyboardStage, null);
      assert.equal(requests.size, before, 'Old pixel cannot fetch a new complete-motion rendition');
    }
  } finally { player.dispose(); }
  reset(); await indexed('idle'); controller.applySettingsLocal({ animation: false });
  assert.equal(controller.getSnapshot().approvedMotion, null);
  assert.equal(controller.getSnapshot().visual.approvedMotion, undefined);
  assert.equal(controller.getSnapshot().visual.frame.id, 'idle-open', 'Pause restores the approved static portrait');
  controller.applySettingsLocal({ animation: true, enabled: false });
  assert.equal(controller.getSnapshot().approvedMotion, null); bounded();
  const revision = controller.getSnapshot().revision;
  controller.dispose(); await nextTurn();
  assert.equal(controller.getSnapshot().revision, revision); assert.equal(controller.getRenderLayer(), null); assert.ok(closed > 0);
  console.log(`Actual animated pack: ${routed.size} illustration routes, native paintRect/scale, three native4458ms idle cycle handoffs, nuzzle/bounce/ear-flick/head-shake/peek/wave/stretch manual/auto4458ms plus native106 and all54 full896 fallback pixels, 400ms keyboard chain, historical-style migration/pause/switching and two-clip caches passed (${requests.size} assets read).`);
} finally {
  pending.splice(0).forEach(resolve => resolve()); controller?.dispose();
  Math.random=nativeRandom;
  for (const [key, value] of Object.entries(before)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
