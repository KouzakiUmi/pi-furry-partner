// Regression for a saved legacy style: fixing Umi must also fix the artwork
// actually selected by config.style. No installed config or live files are read.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createActivity } from "../lib/activity.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { renderDock } from "../lib/editor-layout.mjs";
import { samplePixels } from "../lib/renderer.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import { STYLES, normalizeStyle, styleAssetDirectory } from "../lib/styles.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (file) => JSON.parse(await readFile(join(root, file), "utf8"));
const config = await read("config.json");
const originalConfig = await readFile(join(root, "config.json"), "utf8");
const copy = await read("assets/status-copy.json");
const phrases = await read("assets/status-phrases.json");
const checks = [];
const visibleWidth = (text) => [...String(text)].length;
const truncateToWidth = (text, width) => [...String(text)].slice(0, width).join("");

function session(sheet) {
  let clock = 0;
  const activity = createActivity({ labels: copy.labels, bubbles: copy.bubbles, phrases: phrases.phrases,
    rotationMs: phrases.rotationMs, now: () => clock, random: () => .314159 });
  const player = createMotionPlayer({ now: () => clock });
  const render = () => {
    const snapshot = activity.snapshot();
    let display, visual;
    renderDock({ geometry: { collapsed: false, columns: 120, rows: 120, leftWidth: 123 }, sheet, snapshot,
      theme: { fg: (_key, text) => text }, visibleWidth, truncateToWidth,
      renderAvatar(value) { display = value; return Array(120).fill(""); }, renderPixels: () => [], samplePixels,
      motionPlayer: { frame(...args) { visual = player.frame(...args); return visual; } }, animate: true });
    assert.ok(display?.sheet?.frames[display.frameIndex]);
    return { snapshot, visual, frame: display.sheet.frames[display.frameIndex], sheet: display.sheet };
  };
  return { activity, player, render, set: (time) => { clock = time; } };
}

function darkPixels(sheet, frame, [left, top, right, bottom]) {
  let count = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const index = frame.pixels[y * sheet.width + x];
    if (index !== (sheet.transparentIndex ?? 0) && Math.max(...sheet.palette[index]) < 160) count++;
  }
  return count;
}

const sheets = {};
for (const style of STYLES) {
  // This is the same saved-style resolution as index.ts. A valid legacy
  // illustration preference must not silently become the newer Umi artwork.
  const settings = { ...config, layout: "editor", style };
  const selected = normalizeStyle(settings.style);
  const directory = styleAssetDirectory(selected);
  assert.equal(selected, style);
  const sheet = sheets[style] = await read(`assets/reactions/${directory}/reaction-sheet.json`);
  for (const id of ["idle-open", "rest", "think", "happy", "happy-blink", "idle-wink"])
    assert.ok(sheet.frames[sheet.ids[id]], `${style}: missing ${id}`);

  const waking = session(sheet);
  waking.activity.start({ wake: true });
  const first = waking.render();
  assert.equal(first.snapshot.phase, "waking");
  assert.equal(first.snapshot.face, "rest");
  assert.equal(first.frame.id, "rest");
  assert.equal(first.visual.transitioning, false);
  assert.deepEqual(Array.from(first.frame.pixels), sheet.frames[sheet.ids.rest].pixels,
    `${style}: the actual first runtime frame must be this selected style's rest artwork`);
  waking.set(1199);
  assert.equal(waking.render().frame.id, "rest", `${style}: rest must last the complete startup hold`);
  waking.set(1200);
  assert.equal(waking.render().snapshot.face, "think");
  waking.player.dispose();

  const waiting = session(sheet);
  waiting.activity.start({ wake: false });
  waiting.activity.handle("ui_prompt_start");
  waiting.render();
  // Snapshot the real waiting clock before jumping to the threshold. This
  // avoids accidentally starting its waitingAt clock at the final sample.
  waiting.set(9999);
  assert.equal(waiting.render().snapshot.drowsy, false);
  waiting.set(10000);
  assert.equal(waiting.render().snapshot.drowsy, true);
  waiting.set(10300);
  const asleep = waiting.render();
  assert.equal(asleep.snapshot.phase, "waiting");
  assert.equal(asleep.snapshot.face, "rest");
  assert.equal(asleep.frame.id, "rest");
  assert.equal(asleep.visual.transitioning, false);
  waiting.player.dispose();
  checks.push({ style, assetDirectory: directory, startupFace: first.frame.id,
    startupPixelsSha256: createHash("sha256").update(Buffer.from(first.frame.pixels)).digest("hex"),
    drowsyAtMs: 10000, stableDrowsyAtMs: 10300 });
}

// Legacy-coordinate assertions require the frozen original artwork. Current
// canonical styles use registered HD remakes; their startup paths were tested
// above and the restored header's same-body wink has its own consumer test.
const illustration = await read('tests/fixtures/legacy-eyelids/illustration.json');
assert.equal(styleAssetDirectory("illustration"), "umi");
assert.notDeepEqual(illustration.frames[illustration.ids.rest].pixels,
  sheets.umi.frames[sheets.umi.ids.rest].pixels,
  "The legacy-style regression must exercise illustration artwork, not an Umi companion preview");
const first = session(illustration);
first.activity.start({ wake: true });
const legacy = first.render();
const open = illustration.frames[illustration.ids["idle-open"]];
const upperLashRegions = [[80, 100, 90, 110], [130, 100, 146, 110]];
const lowerLidRegions = [[80, 120, 100, 130], [127, 120, 147, 130]];
const grayIrisRegions = [[80, 107, 86, 114], [130, 107, 137, 114]];
for (let eye = 0; eye < upperLashRegions.length; eye++) {
  const region = upperLashRegions[eye];
  assert.ok(darkPixels(illustration, open, region) > 20,
    `Legacy eye ${eye}: the test ROI must contain the original upper lash when open`);
  assert.equal(darkPixels(legacy.sheet, legacy.frame, region), 0,
    `Legacy eye ${eye}: startup rest left an old upper lash above the closed-eye line`);
  assert.ok(darkPixels(legacy.sheet, legacy.frame, lowerLidRegions[eye]) > 8,
    `Legacy eye ${eye}: removing the old lash must preserve the true closed-eye line`);
  for (const id of ["idle-blink", "talk-blink", "concern-blink", "happy-blink", "rest"])
    assert.equal(darkPixels(illustration, illustration.frames[illustration.ids[id]], region), 0,
      `${id}: illustration's other closed-eye states must not keep the same old upper lash`);
}
for (const id of ["idle-blink", "talk-blink", "concern-blink", "happy-blink", "rest"]) {
  const frame = illustration.frames[illustration.ids[id]];
  for (const [left, top, right, bottom] of grayIrisRegions)
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const rgb = illustration.palette[frame.pixels[y * illustration.width + x]];
      assert.ok(Math.min(...rgb) >= 245,
        `${id}: pale gray iris remnants must also disappear, not just black upper-lash ink`);
    }
}
first.player.dispose();

const pixel = await read('tests/fixtures/legacy-eyelids/pixel.json');
const pixelInk = pixel.palette.findIndex((rgb) => rgb.join(",") === "47,58,60");
assert.ok(pixelInk > 0);
const pixelUpperRegions = [[32, 38, 37, 42], [55, 38, 61, 42]];
for (const region of pixelUpperRegions) {
  assert.ok(darkPixels(pixel, pixel.frames[pixel.ids["idle-open"]], region) > 0,
    "The legacy pixel ROI must originally contain an open-eye upper lash");
  for (const id of ["idle-blink", "talk-blink", "concern-blink", "happy-blink", "rest"])
    assert.equal(darkPixels(pixel, pixel.frames[pixel.ids[id]], region), 0,
      `${id}: the original pixel character must not retain a second upper eyelid`);
}
for (const [x, y] of [[36, 49], [35, 50], [34, 51], [56, 49], [55, 50], [54, 51]])
  assert.equal(pixel.frames[pixel.ids.rest].pixels[y * pixel.width + x], pixelInk,
    "The original pixel character's stepped closed-lid ink must survive the cleanup");
const pokedPixel = withPokeFrame(pixel, await read('tests/fixtures/legacy-eyelids/pixel-poke.json'));
for (const id of ["idle-blink", "talk-blink", "concern-blink", "happy-blink", "rest", "error", "poke"])
  for (const [x, y] of [[40, 45], [40, 47], [61, 45]]) {
    const rgb = pokedPixel.palette[pokedPixel.frames[pokedPixel.ids[id]].pixels[y * pixel.width + x]];
    assert.ok(!(rgb[0] - rgb[1] > 16 && rgb[0] - rgb[2] > 16),
      `${id}: the old iris boundary column must not leave orange eye highlights behind`);
  }

// The independent header style can still be the original pixel character.
// Compare its only wink with an open frame at the same authored angle: the
// old upper outline must disappear while the existing lower lid survives.
const header = await read('tests/fixtures/legacy-eyelids/header.json');
assert.equal(header.frames.length, 15);
assert.equal(header.loopDurationMs, 4800);
const winkIndex = header.frames.findIndex((frame) => frame.wink);
assert.equal(winkIndex, 7);
const wink = header.frames[winkIndex];
assert.equal(wink.angleDeg, -6);
const openHeader = header.frames.find((frame) => !frame.wink && frame.angleDeg === wink.angleDeg);
let headerEyeReport;
if (header.headerRestoration?.schemaVersion === 1) {
  // Current HD-derived artwork has different eye coordinates and palette.
  // Requiring the former 14 pixel outline here would force old body artwork
  // back into a correctly restored same-source header.
  assert.equal(header.headerSourcePose, "idle-open");
  assert.equal(header.headerRestoration.eyePixelsDrawn, false);
  assert.equal(header.headerRestoration.perFrameFit, false);
  let changes = 0;
  for (let i = 0; i < wink.pixels.length; i++) {
    assert.equal(wink.pixels[i] === 0, openHeader.pixels[i] === 0,
      "A same-angle header wink keeps the current silhouette");
    if (wink.pixels[i] !== openHeader.pixels[i]) {
      changes++;
      assert.ok(i % header.width > header.width * .45 && Math.floor(i / header.width) < header.height * .62,
        "The current source wink cannot change the other eye or body");
    }
  }
  const rightIrisPixels = frame => frame.pixels.reduce((count, p, i) => {
    const x = i % header.width / header.width, y = Math.floor(i / header.width) / header.height;
    const [r,g,b] = header.palette[p];
    return count + Number(p !== 0 && x > .54 && x < .76 && y > .38 && y < .57 && b > r + 25 && g > r + 15);
  }, 0);
  assert.ok(changes > 0 && rightIrisPixels(wink) < rightIrisPixels(openHeader),
    "The 700ms current-artwork wink must remove its blue iris");
  headerEyeReport = { winkIndex, currentArtwork: true, sameBody: true, changedEyePixels: changes };
} else {
const ink = header.palette.findIndex((rgb) => rgb.join(",") === "47,58,60");
assert.ok(ink > 0);
function headerInkInSourceBox(frame, [left, top, right, bottom]) {
  // PIL's nearest rotation is an inverse map of destination pixel centers.
  // Checking its original eye coordinates keeps the old upper arch separate
  // from the adjacent correct lid even though the header itself is tilted.
  const angle = -frame.angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let count = 0;
  for (let y = 0; y < header.height; y++) for (let x = 0; x < header.width; x++) {
    if (frame.pixels[y * header.width + x] !== ink) continue;
    const sx = Math.floor(cos * (x + .5 - 50) + sin * (y + .5 - 50) + 50);
    const sy = Math.floor(-sin * (x + .5 - 50) + cos * (y + .5 - 50) + 50);
    if (sx >= left && sx < right && sy >= top && sy < bottom) count++;
  }
  return count;
}
assert.ok(headerInkInSourceBox(openHeader, [52, 38, 67, 49]) > 20,
  "The header regression must sample its original open-eye upper outline");
assert.equal(headerInkInSourceBox(wink, [52, 38, 67, 49]), 0,
  "The tilted native header wink must not retain a second upper eyelid");
assert.equal(headerInkInSourceBox(wink, [53, 49, 63, 53]), 14,
  "The header fix must preserve all 14 original stepped closed-lid pixels");
headerEyeReport = { winkIndex, oldUpperLashPixels: 0, preservedLowerLidPixels: 14 };
}
assert.equal(await readFile(join(root, "config.json"), "utf8"), originalConfig,
  "Style regression must not write the user's or repository's preferences");
console.log(JSON.stringify({ passed: true, modelRequests: 0, installedFilesRead: false,
  actualSavedLegacyStyleCovered: "illustration", oldUpperLashPixels: [0, 0],
  header: headerEyeReport, checks }, null, 2));
