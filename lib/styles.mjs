// Both editions share one illustration source and the original pixel artwork.
// Historical IDs remain input aliases, never extra visible styles.
export const STYLES = Object.freeze(["umi", "umi-pixel"]);
export const DSH_STYLES = Object.freeze(['umi', 'umi-pixel']);
export function normalizeDshStyle(value) {
  return normalizeStyle(value);
}
const directories = Object.freeze({ umi: "umi", "umi-pixel": "pixel" });

const aliases = Object.freeze({ wumi: "umi", "wumi-pixel": "umi-pixel", pixel: "umi-pixel", illustration: "umi" });

export function normalizeStyle(value) {
  if (typeof value !== "string") return undefined;
  const canonical = Object.hasOwn(aliases, value) ? aliases[value] : value;
  return STYLES.includes(canonical) ? canonical : undefined;
}

export function styleAssetDirectory(value) {
  const style = normalizeStyle(value);
  return style ? directories[style] : undefined;
}
