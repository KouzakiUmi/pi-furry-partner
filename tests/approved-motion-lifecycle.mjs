// Real bundled controller: stop obsolete HD work and cap decoded resident bytes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

const { catalog, data } = approvedMotionFixture();
const saved = Object.fromEntries(['window', 'document', 'createImageBitmap'].map(key => [key, globalThis[key]]));
const pending = [], optionsSeen = [];
let entry, controller, clock = 0, hold = true, closed = 0;
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
globalThis.window = { __ModuleLoader__: { load: value => entry = value } };
globalThis.document = { hidden: false, createElement: () => {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
  return canvas;
} };
const bitmap = blob => ({ width: 896, height: 896, tag: blob.path, close() { closed++; } });
globalThis.createImageBitmap = blob => hold ? new Promise(resolve => pending.push(() => resolve(bitmap(blob)))) : Promise.resolve(bitmap(blob));
const sheet = JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json', import.meta.url), 'utf8'));
const fetchImpl = async (url, options = {}) => {
  const u = new URL(String(url), 'http://localhost');
  if (u.pathname.endsWith('/animated/catalog')) return { ok: true, json: async () => catalog };
  if (u.pathname.endsWith('/animated/asset')) {
    const path = u.searchParams.get('path');
    if (path.endsWith('.json')) return { ok: true, json: async () => data[path] };
    optionsSeen.push(options);
    return { ok: true, blob: async () => ({ path }) };
  }
  if (u.pathname.endsWith('/config')) return { ok: true, json: async () => ({ style: 'umi', companionship: 'off' }) };
  if (u.pathname.endsWith('/sheet')) return { ok: true, json: async () => sheet };
  return { ok: false };
};
function emptyHD(reason) {
  const stats = controller.cacheStats();
  assert.equal(stats.approvedHiResClips, 0, reason);
  assert.equal(stats.approvedHiResDownloads, 0, reason);
  assert.equal(stats.approvedHiResBytes, 0, reason);
}
try {
  await import(new URL('../lib/client.js?approved-lifecycle', import.meta.url));
  controller = entry.factory(() => ({})).createMascotController({ fetchImpl, now: () => clock });
  await controller.init(); await flush();
  controller.activity.start({ wake: false }); controller.notifyChange(); await flush();
  controller.getRenderLayer(); await flush();
  assert.equal(controller.cacheStats().approvedHiResDownloads, 4);
  controller.applySettingsLocal({ style: 'umi-pixel' });
  assert.equal(controller.getSnapshot().settings.style, 'umi');
  controller.applySettingsLocal({ animation: false }); await flush();
  emptyHD('Pause stops the illustrated HD pipeline');
  assert.ok(optionsSeen.slice(0, 4).every(options => options.signal.aborted), 'In-flight HD requests are aborted');
  pending.splice(0).forEach(resolve => resolve()); await flush();
  assert.equal(closed, 4, 'Late completed image decodes are closed instead of becoming resident');
  hold = false;
  controller.applySettingsLocal({ animation: true }); await flush();
  controller.activity.handle('tool_execution_start', { toolCallId: 'lifecycle-edit', toolName: 'edit' });
  for (clock = 0; clock < 400; clock += 16) {
    controller.notifyChange(); controller.getRenderLayer(); await flush(); controller.getRenderLayer();
    const stats = controller.cacheStats();
    assert.ok(stats.approvedHiResBytes <= stats.maxApprovedHiResBytes, 'Native frames respect the shared byte budget');
    assert.ok(stats.approvedHiResClips <= 2);
  }
  assert.ok(controller.cacheStats().approvedHiResFrames > 0);
  assert.ok(closed > 4, 'Traversing the 24-frame entry evicts and closes old decoded frames');
  controller.applySettingsLocal({ animation: false }); emptyHD('Pause releases complete-frame animation resources');
  controller.getRenderLayer(); emptyHD('Paused rendering does not restart HD loop fetches');
  controller.applySettingsLocal({ animation: true }); controller.notifyChange(); controller.getRenderLayer(); await flush();
  globalThis.document.hidden = true; controller.notifyChange(); emptyHD('A hidden page releases motion bitmaps');
  controller.getRenderLayer(); emptyHD('Hidden rendering cannot restart HD loop requests');
  globalThis.document.hidden = false; controller.notifyChange(); controller.getRenderLayer(); await flush();
  controller.applySettingsLocal({ enabled: false }); emptyHD('Disabling the pet releases motion bitmaps');
  console.log('Approved HD lifecycle: abort/late close, pause/hidden/disabled release, shared decoded-byte budget and bounded chain prefetch passed.');
} finally {
  controller?.dispose(); pending.splice(0).forEach(resolve => resolve()); await flush();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
