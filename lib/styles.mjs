// Main exposes the illustrated companion only. Historical settings migrate to
// that rendition; pixel artwork belongs to the separate legacy release line.
export const STYLES = Object.freeze(["umi"]);
export const DSH_STYLES = Object.freeze(['umi']);
export function normalizeDshStyle(value) {
  return normalizeStyle(value);
}
const directories = Object.freeze({ umi: "umi" });

const aliases = Object.freeze({ wumi: "umi", "wumi-pixel": "umi", "umi-pixel": "umi", pixel: "umi", illustration: "umi" });

export function normalizeStyle(value) {
  if (typeof value !== "string") return undefined;
  const canonical = Object.hasOwn(aliases, value) ? aliases[value] : value;
  return STYLES.includes(canonical) ? canonical : undefined;
}

export function styleAssetDirectory(value) {
  const style = normalizeStyle(value);
  return style ? directories[style] : undefined;
}
