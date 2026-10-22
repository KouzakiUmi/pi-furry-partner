// Reviewed full-frame state loops. Independent of gesture selection and the
// activity/blink clock; a state is never extended just to finish a video.
export const STATE_LOOP_IDS = Object.freeze(['idle', 'think', 'work', 'listen', 'wait', 'rest']);
const STATE_LOOP_IDLE_SOURCE = '759ef974e7ac320463d04188432f17559c58484e34530e2111d2e0b6f7566927';
const STATE_LOOP_QA_HASHES = ['processingManifestSha256', 'sourceSha256', 'approvedSourceSha256', 'reviewSha256'];
export function reviewedStateLoopQa(id, qa, revision) {
  return STATE_LOOP_IDS.includes(id) && typeof revision === 'string' && revision.length > 0 &&
    qa?.accepted === true && qa.approvedStaticRevision === revision &&
    STATE_LOOP_QA_HASHES.every(key => /^[a-f0-9]{64}$/.test(qa[key] || '')) &&
    (id !== 'idle' || qa.approvedSourceSha256 === STATE_LOOP_IDLE_SOURCE);
}
function sameStateLoopQa(a, b) {
  return ['accepted', 'approvedStaticRevision', ...STATE_LOOP_QA_HASHES].every(key => a?.[key] === b?.[key]);
}
export function normalizeStateLoopCatalog(asset, revision) {
  const clips = {};
  if (asset?.schemaVersion !== 1 || asset.approvedStaticRevision !== revision) return { schemaVersion: 1, clips };
  for (const [id, clip] of Object.entries(asset.clips || {})) {
    if (clip?.approvedStaticRevision === revision && reviewedStateLoopQa(id, clip.qa, revision) &&
        Number.isInteger(clip.periodMs) && clip.periodMs >= 80 && clip.periodMs <= 15000 &&
        Number.isInteger(clip.frameCount) && clip.frameCount >= 2 && clip.frameCount <= 96)
      clips[id] = { ...clip };
  }
  return { schemaVersion: 1, approvedStaticRevision: revision, clips };
}
export function withStateLoopFrames(sheet, asset, metadata) {
  const id = asset?.state, revision = sheet?.approvedStaticRevision;
  if (!sheet || asset?.schemaVersion !== 1 || !reviewedStateLoopQa(id, asset.qa, revision) ||
      asset.approvedStaticRevision !== revision || metadata?.approvedStaticRevision !== revision ||
      !reviewedStateLoopQa(id, metadata.qa, revision) || !sameStateLoopQa(asset.qa, metadata.qa) ||
      sheet.motion?.stateLoops?.[id] || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length < 2 || asset.frames.length > 96 ||
      metadata.frameCount !== asset.frames.length || JSON.stringify(asset.palette) !== JSON.stringify(sheet.palette)) return sheet;
  const size = sheet.width * sheet.height, names = new Set();
  if (!Number.isSafeInteger(size) || size <= 0 || size * asset.frames.length > 6000000) return sheet;
  for (const frame of asset.frames) {
    if (!new RegExp(`^state-${id}-[0-9]{3}$`).test(frame?.id) || names.has(frame.id) ||
        sheet.ids[frame.id] !== undefined || !Array.isArray(frame.pixels) || frame.pixels.length !== size ||
        frame.pixels.some(value => !Number.isInteger(value) || value < 0 || value >= sheet.palette.length)) return sheet;
    names.add(frame.id);
  }
  const steps = asset.sequence?.steps;
  if (!Array.isArray(steps) || steps.length !== asset.frames.length || steps.some((step, i) =>
      step?.id !== asset.frames[i].id || !Number.isInteger(step.durationMs) || step.durationMs < 40 || step.durationMs > 2000)) return sheet;
  const periodMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  if (!Number.isInteger(metadata.periodMs) || periodMs < 80 || periodMs > 15000 ||
      periodMs !== metadata.periodMs || periodMs !== asset.sequence.periodMs) return sheet;
  const ids = { ...sheet.ids };
  const PixelArray = sheet.palette.length > 256 ? Uint16Array : Uint8Array;
  const frames = asset.frames.map((frame, i) => {
    ids[frame.id] = sheet.frames.length + i;
    return { id: frame.id, pixels: PixelArray.from(frame.pixels) };
  });
  return { ...sheet, ids, frames: [...sheet.frames, ...frames], motion: { ...sheet.motion,
    stateLoops: { ...sheet.motion?.stateLoops, [id]: { qa: asset.qa, approvedStaticRevision: revision,
      sequence: { periodMs, steps: steps.map(step => ({ ...step })) } } } } };
}
export function loadStateLoops(sheet, catalog, load) {
  const reviewed = normalizeStateLoopCatalog(catalog, sheet?.approvedStaticRevision);
  let result = sheet;
  for (const [id, metadata] of Object.entries(reviewed.clips)) {
    try { result = withStateLoopFrames(result, load(id), metadata); } catch { /* Optional clip falls back to approved static. */ }
  }
  return result;
}
export function stateLoopFamily(phase, frameId, gesture) {
  if (gesture) return null;
  const id = String(frameId || '');
  if (phase === 'idle' && /^idle-(open|blink|wink)$/.test(id)) return 'idle';
  if (phase === 'thinking' && /^(think(?:-blink)?|idle-blink)$/.test(id)) return 'think';
  if (['reading', 'editing'].includes(phase) && /^(work(?:-blink)?|idle-blink)$/.test(id)) return 'work';
  if (phase === 'listening' && /^listen(?:-blink)?$/.test(id)) return 'listen';
  if (phase === 'waiting' && /^wait(?:-blink)?$/.test(id)) return 'wait';
  if (['dozing', 'cancelled'].includes(phase) && id === 'rest') return 'rest';
  return null;
}
export function reviewedHiResStateLoop(id, clip, revision) {
  if (clip?.approvedStaticRevision !== revision || !reviewedStateLoopQa(id, clip.qa, revision) ||
      !Number.isInteger(clip.periodMs) || clip.periodMs < 80 || clip.periodMs > 15000 ||
      clip.durationMs !== clip.periodMs || !Array.isArray(clip.ids) || clip.ids.length < 2 || clip.ids.length > 512 ||
      !Array.isArray(clip.frames) || clip.frames.length !== clip.ids.length) return null;
  const names = new Set(clip.ids);
  if (names.size !== clip.ids.length) return null;
  let previous = -1;
  for (const [i, frame] of clip.frames.entries()) {
    if (!new RegExp(`^state-${id}-[0-9]{3}$`).test(frame?.id) || frame.id !== clip.ids[i] ||
        !Number.isFinite(frame.atMs) || frame.atMs <= previous || frame.atMs >= clip.periodMs) return null;
    previous = frame.atMs;
  }
  return clip.frames[0].atMs === 0 ? clip : null;
}
export function matchingStateLoopQa(a, b) { return sameStateLoopQa(a, b); }
