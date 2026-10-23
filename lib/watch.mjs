// Additional authored poses share the immutable main sheet's indexed palette.
// Older packs without the asset keep the ordinary work-pose fallback.
export function withWatchFrames(sheet, asset) {
  if (sheet.approvedStaticRevision && asset?.approvedStaticRevision !== sheet.approvedStaticRevision) return sheet;
  if (sheet.approvedStaticRevision && sheet.motion?.watch?.sequence) return sheet;
  if (!asset || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length < 2 || asset.frames.length > 96 ||
      asset.frames[0]?.id !== "watch" || asset.frames[1]?.id !== "watch-blink") return sheet;
  const count = sheet.width * sheet.height;
  // Bound decoded memory as well as the frame/step count. At 240px this admits
  // the complete 12fps movie-derived loop without accepting unbounded packs.
  if (!Number.isSafeInteger(count) || count <= 0 || count * asset.frames.length > 6000000) return sheet;
  const names = new Set();
  for (const frame of asset.frames) {
    if (!frame || typeof frame.id !== "string" || !/^watch(?:-[a-z0-9]+)*$/.test(frame.id) || names.has(frame.id) ||
        !Array.isArray(frame.pixels) || frame.pixels.length !== count ||
        frame.pixels.some((color) => !Number.isInteger(color) || color < 0 || color >= sheet.palette.length)) return sheet;
    names.add(frame.id);
  }
  let sequence;
  if (asset.sequence !== undefined) {
    const steps = asset.sequence?.steps;
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > 128 ||
        steps.some((step) => !names.has(step?.id) || !Number.isInteger(step.durationMs) || step.durationMs < 50 || step.durationMs > 2000)) return sheet;
    const periodMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
    if (periodMs > 20000 || (asset.sequence.periodMs !== undefined && asset.sequence.periodMs !== periodMs)) return sheet;
    sequence = { steps: steps.map(({ id, durationMs }) => ({ id, durationMs })), periodMs };
  } else if (asset.frames.length !== 2) return sheet;
  if (!sheet.approvedStaticRevision && (sheet.ids.watch !== undefined || sheet.ids["watch-blink"] !== undefined)) return sheet;
  const ids = { ...sheet.ids };
  for (const [offset, frame] of asset.frames.entries()) ids[frame.id] = sheet.frames.length + offset;
  return { ...sheet, frames: [...sheet.frames, ...asset.frames], ids,
    motion: { ...sheet.motion, watch: { ...asset.motion, ...(sequence ? { sequence } : {}) } } };
}
