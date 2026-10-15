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
  const rows = renderDock({ geometry, sheet, snapshot: { ...snapshot, bubble }, theme, visibleWidth, truncateToWidth,
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
