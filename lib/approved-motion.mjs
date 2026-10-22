// Approved complete-frame motion, shared by Pi and DSH. This display clock
// never changes the activity snapshot or borrows the ordinary sprite rig.
import { stateExpressionId } from './expressions.mjs';
import { decodeApprovedMotionBinary } from './approved-motion-codec.mjs';
import { approvedMotionStyle } from './build-profile.mjs';

export const APPROVED_MOTION_STATES = Object.freeze({ idle: 'idle', thinking: 'think', reading: 'work', editing: 'work',
  listening: 'listen', waiting: 'wait', dozing: 'rest', cancelled: 'rest', running: 'watch', searching: 'search', compacting: 'search' });
const approvedMotionEmotionIds = new Set(['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']);
const approvedMotionClipIds = new Set([...Object.values(APPROVED_MOTION_STATES), ...approvedMotionEmotionIds, 'work-enter', 'work-exit']);
const approvedMotionHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
export function approvedMotionPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length < 240 && !/[\\?#:%\u0000]/.test(path) &&
    !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..');
}
function approvedMotionQa(qa) {
  return qa?.accepted === true && qa.perFrameFit === false &&
    ['manifestSha256', 'userApprovalSha256', 'sourceVideoSha256'].every(key => approvedMotionHash(qa[key]));
}
function approvedMotionTimeline(frames, periodMs) {
  return Array.isArray(frames) && frames.length >= 2 && frames.length <= 512 && frames[0]?.atMs === 0 &&
    new Set(frames.map(f => f?.id)).size === frames.length && frames.every((f, i) =>
      typeof f?.id === 'string' && f.id.length > 0 && f.id.length < 120 && Number.isFinite(f.atMs) &&
      f.atMs >= 0 && f.atMs < periodMs && (!i || f.atMs > frames[i - 1].atMs));
}
export function normalizeApprovedMotionCatalog(raw) {
  if (raw?.schemaVersion !== 1 || typeof raw.revision !== 'string' || !raw.revision ||
      typeof raw.approvedStaticRevision !== 'string' || !raw.approvedStaticRevision ||
      raw.logicalCanvas?.width !== 640 || raw.logicalCanvas?.height !== 640) return null;
  const clips = {};
  for (const [id, clip] of Object.entries(raw.clips || {})) {
    const rect = clip?.paintRect;
    if (!approvedMotionClipIds.has(id) || clip?.id !== id || !['state', 'gesture', 'action', 'transition'].includes(clip.family) ||
        !Number.isFinite(clip.periodMs) || clip.periodMs < 80 || clip.periodMs > 15000 || typeof clip.loop !== 'boolean' ||
        !approvedMotionQa(clip.qa) || !rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k])) ||
        rect.width <= 0 || rect.height <= 0 || rect.width > 2048 || rect.height > 2048 || Math.abs(rect.x) > 2048 || Math.abs(rect.y) > 2048 ||
        !approvedMotionTimeline(clip.hires?.frames, clip.periodMs) || clip.frameCount !== clip.hires.frames.length ||
        typeof clip.hires.baseUrl !== 'string' || !approvedMotionPath(`${clip.hires.baseUrl}frame.webp`) || !clip.hires.baseUrl.endsWith('/') ||
        clip.hires.frames.some(f => !approvedMotionPath(f.file))) continue;
    const indexed = {};
    for (const [style, entry] of Object.entries(clip.indexed || {})) {
      if (['umi', 'umi-pixel', 'pixel', 'illustration'].includes(style) && approvedMotionPath(entry?.file) &&
          Number.isInteger(entry.width) && entry.width > 0 && entry.width <= 640 && Number.isInteger(entry.height) && entry.height > 0 && entry.height <= 640 &&
          Number.isInteger(entry.frameCount) && entry.frameCount >= 2 && entry.frameCount <= 256 && entry.width * entry.height * entry.frameCount <= 12000000) indexed[style] = { ...entry };
    }
    clips[id] = { ...clip, paintRect: { ...rect }, indexed, hires: { ...clip.hires, frames: clip.hires.frames.map(f => ({ ...f })) } };
  }
  const chain = raw.chain;
  const validChain = chain?.enterClip === 'work-enter' && chain.loopClip === 'work' && chain.exitClip === 'work-exit' &&
    chain.enterDurationMs === 400 && chain.exitDurationMs === 400 && ['work-enter', 'work', 'work-exit'].every(id => clips[id]) &&
    clips['work-enter'].periodMs === 400 && clips['work-exit'].periodMs === 400;
  return { ...raw, clips, chain: validChain ? { ...chain } : null };
}
export function approvedMotionFrameAt(frames, elapsedMs, periodMs, loop = true) {
  const t = loop ? ((elapsedMs % periodMs) + periodMs) % periodMs : Math.min(periodMs - .0001, Math.max(0, elapsedMs));
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (frames[mid].atMs <= t) lo = mid; else hi = mid - 1; }
  return { index: lo, frame: frames[lo], elapsedMs: t, nextInMs: Math.max(1, (frames[lo + 1]?.atMs ?? periodMs) - t) };
}
export function decodeApprovedMotionIndexed(raw, catalog, clip, style) {
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) raw = decodeApprovedMotionBinary(raw);
  const meta = clip?.indexed?.[style];
  if (!meta || raw?.schemaVersion !== 1 || raw.clipId !== clip.id || raw.revision !== catalog.revision ||
      raw.width !== meta.width || raw.height !== meta.height || raw.periodMs !== clip.periodMs || raw.loop !== clip.loop || raw.transparentIndex !== 0 ||
      !approvedMotionQa(raw.qa) || ['manifestSha256', 'userApprovalSha256', 'sourceVideoSha256'].some(key => raw.qa[key] !== clip.qa[key]) ||
      !approvedMotionTimeline(raw.frames, raw.periodMs) || raw.frames.length !== meta.frameCount ||
      !Array.isArray(raw.palette) || raw.palette.length < 2 || raw.palette.length > 512 ||
      raw.palette.some(c => !Array.isArray(c) || c.length !== 3 || c.some(n => !Number.isInteger(n) || n < 0 || n > 255))) return null;
  const count = raw.width * raw.height, PixelArray = raw.palette.length > 256 ? Uint16Array : Uint8Array;
  if (raw.frames.some(f => !(Array.isArray(f.pixels) || ArrayBuffer.isView(f.pixels)) || f.pixels.length !== count ||
      (!(f.pixels instanceof Uint8Array && raw.palette.length === 256) &&
       f.pixels.some(p => !Number.isInteger(p) || p < 0 || p >= raw.palette.length)))) return null;
  const frames = raw.frames.map(f => ({ ...f, cacheKey: `approved:${catalog.revision}/${style}/${clip.id}/${f.id}`,
    pixels: f.pixels instanceof PixelArray ? f.pixels : PixelArray.from(f.pixels) }));
  return { ...raw, frames, ids: Object.fromEntries(frames.map((f, i) => [f.id, i])),
    approvedStaticRevision: catalog.approvedStaticRevision, motion: { approvedWholeFrames: true } };
}
export function approvedMotionStaticFrame(sheet, targetIndex, { phase = 'idle' } = {}) {
  const selected = sheet.frames[targetIndex];
  const emotion = /^emotion-[a-z]+$/.test(selected?.id || '') ? selected.id : null;
  const faces = { idle: 'idle-open', waking: 'idle-open', thinking: 'think', reading: 'work', editing: 'work',
    listening: 'listen', waiting: 'wait', dozing: 'rest', cancelled: 'rest', running: 'watch', searching: 'search', compacting: 'search',
    speaking: 'talk-closed', success: 'happy', error: 'error' };
  const face = ['speaking', 'error'].includes(phase) ? faces[phase] : emotion || faces[phase] || selected?.id;
  // Sequence aliases can point at video frames. Find the preserved static
  // frame by its real ID instead of following that alias while stopped.
  let index = sheet.frames.findIndex(frame => frame.id === face);
  if (index < 0) index = sheet.frames.findIndex(frame => frame.id === 'idle-open');
  if (index < 0) index = 0;
  return { sheet, frame: sheet.frames[index], frameIndex: index,
    cacheKey: `approved-static:${sheet.approvedStaticRevision || ''}:${sheet.frames[index].id}`, transitioning: false,
    nextInMs: Infinity, motion: { x: 0, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, tail: 0, wave: 0 } };
}
export function approvedMotionKeyboardClip(id) { return ['work-enter', 'work', 'work-exit'].includes(id); }
// A user poke is a finite interaction even while ordinary animation is paused.
// Whole-frame sources disable the legacy squash/cheek rig; translate the intact
// approved pose by a few pixels instead, keeping every silhouette pixel intact.
export function approvedMotionPokeFrame(visual, elapsedMs = 0, strength = 1) {
  if (!visual?.sheet?.motion?.approvedWholeFrames || !visual.frame?.pixels) return visual;
  const sheet = visual.sheet, source = visual.frame.pixels, transparent = sheet.transparentIndex ?? 0;
  const t = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 50) * 50);
  const amount = Math.max(.3, Math.min(1, Number(strength) || 1));
  const envelope = Math.exp(-t / 380) * Math.max(0, 1 - t / 1000);
  let x = Math.round(Math.sin(t / 320 * Math.PI * 2) * Math.max(1, sheet.width * .018) * amount * envelope);
  let left = sheet.width, right = -1;
  for (let i = 0; i < source.length; i++) if (source[i] !== transparent) { const col = i % sheet.width; left = Math.min(left, col); right = Math.max(right, col); }
  x = right < 0 ? 0 : Math.max(-left, Math.min(sheet.width - 1 - right, x));
  const pixels = new source.constructor(source.length);
  pixels.fill(transparent);
  for (let row = 0; row < sheet.height; row++) for (let col = 0; col < sheet.width; col++) {
    const dest = col + x;
    if (dest >= 0 && dest < sheet.width) pixels[row * sheet.width + dest] = source[row * sheet.width + col];
  }
  const cacheKey = `${visual.frame.cacheKey || visual.cacheKey || visual.frame.id}:poke:${x}`;
  const frame = { ...visual.frame, pixels, cacheKey };
  return { ...visual, sheet: { ...sheet, frames: [frame], ids: { [frame.id]: 0 } }, frame, frameIndex: 0, cacheKey,
    transitioning: false, nextInMs: 50, motion: { x, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, tail: 0, wave: 0 } };
}
export function createApprovedMotionPlayer({ catalog: initialCatalog, loadIndexed, now = () => Date.now(), onReady = () => {}, maxClips = 2 } = {}) {
  let catalog = normalizeApprovedMotionCatalog(initialCatalog), disposed = false, current = null, lastStyle = null, lastEpoch;
  let activeId = null, activeSince = 0, keyboard = null, lastIndexed = null, playbackEpoch = 0;
  const cache = new Map(), loading = new Map(), rejected = new Set(), limit = Math.max(1, Math.min(2, Number(maxClips) || 2));
  function resetClock() { activeId = null; activeSince = 0; keyboard = current = lastIndexed = null; playbackEpoch++; }
  function clearCache() { for (const r of loading.values()) r.abort?.abort(); loading.clear(); cache.clear(); rejected.clear(); }
  function keyFor(style, id) { return `${catalog?.revision}/${style}/${id}`; }
  function acceptIndexed(key, request, raw, version, clip, style) {
    if (disposed || catalog !== version || loading.get(key) !== request || request.abort?.signal.aborted) return null;
    const sheet = decodeApprovedMotionIndexed(raw, version, clip, style);
    loading.delete(key);
    if (!sheet) { rejected.add(key); return null; }
    cache.delete(key); cache.set(key, sheet);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    if (current?.clipId === clip.id && current.style === style) onReady();
    return sheet;
  }
  function sheetFor(selection, style) {
    if (!selection || !catalog || disposed || !loadIndexed || !approvedMotionStyle(style)) return null;
    const clip = catalog.clips[selection.clipId], meta = clip?.indexed?.[style], key = keyFor(style, selection.clipId);
    if (!meta) return null;
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
    if (loading.has(key) || rejected.has(key)) return null;
    while (loading.size >= limit) { const first = loading.keys().next().value; loading.get(first).abort?.abort(); loading.delete(first); }
    const request = { abort: typeof AbortController === 'function' ? new AbortController() : null };
    loading.set(key, request);
    const version = catalog;
    try {
      const raw = loadIndexed(meta.file, { style, clipId: clip.id, revision: version.revision, signal: request.abort?.signal });
      if (raw?.then) {
        void raw.then(data => acceptIndexed(key, request, data, version, clip, style)).catch(() => {
          if (loading.get(key) === request) { loading.delete(key); if (!request.abort?.signal.aborted) rejected.add(key); }
        });
        return null;
      }
      return acceptIndexed(key, request, raw, version, clip, style);
    } catch { loading.delete(key); rejected.add(key); return null; }
  }
  function nextSelection(selection) {
    if (!approvedMotionStyle(selection?.style)) return null;
    const id = selection?.clipId === 'work-enter' ? catalog?.chain?.loopClip : selection?.clipId === 'work' ? catalog?.chain?.exitClip : null;
    const clip = catalog?.clips[id];
    return clip ? { ...selection, clipId: id, clip, elapsedMs: 0, frame: clip.hires.frames[0], frameIndex: 0,
      loop: clip.loop, transition: clip.family === 'transition' } : null;
  }
  return {
    setCatalog(raw) { catalog = normalizeApprovedMotionCatalog(raw); clearCache(); resetClock(); return catalog; },
    catalog() { return catalog; },
    sample(snapshot = {}, { style = 'umi', animate = true, enabled = true, gesture = snapshot.gesture, time = now() } = {}) {
      if (disposed || !catalog || !enabled || !animate || !approvedMotionStyle(style)) { resetClock(); return null; }
      if (style !== lastStyle || snapshot.demoEpoch !== lastEpoch) { resetClock(); lastStyle = style; lastEpoch = snapshot.demoEpoch; }
      // The ordinary sprite may debounce visualPhase after a tool ends. The
      // keyboard lifecycle follows actual phase, so that debounce cannot keep
      // typing alive or postpone an approved exit.
      const phase = snapshot.reaction || (snapshot.drowsy ? 'dozing' : snapshot.phase || snapshot.visualPhase);
      const hardStop = ['speaking', 'error', 'poked'].includes(phase) || ['speaking', 'error'].includes(snapshot.phase);
      if (hardStop) { resetClock(); return null; }
      const listen = phase === 'listening';
      const stateEmotion = !gesture && !listen ? stateExpressionId(snapshot) : null;
      let id = !listen && gesture ? (approvedMotionEmotionIds.has(gesture.id) ? gesture.id : null)
        : stateEmotion || APPROVED_MOTION_STATES[phase];
      if (!id || !catalog.clips[id]) { resetClock(); return null; }
      // Speech, typing/listening and explicit gestures preempt keyboard cleanup.
      // Ordinary work completion may show its 400ms exit while facts stay live.
      if (listen || gesture || stateEmotion) keyboard = null;
      else if (catalog.chain) {
        if (id === 'work') {
          if (!keyboard) keyboard = { stage: 'enter', since: time };
          else if (keyboard.stage === 'exit') keyboard = { stage: 'loop', since: time };
          if (keyboard.stage === 'enter' && time - keyboard.since >= 400) keyboard = { stage: 'loop', since: keyboard.since + 400 };
        } else if (keyboard && keyboard.stage !== 'exit') keyboard = { stage: 'exit', since: time };
        if (keyboard?.stage === 'exit' && time - keyboard.since >= 400) keyboard = null;
        if (keyboard) id = keyboard.stage === 'enter' ? catalog.chain.enterClip : keyboard.stage === 'exit' ? catalog.chain.exitClip : catalog.chain.loopClip;
      }
      if (activeId !== id) { activeId = id; activeSince = time; playbackEpoch++; }
      const clip = catalog.clips[id];
      const isTransition = clip.family === 'transition' || id === 'work-enter' || id === 'work-exit';
      const externalAge = gesture && !listen ? gesture.elapsedMs : stateEmotion ? snapshot.expressionElapsedMs ?? snapshot.reactionElapsedMs ?? snapshot.phaseElapsedMs : null;
      const elapsedMs = Number.isFinite(externalAge) ? Math.max(0, externalAge) : keyboard ? Math.max(0, time - keyboard.since) : Math.max(0, time - activeSince);
      // Replaying the same manual gesture resets its event age without a
      // different clip ID. Its first frame must not inherit a later HD cursor.
      if (current?.clipId === id && elapsedMs < current.playbackMs) playbackEpoch++;
      const loop = clip.loop && !gesture && !stateEmotion && !isTransition;
      const sampled = approvedMotionFrameAt(clip.hires.frames, elapsedMs, clip.periodMs, loop);
      current = { clipId: id, style, clip, elapsedMs: sampled.elapsedMs, playbackMs: elapsedMs, playbackEpoch,
        frame: sampled.frame, frameIndex: sampled.index,
        transition: isTransition, loop, revision: catalog.revision, nextInMs: sampled.nextInMs };
      return current;
    },
    indexedFrame(selection, style = selection?.style) {
      if (!selection || !approvedMotionStyle(style) || selection.revision !== catalog?.revision || selection.style !== style) return null;
      const sheet = sheetFor(selection, style);
      // Entry can prime the loop immediately. Prime exit only once loop data
      // exists, leaving the second slot available for the held entry frame.
      const next = nextSelection(selection);
      if (next && (selection.clipId === 'work-enter' || sheet)) sheetFor(next, style);
      if (!sheet) return approvedMotionKeyboardClip(selection.clipId) && approvedMotionKeyboardClip(lastIndexed?.approvedMotion?.clipId) &&
        lastIndexed.approvedMotion.style === style && lastIndexed.approvedMotion.revision === selection.revision ? lastIndexed : null;
      const sampled = approvedMotionFrameAt(sheet.frames, selection.elapsedMs, sheet.periodMs, selection.loop);
      lastIndexed = { sheet, frame: sampled.frame, frameIndex: sampled.index,
        cacheKey: `approved:${keyFor(style, selection.clipId)}:${sampled.frame.id}`, transitioning: false,
        nextInMs: Math.min(selection.transition ? 50 : 1000 / 12, sampled.nextInMs), approvedMotion: selection,
        motion: { x: 0, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, tail: 0, wave: 0 } };
      return lastIndexed;
    },
    nextSelection,
    reset() { resetClock(); },
    stats() { return { clips: cache.size, downloads: loading.size, maxClips: limit, keys: [...cache.keys()], clipId: current?.clipId ?? null, keyboardStage: keyboard?.stage ?? null }; },
    dispose() { disposed = true; resetClock(); clearCache(); },
  };
}
