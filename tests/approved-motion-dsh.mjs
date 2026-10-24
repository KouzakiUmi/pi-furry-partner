import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
import { petPaintGeometry, floatingPetGeometry } from '../lib/dsh-presentation.mjs';
const { catalog, data } = approvedMotionFixture();
for (const frame of data["indexed/umi/watch.json"].frames) frame.pixels = [2, 0, 2, 1];
const before = { window: globalThis.window, document: globalThis.document, createImageBitmap: globalThis.createImageBitmap };
let entry, clock = 0, closed = 0, controller;
const pending = new Map(), painted = [];
globalThis.window = { __ModuleLoader__: { load: item => entry = item } };
globalThis.document = { hidden: false, createElement: () => {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
  return canvas;
} };
globalThis.createImageBitmap = async blob => ({ width: 896, height: 896, tag: blob.path, close() { closed++; } });
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const rawSheet = JSON.parse(await readFile(new URL('../assets/reactions/umi/reaction-sheet.json', import.meta.url), 'utf8'));
const fetchImpl = async (url, options = {}) => {
  const u = new URL(String(url), 'http://localhost');
  if (u.pathname.endsWith('/animated/catalog')) return { ok: true, json: async () => catalog };
  if (u.pathname.endsWith('/animated/asset')) {
    assert.equal(u.searchParams.get('v'), catalog.revision);
    const path = u.searchParams.get('path');
    if (path.endsWith('.json')) return { ok: true, json: async () => data[path] };
    painted.push(path);
    if (path.startsWith('hires/think/') || path.startsWith('hires/work-enter/'))
      return new Promise(resolve => pending.set(path, () => resolve({ ok: true, blob: async () => ({ path }) })));
    return { ok: true, blob: async () => ({ path }) };
  }
  if (u.pathname.endsWith('/config')) return { ok: true, json: async () => ({ style: 'umi', language: 'en', companionship: 'off' }) };
  if (u.pathname.endsWith('/sheet')) return { ok: true, json: async () => ({ ...rawSheet, gestureCatalog: { clips: {} } }) };
  return { ok: false };
};
try {
  await import(new URL('../lib/client.js?approved-integration', import.meta.url));
  const plugin = entry.factory(() => ({}));
  // Isolate codec/geometry/routing boundaries; production dwell is covered by action-dwell-dsh.
  controller = plugin.createMascotController({ fetchImpl, now: () => clock, minimumActionMs: 0 });
  await controller.init(); await flush();
  controller.activity.start({ wake: false }); controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'idle');
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'idle');
  controller.getRenderLayer(); await flush();
  let layer = controller.getRenderLayer();
  assert.equal(layer.hiRes, true); assert.deepEqual(layer.paintRect, catalog.clips.idle.paintRect);
  assert.equal(layer.display.scale, 1); assert.equal(layer.display.x, 0); assert.equal(layer.display.y, 0);
  assert.equal(layer.transform, null); assert.equal(layer.registered, true);
  const drawCalls = [], effects = [];
  const drawing = { clearRect() {}, save() {}, restore() {}, scale() {}, translate() {},
    drawImage: (...args) => drawCalls.push(args.slice(1)) };
  const canvas = { width: 0, height: 0, getContext: () => drawing };
  const React = { createElement: (type, props) => ({ type, props }), useRef: () => ({ current: canvas }),
    useEffect: callback => effects.push(callback), useSyncExternalStore: (_, get) => get() };
  const node = plugin.createMascotComponents(React, controller).MascotCanvas({ size: 196, desktop: true });
  canvas.width = node.props.width; canvas.height = node.props.height;
  effects.forEach(effect => effect());
  assert.deepEqual(drawCalls[0], [-128, 0, 896, 896], 'Actual DSH canvas paints the authored source rect without squeezing it into640');
  assert.equal(node.props.width, Math.round(640 * 1.51));
  assert.equal(node.props.height, Math.round(640 * 1.76));
  controller.activity.handle('agent_start'); controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'think');
  layer = controller.getRenderLayer(); assert.equal(layer.hiRes, false);
  assert.ok(layer.displayKey.endsWith('/think'), 'A missing HD frame paints current indexed think, never held idle');
  controller.applySettingsLocal({ style: 'umi-pixel' }); await controller.ensureSheet('umi-pixel'); await flush();
  for (const resolve of pending.values()) resolve(); pending.clear(); await flush();
  assert.equal(controller.getSnapshot().settings.style, 'umi', 'Historical pixel input migrates to illustration');
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'think');
  assert.equal(controller.getSnapshot().visual.sheet.width, 2, 'The approved indexed fixture stays selected after alias migration');
  controller.applySettingsLocal({ animation: false });
  assert.equal(controller.getSnapshot().visual.approvedMotion, undefined, 'Paused illustration uses its static authored frame');
  assert.equal(controller.getSnapshot().visual.sheet.width, 240);
  controller.applySettingsLocal({ animation: true });
  controller.applySettingsLocal({ style: 'umi' }); await flush();
  controller.activity.handle('tool_execution_start', { toolCallId: 'edit', toolName: 'edit' });
  controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().snapshot.phase, 'editing');
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-enter');
  controller.getRenderLayer();
  clock = 399; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-enter');
  clock = 400; controller.notifyChange(); await flush(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work');
  controller.activity.handle('tool_execution_end', { toolCallId: 'edit' });
  controller.activity.handle('message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'x' } });
  clock = 450; controller.notifyChange(); await flush();
  assert.notEqual(controller.getSnapshot().snapshot.phase, 'editing', 'Actual tool state does not wait for visual exit');
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-exit');
  controller.activity.start({ wake: false }); controller.activity.noteTyping(); clock = 500; controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'listen');
  assert.equal(controller.cacheStats().approved.keyboardStage, null);
  controller.activity.start({ wake: false }); controller.notifyChange();
  assert.equal(controller.playGesture('cry'), true); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'cry');
  controller.getRenderLayer(); await flush(); layer = controller.getRenderLayer();
  assert.equal(layer.display.scale, 1); assert.deepEqual(layer.paintRect, catalog.clips.cry.paintRect);
  controller.applySettingsLocal({ animation: false });
  assert.equal(controller.getSnapshot().approvedMotion, null);
  assert.equal(controller.getSnapshot().visual.approvedMotion, undefined, 'Pause never latches a state-video frame');
  controller.playGesture('off'); controller.activity.poke(); controller.notifyChange();
  const pokeFirst = controller.getSnapshot().visual;
  assert.equal(controller.getSnapshot().snapshot.reaction, 'poked');
  assert.equal(pokeFirst.frame.id, 'poke');
  clock += 100; controller.notifyChange();
  const pokeMoving = controller.getSnapshot().visual;
  assert.notEqual(pokeMoving.cacheKey, pokeFirst.cacheKey, 'An explicit paused DSH poke animates temporarily');
  assert.notDeepEqual(pokeMoving.frame.pixels, pokeFirst.frame.pixels, 'The temporary feedback moves real approved pixels');
  assert.equal(controller.getSnapshot().settings.animation, false, 'Temporary poke does not change the paused preference');
  clock += 1100; controller.notifyChange();
  assert.notEqual(controller.getSnapshot().snapshot.reaction, 'poked');
  assert.equal(controller.getSnapshot().visual.frame.id, 'idle-open');
  // Actual controller activity, decoded indexed output and paused static sources
  // must all use the same reading/execution meaning.
  controller.applySettingsLocal({ animation: true });
  clock = 6000; controller.activity.start({ wake: false });
  controller.activity.handle('agent_start');
  controller.activity.handle('tool_execution_start', { toolCallId: 'run-routing', toolName: 'bash' });
  controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().snapshot.phase, 'running');
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-enter');
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'work-enter');
  clock = 6399; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-enter');
  clock = 6400; controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'work');
  controller.activity.handle('tool_execution_start', { toolCallId: 'read-routing', toolName: 'read' });
  controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().snapshot.phase, 'reading');
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'watch', 'A real read cancels the keyboard immediately');
  assert.deepEqual(Array.from(controller.getSnapshot().visual.frame.pixels), [2, 0, 2, 1], 'Actual read output contains the distinct magnifier pixels');
  assert.equal(controller.cacheStats().approved.keyboardStage, null);
  controller.applySettingsLocal({ animation: false }); controller.notifyChange();
  assert.equal(controller.getSnapshot().visual.frame.id, 'watch', 'Paused reading keeps the original magnifier pose');
  controller.activity.handle('tool_execution_end', { toolCallId: 'read-routing' }); controller.notifyChange();
  assert.equal(controller.getSnapshot().visual.frame.id, 'work', 'Paused execution keeps the original keyboard pose');
  assert.equal(controller.getRenderLayer().displayKey, 'poses/work', 'The actual paused render layer also selects keyboard, never the old magnifier override');
  controller.applySettingsLocal({ animation: true });
  clock = 6800; controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'work');
  controller.activity.handle('tool_execution_end', { toolCallId: 'run-routing' });
  controller.activity.handle('message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'x' } });
  clock = 6850; controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().visual.approvedMotion.clipId, 'work-exit');
  clock = 7249; controller.notifyChange(); assert.equal(controller.getSnapshot().approvedMotion.clipId, 'work-exit');
  clock = 7250; controller.notifyChange(); await flush();
  assert.equal(controller.getSnapshot().approvedMotion.clipId, 'think');
  controller.applySettingsLocal({ animation: true, enabled: false });
  assert.equal(controller.getSnapshot().approvedMotion, null);
  const stats = controller.cacheStats();
  assert.ok(stats.approved.clips <= 2); assert.ok(stats.approvedHiResClips <= 2);
  const revision = controller.getSnapshot().revision;
  controller.dispose(); for (const resolve of pending.values()) resolve(); await flush();
  assert.equal(controller.getSnapshot().revision, revision);
  assert.equal(controller.getRenderLayer(), null); assert.ok(closed > 0);

  const paint = petPaintGeometry(640, true, true);
  assert.ok(paint.left <= -128); assert.ok(paint.left + paint.width >= 768);
  assert.ok(paint.top + paint.height >= 896, 'Approved keyboard motion and cry retain their authored overflow');
  for (const viewport of [{ w: 1334, h: 1057 }, { w: 360, h: 640 }]) {
    const position = floatingPetGeometry(196, viewport, {}, true, true), rect = petPaintGeometry(position.size, true, true);
    assert.ok(position.top + rect.top >= 8 - 1e-8);
    assert.ok(position.top + rect.top + rect.height <= viewport.h - 8 + 1e-8);
  }
  console.log('Approved DSH controller: real bundle, HD paintRect/ordinary scale, delayed-load and style fallback, keyboard400ms/typing interruption, pause/static, bounded cache and disposal passed.');
} finally {
  controller?.dispose();
  for (const [key, value] of Object.entries(before)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
}
