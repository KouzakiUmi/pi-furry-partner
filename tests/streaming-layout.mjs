import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createVTTerminal } from "./vt-terminal.mjs";
import { dockGeometry, renderDock, joinEditor, activityBorder } from "../lib/editor-layout.mjs";
import { renderPixels, samplePixels } from "../lib/renderer.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { styleAssetDirectory } from "../lib/styles.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const load = (path) => import(pathToFileURL(path).href);
const api = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
const { KeybindingsManager } = await load(join(modules, "@earendil-works/pi-coding-agent/dist/core/keybindings.js"));
const { CustomEditor } = await load(join(modules, "@earendil-works/pi-coding-agent/dist/modes/interactive/components/custom-editor.js"));
const { createSixelTransport } = await load(process.env.PI_TEST_SIXEL_TRANSPORT || join(root, "lib/sixel.mjs"));
const { TuiMainScreen, TuiAltScreen, visibleWidth, truncateToWidth, setKeybindings } = api;
const { createChatViewport } = await load(join(modules, "@earendil-works/pi-coding-agent/dist/modes/interactive/chat-viewport.js"));
const baseline = process.argv.includes("--baseline");
const keys = new KeybindingsManager(); setKeybindings(keys);
const source = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory("umi-pixel"), "reaction-sheet.json"), "utf8"));
const theme = { fg: (_, text) => text };
const editorTheme = { borderColor: (s) => s, selectList: { selectedPrefix: (s) => s, selectedText: (s) => s, description: (s) => s, scrollInfo: (s) => s, noMatch: (s) => s } };
const checks = [];

function run(graphics, fullscreen = false) {
  const vt = createVTTerminal({ columns: 100, rows: 40, visibleWidth });
  const screen = fullscreen ? new TuiAltScreen(vt.terminal, true, undefined, { mouse: false }) : new TuiMainScreen(vt.terminal, true);
  screen.requestRender = () => {};
  let clock = 0, display = source, frame = 0;
  const motion = createMotionPlayer({ now: () => clock });
  const currentSnapshot = () => ({ phase: frame % 80 < 40 ? "speaking" : "running", face: frame % 80 < 40 ? ["talk-small", "talk-medium", "talk-wide"][frame % 3] : "work", blink: false, bubble: frame % 80 < 40 ? "..." : "typing", color: "accent", glyph: "*", phrase: "STREAM-PHRASE", label: "Busy", busy: true, elapsedMs: clock, toolCount: frame % 80 < 40 ? 0 : 2, toolName: "bash", toolObject: "" });
  class LiveEditor extends CustomEditor {
    renderTopBorder(width, hiddenLineCount) { return activityBorder({ snapshot: currentSnapshot(), width, hiddenLineCount, theme, visibleWidth, truncateToWidth, borderColor: (text) => this.borderColor(text) }); }
  }
  const editor = new LiveEditor(screen, editorTheme, keys, { embedWorkingStatus: true });
  editor.focused = true;
  editor.setWorkingStatusIndicator({ renderInBorder: () => "Working", renderSpinnerInBorder: () => "*" });
  const transport = graphics ? createSixelTransport(vt.terminal, () => ({ widthPx: 10, heightPx: 20 }), () => display, () => "wumi-pixel", () => true, { WT_SESSION: "stream-regression" }, visibleWidth) : undefined;
  const transcript = [];
  let delta = "", geometry;
  const document = { render: () => ["TRANSCRIPT", ...transcript, `assistant ${delta}`], invalidate() {} };
  const dock = {
    render(width) {
      const shape = dockGeometry(width, vt.terminal.rows);
      const nativeLines = editor.render(width - shape.leftWidth);
      const snapshot = currentSnapshot();
      const left = renderDock({ geometry: shape, sheet: source, snapshot, theme, visibleWidth, truncateToWidth, renderPixels, samplePixels,
        motionPlayer: motion,
        renderAvatar({ sheet, ...args }) {
          display = sheet;
          return transport?.render(args) || Array.from({ length: shape.rows }, (_, row) => `avatar ${row}`.padEnd(shape.columns));
        },
      });
      geometry = joinEditor({ width, nativeLines, dockLines: left, geometry: shape, snapshot, theme, visibleWidth, truncateToWidth });
      return geometry.lines;
    }, invalidate() {},
  };
  const footer = { render: () => ["MODEL test-provider/test-model", "TOKENS 123"], invalidate() {} };
  screen.addChild(document); screen.addChild(dock); screen.addChild(footer);
  if (fullscreen) {
    const empty = { render: () => [], invalidate() {} };
    screen.setLayoutRoot(createChatViewport({ document, editor: dock, footer, pendingMessages: empty, status: empty, scrollbar: "never" }).root);
    screen.start();
  }
  const mismatch = [], duplicateWorking = [], drift = [];
  for (frame = 0; frame < 180; frame++) {
    clock = frame * 50;
    if (frame === 100) { vt.terminal.columns = 80; vt.terminal.rows = 34; }
    if (frame === 130) { vt.terminal.columns = 100; vt.terminal.rows = 40; }
    if (frame % 2 === 0) { transcript.push(`assistant completed line ${frame}: ${"result ".repeat(frame % 4 + 1)}`); delta = ""; }
    delta += `token${frame} `;
    if (frame % 35 === 0) transcript.push(`tool ${Math.floor(frame / 35)}: command started`, "tool output one", "tool output two");
    if (frame === 60) editor.setText(Array.from({ length: 12 }, (_, i) => `queued input ${i}`).join("\n"));
    if (frame === 82) editor.setText("");
    screen.renderNow();
    const state = fullscreen ? undefined : screen.captureRenderState();
    const expected = (fullscreen ? screen.getScreenLines() : state.previousLines.slice(state.previousViewportTop, state.previousViewportTop + vt.terminal.rows)).map((line) => stripTerminalSequences(line).trimEnd());
    while (expected.length < vt.terminal.rows) expected.push("");
    const actual = vt.screen;
    const first = expected.findIndex((line, i) => line !== actual[i]);
    if (first >= 0 && mismatch.length < 8) mismatch.push({ frame, row: first, expected: expected[first], actual: actual[first] });
    const working = actual.filter((line) => line.includes("STREAM-PHRASE")).length;
    if (working !== 1 && duplicateWorking.length < 8) duplicateWorking.push({ frame, count: working });
    if (!fullscreen) {
      const expectedY = state.hardwareCursorRow - state.previousViewportTop;
      if ((expectedY !== vt.cursor.y || state.previousViewportTop !== vt.cursor.top) && drift.length < 8) drift.push({ frame, expectedY, actualY: vt.cursor.y, expectedTop: state.previousViewportTop, actualTop: vt.cursor.top });
    }
    assert.ok(geometry.lines.filter((line) => stripTerminalSequences(line).includes("STREAM-PHRASE")).length === 1, "The actual editor layout must produce only one dynamic status border");
    assert.ok(!geometry.lines.map(stripTerminalSequences).join("\n").includes("Working"),"Native Working text must not duplicate the Wumi status border");
  }
  const streamingCounters = { ...vt.counters };
  // Mutating an old tool's result is a distinct native regular-mode limitation.
  transcript[1] = "tool old result completed; duration 9.5s";
  screen.renderNow();
  const oldToolRevision = { extraClearScrollbacks: vt.counters.clearScrollbacks - streamingCounters.clearScrollbacks, extraClearScreens: vt.counters.clearScreens - streamingCounters.clearScreens };
  const result = { graphics, fullscreen, frames: frame, transcriptLines: transcript.length, counters: streamingCounters, oldToolRevision, cursor: vt.cursor, imageCellsInHistory: vt.imageCellsInHistory,
    workingBordersInHistory: vt.history.filter((line) => line.includes("STREAM-PHRASE")).length, mismatch, duplicateWorking, drift };
  transport?.dispose(); motion.dispose(); if (fullscreen) screen.stop({ preserveScreen: true });
  return result;
}

const control = run(false);
assert.deepEqual(control.mismatch, [], "Growing regular-mode text must match Pi's desired viewport");
assert.deepEqual(control.duplicateWorking, [], "Native text rendering must retain exactly one Working border");
assert.deepEqual(control.drift, [], "Text-only cursor/scroll bookkeeping must stay aligned");
assert.equal(control.workingBordersInHistory, 0, "Old native input borders must not be left in text scrollback");
checks.push("Text-only real Pi regular-mode streaming grows assistant/tool history across viewport and editor-height boundaries without duplicate Working borders or cursor drift");
assert.equal(control.oldToolRevision.extraClearScrollbacks, 1, "Regular mode must document its native full redraw when an offscreen old tool row changes");
const fullscreenControl = run(false, true);
assert.deepEqual(fullscreenControl.mismatch, []);
assert.equal(fullscreenControl.counters.textScrolls, 0, "The official fullscreen input dock must not scroll terminal history while output grows");
assert.equal(fullscreenControl.oldToolRevision.extraClearScrollbacks, 0);
assert.deepEqual(fullscreenControl.duplicateWorking, []);
checks.push("Official Pi createChatViewport fullscreen layout isolates the fixed input/footer from growing or revised transcript rows; regular mode independently requires a full scrollback redraw for an offscreen old-row revision");
const graphics = run(true);
const fullscreenGraphics = run(true, true);
if (!baseline) {
  for (const result of [graphics, fullscreenGraphics]) {
    assert.equal(result.counters.sixelScrolls, 0, "Sixel six-band raster padding must never cause extra native scrolls");
    assert.deepEqual(result.mismatch, [], "Graphics must preserve the exact text viewport during output growth");
    assert.deepEqual(result.duplicateWorking, [], "Graphics must not duplicate or lose native Working borders");
    assert.deepEqual(result.drift, [], "Graphics must preserve Pi's cursor/viewport bookkeeping");
    assert.equal(result.workingBordersInHistory, 0);
    assert.equal(result.imageCellsInHistory, 0, "Old avatar images must be cleared before entering history");
  }
  checks.push("Regular and official fullscreen product Sixel survive 180 live streaming/50ms motion frames, six-pixel band padding, tool growth, input-height changes and two resizes with zero extra scrolls, stale images or native cursor drift");
}
const report = { testedAt: new Date().toISOString(), piVersion: version, modelRequests: 0, verification: "Real Pi main/fullscreen renderers, official fixed-dock ChatViewport, CustomEditor/product dock/motion and deterministic VT model including WT six-band raster overflow; not a native-window screenshot", baseline, checks, control, fullscreenControl, graphics, fullscreenGraphics, passed: !baseline };
const reportPath = baseline ? join(root, "work/streaming-layout-baseline.json") : join(root, "tests/streaming-layout-validation.json");
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
