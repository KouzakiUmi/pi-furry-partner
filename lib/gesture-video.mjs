// Reviewed whole-frame clips. Assets are loaded one action at a time by the host.
import { EXPRESSIONS, stateExpressionId } from './expressions.mjs';
export const GESTURE_VIDEO_IDS = Object.freeze(['wave', 'stretch', ...EXPRESSIONS.map(e => e.id)]);
export function isGestureVideoId(id) { return GESTURE_VIDEO_IDS.includes(id); }
export function normalizeGestureVideoCatalog(asset) {
  const clips = {};
  for (const [id, clip] of Object.entries(asset?.clips || {})) {
    if (isGestureVideoId(id) && clip?.qa?.accepted === true && Number.isInteger(clip.periodMs) &&
        clip.periodMs >= 80 && clip.periodMs <= 15000 && Number.isInteger(clip.frameCount) &&
        clip.frameCount >= 2 && clip.frameCount <= 96) {
      clips[id] = { periodMs: clip.periodMs, frameCount: clip.frameCount, qa: { accepted: true } };
    }
  }
  return { schemaVersion: 1, clips };
}

// A short real state may borrow filmed artwork without becoming a manual or
// companion gesture. Its own event age selects the frame; no activity clock,
// phase, copy, tool or gesture-mode state is changed, and the state may end early.
export function stateExpressionVideo(snapshot = {}, catalog) {
  if (snapshot.gesture || snapshot.drowsy || ['poked', 'listening'].includes(snapshot.reaction) ||
      ['reading', 'editing', 'running', 'searching', 'compacting', 'speaking'].includes(snapshot.visualPhase || snapshot.phase)) return null;
  const id = stateExpressionId(snapshot);
  const clip = id && normalizeGestureVideoCatalog(catalog).clips[id];
  if (!clip) return null;
  const age = snapshot.expressionElapsedMs ?? (snapshot.reaction === 'startled' ? snapshot.reactionElapsedMs : snapshot.phaseElapsedMs) ?? 0;
  if (!Number.isFinite(age) || age < 0) return null;
  return { id, face: `emotion-${id}`, source: 'state', durationMs: clip.periodMs,
    elapsedMs: Math.min(clip.periodMs - 1, age) };
}
export function withGestureVideoFrames(sheet, asset, metadata) {
  const action = asset?.action;
  if (!isGestureVideoId(action) || asset?.qa?.accepted !== true || sheet.motion?.gestureVideos?.[action] ||
      asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length < 2 || asset.frames.length > 96) return sheet;
  const palette = asset.palette || sheet.palette;
  if (!Array.isArray(palette) || palette.length < sheet.palette.length || palette.length > 512 ||
      JSON.stringify(palette.slice(0, sheet.palette.length)) !== JSON.stringify(sheet.palette) ||
      palette.some(c => !Array.isArray(c) || c.length !== 3 || c.some(n => !Number.isInteger(n) || n < 0 || n > 255))) return sheet;
  const count = sheet.width * sheet.height, names = new Set();
  if (!Number.isSafeInteger(count) || count <= 0 || count * asset.frames.length > 6000000) return sheet;
  for (const frame of asset.frames) {
    if (!new RegExp(`^gesture-${action}-[0-9]{3}$`).test(frame?.id) || names.has(frame.id) ||
        sheet.ids[frame.id] !== undefined || !(Array.isArray(frame.pixels) || frame.pixels instanceof Uint8Array || frame.pixels instanceof Uint16Array) ||
        frame.pixels.length !== count || frame.pixels.some(p => !Number.isInteger(p) || p < 0 || p >= palette.length)) return sheet;
    names.add(frame.id);
  }
  const steps = asset.sequence?.steps;
  if (!Array.isArray(steps) || steps.length !== asset.frames.length ||
      steps.some((s, i) => s?.id !== asset.frames[i].id || !names.has(s?.id) || !Number.isInteger(s.durationMs) || s.durationMs < 40 || s.durationMs > 2000)) return sheet;
  const periodMs = steps.reduce((n, s) => n + s.durationMs, 0);
  if (periodMs > 15000 || periodMs !== asset.sequence.periodMs ||
      metadata && (metadata.qa?.accepted !== true || metadata.periodMs !== periodMs || metadata.frameCount !== asset.frames.length)) return sheet;
  const ids = { ...sheet.ids };
  const PixelArray = palette.length > 256 ? Uint16Array : Uint8Array;
  const frames = asset.frames.map((frame, i) => {
    ids[frame.id] = sheet.frames.length + i;
    return { id: frame.id, pixels: frame.pixels instanceof PixelArray ? frame.pixels : PixelArray.from(frame.pixels) };
  });
  return { ...sheet, palette, ids, frames: [...sheet.frames, ...frames], motion: { ...sheet.motion,
    gestureVideos: { ...sheet.motion?.gestureVideos, [action]: { bakedMotion: true, sequence: { periodMs, steps: steps.map(s => ({ ...s })) } } } } };
}

// Views share the base frames. The cache retains at most two complete clips,
// never a cumulative sheet with all nine videos appended.
export function createGestureVideoCache({ load, maxClips = 2 } = {}) {
  const cache = new Map(), rejected = new Set();
  const limit = Math.max(1, Math.min(2, Number(maxClips) || 2));
  return {
    sheet(base, key, action, metadata) {
      if (!base || !isGestureVideoId(action) || metadata?.qa?.accepted !== true) return base;
      const id = `${key}/${action}`;
      const hit = cache.get(id);
      if (hit?.base === base) { cache.delete(id); cache.set(id, hit); return hit.sheet; }
      if (rejected.has(id)) return base;
      let augmented = base;
      try { augmented = withGestureVideoFrames(base, load(key, action), metadata); } catch { /* Optional pack uses authored fallback. */ }
      if (augmented === base) { rejected.add(id); return base; }
      cache.delete(id); cache.set(id, { base, sheet: augmented });
      while (cache.size > limit) cache.delete(cache.keys().next().value);
      return augmented;
    },
    clear() { cache.clear(); rejected.clear(); },
    stats() { return { clips: cache.size, maxClips: limit, keys: [...cache.keys()] }; },
  };
}

export function reviewedHiResGesture(id, clip) {
  if (!isGestureVideoId(id) || clip?.qa?.accepted !== true || !Number.isInteger(clip.periodMs) ||
      clip.periodMs < 80 || clip.periodMs > 15000 || clip.durationMs !== clip.periodMs ||
      !Array.isArray(clip.ids) || clip.ids.length < 2 || clip.ids.length > 512 ||
      !Array.isArray(clip.frames) || clip.frames.length !== clip.ids.length) return null;
  const names = new Set(clip.ids);
  if (names.size !== clip.ids.length || clip.ids.some(name => !new RegExp(`^gesture-${id}-[0-9]{3}$`).test(name))) return null;
  let previous = -1;
  for (const [i, frame] of clip.frames.entries()) {
    if (frame?.id !== clip.ids[i] || !names.has(frame?.id) || !Number.isFinite(frame.atMs) || frame.atMs <= previous || frame.atMs >= clip.periodMs) return null;
    previous = frame.atMs;
  }
  if (clip.frames[0].atMs !== 0 || new Set(clip.frames.map(f => f.id)).size !== names.size) return null;
  return clip;
}
