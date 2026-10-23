// Read-only audit of actual DSH controller selection and real exported pixels.
// Browser bitmap plumbing is mocked; selected PNG/WebP RGBA is decoded by Pillow.
// --require-all deliberately fails while a public gesture still has no real motion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { loadAnimatedCatalog, loadAnimatedAsset, loadEncodedSheet, loadEncodedGesture, loadHiResManifest, loadHiResFrame } from '../lib/index.js';
import { GESTURES } from '../lib/gestures.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');
const catalog = loadAnimatedCatalog(), hires = loadHiResManifest();
const saved = Object.fromEntries(['window', 'document', 'createImageBitmap', 'setTimeout', 'clearTimeout'].map(k => [k, globalThis[k]]));
let entry, controller, wall = 0;
function canvas() {
  const c = { width: 0, height: 0 };
  c.getContext = () => ({ drawImage(image) { c.sourcePath = image.sourcePath; }, clearRect() {},
    getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
  return c;
}
function dimensions(b) {
  if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let at = 12; at + 8 <= b.length;) {
    const kind = b.toString('ascii', at, at + 4), n = b.readUInt32LE(at + 4), p = at + 8;
    if (kind === 'VP8X') return [b.readUIntLE(p + 4, 3) + 1, b.readUIntLE(p + 7, 3) + 1];
    if (kind === 'VP8L') { const bits = b.readUInt32LE(p + 1); return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    at = p + n + (n % 2);
  }
  throw Error('Unknown bitmap dimensions');
}
const respond = (b, sourcePath) => ({ ok: Boolean(b), json: async () => JSON.parse(b),
  arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), blob: async () => ({ bytes: b, sourcePath }) });
async function fetchImpl(url) {
  const u = new URL(String(url), 'http://audit');
  if (u.pathname.endsWith('/config')) return { ok: true, json: async () => ({ style: 'umi', animation: true, enabled: true, companionship: 'off', language: 'en' }) };
  if (u.pathname.endsWith('/animated/catalog')) return { ok: true, json: async () => catalog };
  if (u.pathname.endsWith('/sheet')) return { ok: true, json: async () => loadEncodedSheet(u.searchParams.get('style')) };
  if (u.pathname.endsWith('/gesture')) { const a = loadEncodedGesture(u.searchParams.get('style'), u.searchParams.get('action')); return { ok: Boolean(a), json: async () => a }; }
  if (u.pathname.endsWith('/hires/manifest')) return { ok: true, json: async () => hires };
  if (u.pathname.endsWith('/animated/asset')) {
    const path = u.searchParams.get('path'), a = loadAnimatedAsset(path, u.searchParams.get('v'));
    return respond(a?.bytes, resolve(root, 'assets/animated', path));
  }
  if (u.pathname.endsWith('/hires/frame')) {
    const kind = u.searchParams.get('kind'), id = u.searchParams.get('id'), b = loadHiResFrame(kind, id);
    const folder = kind === 'poses' ? 'poses' : kind;
    let path = resolve(root, 'assets/hires/umi', folder, id + '.png');
    // Existing HD banks can be either PNG or WebP. Resolve the actual bytes.
    for (const suffix of ['.png', '.webp']) {
      const candidate = resolve(root, 'assets/hires/umi', folder, id + suffix);
      try { if (b && readFileSync(candidate).equals(b)) { path = candidate; break; } } catch {}
    }
    return respond(b, path);
  }
  return { ok: false };
}
globalThis.window = { __ModuleLoader__: { load: value => entry = value } };
globalThis.document = { hidden: false, createElement: canvas };
globalThis.createImageBitmap = async blob => { const [width, height] = dimensions(blob.bytes); return { width, height, sourcePath: blob.sourcePath, close() {} }; };
globalThis.setTimeout = () => ({ unref() {} }); globalThis.clearTimeout = () => {};
const matrix = [];
try {
  await import(pathToFileURL(resolve(root, 'lib/client.js')));
  controller = entry.factory(() => ({})).createMascotController({ fetchImpl, now: () => wall });
  await controller.init(); await controller.ensureApprovedCatalog();
  for (const gesture of GESTURES) {
    controller.playGesture('off'); controller.setDemo('off'); controller.activity.start({ wake: false });
    wall += 100; controller.notifyChange();
    assert.equal(controller.playGesture(gesture.id), true, `${gesture.id}: public command accepted`);
    const samples = [];
    for (let target = 0, next = 0; target <= .8; target += .2) {
      const duration = catalog.clips[gesture.id]?.periodMs ?? gesture.durationMs, desired = Math.round(duration * target);
      while (next < desired) { const dt = Math.min(25, desired - next); next += dt; wall += dt; controller.notifyChange(); controller.getRenderLayer(); await wait(1); }
      const deadline = Date.now() + 5000; let state, layer;
      do { state = controller.getSnapshot(); layer = controller.getRenderLayer(state); if (layer?.hiRes && layer.bitmap?.sourcePath) break; await wait(5); controller.notifyChange(); } while (Date.now() < deadline);
      assert.ok(state?.visual?.frame?.pixels, `${gesture.id}: actual indexed pixels`);
      assert.ok(layer?.bitmap?.sourcePath, `${gesture.id}: actual final bitmap route ${JSON.stringify({ layer: layer && { ...layer, bitmap: { width: layer.bitmap?.width, height: layer.bitmap?.height, sourcePath: layer.bitmap?.sourcePath } }, approved: state.approvedMotion?.clipId, stats: controller.cacheStats() })}`);
      const pixels = state.visual.frame.pixels;
      samples.push({ elapsedMs: state.gesture?.elapsedMs, approvedClipId: state.approvedMotion?.clipId ?? null,
        indexedFrameId: state.visual.frame.id, indexedPixelsSha256: sha(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)),
        motion: state.visual.motion, renderDisplayKey: layer.displayKey, renderTransform: layer.transform ?? null,
        renderSourcePath: layer.bitmap.sourcePath, renderPaintRect: layer.paintRect ?? null });
    }
    matrix.push({ id: gesture.id, label: gesture.labels[0], accepted: true, approvedCatalogHasClip: Boolean(catalog.clips[gesture.id]),
      optionalIndexedCatalogHasClip: Boolean(loadEncodedSheet('umi').gestureCatalog.clips[gesture.id]),
      optionalHdCatalogHasClip: Boolean(hires.animations?.gestures?.[gesture.id]), samples });
  }
} finally {
  controller?.dispose();
  for (const [k, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[k]; else globalThis[k] = value; }
}
const paths = [...new Set(matrix.flatMap(row => row.samples.map(s => s.renderSourcePath)))];
const decoded = spawnSync('python', ['-c', 'import sys,json,hashlib;from PIL import Image;print(json.dumps({p:hashlib.sha256(Image.open(p).convert("RGBA").tobytes()).hexdigest() for p in json.load(sys.stdin)}))'],
  { input: JSON.stringify(paths), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
assert.equal(decoded.status, 0, decoded.stderr); const rgba = JSON.parse(decoded.stdout);
for (const row of matrix) {
  row.samples.forEach(s => { s.renderDecodedRgbaSha256 = rgba[s.renderSourcePath]; });
  row.renderedPixelVariants = new Set(row.samples.map(s => s.renderDecodedRgbaSha256)).size;
  row.indexedPixelVariants = new Set(row.samples.map(s => s.indexedPixelsSha256)).size;
  row.realApprovedMotion = row.approvedCatalogHasClip && row.renderedPixelVariants > 1 && row.samples.every(s => s.approvedClipId === row.id);
  row.classification = row.realApprovedMotion ? 'REAL_APPROVED_CONTINUOUS_CLIP' : 'PUBLIC_COMMAND_WITHOUT_CORRESPONDING_CONTINUOUS_CLIP';
  if (row.approvedCatalogHasClip) assert.ok(row.realApprovedMotion, `${row.id}: approved gesture must change real rendered RGBA`);
}
const missing = matrix.filter(row => !row.realApprovedMotion).map(row => row.id);
console.log(JSON.stringify({ scope: 'Actual shipped DSH controller, exported indexed pixels, final render-layer source and real decoded PNG/WebP RGBA; no asset mutations',
  bitmapMockScope: 'Canvas plumbing is mocked; actual final source bitmap files independently decoded with Pillow. This is routing/pixel-change evidence, not a human video review.',
  revision: catalog.revision, publicGestures: matrix.length, realContinuousGestures: matrix.length - missing.length, missing, matrix }));
if (process.argv.includes('--require-all') && missing.length) process.exitCode = 1;
