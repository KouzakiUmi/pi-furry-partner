// Approved complete-frame motion, shared by Pi and DSH. This display clock
// never changes the activity snapshot or borrows the ordinary sprite rig.
import { stateExpressionId } from '../expressions.mjs';
import { decodeApprovedMotionBinary } from '../approved-motion-codec.mjs';
import { approvedMotionStyle } from '../build-profile.mjs';

export const APPROVED_MOTION_STATES = Object.freeze({ idle: 'idle', thinking: 'think', reading: 'watch', editing: 'work',
  listening: 'listen', waiting: 'wait', dozing: 'rest', cancelled: 'rest', running: 'work', searching: 'search', compacting: 'search' });
const approvedMotionEmotionIds = new Set(['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']);
export const APPROVED_AUXILIARY_IDS = Object.freeze(['wave', 'nod', 'peek', 'stretch', 'ear-flick', 'nuzzle', 'bounce', 'head-shake']);
export const APPROVED_IDLE_VARIANT_IDS = Object.freeze(['idle', 'idle-center', 'idle-right', 'idle-settle']);
const approvedMotionGestureIds = new Set([...approvedMotionEmotionIds, ...APPROVED_AUXILIARY_IDS]);
const approvedMotionClipIds = new Set([...Object.values(APPROVED_MOTION_STATES), ...approvedMotionGestureIds, ...APPROVED_IDLE_VARIANT_IDS, 'work-enter', 'work-exit']);
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
  // Only explicitly selected, reviewed loops with the same registered canvas
  // may join the idle playlist. Missing/unreviewed variants never replace idle.
  const original = clips.idle;
  const idleVariants = [...new Set(['idle', ...(Array.isArray(raw.idleVariants) ? raw.idleVariants : [])])].filter(id => {
    const clip = clips[id];
    return APPROVED_IDLE_VARIANT_IDS.includes(id) && clip?.family === 'state' && clip.loop === true && original &&
      ['x', 'y', 'width', 'height'].every(key => clip.paintRect[key] === original.paintRect[key]);
  });
  return { ...raw, clips, idleVariants, chain: validChain ? { ...chain } : null };
}
export function approvedMotionFrameAt(frames, elapsedMs, periodMs, loop = true) {
  // Adding a whole period to a positive fractional boundary can round it back
  // below its authored timestamp (83.333ms in a4458ms loop, for example).
  // Keep positive remainders exact; only negative clocks need normalization.
  const remainder = elapsedMs % periodMs;
  const t = loop ? (remainder < 0 ? remainder + periodMs : remainder || 0)
    : Math.min(periodMs - .0001, Math.max(0, elapsedMs));
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (frames[mid].atMs <= t) lo = mid; else hi = mid - 1; }
  return { index: lo, frame: frames[lo], elapsedMs: t, nextInMs: Math.max(1, (frames[lo + 1]?.atMs ?? periodMs) - t) };
}
function approvedIndexedViewport(sheet) {
  const r = sheet?.viewport?.worldRect;
  if (r === undefined) return { x: 0, y: 0, width: 640, height: 640 };
  if (!Array.isArray(r) || r.length !== 4 || r.some(n => !Number.isFinite(n)) ||
      r[2] <= 0 || r[3] <= 0 || r[2] > 2048 || r[3] > 2048 || Math.abs(r[0]) > 2048 || Math.abs(r[1]) > 2048) return null;
  return { x: r[0], y: r[1], width: r[2], height: r[3] };
}
export function approvedMotionIndexedRect(sheet) {
  if (!sheet?.motion?.approvedWholeFrames) return null;
  const r = approvedIndexedViewport(sheet);
  return r && (r.x !== 0 || r.y !== 0 || r.width !== 640 || r.height !== 640) ? r : null;
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
  const viewport = approvedIndexedViewport(raw);
  if (!viewport) return null;
  if ((viewport.x !== 0 || viewport.y !== 0 || viewport.width !== 640 || viewport.height !== 640) &&
      (!['x', 'y', 'width', 'height'].every(k => viewport[k] === clip.paintRect[k]) ||
       Math.abs(raw.width / viewport.width - raw.height / viewport.height) > 1e-9)) return null;
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
  const faces = { idle: 'idle-open', waking: 'idle-open', thinking: 'think', reading: 'watch', editing: 'work',
    listening: 'listen', waiting: 'wait', dozing: 'rest', cancelled: 'rest', running: 'work', searching: 'search', compacting: 'search',
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
// The same rigid feedback covers the HD pose stage, which is one static cel.
export function approvedMotionPokeFrame(visual, elapsedMs = 0, strength = 1) {
  if (!visual?.frame?.pixels || !(visual.sheet?.width > 0)) return visual;
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
export function createApprovedMotionPlayer({ catalog: initialCatalog, loadIndexed, now = () => Date.now(), onReady = () => {}, onInteractionPresented = () => {}, maxClips = 2, random = Math.random, minimumActionMs = 0, maximumLoadingMs = 1200 } = {}) {
  let catalog = normalizeApprovedMotionCatalog(initialCatalog), disposed = false, current = null, lastStyle = null, lastEpoch;
  let activeId = null, activeSince = 0, keyboard = null, lastIndexed = null, playbackEpoch = 0;
  let idleChoice = null, lastIdleId = null, action = null;
  const minimum = Math.max(0, Math.min(10000, Number(minimumActionMs) || 0));
  const loadingGrace = Math.max(0, Math.min(10000, Number(maximumLoadingMs) || 0));
  // Before a resource is visible its clock is frozen, with a finite loading
  // grace. A failed download must never keep an obsolete action on screen.
  const visibleSince = item => item.presentedAt ?? item.since + loadingGrace;
  const visibleAge = (item, time) => Math.max(0, time - visibleSince(item));
  function markPresented(selection, time = now()) {
    if (!selection || selection !== current || selection.revision !== catalog?.revision || !Number.isFinite(time)) return false;
    if (selection.interactionEpoch !== undefined) onInteractionPresented(selection.interactionEpoch);
    if (!minimum) return true;
    if (action && action.presentedAt == null && (action.id === selection.clipId || action.id === 'work' && ['work-enter', 'work'].includes(selection.clipId))) action.presentedAt = time;
    if (keyboard && selection.clipId === (keyboard.stage === 'enter' ? catalog.chain?.enterClip : keyboard.stage === 'exit' ? catalog.chain?.exitClip : catalog.chain?.loopClip)) {
      if (keyboard.presentedAt == null) keyboard.presentedAt = time;
    } else if (activeId === selection.clipId && action?.id === selection.clipId && !action.clockPresented) {
      activeSince = time; action.clockPresented = true;
    }
    return true;
  }
  const cache = new Map(), loading = new Map(), rejected = new Set(), limit = Math.max(1, Math.min(2, Number(maxClips) || 2));
  function resetClock() { idleChoice = null; activeId = null; activeSince = 0; keyboard = current = lastIndexed = action = null; playbackEpoch++; }
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
  function pickIdle(avoid) {
    const pool = catalog.idleVariants.filter(id => id !== avoid);
    if (!pool.length) return catalog.idleVariants[0];
    const draw = Math.max(0, Math.min(1 - Number.EPSILON, Number(random()) || 0));
    return pool[Math.floor(draw * pool.length)];
  }
  function startIdle(id, since) {
    lastIdleId = id;
    idleChoice = { id, since, nextId: pickIdle(id) };
  }
  function nextSelection(selection) {
    if (!approvedMotionStyle(selection?.style)) return null;
    if (idleChoice && selection.clipId === idleChoice.id) {
      const clip = catalog.clips[idleChoice.nextId];
      return { ...selection, clipId: clip.id, clip, elapsedMs: 0, frame: clip.hires.frames[0], frameIndex: 0,
        loop: true, transition: false };
    }
    const id = selection?.clipId === 'work-enter' ? catalog?.chain?.loopClip : selection?.clipId === 'work' ? catalog?.chain?.exitClip : null;
    const clip = catalog?.clips[id];
    return clip ? { ...selection, clipId: id, clip, elapsedMs: 0, frame: clip.hires.frames[0], frameIndex: 0,
      loop: clip.loop, transition: clip.family === 'transition' } : null;
  }
  return {
    setCatalog(raw) { catalog = normalizeApprovedMotionCatalog(raw); lastIdleId = null; clearCache(); resetClock(); return catalog; },
    catalog() { return catalog; },
    sample(snapshot = {}, { style = 'umi', animate = true, enabled = true, gesture = snapshot.gesture, time = now() } = {}) {
      const interaction = snapshot.interaction && ["wave", "bounce", "ear-flick", "head-shake"].includes(snapshot.interaction.id) &&
        ["welcome", "poke"].includes(snapshot.interaction.kind) && snapshot.interaction.remainingMs > 0 ? snapshot.interaction : null;
      if (disposed || !catalog || !enabled || !animate && interaction?.kind !== "poke" || !approvedMotionStyle(style)) { resetClock(); return null; }
      // A cancelled/finished explicit interaction must not be held by ordinary
      // minimum-action dwell or carried into a new task's keyboard chain.
      if (current?.interactionEpoch !== undefined && current.interactionEpoch !== interaction?.epoch) resetClock();
      if (interaction) gesture = { id: interaction.id, elapsedMs: interaction.elapsedMs };
      if (style !== lastStyle || snapshot.demoEpoch !== lastEpoch) { resetClock(); lastStyle = style; lastEpoch = snapshot.demoEpoch; }
      // A completed tool is no longer active. Its display alone may continue
      // while waiting for the next real state, until the activity gap expires.
      // Selecting the same clip here preserves its original playback clock:
      // adjacent reads never restart the lens, and work keeps the keyboard.
      const gap = snapshot.pendingNextState;
      const gapPhase = snapshot.phase === 'thinking' && snapshot.busy && snapshot.toolCount === 0 &&
        !snapshot.awaitingUser && gap?.remainingMs > 0 &&
        ['reading', 'editing', 'running', 'searching'].includes(gap.visualPhase) ? gap.visualPhase : null;
      const phase = snapshot.reaction || (snapshot.drowsy ? 'dozing' : gapPhase || snapshot.phase || snapshot.visualPhase);
      const hardStop = ['speaking', 'error'].includes(phase) || phase === 'poked' && !interaction || ['speaking', 'error'].includes(snapshot.phase);
      if (hardStop) { resetClock(); return null; }
      const listen = phase === 'listening';
      const stateEmotion = !gesture && !listen ? stateExpressionId(snapshot) : null;
      let id = !listen && gesture ? (approvedMotionGestureIds.has(gesture.id) ? gesture.id : null)
        : stateEmotion || APPROVED_MOTION_STATES[phase];
      if (!id || !catalog.clips[id]) { resetClock(); return null; }
      const urgent = Boolean(gesture || snapshot.reaction || snapshot.awaitingUser ||
        ['waiting', 'cancelled', 'listening'].includes(phase));
      let displayPhase = phase, held = false;
      if (minimum) {
        const toolPhase = ['reading', 'editing', 'running', 'searching', 'compacting'].includes(phase);
        const canEnterImmediately = action?.id === 'idle' || action?.id === 'think' && toolPhase ||
          keyboard?.stage === 'exit' && action?.id !== 'work' && action?.presentedAt == null;
        if (action && action.id !== id && !urgent && !canEnterImmediately) {
          const keyboardNeedsLoop = action.id === 'work' && keyboard &&
            (keyboard.stage === 'enter' || keyboard.stage === 'loop' && visibleAge(keyboard, time) < Math.max(1, minimum - 400));
          if (keyboardNeedsLoop || visibleAge(action, time) < minimum) {
            id = action.id; displayPhase = action.phase; held = true;
          }
        }
        const replay = gesture && current?.clipId === id && Number.isFinite(gesture.elapsedMs) && gesture.elapsedMs < current.playbackMs;
        if (!held && (action?.id !== id || replay)) action = { id, phase, since: time, presentedAt: null,
          single: Boolean(gesture || stateEmotion), externalClock: Boolean(gesture), externalAge: gesture?.elapsedMs ?? snapshot.expressionElapsedMs ?? snapshot.reactionElapsedMs ?? snapshot.phaseElapsedMs };
      }
      // Urgent interaction bypasses visual cleanup. Ordinary short work still
      // gets its full visible entry, readable loop, and complete exit.
      const selectedEmotion = held ? null : stateEmotion;
      if (listen || gesture || selectedEmotion && (!minimum || phase !== 'success') || urgent && minimum || displayPhase === 'reading' && !minimum) keyboard = null;
      else if (catalog.chain) {
        const stageAge = () => minimum ? visibleAge(keyboard, time) : time - keyboard.since;
        if (id === 'work') {
          if (!keyboard) keyboard = { stage: 'enter', since: time, presentedAt: null };
          else if (keyboard.stage === 'exit') keyboard = { stage: 'loop', since: time, presentedAt: null };
          if (keyboard.stage === 'enter' && stageAge() >= 400) keyboard = { stage: 'loop', since: minimum ? time : keyboard.since + 400, presentedAt: null };
        } else if (keyboard && keyboard.stage !== 'exit') keyboard = { stage: 'exit', since: time, presentedAt: null };
        if (keyboard?.stage === 'exit' && stageAge() >= 400) keyboard = null;
        if (keyboard) id = keyboard.stage === 'enter' ? catalog.chain.enterClip : keyboard.stage === 'exit' ? catalog.chain.exitClip : catalog.chain.loopClip;
      }
      const variedIdle = id === 'idle' && phase === 'idle' && !gesture && !stateEmotion && !keyboard && catalog.idleVariants.length > 1;
      if (variedIdle) {
        if (!idleChoice) startIdle(pickIdle(lastIdleId), time);
        const previous = catalog.clips[idleChoice.id];
        if (time - idleChoice.since >= previous.periodMs) {
          const nextId = idleChoice.nextId, boundary = idleChoice.since + previous.periodMs;
          // Preserve ordinary timer jitter, but do not replay a long backlog
          // or draw hundreds of choices after a suspended/backgrounded view.
          startIdle(nextId, time - boundary < catalog.clips[nextId].periodMs ? boundary : time);
        }
        id = idleChoice.id;
      } else idleChoice = null;
      if (activeId !== id) { activeId = id; activeSince = time; playbackEpoch++; }
      if (variedIdle) activeSince = idleChoice.since;
      const clip = catalog.clips[id];
      const isTransition = clip.family === 'transition' || id === 'work-enter' || id === 'work-exit';
      const externalAge = keyboard ? null : held ? action?.single
        ? (action.externalClock ? Number(action.externalAge) || 0 : 0) + visibleAge(action, time) : null
        : gesture && !listen ? gesture.elapsedMs : selectedEmotion ? minimum ? visibleAge(action, time)
          : snapshot.expressionElapsedMs ?? snapshot.reactionElapsedMs ?? snapshot.phaseElapsedMs : null;
      const elapsedMs = variedIdle ? Math.max(0, time - idleChoice.since) : Number.isFinite(externalAge) ? Math.max(0, externalAge) : keyboard ? minimum ? visibleAge(keyboard, time) : Math.max(0, time - keyboard.since) : minimum && action?.presentedAt == null ? visibleAge(action, time) : Math.max(0, time - activeSince);
      // Replaying the same manual gesture resets its event age without a
      // different clip ID. Its first frame must not inherit a later HD cursor.
      if (current?.clipId === id && elapsedMs < current.playbackMs) playbackEpoch++;
      const single = held ? action?.single : gesture || selectedEmotion;
      const loop = clip.loop && !single && !isTransition;
      const sampled = approvedMotionFrameAt(clip.hires.frames, elapsedMs, clip.periodMs, loop);
      current = { clipId: id, style, clip, elapsedMs: sampled.elapsedMs, playbackMs: elapsedMs, playbackEpoch,
        frame: sampled.frame, frameIndex: sampled.index,
        transition: isTransition, loop, revision: catalog.revision, nextInMs: sampled.nextInMs,
        ...(interaction ? { interactionEpoch: interaction.epoch, interactionKind: interaction.kind } : {}) };
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
      markPresented(selection);
      const sampled = approvedMotionFrameAt(sheet.frames, selection.elapsedMs, sheet.periodMs, selection.loop);
      lastIndexed = { sheet, frame: sampled.frame, frameIndex: sampled.index,
        cacheKey: `approved:${keyFor(style, selection.clipId)}:${sampled.frame.id}`, transitioning: false,
        nextInMs: !selection.loop && selection.playbackMs >= sheet.periodMs ? Infinity : sampled.nextInMs, approvedMotion: selection,
        motion: { x: 0, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, tail: 0, wave: 0 } };
      return lastIndexed;
    },
    nextSelection,
    markPresented,
    reset() { resetClock(); },
    stats() { return { clips: cache.size, downloads: loading.size, maxClips: limit, keys: [...cache.keys()], clipId: current?.clipId ?? null, keyboardStage: keyboard?.stage ?? null }; },
    dispose() { disposed = true; resetClock(); clearCache(); },
  };
}
