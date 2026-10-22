import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const { catalog, data } = approvedMotionFixture();
const saved = Object.fromEntries(['window', 'document', 'createImageBitmap'].map(key => [key, globalThis[key]]));
let entry, controller, clock = 0, closed = 0;
const decoding = new Map(), requests = [];
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
globalThis.window = { __ModuleLoader__: { load: item => entry = item } };
globalThis.document = { hidden: false, createElement: () => {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
  return canvas;
} };
globalThis.createImageBitmap = blob => new Promise(resolve => decoding.set(blob.path, () => resolve({
  width: 896, height: 896, tag: blob.path, close() { closed++; } })));
const sheet = JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json', import.meta.url), 'utf8'));
const fetchImpl = async url => {
  const u = new URL(String(url), 'http://localhost');
  if (u.pathname.endsWith('/animated/catalog')) return { ok: true, json: async () => catalog };
  if (u.pathname.endsWith('/animated/asset')) {
    const path = u.searchParams.get('path');
    if (path.endsWith('.json')) return { ok: true, json: async () => data[path] };
    requests.push(path); return { ok: true, blob: async () => ({ path }) };
  }
  if (u.pathname.endsWith('/config')) return { ok: true, json: async () => ({ style: 'umi', companionship: 'off' }) };
  if (u.pathname.endsWith('/sheet')) return { ok: true, json: async () => sheet };
  return { ok: false };
};
try {
  await import(new URL('../lib/client.js?approved-hd-delay', import.meta.url));
  controller = entry.factory(() => ({})).createMascotController({ fetchImpl, now: () => clock });
  await controller.init(); await flush(); controller.activity.start({ wake: false }); controller.notifyChange(); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false); await flush();
  assert.equal(requests.length, 4);
  for (clock = 100; clock <= 600; clock += 100) { controller.notifyChange(); controller.getRenderLayer(); }
  assert.equal(requests.length, 4, 'Undecoded requests are bounded while the live frame clock advances');
  assert.equal(controller.cacheStats().approvedHiResDownloads, 4);
  decoding.get('hires/idle/001.webp')(); await flush();
  const firstHD = controller.getRenderLayer();
  assert.equal(firstHD.hiRes, true, 'An already late HD frame can end indexed starvation');
  assert.equal(firstHD.bitmap.tag, 'hires/idle/001.webp');
  assert.equal(firstHD.registered, true); assert.deepEqual(firstHD.paintRect, catalog.clips.idle.paintRect);
  decoding.get('hires/idle/000.webp')(); await flush();
  assert.equal(controller.getRenderLayer().bitmap, firstHD.bitmap, 'An older decode cannot rewind the displayed clip');
  clock = 700; controller.notifyChange();
  assert.equal(controller.getRenderLayer().bitmap, firstHD.bitmap, 'Hold this clip HD while the exact successor is still decoding');
  decoding.get('hires/idle/002.webp')(); await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag, 'hires/idle/002.webp');
  clock = 1000; controller.notifyChange();
  assert.equal(controller.getRenderLayer().bitmap.tag, 'hires/idle/000.webp', 'The next loop cycle may advance naturally to its first frame');
  controller.applySettingsLocal({ style: 'umi-pixel' }); await flush();
  decoding.get('hires/idle/003.webp')(); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false, 'A late illustrated decode cannot take over pixel style');
  controller.applySettingsLocal({ style: 'umi' }); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false, 'A new style epoch starts without retained illustrated bitmaps');
  await flush(); for (const resolve of decoding.values()) resolve(); await flush();
  assert.equal(controller.getRenderLayer().bitmap.tag, 'hires/idle/000.webp', 'Newly decoded illustrated frames use the new style epoch clock');
  controller.activity.handle('agent_start'); controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'think');
  assert.equal(controller.getRenderLayer().hiRes, false, 'An unrelated clip cannot borrow the previous clip HD'); await flush();
  assert.ok(controller.cacheStats().approvedHiResDownloads <= 8);
  const revision = controller.getSnapshot().revision;
  controller.dispose(); for (const resolve of decoding.values()) resolve(); await flush();
  assert.equal(controller.getSnapshot().revision, revision); assert.ok(closed > 0);
  console.log('Approved HD delay: bounded fetch+decode, late same-clip promotion/hold, no backward or future frames, loop wrap, style/clip epoch isolation and disposal passed.');
} finally {
  controller?.dispose();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
