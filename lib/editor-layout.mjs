export const DOCK_CAPTION_ROWS = 3;
import { localize } from "./language.mjs";

// Keep the frame and decorations within terminal cell widths, including CJK
// text and the two-cell paw emoji. Tiny columns retain a bounded fallback.
export function renderDockCaption({ text = "", width, color = "accent", language, theme, visibleWidth, truncateToWidth }) {
  width = Math.max(0, Math.floor(width) || 0);
  const tint = (line) => theme.fg(color, line);
  if (!width) return Array(DOCK_CAPTION_ROWS).fill("");
  if (width === 1) return ["╭", "│", "╰"].map(tint);
  const inner = width - 2;
  const paw = "🐾", pairWidth = visibleWidth(paw) * 2;
  const gap = language === "en" ? "  " : " ";
  const fit = (value, cells) => {
    if (cells < 1) return "";
    const clipped = truncateToWidth(String(value), cells, "…");
    return visibleWidth(clipped) <= cells ? clipped : truncateToWidth(clipped, cells, "");
  };
  let content;
  // Decorations never borrow the text's cells. Tiny docks omit them rather
  // than squeezing emoji ink against the phrase or a neighboring side wall.
  if (inner >= pairWidth + visibleWidth(gap) * 2 + 1) {
    const available = inner - pairWidth - visibleWidth(gap) * 2;
    const words = fit(text, available);
    content = paw + gap + words + gap + paw;
  } else content = fit(text, inner);
  const spare = Math.max(0, inner - visibleWidth(content));
  const left = Math.floor(spare / 2), right = spare - left;
  return ["╭" + "─".repeat(inner) + "╮", "│" + " ".repeat(left) + content + " ".repeat(right) + "│", "╰" + "─".repeat(inner) + "╯"].map(tint);
}

export function dockGeometry(columns, rows, size = "auto") {
  if (columns < 60 || rows < 22) return { collapsed: true, columns: 0, captionColumns: 0, imageOffset: 0, rows: 0, leftWidth: 0 };
  let height = size === "large" ? 10 : size === "small" ? 6 : size === "compact" ? 7 : 8;
  height = Math.max(5, Math.min(height, rows - 16));
  const width = height * 2;
  // A wider caption uses horizontal breathing room without enlarging the art.
  // Retain the compact lane below 80 columns to protect the native editor.
  const captionColumns = Math.max(width, columns >= 120 ? 24 : columns >= 80 ? 20 : width);
  const imageOffset = Math.floor((captionColumns - width) / 2);
  return { collapsed: false, columns: width, captionColumns, imageOffset, rows: height, leftWidth: captionColumns + 3 };
}

export function activityLine(snapshot, width, theme, visibleWidth, truncateToWidth) {
  if (width < 1) return "";
  const status = theme.fg(snapshot.color, `${snapshot.glyph} ${snapshot.phrase}`);
  const detail = snapshot.responseIndicator || (snapshot.toolName ? `${snapshot.toolName}${snapshot.toolObject ? ` · ${snapshot.toolObject}` : ""}` : snapshot.label);
  const seconds = snapshot.busy && !snapshot.responseIndicator ? ` · ${Math.floor(snapshot.elapsedMs / 1000)}s` : "";
  const parallel = snapshot.toolCount > 1 ? ` · ${snapshot.toolCount} ${localize(snapshot.language, "个工具", "tools")}` : "";
  const right = theme.fg("dim", `${detail}${seconds}${parallel}`);
  if (width >= 86 && visibleWidth(status) + visibleWidth(right) + 3 <= width) {
    return status + " ".repeat(width - visibleWidth(status) - visibleWidth(right)) + right;
  }
  const suffix = theme.fg("dim", (snapshot.responseIndicator ? ` · ${Math.floor(snapshot.responseWaitMs / 1000)}s` : seconds) + parallel);
  if (snapshot.responseIndicator) {
    const clock = truncateToWidth(suffix, width, "");
    return truncateToWidth(status, Math.max(0, width - visibleWidth(clock)), "…") + clock;
  }
  return truncateToWidth(status + suffix, width, "…");
}

// The native Working caption and Umi's phrase share the same top border.
// Keep native hidden-line information visible without adding a second row.
export function activityBorder({ snapshot, width, hiddenLineCount = 0, theme, visibleWidth, truncateToWidth, borderColor = (text) => text }) {
  if (width < 1) return "";
  const overflow = hiddenLineCount > 0 ? ` ↑ ${hiddenLineCount} ${localize(snapshot.language, "行", "lines")} ` : "";
  if (width < 8 + visibleWidth(overflow)) {
    return borderColor(truncateToWidth(overflow || "─".repeat(width), width, ""));
  }
  const status = activityLine(snapshot, width - 5 - visibleWidth(overflow), theme, visibleWidth, truncateToWidth);
  return borderColor("── ") + status + borderColor(" " + "─".repeat(Math.max(0, width - 4 - visibleWidth(status) - visibleWidth(overflow))) + overflow);
}

// The native Pi editor has horizontal rules only. Reserve real columns before
// asking it to wrap input so side walls never cover a character or IME cursor.
export function editorFrameGeometry(width) {
  const outerWidth = Math.max(1, Math.floor(width) || 0);
  const inset = outerWidth >= 3 ? 1 : 0;
  return { outerWidth, inset, innerWidth: outerWidth - inset * 2 };
}

export function frameEditorLines({ nativeLines, width, visibleLineCount, borderColor = (text) => text, visibleWidth, truncateToWidth, cursorMarker = "" }) {
  const { inset, innerWidth } = editorFrameGeometry(width);
  const bottom = visibleLineCount + 1;
  const fit = (line) => {
    let text = truncateToWidth(line, innerWidth, "");
    // A two-cell grapheme cannot fit a one-cell native layout. Keep a bounded
    // hardware cursor in that extreme case without changing the user's draft.
    if (cursorMarker && line.includes(cursorMarker) && !text.includes(cursorMarker)) {
      const before = line.slice(0, line.indexOf(cursorMarker));
      const column = Math.min(innerWidth - 1, visibleWidth(before));
      const prefix = truncateToWidth(before, column, "");
      text = prefix + " ".repeat(Math.max(0, column - visibleWidth(prefix))) + cursorMarker + "\x1b[7m \x1b[27m";
    }
    return text + " ".repeat(Math.max(0, innerWidth - visibleWidth(text)));
  };
  return nativeLines.map((line, row) => {
    const text = fit(line);
    if (!inset) return text;
    if (row === 0) return borderColor("╭") + text + borderColor("╮");
    if (row === bottom) return borderColor("╰") + text + borderColor("╯");
    if (row < bottom) return borderColor("│") + text + borderColor("│");
    // Native completion is a separate list below the closed input box. Align
    // its cells and mouse events to the same content origin as the text input.
    return " " + text + " ";
  });
}

export function renderDock({ geometry, sheet, snapshot, renderAvatar, theme, visibleWidth, truncateToWidth, renderPixels, samplePixels, motionPlayer, animate = true }) {
  if (geometry.collapsed) return [];
  const width = geometry.columns;
  const captionColumns = geometry.captionColumns ?? width;
  const imageOffset = geometry.imageOffset ?? Math.max(0, Math.floor((captionColumns - width) / 2));
  const caption = renderDockCaption({ text: snapshot.bubble || "", width: captionColumns, color: snapshot.color, language: snapshot.language, theme, visibleWidth, truncateToWidth });
  // A blink keeps the current paw pose; it must not jump back to neutral.
  let face = snapshot.face;
  const visualPhase = snapshot.reaction || (snapshot.drowsy ? "dozing" : snapshot.visualPhase || snapshot.phase);
  if (snapshot.blink && visualPhase === "thinking" && sheet.ids["think-blink"] !== undefined) face = "think-blink";
  if (snapshot.blink && face === "think" && sheet.ids["think-blink"] !== undefined) face = "think-blink";
  if (face === "idle-blink" && ["reading", "editing", "running"].includes(visualPhase) && sheet.ids["work-blink"] !== undefined) face = "work-blink";
  // The motion player closes the eyes without replacing the current mouth.
  if (snapshot.blink && face === "happy" && sheet.ids["happy-blink"] !== undefined) face = "happy-blink";
  if (snapshot.blink && face === "concern" && sheet.ids["concern-blink"] !== undefined) face = "concern-blink";
  if (snapshot.blink && face === "idle-open") face = "idle-blink";
  if (face === "search" && sheet.ids.search === undefined) face = "work";
  if (face === "watch" && sheet.ids.watch === undefined) face = "work";
  if (face === "watch-blink" && sheet.ids["watch-blink"] === undefined) face = sheet.ids["work-blink"] !== undefined ? "work-blink" : "idle-blink";
  if (face === "listen" && sheet.ids.listen === undefined) face = "idle-open";
  if (face === "listen-blink" && sheet.ids["listen-blink"] === undefined) face = "idle-blink";
  if (face === "wait" && sheet.ids.wait === undefined) face = "idle-open";
  if (face === "wait-blink" && sheet.ids["wait-blink"] === undefined) face = "idle-blink";
  if (face === "error" && sheet.ids.error === undefined) face = "concern";
  if (face === "poke" && sheet.ids.poke === undefined) face = "idle-blink";
  const index = sheet.ids[face] ?? sheet.ids["idle-open"] ?? 0;
  const visual = motionPlayer?.frame(sheet, index, { animate: animate || snapshot.reaction === "poked", phase: visualPhase, blink: snapshot.blink,
    reactionElapsedMs: snapshot.reactionElapsedMs, reactionStrength: snapshot.reactionStrength });
  const displaySheet = visual?.sheet || sheet;
  const frameIndex = visual?.frameIndex ?? index;
  let pixels = renderAvatar?.({ frameIndex, columns: width, rows: geometry.rows, sheet: displaySheet });
  if (!pixels) {
    const frame = displaySheet.frames[frameIndex];
    pixels = renderPixels(samplePixels(frame, displaySheet.width, displaySheet.height, width, geometry.rows * 2), width, geometry.rows * 2, frame.palette || displaySheet.palette);
  }
  // The leading cells also move Sixel's existing OSC anchor; image sampling
  // still uses the original width, and the editor begins after the whole lane.
  const alignedPixels = pixels.map((line) => " ".repeat(imageOffset) + line + " ".repeat(Math.max(0, captionColumns - imageOffset - visibleWidth(line))));
  return [...caption, ...alignedPixels];
}

export function joinEditor({ width, nativeLines, dockLines, geometry, snapshot, theme, visibleWidth, truncateToWidth, editorInset = 0, nativeRenderWidth }) {
  const leftWidth = geometry.leftWidth;
  const editorWidth = Math.max(1, width - leftWidth - editorInset * 2);
  const offsetY = geometry.collapsed ? 0 : Math.max(0, Math.round((dockLines.length - nativeLines.length) / 2));
  const height = Math.max(dockLines.length, offsetY + nativeLines.length);
  const result = [];
  for (let row = 0; row < height; row++) {
    const left = dockLines[row] || "";
    const prefix = leftWidth ? left + " ".repeat(Math.max(0, leftWidth - visibleWidth(left))) : "";
    const right = nativeLines[row - offsetY] || "";
    result.push(prefix + right);
  }
  return { lines: result, offsetY, leftWidth, editorWidth, editorInset, contentX: leftWidth + editorInset, nativeRenderWidth: nativeRenderWidth ?? editorWidth, nativeHeight: nativeLines.length };
}
