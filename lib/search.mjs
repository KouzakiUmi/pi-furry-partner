// Optional complete search/compaction frames augment the immutable 21-pose
// sheet. Older styles and local packs retain their original articulated pose.
export function withSearchFrames(sheet, asset) {
  if (!asset || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length < 2 || asset.frames.length > 96 ||
      !["search", "search-video-000"].includes(asset.frames[0]?.id) || sheet.motion?.searchVideo?.sequence) return sheet;
  const count = sheet.width * sheet.height;
  if (!Number.isSafeInteger(count) || count <= 0 || count * asset.frames.length > 6000000) return sheet;
  const names = new Set();
  for (const frame of asset.frames) {
    if (!frame || typeof frame.id !== "string" || !/^search(?:-[a-z0-9]+)*$/.test(frame.id) || names.has(frame.id) ||
        !Array.isArray(frame.pixels) || frame.pixels.length !== count ||
        frame.pixels.some((value) => !Number.isInteger(value) || value < 0 || value >= sheet.palette.length)) return sheet;
    names.add(frame.id);
  }
  const steps = asset.sequence?.steps;
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 128 ||
      steps.some((step) => !names.has(step?.id) || !Number.isInteger(step.durationMs) || step.durationMs < 50 || step.durationMs > 2000)) return sheet;
  const periodMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  if (periodMs > 20000 || (asset.sequence.periodMs !== undefined && asset.sequence.periodMs !== periodMs)) return sheet;
  const ids = { ...sheet.ids };
  for (const [offset, frame] of asset.frames.entries()) ids[frame.id] = sheet.frames.length + offset;
  ids.search = sheet.frames.length;
  // Repoint the search alias; its original frame object and array index remain
  // intact for compatibility and reproducible source hashes.
  return { ...sheet, frames: [...sheet.frames, ...asset.frames], ids,
    motion: { ...sheet.motion, searchVideo: { ...asset.motion, bakedMotion: true,
      sequence: { steps: steps.map(({ id, durationMs }) => ({ id, durationMs })), periodMs } } } };
}
