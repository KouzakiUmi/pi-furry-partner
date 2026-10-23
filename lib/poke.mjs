// A local reaction must never submit a message or modify the real agent state.
export const POKE_DURATION_MS = 1100;

export function withPokeFrame(sheet, patch) {
  // Complete approved poses take precedence over legacy sparse face patches.
  if (sheet.ids?.poke !== undefined) return sheet;
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
  const face = patch.motion?.face;
  const point = (value) => Array.isArray(value) && value.length === 2 && value.every((axis) => Number.isFinite(axis) && axis >= 0 && axis <= 1);
  const shapeValid = face?.normalized === true && Array.isArray(face.polygon) && face.polygon.length >= 3 && face.polygon.length <= 64 && face.polygon.every(point) && point(face.pivot);
  const area = shapeValid ? Math.abs(face.polygon.reduce((sum, [x, y], i) => { const next = face.polygon[(i + 1) % face.polygon.length]; return sum + x * next[1] - next[0] * y; }, 0)) / 2 : 0;
  const safeFace = area > 1e-6 ? { polygon: face.polygon.map((value) => [...value]), pivot: [...face.pivot], normalized: true, paddingNormalized: .01 } : undefined;
  // Optional local-deformation landmarks do not change the one-frame format.
  // Older patches keep their original metadata and use the whole-body reaction.
  return { ...sheet, frames: [...sheet.frames, { id: "poke", pixels }], ids: { ...sheet.ids, poke: sheet.frames.length },
    ...(safeFace ? { motion: { ...sheet.motion, pokeFace: safeFace } } : {}) };
}
