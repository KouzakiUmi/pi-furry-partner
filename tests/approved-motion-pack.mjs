// Real exported resources through the host, runtime and shipped DSH bundle.
// Only bitmap decoding is mocked; dimensions come from each actual WebP header.
import assert from 'node:assert/strict';
import { setImmediate as nextTurn, setTimeout as wait } from 'node:timers/promises';
import { loadAnimatedCatalog, loadAnimatedAsset, loadEncodedSheet } from '../lib/index.js';
import { createApprovedMotionPlayer, normalizeApprovedMotionCatalog } from '../lib/approved-motion.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';

const catalog = loadAnimatedCatalog();
const normalized = normalizeApprovedMotionCatalog(catalog);
assert.equal(Object.keys(normalized.clips).length, 19);
assert.deepEqual(normalized.anchor, [320, 608]);
assert.equal(normalized.chain.enterDurationMs, 400);
assert.equal(normalized.chain.exitDurationMs, 400);
const before = Object.fromEntries(['window', 'document', 'createImageBitmap'].map(k => [k, globalThis[k]]));
let entry, controller, clock = 0, closed = 0, blockThink = false;
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
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
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
  await until(() => controller.getSnapshot().visual?.approvedMotion?.clipId === id, `Actual indexed ${id} loaded`);
  bounded();
}
async function hd(id) {
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
  for (const [demo, id] of [['thinking', 'think'], ['waiting', 'wait'], ['cancelled', 'rest'], ['running', 'watch'], ['searching', 'search']]) {
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
  clock = enterAt + 450; controller.notifyChange(); const exitAt = clock;
  await hd('work-exit');
  assert.notEqual(controller.getSnapshot().snapshot.phase, 'editing', 'Real tool state finishes before its visual exit');
  clock = exitAt + 399; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-exit');
  clock = exitAt + 400; controller.notifyChange(); await indexed('think');
  for (const id of ['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']) {
    reset(); assert.equal(controller.playGesture(id), true); await hd(id);
  }
  assert.deepEqual([...routed].sort(), Object.keys(catalog.clips).sort(), 'All 17 core clips plus both transitions route through DSH');

  // Exercise the shipped renderer with a native 896 canvas and explicit overflow.
  const effects = [], drawCalls = [], drawing = { clearRect() {}, save() {}, restore() {}, scale() {}, translate() {}, drawImage: (...args) => drawCalls.push(args.slice(1)) };
  const canvas = { width: 0, height: 0, getContext: () => drawing };
  const React = { createElement: (type, props) => ({ type, props }), useRef: () => ({ current: canvas }), useEffect: cb => effects.push(cb), useSyncExternalStore: (_, get) => get() };
  const node = plugin.createMascotComponents(React, controller).MascotCanvas({ size: 196, desktop: true });
  canvas.width = node.props.width; canvas.height = node.props.height; effects.forEach(cb => cb());
  const { x, y, width, height } = catalog.clips.affection.paintRect;
  assert.deepEqual(drawCalls[0], [x, y, width, height], 'Actual canvas paints native scale with world translation');

  // Deliberately delay current HD: indexed must show this clip, not held old HD.
  blockThink = true; reset(); controller.setDemo('thinking'); await indexed('think');
  let layer = controller.getRenderLayer();
  assert.equal(layer.hiRes, false); assert.ok(layer.displayKey.endsWith('/think'));
  controller.applySettingsLocal({ style: 'umi-pixel' }); await controller.ensureSheet('umi-pixel');
  await until(() => controller.getSnapshot().visual?.sheet?.width === 100, 'Original pixel bank loads');
  blockThink = false; pending.splice(0).forEach(resolve => resolve()); await nextTurn();
  for (const style of ['umi-pixel', 'pixel']) {
    controller.applySettingsLocal({ style }); await controller.ensureSheet(style);
    await until(() => controller.getSnapshot().visual?.sheet?.width === 100, `${style} resolves to the original pixel bank`);
    assert.equal(controller.getSnapshot().approvedMotion, null);
    assert.equal(controller.getSnapshot().visual.approvedMotion, undefined);
    assert.equal(controller.getSnapshot().approvedMotionReady, false);
    layer = controller.getRenderLayer(); assert.equal(layer.hiRes, false, 'Delayed illustrated HD cannot take over another style');
    assert.equal(layer.width, 100); bounded();
    controller.applySettingsLocal({ animation: false });
    assert.equal(controller.getSnapshot().visual.sheet.width, 100);
    assert.equal(controller.getSnapshot().visual.approvedMotion, undefined, 'Paused old pixel never enters the approved static branch');
    controller.applySettingsLocal({ animation: true });
  }
  controller.applySettingsLocal({ style: 'illustration' });
  assert.equal(controller.getSnapshot().settings.style, 'umi', 'Historical illustration alias resolves to the illustrated DSH rendition');
  // Both illustration IDs read the same approved pixels; pixel stays ordinary.
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
  console.log(`Actual animated pack: ${routed.size} illustration routes, native paintRect/scale, 400ms keyboard chain, old-pixel fallback/pause/switching and two-clip caches passed (${requests.size} assets read).`);
} finally {
  pending.splice(0).forEach(resolve => resolve()); controller?.dispose();
  for (const [key, value] of Object.entries(before)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
