import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const { catalog, data } = approvedMotionFixture();
// Production-like 24fps HD / 12fps indexed, so lateness and recovery exercise
// real cadence rather than the broad 250ms fixture slots.
const idle = catalog.clips.idle;
idle.hires.frames = Array.from({ length: 24 }, (_, i) => ({ id: `idle-${i}`, file: `${String(i).padStart(3, '0')}.webp`, atMs: i * 1000 / 24 }));
idle.frameCount = 24;
for (const [style, meta] of Object.entries(idle.indexed)) {
  meta.frameCount = 12;
  data[meta.file].frames = Array.from({ length: 12 }, (_, i) => ({ id: `idle-${i}`, atMs: i * 1000 / 12, pixels: [0, 1, i % 2 ? 2 : 1, 0] }));
}
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
  clock = 40; controller.notifyChange();
  decoding.get('hires/idle/000.webp')(); await flush();
  const firstHD = controller.getRenderLayer();
  assert.equal(firstHD.hiRes, true);
  assert.equal(firstHD.bitmap.tag, 'hires/idle/000.webp');
  assert.equal(firstHD.registered, true); assert.deepEqual(firstHD.paintRect, idle.paintRect);
  clock = 90; controller.notifyChange();
  assert.equal(controller.getRenderLayer().bitmap, firstHD.bitmap, 'Brief HD lateness holds a registered frame without a quality flash'); await flush();
  clock = 200; controller.notifyChange();
  const fallback = controller.getRenderLayer(); await flush();
  assert.equal(fallback.hiRes, false, 'HD older than150ms yields to live indexed playback');
  assert.equal(fallback.registered, true);
  assert.deepEqual(fallback.display, { ...fallback.display, scale: 1, x: 0, y: 0 });
  assert.equal(fallback.transform, null);
  decoding.get('hires/idle/001.webp')(); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false, 'An obsolete decode cannot bring stale HD back'); await flush();
  clock = 210; controller.notifyChange(); decoding.get('hires/idle/002.webp')(); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false, 'A single fresher decode cannot flash back to HD'); await flush();
  clock = 220; controller.notifyChange(); decoding.get('hires/idle/003.webp')(); await flush();
  controller.getRenderLayer(); await flush();
  assert.ok(controller.cacheStats().approvedHiResDownloads <= 4, 'Catch-up retains the four-request limit');
  // Complete the obsolete in-flight window. The next requests must follow
  // current time, not replay all missing historical frames.
  for (const id of ['004', '005', '006', '007']) decoding.get(`hires/idle/${id}.webp`)?.();
  await flush();
  clock = 470; controller.notifyChange(); controller.getRenderLayer(); await flush();
  assert.ok(decoding.has('hires/idle/011.webp'), 'Bounded catch-up requests the live frame');
  decoding.get('hires/idle/011.webp')(); await flush();
  assert.equal(controller.getRenderLayer().hiRes, false, 'Recovery waits for contiguous lookahead rather than one lucky frame'); await flush();
  decoding.get('hires/idle/012.webp')(); await flush(); decoding.get('hires/idle/013.webp')(); await flush();
  const recovered = controller.getRenderLayer();
  assert.equal(recovered.hiRes, true); assert.equal(recovered.bitmap.tag, 'hires/idle/011.webp');
  assert.equal(recovered.registered, true); assert.deepEqual(recovered.paintRect, idle.paintRect);
  assert.equal(recovered.display.scale, fallback.display.scale);
  assert.equal(recovered.display.x, fallback.display.x); assert.equal(recovered.display.y, fallback.display.y);
  clock = 480; controller.notifyChange();
  assert.equal(controller.getRenderLayer().bitmap, recovered.bitmap, 'Recovered playback does not rewind to an old decoded bitmap');
  clock = 1000; controller.notifyChange();
  assert.equal(controller.getRenderLayer().bitmap.tag, 'hires/idle/000.webp', 'The next loop cycle advances naturally to its first frame');
  controller.applySettingsLocal({ style: 'umi-pixel' }); await flush();
  decoding.get('hires/idle/014.webp')?.(); await flush();
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
  console.log('Approved HD delay: bounded150ms hold, stable indexed fallback, cooldown/buffered recovery, four-request live catch-up, fixed world anchor, loop/style isolation and disposal passed.');
} finally {
  controller?.dispose();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
