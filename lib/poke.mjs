// A local reaction must never submit a message or modify the real agent state.
export const POKE_DURATION_MS = 1100;

export function withPokeFrame(sheet, patch) {
  if (!patch || patch.width !== sheet.width || patch.height !== sheet.height || !Array.isArray(patch.pixels)) return sheet;
  const base = sheet.frames[sheet.ids[patch.base]];
  if (!base) return sheet;
  const pixels = base.pixels.slice();
  for (const entry of patch.pixels) {
    const [index, color] = entry;
    if (!Number.isInteger(index) || !Number.isInteger(color) || index < 0 || index >= pixels.length || color < 0 || color >= sheet.palette.length) return sheet;
    // Poking changes the face, never the silhouette or transparent margins.
    if (pixels[index] === (sheet.transparentIndex ?? 0) || color === (sheet.transparentIndex ?? 0)) return sheet;
    pixels[index] = color;
  }
  return { ...sheet, frames: [...sheet.frames, { id: "poke", pixels }], ids: { ...sheet.ids, poke: sheet.frames.length } };
}
