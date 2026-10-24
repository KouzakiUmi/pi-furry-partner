// Public style names use Umi. Keep the original asset directories and accept
// earlier command/config IDs so existing installations continue to work.
export const STYLES = Object.freeze(["umi", "umi-pixel", "pixel", "illustration"]);
const aliases = Object.freeze({ wumi: "umi", "wumi-pixel": "umi-pixel" });
const directories = Object.freeze({ umi: "wumi", "umi-pixel": "wumi-pixel", pixel: "pixel", illustration: "illustration" });

export function normalizeStyle(value) {
  if (typeof value !== "string") return undefined;
  const canonical = Object.hasOwn(aliases, value) ? aliases[value] : value;
  return STYLES.includes(canonical) ? canonical : undefined;
}

export function styleAssetDirectory(value) {
  const style = normalizeStyle(value);
  return style ? directories[style] : undefined;
}
