// Additional authored poses share the immutable main sheet's indexed palette.
// Older packs without the asset keep the ordinary work-pose fallback.
export function withWatchFrames(sheet, asset) {
  if (!asset || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length !== 2 ||
      asset.frames[0]?.id !== "watch" || asset.frames[1]?.id !== "watch-blink") return sheet;
  const count = sheet.width * sheet.height;
  for (const frame of asset.frames) {
    if (!Array.isArray(frame.pixels) || frame.pixels.length !== count ||
        frame.pixels.some((color) => !Number.isInteger(color) || color < 0 || color >= sheet.palette.length)) return sheet;
  }
  if (sheet.ids.watch !== undefined || sheet.ids["watch-blink"] !== undefined) return sheet;
  const ids = { ...sheet.ids };
  for (const [offset, frame] of asset.frames.entries()) ids[frame.id] = sheet.frames.length + offset;
  return { ...sheet, frames: [...sheet.frames, ...asset.frames], ids,
    motion: { ...sheet.motion, watch: asset.motion } };
}
