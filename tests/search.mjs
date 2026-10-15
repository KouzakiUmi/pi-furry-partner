import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withSearchFrames } from "../lib/search.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { withListenFrames } from "../lib/listen.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";

const read = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const checks = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const base = await read(`assets/reactions/${style}/reaction-sheet.json`);
  const asset = await read(`assets/reactions/${style}/search-frames.json`);
  const poke = await read(`assets/reactions/${style}/poke-patch.json`);
  const watch = await read(`assets/reactions/${style}/watch-frames.json`);
  const listen = await read(`assets/reactions/${style}/listen-frames.json`);
  const before = withListenFrames(withWatchFrames(withPokeFrame(base, poke), watch), listen);
  const original = JSON.stringify(base), sheet = withSearchFrames(before, asset);
  assert.equal(sheet.frames.length, before.frames.length + asset.frames.length);
  assert.equal(sheet.palette, base.palette);
  assert.equal(sheet.ids.search, before.frames.length);
  assert.equal(sheet.frames[base.ids.search], base.frames[base.ids.search], "The legacy source pose remains available at its original index");
  for (let i = 0; i < before.frames.length; i++) assert.equal(sheet.frames[i], before.frames[i]);
  assert.equal(withSearchFrames(sheet, asset), sheet, "Repeated augmentation does not grow the frame bank");
  assert.equal(withSearchFrames(base), base);
  let time = 0;
  const player = createMotionPlayer({ now: () => time }), visited = new Set();
  for (time = 0; time < asset.sequence.periodMs; time += 50) {
    const value = player.frame(sheet, sheet.ids.search, { phase: "searching" });
    visited.add(value.motion.searchFrameId);
    assert.ok(Number.isInteger(value.motion.searchSequenceStep));
    assert.ok(value.nextInMs <= 50, "The refresh quantum cannot skip an 83/84 ms video frame");
    assert.equal(value.transitioning, false, "Internal video poses cannot crossfade");
    for (const key of ["x", "y", "tilt", "tail", "wave", "earLeft", "earRight", "pawLeft", "pawRight"]) assert.equal(value.motion[key], 0);
    for (const key of ["tailPhase", "paperPhase", "burrowPhase"]) assert.equal(value.motion[key], undefined, "Baked video must disable all old tail, paper and head rigs");
    assert.deepEqual(Buffer.from(value.frame.pixels), Buffer.from(sheet.frames[sheet.ids[value.motion.searchFrameId]].pixels),
      "Every displayed pixel comes from one intact authored frame");
  }
  assert.equal(visited.size, new Set(asset.sequence.steps.map((step) => step.id)).size);
  assert.ok(player.stats().frames <= player.stats().maxFrames, "The larger bank retains the bounded playback cache");
  const frozen = player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  time += 60000;
  const paused = player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  assert.equal(paused.cacheKey, frozen.cacheKey); assert.equal(paused.nextInMs, Infinity);
  player.dispose();
  assert.equal(JSON.stringify(base), original);
  checks.push(`${style}: complete forward loop visits every pose, unchanged source/palette, exact unwarped pixels, no internal crossfade, 50 ms refresh and bounded paused cache`);

  let now = 0;
  const changed = createMotionPlayer({ now: () => now }), continuous = createMotionPlayer({ now: () => now });
  for (now = 0; now < 7500; now += 50) {
    const phase = now < 1000 || now >= 4300 ? "searching" : "compacting";
    const a = changed.frame(sheet, sheet.ids.search, { phase });
    const b = continuous.frame(sheet, sheet.ids.search, { phase: "searching" });
    assert.equal(a.motion.searchFrameId, b.motion.searchFrameId, "Search/compaction handoff keeps the existing sequence clock");
    assert.equal(a.transitioning, false);
    assert.deepEqual(Buffer.from(a.frame.pixels), Buffer.from(b.frame.pixels));
  }
  changed.dispose(); continuous.dispose();
  checks.push(`${style}: searching and compacting share one continuous cycle without a phase-boundary jump`);
}

{
  // Small synthetic data checks the loader limits and timing independently of
  // the actual artwork, including malformed optional packs and legacy fallback.
  const frame = (id, color) => ({ id, pixels: Array(16).fill(color) });
  const base = { width: 4, height: 4, palette: [[0, 0, 0], [250, 250, 250], [50, 60, 70]],
    frames: [frame("search", 1)], ids: { search: 0 }, motion: { ears: false, paws: false } };
  const asset = { width: 4, height: 4, frames: [frame("search-video-000", 1), frame("search-video-001", 2), frame("search-video-002", 1)],
    sequence: { steps: [{ id: "search-video-000", durationMs: 83 }, { id: "search-video-001", durationMs: 84 }, { id: "search-video-002", durationMs: 83 }], periodMs: 250 } };
  for (const bad of [
    { ...asset, width: 1 }, { ...asset, frames: [asset.frames[0]] },
    { ...asset, frames: [...asset.frames, null] },
    { ...asset, frames: [...asset.frames, asset.frames[0]] },
    { ...asset, frames: [{ ...asset.frames[0], pixels: Array(16).fill(-1) }, asset.frames[1]] },
    { ...asset, frames: [{ ...asset.frames[0], pixels: Array(16).fill(3) }, asset.frames[1]] },
    { ...asset, frames: Array.from({ length: 97 }, (_, i) => frame(`search-video-${i}`, 1)) },
    { ...asset, sequence: { steps: [{ id: "search-video-000", durationMs: 49 }, asset.sequence.steps[1]] } },
    { ...asset, sequence: { steps: [{ id: "missing", durationMs: 83 }, asset.sequence.steps[1]] } },
    { ...asset, sequence: { steps: Array(129).fill(asset.sequence.steps[0]) } },
    { ...asset, sequence: { steps: Array(20).fill({ id: "search-video-000", durationMs: 2000 }) } },
    { ...asset, sequence: { ...asset.sequence, periodMs: 251 } },
  ]) assert.equal(withSearchFrames(base, bad), base, "Malformed optional packs fall back without mutating the original sheet");
  const sheet = withSearchFrames(base, asset); assert.equal(sheet.frames.length, 4);
  let time = 0; const player = createMotionPlayer({ now: () => time });
  for (const [at, id] of [[0, "000"], [82, "000"], [83, "001"], [166, "001"], [167, "002"], [249, "002"], [250, "000"], [333, "001"]]) {
    time = at; assert.equal(player.frame(sheet, sheet.ids.search, { phase: "searching" }).frame.id, `search-video-${id}`);
  }
  player.dispose();
  const legacy = createMotionPlayer({ now: () => time });
  assert.equal(legacy.frame(base, 0, { phase: "searching" }).motion.searchSequenceStep, undefined);
  time += 100;
  assert.equal(legacy.frame(base, 0, { phase: "searching" }).motion.tailPhase, 1, "Old packs keep their original articulated fallback");
  legacy.dispose();
  checks.push("Malformed assets are rejected within bounded frame/step/pixel/time budgets; exact 83/84 ms boundaries loop correctly; absent video packs retain the legacy motion path");
}
process.stdout.write(JSON.stringify({ passed: true, checks }, null, 2) + "\n");
