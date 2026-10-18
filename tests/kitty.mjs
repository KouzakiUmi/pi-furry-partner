import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { encodeIndexedPng, createKittyTransport } from "../lib/kitty.mjs";
import { modules, version } from "./pi-runtime.mjs";

const checks = [];
function pngChunks(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  const chunks = []; let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}
function decodeIndexedPng(buffer) {
  const chunks = pngChunks(buffer), ihdr = chunks.find((item) => item.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  assert.equal(ihdr[8], 8); assert.equal(ihdr[9], 3);
  const palette = chunks.find((item) => item.type === "PLTE").data;
  const alpha = chunks.find((item) => item.type === "tRNS")?.data;
  const raw = inflateSync(Buffer.concat(chunks.filter((item) => item.type === "IDAT").map((item) => item.data)));
  const pixels = [];
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width + 1)], 0);
    pixels.push(...raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)));
  }
  return { width, height, pixels, palette, alpha };
}

const palette = [[0,0,0],[255,255,255],[20,80,160],[240,100,60]];
const original = [0,1,2,3, 3,2,1,0];
const encoded = encodeIndexedPng({ pixels: original, width: 4, height: 2, palette, transparentIndex: 0 });
const decoded = decodeIndexedPng(encoded);
assert.equal(decoded.width, 4); assert.equal(decoded.height, 2); assert.deepEqual(decoded.pixels, original);
assert.deepEqual([...decoded.palette], palette.flat()); assert.equal(decoded.alpha[0], 0); assert.ok([...decoded.alpha.subarray(1)].every((value) => value === 255));
assert.throws(() => encodeIndexedPng({ pixels: [4], width: 1, height: 1, palette }), /outside its palette/);
checks.push("Indexed mascot pixels encode as a valid compressed palette PNG with transparent index preservation");

const sheet = {
  width: 8, height: 8, transparentIndex: 0, palette,
  frames: [0,1].map((frame) => ({ cacheKey: `frame-${frame}`, pixels: Array.from({ length: 64 }, (_, i) => (i + frame) % 4) })),
};
let nextId = 100, calls = [], deleted = [], allowed = true;
const fakeRenderImage = (data, dimensions, options) => {
  calls.push({ data, dimensions, options });
  return { sequence: `\x1b_Ga=T,f=100,i=${options.imageId},c=${options.maxWidthCells},r=1,C=1;${data}\x1b\\`, columns: options.maxWidthCells, rows: 1, imageId: options.imageId };
};
const transport = createKittyTransport({
  getCellDimensions: () => ({ widthPx: 10, heightPx: 20 }), getSheet: () => sheet, getStyle: () => "umi", isAllowed: () => allowed,
  renderImage: fakeRenderImage, allocateImageId: () => ++nextId, deleteImage: (imageId) => deleted.push(imageId), maxFrames: 2,
});
const first = transport.render({ frameIndex: 0, columns: 4, rows: 4 });
assert.equal(first.length, 4); assert.ok(first.every((line) => line.startsWith("\x1b_G") && line.endsWith("    ")));
assert.equal(calls.length, 4); assert.deepEqual(calls.map((call) => call.options.imageId), [101,102,103,104]);
assert.ok(calls.every((call) => call.options.maxHeightCells === 1 && call.options.moveCursor === false));
for (const call of calls) {
  const png = decodeIndexedPng(Buffer.from(call.data, "base64"));
  assert.deepEqual({ width: png.width, height: png.height }, { width: 8, height: 4 });
  assert.deepEqual(call.dimensions, { widthPx: 40, heightPx: 20 }, "Kitty placement reserves the requested cell rectangle even when its PNG is source-limited");
}
assert.strictEqual(transport.render({ frameIndex: 0, columns: 4, rows: 4 }), first);
assert.equal(calls.length, 4, "An unchanged frame must not be recompressed or retransmitted");
allowed = false;
assert.equal(transport.render({ frameIndex: 0, columns: 4, rows: 4 }), undefined, "An overlay guard must remove Kitty image lines so Pi can composite popup text");
allowed = true;
assert.strictEqual(transport.render({ frameIndex: 0, columns: 4, rows: 4 }), first, "The same stripe lines resume after the overlay closes");
assert.equal(calls.length, 4);
const second = transport.render({ frameIndex: 1, columns: 4, rows: 4 });
assert.notDeepEqual(second, first); assert.equal(calls.length, 8);
assert.deepEqual(calls.slice(4).map((call) => call.options.imageId), [101,102,103,104], "Frame updates reuse row image IDs");
transport.render({ frameIndex: 0, columns: 5, rows: 4 });
assert.equal(transport.stats().frames, 2, "PNG frame cache is bounded");
transport.dispose(); assert.deepEqual(deleted, [101,102,103,104]);
transport.dispose(); assert.deepEqual(deleted, [101,102,103,104], "Disposal is idempotent");
assert.equal(transport.render({ frameIndex: 0, columns: 4, rows: 4 }), undefined);
assert.equal(createKittyTransport({}).render({ frameIndex: 0, columns: 4, rows: 4 }), undefined);
checks.push("Kitty transport emits one transparent PNG per terminal row, reuses and releases stable image IDs, skips unchanged frames and bounds its cache");

// Exercise Pi's real Kitty encoder and main-screen image lifecycle. This checks
// protocol/layout bytes, not pixels in a native Kitty window.
const api = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/index.js")));
const savedCapabilities = api.getCapabilities(), savedCell = { ...api.getCellDimensions() };
const geometrySheet = (size) => ({ width: size, height: size, transparentIndex: 0, palette,
  frames: [{ cacheKey: `source-${size}`, pixels: Array.from({ length: size * size }, (_, i) => i % palette.length) }],
});
const geometryCases = [
  { source: 80, cell: { widthPx: 9, heightPx: 20 }, stripe: { widthPx: 80, heightPx: 11 } },
  { source: 80, cell: { widthPx: 10, heightPx: 23 }, stripe: { widthPx: 80, heightPx: 12 } },
  { source: 240, cell: { widthPx: 10, heightPx: 23 }, stripe: { widthPx: 160, heightPx: 23 } },
];
for (const { source, cell, stripe } of geometryCases) {
  api.setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true }); api.setCellDimensions(cell);
  let imageId = 1000;
  const geometryTransport = createKittyTransport({ getCellDimensions: api.getCellDimensions, getSheet: () => geometrySheet(source),
    renderImage: api.renderImage, allocateImageId: () => ++imageId });
  const lines = geometryTransport.render({ frameIndex: 0, columns: 16, rows: 8 });
  assert.equal(lines.length, 8);
  assert.ok(lines.every((line) => /,c=16,r=1,/.test(line)), `${source}px source at ${cell.widthPx}x${cell.heightPx}px cells must retain a 16-column Kitty placement`);
  const base64 = /;([A-Za-z0-9+/=]+)\x1b\\/.exec(lines[0])?.[1];
  assert.deepEqual(api.getImageDimensions(base64, "image/png"), stripe, "PNG sampling remains source-limited while placement retains the full cell rectangle");
}
checks.push("Kitty placements retain their requested 16-cell width across 9x20 and 10x23 cell ratios for 80px and 240px source frames");
const writes = [];
const terminal = {
  columns: 80, rows: 30, kittyProtocolActive: true,
  start() {}, stop() {}, hideCursor() {}, showCursor() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {}, async drainInput() {},
  write(data) { writes.push(data); },
};
let realFrame = 0;
const realTransport = createKittyTransport({ getCellDimensions: api.getCellDimensions, getSheet: () => sheet, getStyle: () => "umi",
  renderImage: api.renderImage, allocateImageId: api.allocateImageId });
const component = { render() { return realTransport.render({ frameIndex: realFrame, columns: 4, rows: 4 }).map((line) => `  ${line}   editor`); }, invalidate() {} };
const screen = new api.TuiMainScreen(terminal);
try {
  api.setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true }); api.setCellDimensions({ widthPx: 10, heightPx: 20 });
  screen.addChild(component); screen.renderNow();
  assert.match(writes.join(""), /\x1b_Ga=T,f=100,q=2,C=1,c=4,r=1,i=\d+/);
  assert.equal(screen.captureRenderState().previousLines.filter((line) => line.includes("\x1b_G")).length, 4);
  assert.ok(screen.captureRenderState().previousLines.every((line) => api.visibleWidth(line) === 15), "Kitty APCs stay zero-width beside editor text");
  writes.length = 0; realFrame = 1; screen.renderNow();
  const update = writes.join("");
  assert.match(update, /\x1b_Ga=d,d=I,i=\d+,q=2\x1b\\/, "Changed rows free their prior Kitty image data");
  assert.match(update, /\x1b_Ga=T,f=100,q=2,C=1,c=4,r=1,i=\d+/);
  checks.push("Pi " + version + " main-screen renderer recognizes row-sized Kitty images beside editor text and replaces changed frame IDs without cursor-cell drift");
} finally {
  screen.stop({ preserveScreen: true }); realTransport.dispose(); api.setCapabilities(savedCapabilities); api.setCellDimensions(savedCell);
}

console.log(JSON.stringify({ suite: "kitty", piVersion: version, modelRequests: 0, passed: true, checks }, null, 2));
