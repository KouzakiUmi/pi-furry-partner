import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodeSixelStripe, createSixelTransport, graphicsMode, sixelCellDimensions } from "../lib/sixel.mjs";
import { createVTTerminal } from "./vt-terminal.mjs";

// Protocol-level verification: real Pi renderers and the product adapter, with a
// fake terminal sink. This verifies bytes/cropping, not native display pixels.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const api = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/index.js")));
const { extractAnsiCode, stripTerminalSequences } = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/utils.js")));
const { TuiMainScreen, TuiAltScreen, ScrollView, visibleWidth, truncateToWidth, sliceByColumn, compositeTuiLine } = api;
const { getCapabilities, setCapabilities, getCellDimensions, setCellDimensions } = api;
const checks = [];

function decodeSixel(encoded) {
  assert.ok(encoded.startsWith("\x1bP") && encoded.endsWith("\x1b\\"));
  const data = encoded.slice(encoded.indexOf("q") + 1, -2);
  const raster = /^"(\d+);(\d+);(\d+);(\d+)/.exec(data);
  assert.ok(raster, "Sixel raster dimensions are required");
  const width = +raster[3], height = +raster[4];
  const pixels = new Array(width * height).fill(0);
  const palette = new Map();
  let i = raster[0].length, x = 0, y = 0, color = 0;
  const paint = (character, count = 1) => {
    const bits = character.charCodeAt(0) - 63;
    assert.ok(bits >= 0 && bits < 64);
    for (let repeat = 0; repeat < count; repeat++, x++) {
      for (let bit = 0; bit < 6; bit++) {
        if (!(bits & (1 << bit))) continue;
        assert.ok(x < width && y + bit < height, "Nontransparent pixels must fit the declared raster");
        pixels[(y + bit) * width + x] = color;
      }
    }
  };
  while (i < data.length) {
    const ch = data[i++];
    if (ch === "#") {
      const match = /^[0-9;]+/.exec(data.slice(i));
      assert.ok(match);
      i += match[0].length;
      const values = match[0].split(";").map(Number);
      color = values[0];
      if (values.length > 1) {
        assert.equal(values[1], 2);
        palette.set(color, values.slice(2));
      }
    } else if (ch === "!") {
      const match = /^\d+/.exec(data.slice(i));
      assert.ok(match);
      i += match[0].length;
      paint(data[i++], +match[0]);
    } else if (ch === "$") x = 0;
    else if (ch === "-") { x = 0; y += 6; }
    else paint(ch);
  }
  return { width, height, pixels, palette };
}

const palette = [[0, 0, 0], [255, 255, 255], [20, 30, 40], [240, 100, 60], [0, 180, 255]];
for (const [width, height] of [[1,1], [9,6], [37,20], [64,24]]) {
  const pixels = Array.from({ length: width * height }, (_, i) => ((i * 17 + Math.floor(i / width) * 3) % 11 < 4 ? 0 : i % 4 + 1));
  const encoded = encodeSixelStripe(pixels, width, height, palette);
  const decoded = decodeSixel(encoded);
  assert.deepEqual(decoded.pixels, pixels);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  for (const color of new Set(pixels.filter(Boolean))) {
    assert.deepEqual(decoded.palette.get(color), palette[color].map((n) => Math.round(n * 100 / 255)));
  }
}
assert.deepEqual(decodeSixel(encodeSixelStripe(new Array(40).fill(0), 5, 8, palette)).pixels, new Array(40).fill(0));
const solidEncoded = encodeSixelStripe(new Array(120).fill(1), 20, 6, palette);
assert.match(solidEncoded, /!20~/);
assert.ok(solidEncoded.startsWith("\x1bP0;1;0q"), "P2=1 preserves transparent pixels");
checks.push("Product Sixel encoder independently decoded: palette, transparency, RLE and final bands shorter than 6 pixels");

const cell = { widthPx: 10, heightPx: 20 };
const sourceWidth = 60, sourceHeight = 240;
const sheet = {
  width: sourceWidth, height: sourceHeight, palette,
  frames: [0,1].map((frame) => ({ pixels: Array.from({ length: sourceWidth * sourceHeight }, (_, i) => {
    const x = i % sourceWidth, y = Math.floor(i / sourceWidth);
    return (x + y) % 7 === 0 ? 0 : (Math.floor(y / 20) + x + frame) % 4 + 1;
  }) })),
};
const dcStrings = (writes) => writes.join("").match(/\x1bP[\s\S]*?\x1b\\/g) || [];
const expectedStripe = (frame, stripe) => sheet.frames[frame].pixels.slice(stripe * 20 * sourceWidth, (stripe + 1) * 20 * sourceWidth);
function terminalSink(columns = 80, rows = 24) {
  const writes = [];
  const terminal = {
    columns, rows, kittyProtocolActive: false,
    start() {}, stop() {}, hideCursor() {}, showCursor() {}, moveBy() {},
    clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {},
    setProgress() {}, setProgramStatus() {}, async drainInput() {},
    write(data) { assert.equal(this, terminal); writes.push(data); },
  };
  return { terminal, writes };
}

{
  // Reproduce the actual WT integration state instead of mocking a correct cell:
  // native images=null => Pi never queries cell size => its default stays 9x18.
  const savedCapabilities = getCapabilities();
  const savedCell = { ...getCellDimensions() };
  const { terminal, writes } = terminalSink();
  setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  setCellDimensions({ widthPx: 9, heightPx: 18 });
  const screen = new TuiMainScreen(terminal);
  let transport;
  try {
    screen.queryCellSize();
    assert.equal(writes.join("").includes("\x1b[16t"), false);
    assert.deepEqual(getCellDimensions(), { widthPx: 9, heightPx: 18 });
    assert.deepEqual(sixelCellDimensions(getCellDimensions(), { WT_SESSION: "regression" }), { widthPx: 10, heightPx: 20 });
    assert.deepEqual(sixelCellDimensions({ widthPx: 12, heightPx: 24 }, {}), { widthPx: 12, heightPx: 24 });
    transport = createSixelTransport(terminal, getCellDimensions, () => sheet, () => "pixel", () => true, { WT_SESSION: "regression" });
    screen.addChild({
      render: () => transport.render({ frameIndex: 0, columns: 6, rows: 12 }).map((line) => `  ${line}   info`),
      invalidate() {},
    });
    screen.renderNow();
    const decoded = dcStrings(writes).map(decodeSixel);
    assert.equal(decoded.length, 12);
    assert.ok(decoded.every((stripe) => stripe.width === 60 && stripe.height === 20));
    assert.deepEqual(decoded.flatMap((stripe) => stripe.pixels), sheet.frames[0].pixels);
    // Font geometry is not the WT Sixel virtual grid, even if another component
    // updates Pi's global cell dimensions later.
    setCellDimensions({ widthPx: 14, heightPx: 28 });
    writes.length = 0;
    terminal.write(transport.render({ frameIndex: 1, columns: 6, rows: 12 }).join("\r\n"));
    const afterFontChange = dcStrings(writes).map(decodeSixel);
    assert.ok(afterFontChange.every((stripe) => stripe.width === 60 && stripe.height === 20));
    assert.deepEqual(afterFontChange.flatMap((stripe) => stripe.pixels), sheet.frames[1].pixels);
    checks.push("WT regression: real Pi images=null/9x18 fallback now renders exact 10x20 virtual cells, with no missing rows or narrowed width");
  } finally {
    screen.stop({ preserveScreen: true });
    transport?.dispose();
    setCapabilities(savedCapabilities);
    setCellDimensions(savedCell);
  }
}

{
  const { terminal, writes } = terminalSink();
  const originalWrite = terminal.write;
  const transport = createSixelTransport(terminal, () => cell, () => sheet);
  const lines = transport.render({ frameIndex: 0, columns: 6, rows: 12 });
  assert.equal(lines.length, 12);
  for (const line of lines) {
    assert.equal(visibleWidth(line), 6);
    const osc = line.slice(6);
    assert.equal(extractAnsiCode(osc, 0)?.code, osc);
    assert.equal(visibleWidth(osc), 0);
    assert.ok(truncateToWidth(`  ${line}   text`, 79).includes(osc));
    assert.ok(sliceByColumn(`  ${line}   text`, 0, 79, true).includes(osc));
  }
  terminal.write(lines[3]);
  assert.equal(dcStrings(writes).length, 1);
  assert.deepEqual(decodeSixel(dcStrings(writes)[0]).pixels, expectedStripe(0,3));
  assert.ok(writes[0].startsWith("      \x1b7\x1b[1G"), "Blank cells are written before deferred drawing at the marker column");
  assert.ok(writes[0].endsWith("\x1b8"), "Cursor is restored after each stripe");
  assert.strictEqual(transport.render({ frameIndex: 0, columns: 6, rows: 12 }), lines);
  transport.dispose(); transport.dispose();
  assert.strictEqual(terminal.write, originalWrite);
  assert.equal(transport.render({ frameIndex: 0, columns: 6, rows: 12 }), undefined);
  checks.push("Product transport: true zero-width OSC, exact pixels, clear-before-draw, cursor save/restore, cache and idempotent write restoration");
}

{
  // Fullscreen selection slices a styled line into three ranges. Pi preserves
  // preceding ANSI in each range, which also duplicates our zero-width OSC.
  // Exercise the real host utility rather than manufacturing duplicate bytes.
  const { terminal, writes } = terminalSink();
  const transport = createSixelTransport(terminal, () => cell, () => sheet, () => "selection", () => true, {}, visibleWidth);
  const stripe = transport.render({ frameIndex: 0, columns: 6, rows: 12 })[0];
  const line = `  ${stripe}  │ drag this native input text │`;
  const start = 18, end = 24;
  const selected = sliceByColumn(line, 0, start, true)
    + "\x1b[7m" + sliceByColumn(line, start, end - start, true) + "\x1b[27m"
    + sliceByColumn(line, end, visibleWidth(line) - end, true);
  assert.equal((line.match(/pi-furry-partner-/g) || []).length, 1);
  assert.equal((selected.match(/pi-furry-partner-/g) || []).length, 3, "The regression must exercise the host's real three-marker selection transform");
  const drawColumns = () => [...writes.join("").matchAll(/\x1b\[(\d+)G\x1bP/g)].map((match) => Number(match[1]) - 1);
  terminal.write(`\x1b[?2026h\x1b[4;1H\x1b[2K${selected}\x1b[?2026l`);
  assert.equal(dcStrings(writes).length, 1, "A selected line must emit one image stripe, never clones inside the text input");
  assert.deepEqual(drawColumns(), [2]);
  assert.deepEqual(decodeSixel(dcStrings(writes)[0]).pixels, expectedStripe(0, 0));
  writes.length = 0;
  terminal.write(`\x1b[?2026h\x1b[4;1H${selected}\x1b[5;1H${selected}\x1b[?2026l`);
  assert.equal(dcStrings(writes).length, 2, "An identical stripe token on different rows must remain drawable once on each row");
  assert.deepEqual(drawColumns(), [2, 2]);
  writes.length = 0;
  const marker = stripe.slice(6);
  terminal.write(`\x1b[?2026h\x1b[4;1H${marker}\x1b[4;79H${stripe}\x1b[4;1H${line}\x1b[?2026l`);
  assert.equal(dcStrings(writes).length, 1, "Invalid left/right anchors must neither draw nor hide a later valid anchor on that row");
  assert.deepEqual(drawColumns(), [2]);
  writes.length = 0;
  terminal.write(`\x1b[?2026h\x1b[4;1H${marker}\x1b[5;79H${stripe}\x1b[?2026l`);
  assert.equal(dcStrings(writes).length, 0, "Out-of-bounds stripes must never spill into a neighboring row or input cell");
  transport.dispose();
  checks.push("Real Pi selection slicing duplicates one OSC three times, but Sixel emits exactly one correctly positioned stripe per row; repeated tokens on different rows survive and invalid horizontal anchors cannot draw or shadow a later valid anchor");
}

{
  const { terminal, writes } = terminalSink();
  const transport = createSixelTransport(terminal, () => cell, () => sheet, () => "cursor-selection", () => true, {}, visibleWidth);
  const stripe = transport.render({ frameIndex: 0, columns: 6, rows: 12 })[0];
  const cursorMarker = api.CURSOR_MARKER;
  const privateMarkers = [cursorMarker, "\x1b_pi:fc\x07", "\x1b_pi:/fc\x07"];
  const screen = new TuiAltScreen(terminal, true, undefined, { mouse: true, copyOnSelect: false });
  screen.selectionAnchor = { row: 0, col: 24 }; screen.selectionFocus = { row: 0, col: 26 };
  const lines = screen.applySelection([`  ${stripe}${" ".repeat(12)}${cursorMarker}input text here`]);
  assert.equal(lines[0].split(cursorMarker).length - 1, 3, "The caret must precede the selection so the real Pi transform duplicates its internal APC");
  assert.deepEqual(screen.extractCursorPosition(lines, terminal.rows), { row: 0, col: 20 });
  assert.equal(lines[0].split(cursorMarker).length - 1, 2, "Pi removes only the first copied cursor marker");
  terminal.write(`\x1b[?2026h\x1b[4;1H\x1b[2K${lines[0]}\x1b[?2026l`);
  assert.ok(writes.join("").endsWith("\x1b[?2026l"), "Residual Pi APC-BEL markers must not buffer the END_SYNC or lock the terminal writer");
  assert.equal(dcStrings(writes).length, 1);
  terminal.write("\x1b[?2026h\x1b[5;1Htyping after selection\x1b[?2026l");
  assert.ok(writes.join("").includes("typing after selection"));
  assert.ok(privateMarkers.every((marker) => !writes.join("").includes(marker)), "Pi's BEL-terminated internal APCs must never reach a real terminal");
  transport.dispose();
  // Every write boundary of all three internal markers must behave identically.
  for (const marker of privateMarkers) for (let split = 0; split <= marker.length; split++) {
    const sink = terminalSink();
    const adapter = createSixelTransport(sink.terminal, () => cell, () => sheet, () => "split-cursor", () => true, {}, visibleWidth);
    const image = adapter.render({ frameIndex: 0, columns: 6, rows: 12 })[0];
    sink.terminal.write(`\x1b[?2026h\x1b[3;1H${image}${marker.slice(0, split)}`);
    sink.terminal.write(`${marker.slice(split)}safe text\x1b[?2026l`);
    sink.terminal.write("subsequent input");
    const output = sink.writes.join("");
    assert.ok(output.includes("safe text") && output.includes("subsequent input"), `Pi marker split ${split} must not swallow following output`);
    assert.ok(output.includes("\x1b[?2026l")); assert.equal(dcStrings(sink.writes).length, 1);
    assert.ok(privateMarkers.every((value) => !output.includes(value)));
    adapter.dispose();
  }
  const sink = terminalSink();
  const adapter = createSixelTransport(sink.terminal, () => cell, () => sheet);
  const standard = "\x1b_Ga=T;payload\x07still APC payload\x1b\\";
  for (const byte of standard) sink.terminal.write(byte);
  const ordinaryPiNamedApc = "\x1b_pi:c\x1b\\";
  sink.terminal.write(ordinaryPiNamedApc + "unrelated terminal output");
  assert.equal(sink.writes.join(""), standard + ordinaryPiNamedApc + "unrelated terminal output", "Standard APC-ST strings, including BEL inside payload or Pi-like names, must remain byte-for-byte intact");
  adapter.dispose();
  checks.push("Real Pi caret-before-selection duplicates APC-BEL markers and leaves two after cursor extraction; transport strips only the three private markers across every byte split, closes synchronization, draws the avatar and keeps later typing live while preserving ordinary APC-ST payloads");
}

{
  const { terminal, writes } = terminalSink(80, 1000);
  const originalWrite = terminal.write;
  const width = 20, height = 40;
  const firstFrame = { cacheKey: "motion:first", pixels: new Array(width * height).fill(1) };
  const overridePalette = [[0, 0, 0], [10, 240, 30], [250, 30, 210]];
  const secondFrame = { cacheKey: "motion:second", pixels: new Array(width * height).fill(2), palette: overridePalette };
  let currentFrame = firstFrame;
  const transport = createSixelTransport(terminal, () => cell,
    () => ({ width, height, palette, frames: [currentFrame] }), () => "motion", () => true, {});
  const geometry = { frameIndex: 0, columns: 2, rows: 2 };
  const first = transport.render(geometry);
  terminal.write(first.join("\r\n"));
  assert.deepEqual(dcStrings(writes).map(decodeSixel).flatMap((stripe) => stripe.pixels), firstFrame.pixels);
  assert.deepEqual(decodeSixel(dcStrings(writes)[0]).palette.get(1), [100, 100, 100], "Frames without a palette use the sheet palette");
  currentFrame = { ...firstFrame, pixels: [...firstFrame.pixels] };
  assert.strictEqual(transport.render(geometry), first, "Stable content cache keys survive new single-frame sheet objects");
  currentFrame = secondFrame;
  const second = transport.render(geometry);
  assert.notStrictEqual(second, first, "A different cache key must not reuse frameIndex 0's old pixels");
  writes.length = 0; terminal.write(second.join("\r\n"));
  const decoded = dcStrings(writes).map(decodeSixel);
  assert.deepEqual(decoded.flatMap((stripe) => stripe.pixels), secondFrame.pixels);
  assert.deepEqual(decoded[0].palette.get(2), overridePalette[2].map((n) => Math.round(n * 100 / 255)));
  currentFrame = firstFrame;
  assert.strictEqual(transport.render(geometry), first);
  transport.dispose();
  assert.strictEqual(terminal.write, originalWrite);
  checks.push("Dynamic single-frame sheets: frame.cacheKey identifies pixels independently of frameIndex 0; equal keys reuse markers and frame.palette overrides the sheet palette");
}

{
  const { terminal, writes } = terminalSink(80, 1000);
  const originalWrite = terminal.write;
  const width = 20, height = 40;
  const frames = Array.from({ length: 300 }, (_, i) => ({
    cacheKey: `motion:bounded:${i}`,
    pixels: Array.from({ length: width * height }, (_, pixel) => pixel % width < 9 ? (i >> (pixel % width)) & 1 ? 2 : 1 : 3),
  }));
  let currentFrame = frames[0];
  const transport = createSixelTransport(terminal, () => cell,
    () => ({ width, height, palette, frames: [currentFrame] }), () => "motion", () => true, {});
  const geometry = { frameIndex: 0, columns: 2, rows: 2 };
  const rendered = [];
  for (let i = 0; i < frames.length; i++) {
    currentFrame = frames[i];
    rendered.push(transport.render(geometry));
    if (i > 0 && i % 32 === 0) {
      currentFrame = frames[0];
      assert.strictEqual(transport.render(geometry), rendered[0], "An LRU hit keeps an older frequently used frame alive");
    }
  }
  terminal.write(rendered.flat().join("\r\n"));
  assert.equal(dcStrings(writes).length, 64 * geometry.rows, "After 300 dynamic frames, only 64 frames' stripe payloads remain reachable");
  assert.ok(!writes.join("").includes("\x1b]777;pi-furry-partner-"), "Evicted private markers are removed at the terminal boundary");
  writes.length = 0;
  terminal.write(rendered[299].join("\r\n") + "\r\n" + rendered[298].join("\r\n"));
  assert.equal(dcStrings(writes).length, 4, "Recent frames remain drawable for Pi's differential repaint");
  currentFrame = frames[0];
  assert.strictEqual(transport.render(geometry), rendered[0], "Cache hits refresh LRU age rather than preserving insertion age");
  writes.length = 0; terminal.write(rendered[1].join("\r\n"));
  assert.equal(dcStrings(writes).length, 0, "Evicting a frame also removes its old payload tokens");
  currentFrame = frames[1];
  const rebuilt = transport.render(geometry);
  assert.notStrictEqual(rebuilt, rendered[1], "Returning to an evicted early frame rebuilds fresh markers");
  writes.length = 0; terminal.write(rebuilt.join("\r\n"));
  assert.deepEqual(dcStrings(writes).map(decodeSixel).flatMap((stripe) => stripe.pixels), frames[1].pixels);
  transport.dispose(); transport.dispose();
  assert.strictEqual(terminal.write, originalWrite);
  assert.equal(transport.render(geometry), undefined);
  checks.push("Dynamic Sixel cache: 300-frame stress retains at most 64 LRU frames and payload sets, preserves recent/reused markers, rebuilds evicted content exactly and restores terminal.write");
}

{
  const { terminal, writes } = terminalSink();
  const width = 20, height = 60;
  const first = { cacheKey: "stripe-identity:base", pixels: new Array(width * height).fill(1) };
  const second = { cacheKey: "stripe-identity:one-pixel", pixels: [...first.pixels] };
  second.pixels[width * 45 + 4] = 2;
  let current = first;
  const transport = createSixelTransport(terminal, () => cell,
    () => ({ width, height, palette, frames: [current] }), () => "motion", () => true, {}, visibleWidth);
  const geometry = { frameIndex: 0, columns: 2, rows: 3 };
  const baseLines = transport.render(geometry);
  current = second;
  const changedLines = transport.render(geometry);
  assert.equal(changedLines[0], baseLines[0]);
  assert.equal(changedLines[1], baseLines[1]);
  assert.notEqual(changedLines[2], baseLines[2]);
  current = first;
  const screen = new TuiMainScreen(terminal);
  screen.addChild({ render: () => [...transport.render(geometry), "footer one", "footer two"], invalidate() {} });
  screen.renderNow();
  writes.length = 0; current = second; screen.renderNow();
  assert.equal(dcStrings(writes).length, 1, "One changed stripe must not invalidate every row of a new full motion frame");
  assert.deepEqual(decodeSixel(dcStrings(writes)[0]).pixels, second.pixels.slice(width * 40));
  screen.stop({ preserveScreen: true }); transport.dispose();
  checks.push("Stripe content identity: unchanged pixels/palette retain stable markers across dynamic frame keys, and real Pi differential rendering redraws only the changed stripe");
}

{
  const vt = createVTTerminal({ columns: 20, rows: 8, visibleWidth });
  const terminal = vt.terminal;
  const originalWrite = terminal.write;
  const writes = [];
  const captureWrite = function (data) { writes.push(data); return originalWrite.call(terminal, data); };
  terminal.write = captureWrite;
  terminal.write("\x1b[6;1H");
  writes.length = 0;
  const width = 20, height = 60;
  const source = { width, height, palette, frames: [{ pixels: new Array(width * height).fill(1) }] };
  const transport = createSixelTransport(terminal, () => cell, () => source, () => "split", () => true,
    { WT_SESSION: "split-writes" }, visibleWidth, () => ({ row: 5, column: 0 }));
  const avatar = transport.render({ frameIndex: 0, columns: 2, rows: 3 });
  const finalFooter = "footer two".padEnd(terminal.columns);
  const body = [...avatar.map((line, i) => `  ${line} 中文 ${i}`), "footer one", finalFooter].join("\r\n");
  terminal.write("\x1b[?202"); terminal.write("6h");
  // Deliberately split private OSCs and normal text at arbitrary write boundaries.
  for (let offset = 0; offset < body.length; offset += 7) terminal.write(body.slice(offset, offset + 7));
  assert.equal(vt.counters.dcs, 0, "A bounded text writer must not draw before the whole synchronized transaction has allocated its rows");
  const cursorBeforeImages = { ...vt.cursor };
  assert.ok(writes.join("").includes("footer two"), "Normal text streams immediately instead of waiting in a batch buffer");
  terminal.write("\x1b[?2026"); terminal.write("l");
  assert.equal(vt.counters.dcs, 3);
  assert.equal(vt.counters.sixelScrolls, 0, "Text-created viewport space must be allocated before the 24px final-band footprint is drawn");
  assert.deepEqual(vt.cursor, cursorBeforeImages, "Post-image cursor restore leaves Pi's subsequent positioning unchanged");
  assert.equal(vt.counters.syncBegin, 1); assert.equal(vt.counters.syncEnd, 1);
  assert.equal(vt.imageCellsInHistory, 0);
  const output = writes.join("");
  assert.ok(output.lastIndexOf("footer two") < output.indexOf("\x1bP"));
  assert.ok(output.lastIndexOf("\x1bP") < output.indexOf("\x1b[?2026l"));
  assert.ok(!output.includes("\x1b]777;pi-furry-partner-"));
  terminal.write("Z");
  assert.equal(vt.cursor.top, cursorBeforeImages.top + 1, "DECSC/DECRC keeps the delayed-wrap flag of a full-width final text row");
  assert.equal(vt.cursor.x, 1);
  transport.dispose(); assert.strictEqual(terminal.write, captureWrite);
  checks.push("Cross-write synchronized rendering: split CSI/OSC markers and CJK text survive bounded writes, all text scrolls precede images, DCS stays inside 2026 and native cursor/history remain unchanged");
}

{
  const { terminal, writes } = terminalSink();
  const originalWrite = terminal.write;
  const transport = createSixelTransport(terminal, () => cell, () => sheet);
  const partial = "\x1b[?2026hNormal text\x1b[38;2";
  terminal.write(partial);
  assert.ok(writes.join("").includes("Normal text"));
  transport.dispose();
  assert.equal(writes.join(""), partial, "Disposal flushes an unfinished native escape sequence without losing normal terminal bytes");
  assert.strictEqual(terminal.write, originalWrite);
  checks.push("Transport disposal preserves already-streamed normal text and flushes incomplete native escape bytes before restoring terminal.write");
}

{
  const { terminal, writes } = terminalSink();
  const originalWrite = terminal.write;
  const transport = createSixelTransport(terminal, () => cell, () => sheet);
  const screen = new TuiMainScreen(terminal);
  let frame = 0;
  screen.addChild({ render: () => transport.render({ frameIndex: frame, columns: 6, rows: 12 }).map((line) => `  ${line}   info`), invalidate() {} });
  screen.renderNow();
  assert.equal(dcStrings(writes).length, 12);
  dcStrings(writes).forEach((dcs, stripe) => assert.deepEqual(decodeSixel(dcs).pixels, expectedStripe(0,stripe)));
  writes.length = 0; frame = 1; screen.renderNow();
  assert.equal(dcStrings(writes).length, 12);
  dcStrings(writes).forEach((dcs, stripe) => assert.deepEqual(decodeSixel(dcs).pixels, expectedStripe(1,stripe)));
  assert.ok(!writes.join("").includes("\x1b[3J"));
  assert.ok(writes.join("").includes("\x1b[2K  " + " ".repeat(6) + "   info"));
  assert.ok(writes.join("").lastIndexOf("info") < writes.join("").indexOf("\x1bP"), "Every text row is complete before the first image stripe is drawn");
  writes.length = 0; screen.renderNow();
  assert.equal(dcStrings(writes).length, 0, "Unchanged rows do not redraw image stripes");
  screen.stop({ preserveScreen: true }); transport.dispose();
  assert.strictEqual(terminal.write, originalWrite);
  checks.push("Real Pi TuiMainScreen full/differential render: exact product DCS output and whole-row erase, no scrollback clear, no work on unchanged rows");
}

{
  const { terminal, writes } = terminalSink(80,8);
  const transport = createSixelTransport(terminal, () => cell, () => sheet);
  const screen = new TuiAltScreen(terminal, false, undefined, { mouse: false });
  let frame = 0;
  const document = { render: () => [...transport.render({ frameIndex: frame, columns: 6, rows: 12 }).map((line) => `  ${line}   info`), ...Array.from({ length:30 }, (_,i) => `message ${i}`)], invalidate() {} };
  const scroll = new ScrollView(document, { primary:true, follow:"none", scrollbar:"always" });
  screen.setLayoutRoot(scroll); screen.start(); screen.renderNow();
  assert.equal(dcStrings(writes).length, 7, "A clipped image at the actual bottom row cannot emit a scrolling final sixel band");
  writes.length = 0; scroll.scrollTo(5); screen.renderNow();
  assert.equal(screen.viewportTop, 5);
  assert.equal(dcStrings(writes).length, 7);
  dcStrings(writes).forEach((dcs, i) => assert.deepEqual(decodeSixel(dcs).pixels, expectedStripe(0, i+5)));
  writes.length = 0; frame = 1; screen.renderNow();
  assert.equal(dcStrings(writes).length, 7);
  dcStrings(writes).forEach((dcs, i) => assert.deepEqual(decodeSixel(dcs).pixels, expectedStripe(1, i+5)));
  scroll.scrollTo(30); screen.renderNow();
  writes.length = 0; frame = 0; screen.renderNow();
  assert.equal(dcStrings(writes).length, 0);
  screen.stop({ preserveScreen: true }); transport.dispose();
  checks.push("Real Pi TuiAltScreen with always-visible scrollbar: partial viewport crops retain only source stripes 5–11; fully offscreen animation emits no DCS");
}

{
  const { terminal, writes } = terminalSink();
  let allowed = true;
  const originalWrite = terminal.write;
  const transport = createSixelTransport(terminal, () => cell, () => sheet, () => "pixel", () => allowed);
  const line = transport.render({ frameIndex: 0, columns: 6, rows: 12 })[0];
  const composite = compositeTuiLine(`  ${line}   info`, "POP", 3, 3, 80);
  assert.ok(composite.includes("\x1b]777;pi-furry-partner-"), "A narrow overlay left of the marker still retains its anchor");
  allowed = false; terminal.write(composite);
  assert.equal(dcStrings(writes).length, 0);
  assert.ok(!writes.join("").includes("\x1b]777;pi-furry-partner-"));
  assert.ok(stripTerminalSequences(writes.join("")).includes("POP"));
  writes.length = 0; allowed = true; terminal.write(line);
  assert.equal(dcStrings(writes).length, 1);
  transport.dispose(); assert.strictEqual(terminal.write, originalWrite);
  checks.push("Product overlay guard drops retained anchors instead of drawing across a narrow modal, then resumes when allowed");
}

assert.equal(graphicsMode("auto", { WT_SESSION:"test" }), "sixel");
assert.equal(graphicsMode("auto", { WT_SESSION:"test", TMUX:"test" }), "blocks");
assert.equal(graphicsMode("auto", {}), "blocks");
assert.equal(graphicsMode("blocks", { WT_SESSION:"test" }), "blocks");
assert.equal(graphicsMode("blocks", { WT_SESSION:"test", PI_WINK_RENDER:"sixel" }), "blocks");
assert.equal(graphicsMode("auto", { PI_FURRY_RENDER:"sixel" }), "sixel");
assert.equal(graphicsMode("auto", { PI_WINK_RENDER:"sixel" }), "sixel");
assert.equal(graphicsMode("auto", { PI_FURRY_RENDER:"blocks", PI_WINK_RENDER:"sixel" }), "blocks");
assert.equal(graphicsMode("blocks", { PI_FURRY_RENDER:"sixel" }), "blocks");
checks.push("Graphics selection: Windows Terminal auto, multiplexed/unknown terminal fallback and explicit block preference");

const report = { testedAt: new Date().toISOString(), piVersion:version, verification:"protocol-level: fake terminal bytes, independent Sixel decoder and real Pi rendering; native screen pixels not inspected", modelRequests:0, passed:true, checks };
await writeFile(join(root, "tests/sixel-validation.json"), JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
