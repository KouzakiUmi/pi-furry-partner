// The renderer uses only terminal cells; no image protocol or network is needed.
const RESET = "\x1b[0m";
import { localize } from "./language.mjs";
const fg = (rgb) => `\x1b[38;2;${rgb.join(";")}m`;
const bg = (rgb) => `\x1b[48;2;${rgb.join(";")}m`;

export function safeText(value) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

export function headerCanAnimate(tui) {
  if (tui.mode !== "regular") return true;
  // Pi 1.2 main-screen would clear scrollback if a changed header is above the viewport.
  // Fail closed on older renderers without this public concrete-renderer method.
  if (typeof tui.captureRenderState !== "function") return false;
  return tui.captureRenderState().previousViewportTop === 0;
}

export function samplePixels(frame, sourceWidth, sourceHeight, width, height) {
  if (width === sourceWidth && height === sourceHeight) return frame.pixels;
  return Array.from({ length: width * height }, (_, i) => {
    const x = Math.min(sourceWidth - 1, Math.floor((i % width + 0.5) * sourceWidth / width));
    const y = Math.min(sourceHeight - 1, Math.floor((Math.floor(i / width) + 0.5) * sourceHeight / height));
    return frame.pixels[y * sourceWidth + x];
  });
}

export function terminalVariants(native) {
  const variants = {};
  for (const [name, edge] of [["small", 24], ["compact", 32], ["normal", 40], ["large", 52]]) {
    variants[name] = {
      width: edge, height: edge,
      frames: native.frames.map((frame) => ({ ...frame, pixels: samplePixels(frame, native.width, native.height, edge, edge) })),
    };
  }
  return { ...native, variants };
}

export function renderPixels(pixels, width, height, palette) {
  const lines = [];
  for (let y = 0; y < height; y += 2) {
    let line = "";
    let lastPair = "";
    for (let x = 0; x < width; x++) {
      const upper = pixels[y * width + x] ?? 0;
      const lower = y + 1 < height ? (pixels[(y + 1) * width + x] ?? 0) : 0;
      const pair = `${upper}:${lower}`;
      if (pair !== lastPair) {
        line += RESET;
        if (upper) line += fg(palette[upper]);
        else if (lower) line += fg(palette[lower]);
        if (upper && lower && upper !== lower) line += bg(palette[lower]);
        lastPair = pair;
      }
      // Default terminal background remains visible in every transparent half.
      line += upper ? (lower ? (upper === lower ? "█" : "▀") : "▀") : (lower ? "▄" : " ");
    }
    lines.push(line + RESET);
  }
  return lines;
}

export function chooseSize(variants, requested, columns, rows) {
  let name = requested;
  if (name === "auto" || !variants[name]) {
    name = rows >= 52 && columns >= 105 ? "normal" : rows >= 36 && columns >= 72 ? "compact" : "small";
  }
  const variant = variants[name] ?? variants.small;
  // Leave room for Pi's native editor, footer, spacers and this header's own captions.
  const edge = Math.max(1, Math.min(variant.width, columns - 4, Math.max(4, (rows - 14) * 2)));
  return { name, variant, width: edge, height: Math.max(2, Math.floor(edge * variant.height / variant.width / 2) * 2) };
}

export function createHeader({ sheet, getSettings, getSnapshot, getRows, theme, visibleWidth, truncateToWidth, renderAvatar }) {
  let frameIndex = 0;
  const cache = new Map();
  const fit = (s, w) => truncateToWidth(s, Math.max(0, w), "…");
  return {
    get frameIndex() { return frameIndex; },
    setFrame(index) { frameIndex = index; },
    invalidate() { cache.clear(); },
    render(width) {
      if (width <= 0) return [];
      const settings = getSettings();
      const l = (zh, en) => localize(settings.language, zh, en);
      const snapshot = getSnapshot();
      const { variant, width: edge, height } = chooseSize(sheet.variants, settings.size, width, getRows());
      const index = frameIndex % variant.frames.length;
      const key = `${variant.width}:${edge}:${height}:${index}`;
      let avatar = renderAvatar?.({ frameIndex: index, columns: edge, rows: height / 2, width: edge, height });
      avatar ??= cache.get(key);
      if (!avatar) {
        const pixels = samplePixels(variant.frames[index], variant.width, variant.height, edge, height);
        avatar = renderPixels(pixels, edge, height, sheet.palette);
        cache.set(key, avatar);
      }
      const name = safeText(settings.name);
      const title = theme.bold(theme.fg("accent", name));
      const state = theme.fg(snapshot.busy ? "warning" : "success", `● ${safeText(snapshot.status)}`);
      const model = safeText(snapshot.model || l("尚未选择模型", "No model selected"));
      const provider = safeText(snapshot.provider);
      const info = [
        title,
        theme.fg("muted", safeText(settings.subtitle)),
        "",
        state,
        theme.fg("dim", "MODEL") + "  " + theme.fg("text", model),
        theme.fg("dim", "PROVIDER") + "  " + theme.fg("muted", provider || "—"),
        "",
        theme.fg("muted", l("/model  切换模型   /settings  设置", "/model  Models   /settings  Settings")),
        theme.fg("dim", l("/mascot pause  暂停动画", "/mascot pause  Pause animation")),
      ];
      let lines;
      if (width >= edge + 34) {
        const top = Math.max(0, Math.floor((avatar.length - info.length) / 2));
        lines = avatar.map((line, i) => `  ${line}   ${fit(info[i - top] ?? "", width - edge - 5)}`);
      } else {
        const left = " ".repeat(Math.max(0, Math.floor((width - edge) / 2)));
        lines = avatar.map((line) => left + line);
        lines.push(`  ${title}  ${state}`);
      }
      const rule = theme.fg("borderMuted", "─".repeat(Math.max(0, width - 4)));
      const footer = width >= 48 ? theme.fg("dim", l("  输入想做的事，让我们开始吧。", "  Tell me what you'd like to make. Let's begin.")) : "";
      return ["", ...lines, "", `  ${rule}`, ...(footer ? [footer] : [])].map((line) => fit(line, width));
    },
  };
}
