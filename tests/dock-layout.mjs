import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOCK_CAPTION_ROWS, dockGeometry, renderDock, renderDockCaption, joinEditor } from "../lib/editor-layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const load = (file) => import(pathToFileURL(file).href);
const { CURSOR_MARKER, visibleWidth, truncateToWidth } = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
const theme = { fg: (_, text) => `\x1b[36m${text}\x1b[0m` };
const sheet = { width: 1, height: 1, transparentIndex: 0, palette: [[0, 0, 0]], ids: { "idle-open": 0 }, frames: [{ id: "idle-open", pixels: [0] }] };
const snapshot = { face: "idle-open", phase: "idle", color: "accent", glyph: "🐾", phrase: "caption fixture", bubble: "我在" };
const checks = [], cases = [];
const paint = (width, bubble, extra = {}) => {
  const geometry = { collapsed: false, columns: width, rows: 6, leftWidth: width + 3 };
  const rows = renderDock({ geometry, sheet, snapshot: { ...snapshot, bubble, language: extra.language }, theme, visibleWidth, truncateToWidth,
    renderAvatar: ({ columns, rows }) => Array.from({ length: rows }, (_, i) => `A${i}`.padEnd(columns).slice(0, columns)), ...extra });
  return { geometry, rows, plain: rows.map(stripTerminalSequences) };
};

assert.equal(DOCK_CAPTION_ROWS, 3);
assert.equal(visibleWidth("🐾"), 2, "Caption fixtures use Pi's actual terminal-cell measurement for paws");
for (const width of [12, 14, 16, 20]) {
  for (const bubble of ["我在", "···", "Hi", "中🙂", "e\u0301"]) {
    const { rows, plain } = paint(width, bubble);
    assert.equal(rows.length, DOCK_CAPTION_ROWS + 6);
    assert.equal(plain[0], "╭" + "─".repeat(width - 2) + "╮");
    assert.equal(plain[2], "╰" + "─".repeat(width - 2) + "╯");
    assert.ok(plain[1].startsWith("│") && plain[1].endsWith("│"), "The short phrase sits in a complete side wall rather than in the bottom border");
    assert.equal((plain[1].match(/🐾/gu) || []).length, 2);
    const inner = plain[1].slice(1, -1), index = inner.indexOf(bubble);
    assert.ok(index >= 0, `${width}-cell caption preserves a short fitting CJK/emoji phrase`);
    const left = visibleWidth(inner.slice(0, index)), right = visibleWidth(inner.slice(index + bubble.length));
    assert.ok(Math.abs(left - right) <= 1, `${width}-cell caption centers the visible phrase to within one cell (${left}/${right})`);
    assert.ok(inner.indexOf("🐾") < index && inner.lastIndexOf("🐾") > index, "One paw appears on either side of the phrase");
    for (const row of rows.slice(0, DOCK_CAPTION_ROWS)) assert.equal(visibleWidth(row), width);
    assert.ok(plain[DOCK_CAPTION_ROWS].startsWith("A0"), "The avatar starts immediately after all three caption rows");
    cases.push({ width, bubble, leftCells: left, rightCells: right });
  }
}
const copy = JSON.parse(await readFile(join(root, "assets/status-copy.json"), "utf8"));
for (const [phase, bubble] of Object.entries(copy.bubbles)) {
  const { plain } = paint(16, bubble);
  assert.ok(plain[1].includes(bubble), `The real ${phase} short caption fits whole inside the normal 16-cell paw frame`);
  assert.ok(!plain[1].includes("…")); assert.equal((plain[1].match(/🐾/gu) || []).length, 2);
}
checks.push("All normal 12/14/16/20-cell docks use a complete three-row frame with two two-cell paws and cell-centered CJK/emoji; every real short caption fits whole in the normal 16-cell dock");

const englishCopy = JSON.parse(await readFile(join(root, "assets/status-copy.en.json"), "utf8"));
for (const [key, bubble] of Object.entries(englishCopy.bubbles)) {
  assert.ok(visibleWidth(bubble) <= 10, `${key} must leave two cells between each paw and the text`);
  const { plain } = paint(20, bubble, { language: "en" });
  assert.equal(visibleWidth(plain[1]), 20);
  assert.ok(plain[1].includes(bubble), `The ${key} bubble fits without truncation`);
  const [before, words, after] = plain[1].split("🐾");
  assert.equal(visibleWidth(before + "🐾" + words + "🐾" + after), 20);
  assert.ok(words.startsWith("  ") && words.endsWith("  "), `${key}: English text cannot touch the paw ink`);
  assert.equal(words.trim(), bubble);
}
for (const language of ["en", "zh-CN"]) for (let width = 0; width <= 80; width++) {
  for (const text of ["Still here! I'm listening to your idea", "中文🙂👩‍💻正在认真思考", "e\u0301 and cafe\u0301", "\x1b[35mLONG styled text\x1b[0m", "z · z · z"]) {
    const lines = renderDockCaption({ text, width, language, theme, visibleWidth, truncateToWidth });
    for (const line of lines) assert.equal(visibleWidth(line), width, `${language}: exact caption width at ${width}`);
    if (width >= 2) {
      const middle = stripTerminalSequences(lines[1]);
      assert.ok(middle.startsWith("│") && middle.endsWith("│"));
      const pieces = middle.split("🐾");
      if (pieces.length === 3) {
        const gap = language === "en" ? "  " : " ";
        assert.ok(pieces[1].startsWith(gap) && pieces[1].endsWith(gap), `${language}: reserved paw spacing at ${width}`);
      }
      assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(middle));
    }
  }
}
checks.push("Every English bubble, including poke and listening, fits the normal dock with two-cell paw gaps; real Pi widths 0–80 clip long ANSI/CJK/combining/emoji text without invading paws or side walls");

for (const terminalWidth of [60, 79, 80, 100, 119, 120, 140, 160]) {
  const geometry = dockGeometry(terminalWidth, 40);
  assert.equal(geometry.columns, 16, "A wider caption cannot enlarge the normal avatar");
  assert.equal(geometry.rows, 8);
  const captionWidth = terminalWidth >= 120 ? 24 : terminalWidth >= 80 ? 20 : 16;
  assert.equal(geometry.captionColumns, captionWidth);
  assert.equal(geometry.imageOffset, (captionWidth - 16) / 2);
  assert.equal(geometry.leftWidth, captionWidth + 3);
  assert.ok(terminalWidth - geometry.leftWidth >= 41, "Narrow terminals retain at least the original native editing space");
  let imageRequest;
  const rows = renderDock({ geometry, sheet, snapshot: { ...snapshot, bubble: "All ears", language: "en" }, theme, visibleWidth, truncateToWidth,
    renderAvatar(request) { imageRequest = request; return Array.from({ length: request.rows }, (_, i) => `A${i}`.padEnd(request.columns)); } });
  assert.equal(imageRequest.columns, 16);
  assert.equal(imageRequest.rows, 8);
  assert.ok(stripTerminalSequences(rows[3]).startsWith(" ".repeat(geometry.imageOffset) + "A0"));
  for (const row of rows) assert.equal(visibleWidth(row), captionWidth);
  const framedNative = ["─".repeat(terminalWidth - geometry.leftWidth), "│ " + CURSOR_MARKER + "draft│", "─".repeat(terminalWidth - geometry.leftWidth)];
  const combined = joinEditor({ width: terminalWidth, nativeLines: framedNative, dockLines: rows, geometry, snapshot, theme, visibleWidth, truncateToWidth, editorInset: 1 });
  assert.equal(combined.contentX, geometry.leftWidth + 1);
  assert.equal(visibleWidth(combined.lines[combined.offsetY + 1].split(CURSOR_MARKER)[0]), geometry.leftWidth + 2);
  assert.ok(combined.lines.every((line) => visibleWidth(line) <= terminalWidth));
}
checks.push("80/120-column thresholds widen only the caption to 20/24 cells; the 16×8 avatar is centered by 2/4 cells and native editor/cursor follow the caption lane without double offsets");

assert.deepEqual(renderDockCaption({ text: "中文🙂", width: 0, theme, visibleWidth, truncateToWidth }).map(stripTerminalSequences), ["", "", ""]);
for (let width = 1; width <= 80; width++) {
  for (const bubble of ["", "·", "思考中", "中文🙂👩‍💻", "e\u0301一起想", "很长的中文短句🙂正在认真寻找相关资料"] ) {
    const { rows, plain } = paint(width, bubble);
    assert.equal(rows.length, DOCK_CAPTION_ROWS + 6);
    for (const row of rows) {
      assert.ok(visibleWidth(row) <= width, `Caption or avatar overflow at ${width} cells`);
      assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(stripTerminalSequences(row)), "Truncation must not leave an unpaired emoji surrogate");
    }
    if (width >= 2) {
      assert.ok(plain[0].startsWith("╭") && plain[0].endsWith("╮"));
      assert.ok(plain[1].startsWith("│") && plain[1].endsWith("│"));
      assert.ok(plain[2].startsWith("╰") && plain[2].endsWith("╯"));
    }
    if (width >= 12) assert.equal((plain[1].match(/🐾/gu) || []).length, 2);
  }
}
checks.push("Widths 1–80 handle empty, long, combining, CJK and multi-codepoint emoji phrases without overflow or split surrogates; tiny docks degrade decoration while retaining the closed frame whenever two cells fit");

let collapsedAvatarCalls = 0;
assert.deepEqual(renderDock({ geometry: { collapsed: true }, renderAvatar() { collapsedAvatarCalls++; } }), []);
assert.equal(collapsedAvatarCalls, 0);
for (const size of ["small", "compact", "auto", "large"]) {
  for (const width of [60, 61, 70, 80, 100, 160]) {
    const geometry = dockGeometry(width, 40, size), editorWidth = width - geometry.leftWidth;
    const native = ["─".repeat(editorWidth), "    " + CURSOR_MARKER + "原生🙂", "─".repeat(editorWidth)];
    const dock = renderDock({ geometry, sheet, snapshot, theme, visibleWidth, truncateToWidth,
      renderAvatar: ({ columns, rows }) => Array.from({ length: rows }, () => "A".repeat(columns)) });
    const combined = joinEditor({ width, nativeLines: native, dockLines: dock, geometry, snapshot, theme, visibleWidth, truncateToWidth });
    assert.equal(dock.length, geometry.rows + DOCK_CAPTION_ROWS);
    for (const row of combined.lines) assert.ok(visibleWidth(row) <= width);
    const markerRow = combined.lines.findIndex((line) => line.includes(CURSOR_MARKER));
    assert.equal(markerRow, combined.offsetY + 1);
    assert.equal(visibleWidth(combined.lines[markerRow].split(CURSOR_MARKER)[0]), geometry.leftWidth + 4);
  }
}
checks.push("Small/compact/normal/large caption heights join the native editor without widening rows or changing the reported cursor offsets, and collapsed docks add no caption or avatar work");

const report = { testedAt: new Date().toISOString(), piVersion: version, modelRequests: 0, passed: true,
  verification: "Product renderDock/joinEditor and real Pi terminal-cell width functions; ANSI-styled CJK/emoji fixtures, no native-window automation", captionRows: DOCK_CAPTION_ROWS, checks, cases };
await writeFile(join(root, "tests/dock-layout-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
