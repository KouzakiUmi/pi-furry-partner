import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createMotionPlayer } from "../lib/motion.mjs";
import { renderDock } from "../lib/editor-layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const synthetic = () => {
  const palette = [[0, 0, 0], [255, 0, 0], [0, 0, 255], [191, 0, 64], [128, 0, 128], [64, 0, 191]];
  const frame = (id, color) => ({ id, pixels: Array.from({ length: 24 * 24 }, (_, i) => {
    const x = i % 24, y = Math.floor(i / 24); return x >= 4 && x < 20 && y >= 4 && y < 20 ? color : 0;
  }) });
  return { width: 24, height: 24, transparentIndex: 0, style: "test", palette,
    frames: [frame("idle-open", 1), frame("talk-small", 2), frame("talk-medium", 1), frame("talk-wide", 2), frame("think", 1), frame("think-blink", 2), frame("rest", 2), frame("happy", 1), frame("work",2),frame("work-blink",1),frame("search",2),frame("error",1)],
    ids: { "idle-open": 0, "talk-small": 1, "talk-medium": 2, "talk-wide": 3, think: 4, "think-blink": 5, rest: 6, happy: 7,work:8,"work-blink":9,search:10,error:11 }, motion: { ears: false } };
};
const make = (options = {}) => {
  let time = 0;
  const player = createMotionPlayer({ now: () => time, ...options });
  return { player, set: (ms) => { time = ms; }, advance: (ms) => { time += ms; }, get time() { return time; } };
};
const equalPixels = (a, b) => assert.deepEqual(Array.from(a.frame.pixels), Array.from(b.frame.pixels));
const regionBounds = (sheet, region, extra = 0) => {
  const normalized = region.normalized !== false && region.polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
  const polygon = region.polygon.map(([x, y]) => normalized ? [x * sheet.width, y * sheet.height] : [x, y]);
  const padding = (region.padding ?? (region.paddingNormalized !== undefined ? region.paddingNormalized * sheet.width : Math.max(1, sheet.width / 64))) + extra;
  return [Math.floor(Math.min(...polygon.map(([x]) => x)) - padding), Math.floor(Math.min(...polygon.map(([, y]) => y)) - padding),
    Math.ceil(Math.max(...polygon.map(([x]) => x)) + padding), Math.ceil(Math.max(...polygon.map(([, y]) => y)) + padding)];
};
const withinBounds = (x, y, [left, top, right, bottom]) => x >= left && x <= right && y >= top && y <= bottom;
const paperRegions = (sheet) => (Array.isArray(sheet.motion?.papers) ? sheet.motion.papers : sheet.motion?.papers ? [sheet.motion.papers] : []);
const mayFlutter = (sheet, x, y) => paperRegions(sheet).some((region) => withinBounds(x, y, regionBounds(sheet, region, 1)));
const searchHeadRegions = (sheet) => (Array.isArray(sheet.motion?.searchHead) ? sheet.motion.searchHead : sheet.motion?.searchHead ? [sheet.motion.searchHead] : []);
const mayMoveSearchHead = (sheet, x, y) => searchHeadRegions(sheet).some((region) => withinBounds(x, y, regionBounds(sheet, region, 2)));
const scaledPolygon = (sheet, region) => {
  const polygon = region.polygon ?? region;
  const normalized = region.normalized !== false && polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
  return polygon.map(([x, y]) => normalized ? [x * sheet.width, y * sheet.height] : [x, y]);
};
const withinPolygon = (x, y, polygon) => {
  let intersections = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[(i + 1) % polygon.length];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) intersections++;
  }
  return intersections % 2 === 1;
};
const differenceCount = (left, right, test = () => true) => {
  let changes = 0;
  for (let i = 0; i < left.frame.pixels.length; i++) if (test(i) && left.frame.pixels[i] !== right.frame.pixels[i]) changes++;
  return changes;
};
const alphaComponent = (pixels, width, height, transparent, seed) => {
  const included = new Uint8Array(pixels.length), queue = new Int32Array(pixels.length);
  let head = 0, count = 0;
  if (seed < 0 || pixels[seed] === transparent) return included;
  included[seed] = 1; queue[count++] = seed;
  while (head < count) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (!included[next] && pixels[next] !== transparent) { included[next] = 1; queue[count++] = next; }
    }
  }
  return included;
};

{
  const sheet = synthetic(), { player, set } = make();
  const initial = player.frame(sheet, 0, { phase: "idle" });
  assert.equal(initial.sheet.width, sheet.width); assert.equal(initial.sheet.height, sheet.height);
  assert.equal(initial.sheet.palette, sheet.palette); assert.equal(initial.sheet.frames.length, 1);
  assert.equal(initial.frameIndex, 0); assert.equal(initial.frame.cacheKey, initial.cacheKey);
  assert.equal(initial.sheet.frames[0], initial.frame); assert.equal(initial.transitioning, false);
  set(49); assert.equal(player.frame(sheet, 0, { phase: "idle" }).cacheKey, initial.cacheKey);
  assert.deepEqual(sheet.frames[0].pixels, initial.frame.pixels);
  set(500); const moved = player.frame(sheet, 0, { phase: "idle" });
  assert.notEqual(moved.cacheKey, initial.cacheKey);
  assert.equal(moved.frame.pixels.length, sheet.width * sheet.height);
  assert.equal(moved.sheet.palette.length, sheet.palette.length);
  assert.ok(moved.frame.pixels.some((p) => p === 0));
  player.dispose();
  checks.push("Fixed one-frame indexed views share the source palette, retain transparency and use stable content identities within each motion step");
}

{
  const sheet = synthetic(), { player, advance } = make();
  player.frame(sheet, 0, { phase: "idle" });
  const start = player.frame(sheet, 1, { phase: "speaking" });
  assert.equal(start.transitioning, true); assert.equal(start.frame.pixels[12 * 24 + 12], 1);
  const colors = [];
  for (let step = 1; step <= 4; step++) {
    advance(50);
    // Mouth changes during an existing transition must not change its deadline.
    const visual = player.frame(sheet, step === 2 ? 3 : 1, { phase: "speaking", blink: step === 3 });
    colors.push(visual.frame.pixels[12 * 24 + 12]);
    assert.equal(visual.transitioning, step < 4);
  }
  assert.deepEqual(colors, [3, 4, 5, 2]);
  advance(135); const mouth = player.frame(sheet, 2, { phase: "speaking" });
  assert.equal(mouth.transitioning, false); assert.equal(mouth.frame.pixels[12 * 24 + 12], 1);
  assert.ok(player.stats().palettePairs <= 3, "Repeated color pairs are looked up after their first nearest-palette calculation");
  player.dispose();
  checks.push("Phase transitions use four 50ms palette-quantized steps over 200ms; mouth frames switch immediately without restarting or starving a transition");
}

{
  const sheet = synthetic(), { player, set } = make();
  player.frame(sheet, 0, { phase: "idle" });
  player.frame(sheet, 1, { phase: "speaking" });
  set(75); const halfway = player.frame(sheet, 1, { phase: "speaking" });
  const restart = player.frame(sheet, 4, { phase: "thinking" });
  assert.equal(restart.cacheKey, halfway.cacheKey, "A rapid state change starts from the actual displayed composite");
  set(125); assert.equal(player.frame(sheet, 4, { phase: "thinking" }).transitioning, true);
  set(275); assert.equal(player.frame(sheet, 4, { phase: "thinking" }).transitioning, false);
  set(300); assert.equal(player.frame(sheet, 5, { phase: "thinking", blink: true }).transitioning, false, "Blink does not change the underlying pose group");
  player.reset();
  player.frame(sheet, 6, { phase: "waking" });
  assert.equal(player.frame(sheet, 4, { phase: "waking" }).transitioning, true, "Wake stages have distinct pose groups despite sharing a phase");
  set(600); player.frame(sheet, 4, { phase: "waking" });
  assert.equal(player.frame(sheet, 0, { phase: "waking" }).transitioning, true);
  player.dispose();
  checks.push("Rapid switches crossfade from the displayed composite, blink variants keep their pose and waking rest/think/idle stages transition independently");
}

{
  const sheet = synthetic(), { player, set } = make();
  player.frame(sheet, 0, { phase: "idle" });
  player.frame(sheet, 1, { phase: "speaking" });
  set(100); const moving = player.frame(sheet, 1, { phase: "speaking" });
  set(150); const paused = player.frame(sheet, 1, { phase: "speaking", animate: false });
  assert.equal(paused.cacheKey, moving.cacheKey); assert.equal(paused.nextInMs, Infinity);
  set(90000); const frozen = player.frame(sheet, 3, { phase: "speaking", animate: false, blink: true });
  assert.equal(frozen.cacheKey, paused.cacheKey); assert.deepEqual(frozen.motion, paused.motion);
  assert.equal(player.stats().logicalTime, 100);
  const resumed = player.frame(sheet, 1, { phase: "speaking" });
  assert.equal(resumed.cacheKey, moving.cacheKey); assert.equal(resumed.transitioning, true);
  set(90100); assert.equal(player.frame(sheet, 1, { phase: "speaking" }).transitioning, false);
  const changed = player.frame(sheet, 4, { phase: "thinking", animate: false });
  assert.equal(changed.transitioning, false); assert.equal(changed.frame.id, "think");
  set(95000); assert.equal(player.frame(sheet, 5, { phase: "thinking", animate: false }).cacheKey, changed.cacheKey);
  assert.equal(player.frame(sheet, 7, { phase: "thinking", animate: false }).cacheKey, changed.cacheKey, "Even a caller-provided pose change in the same paused phase remains still");
  player.dispose();
  checks.push("Pause freezes pixels, blink, mouth, ears and breathing; resume continues the same logical clock and a real paused phase change updates once");
}

{
  const sheet = synthetic(), first = make(), second = make();
  first.player.frame(sheet, 4, { phase: "thinking" }); second.player.frame(sheet, 4, { phase: "thinking" });
  let frequent;
  for (let i = 1; i <= 60; i++) { first.set(i * 10); frequent = first.player.frame(sheet, 4, { phase: "thinking" }); }
  second.set(600); equalPixels(frequent, second.player.frame(sheet, 4, { phase: "thinking" }));
  const before = first.player.stats().logicalTime;
  first.set(500); first.player.frame(sheet, 4, { phase: "thinking" });
  assert.equal(first.player.stats().logicalTime, before, "Backward clock adjustments cannot rewind motion");
  first.player.dispose(); second.player.dispose();
  checks.push("Micro-motion depends on elapsed logical time rather than token/render frequency and tolerates backward wall-clock adjustments");
}

{
  const sheet=synthetic(),{player,set}=make();player.frame(sheet,sheet.ids.work,{phase:"running"});
  for(let i=1;i<=10;i++){
    set(i*100);const visual=player.frame(sheet,i%3?sheet.ids.work:sheet.ids["work-blink"],{phase:i%2?"editing":"running"});
    assert.equal(visual.transitioning,false,"Adjacent editing/running and blink variants share the work pose and never crossfade");
    assert.match(visual.frame.id,/^work/);
  }
  player.reset();player.frame(sheet,sheet.ids.search,{phase:"searching"});
  assert.equal(player.frame(sheet,sheet.ids.search,{phase:"compacting"}).transitioning,false);
  player.dispose();checks.push("Consecutive editing/running reuse one typing pose without fading; searching and compacting likewise share the buried-search pose");
}

{
  const sheet=synthetic(),{player,set}=make();player.frame(sheet,sheet.ids.think,{phase:"thinking"});
  set(50);assert.equal(player.frame(sheet,sheet.ids.work,{phase:"running"}).transitioning,true,"Typing begins its 200ms transition immediately");
  set(250);assert.equal(player.frame(sheet,sheet.ids.work,{phase:"running"}).frame.id,"work");
  set(300);assert.equal(player.frame(sheet,sheet.ids.think,{phase:"thinking"}).frame.id,"work");
  set(540);assert.equal(player.frame(sheet,sheet.ids.think,{phase:"thinking"}).frame.id,"work","A stable think request still respects the 1200ms work dwell");
  set(1249);assert.equal(player.frame(sheet,sheet.ids.think,{phase:"thinking"}).frame.id,"work");
  set(1250);assert.equal(player.frame(sheet,sheet.ids.think,{phase:"thinking"}).transitioning,true,"Work has remained visible for 1200ms, including at least 1000ms after its entry fade");
  set(1450);assert.equal(player.frame(sheet,sheet.ids.think,{phase:"thinking"}).frame.id,"think");
  player.reset();player.frame(sheet,sheet.ids.work,{phase:"running"});
  set(1600);player.frame(sheet,sheet.ids.think,{phase:"thinking"});set(1700);
  assert.equal(player.frame(sheet,sheet.ids.work,{phase:"editing"}).frame.id,"work","A brief intermediate think phase must not flash the typing pose");
  player.dispose();checks.push("Typing enters immediately, remains visible for at least 1200ms including 1000ms after its entry fade, and requires 240ms stability before exiting to think; short tool boundaries never flash another pose");
}

{
  const sheet=synthetic();
  for(const [phase,index]of[["waiting",sheet.ids["idle-open"]],["speaking",sheet.ids["talk-small"]],["error",sheet.ids.error]]){
    const {player,set}=make();player.frame(sheet,sheet.ids.work,{phase:"running"});
    set(50);player.frame(sheet,sheet.ids.think,{phase:"thinking"});set(100);
    assert.equal(player.frame(sheet,index,{phase}).transitioning,true,`${phase} bypasses pending think/work debounce immediately`);
    set(300);const visual=player.frame(sheet,index,{phase});assert.equal(visual.transitioning,false);assert.equal(visual.frame.id,sheet.frames[index].id);player.dispose();
  }
  checks.push("Waiting, speech and error bypass visual debounce and begin their pose transition immediately instead of waiting for a typing dwell");
}

{
  const sheet=synthetic(),{player,set}=make();const first=player.frame(sheet,sheet.ids.rest,{phase:"dozing"});
  set(1200);const sleeping=player.frame(sheet,sheet.ids.rest,{phase:"dozing"});assert.notEqual(sleeping.cacheKey,first.cacheKey);
  assert.equal(sleeping.motion.earLeft,0);assert.equal(sleeping.motion.earRight,0);assert.equal(sleeping.motion.x,0);
  player.reset();player.frame(sheet,sheet.ids.think,{phase:"startled"});set(1300);
  const waking=player.frame(sheet,sheet.ids.think,{phase:"startled"});assert.ok(waking.motion.y<0);assert.notEqual(waking.motion.earLeft,0);
  set(1900);const settled=player.frame(sheet,sheet.ids.think,{phase:"startled"});assert.equal(settled.motion.y,0);assert.equal(settled.motion.earLeft,0);
  player.dispose();
  const observed=[],observedIds=[];const options={geometry:{collapsed:false,columns:16,rows:8},sheet,theme:{fg:(_,s)=>s},visibleWidth:(s)=>s.length,truncateToWidth:(s,w)=>s.slice(0,w),renderAvatar:()=>Array(8).fill(" ".repeat(16)),motionPlayer:{frame:(input,index,value)=>{observed.push(value.phase);observedIds.push(input.frames[index].id);return{sheet:input,frameIndex:index};}}};
  renderDock({...options,snapshot:{face:"rest",phase:"waiting",drowsy:true,color:"warning",bubble:"z"}});
  renderDock({...options,snapshot:{face:"think",phase:"thinking",reaction:"startled",color:"accent",bubble:"!"}});
  renderDock({...options,snapshot:{face:"idle-blink",phase:"thinking",visualPhase:"editing",blink:true,color:"accent",bubble:"typing"}});
  assert.deepEqual(observed,["dozing","startled","editing"]);assert.equal(observedIds[2],"work-blink");
  checks.push("Dozing uses slow nod/breath without twitching; startled bounce settles after 650ms, and the real dock maps reaction flags to motion without changing actual activity phase");
}

const assetResults = [], actionResults = [];
for (const style of ["wumi", "pixel", "illustration", "wumi-pixel"]) {
  let sheet;
  try { sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8")); }
  catch (error) { if (style === "wumi-pixel" && error.code === "ENOENT") continue; throw error; }
  const test = make(), { player } = test;
  const palette = sheet.palette;
  const phases = ["idle", "thinking", "speaking", "reading", "success", "error", "cancelled", "compacting"];
  for (let i = 0; i < 180; i++) {
    test.set(i * 100);
    const visual = player.frame(sheet, i % sheet.frames.length, { phase: phases[Math.floor(i / 9) % phases.length] });
    assert.equal(visual.sheet.width, sheet.width); assert.equal(visual.sheet.height, sheet.height);
    assert.equal(visual.frame.pixels.length, sheet.width * sheet.height);
    assert.equal(visual.sheet.palette, palette);
    assert.ok(visual.frame.pixels.every((p) => Number.isInteger(p) && p >= 0 && p < palette.length));
    assert.ok(player.stats().frames <= 64);
  }
  assetResults.push({ style, dimensions: [sheet.width, sheet.height], frames: sheet.frames.length, maxCachedFrames: player.stats().frames, generatedFrames: player.stats().generatedFrames });
  player.dispose();
}
checks.push("All available reaction styles retain fixed dimensions, valid original-palette indexes and a maximum of 64 cached frames through repeated pose changes");

for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  for (const id of ["search", "error", "happy", "happy-blink", "work", "work-blink","wait","wait-blink"]) assert.ok(sheet.ids[id] !== undefined, `${style} needs its final ${id} asset`);
  assert.ok(sheet.motion?.tail?.normalized && sheet.motion?.wave?.normalized);
  const metrics = { style, tailAlphaChanges: 0, waveAlphaChanges: 0, earAlphaChanges: 0, typingPixelChanges: 0, errorEyeChanges: [] };
  for (const phase of ["searching", "compacting"]) {
    const tailOnlySheet = { ...sheet, motion: { ...sheet.motion, papers: false, searchHead: false } };
    const { player, set } = make();
    const start = player.frame(tailOnlySheet, sheet.ids.search, { phase });
    set(450); const tail = player.frame(tailOnlySheet, sheet.ids.search, { phase });
    let alphaChanges = 0;
    for (let i = 0; i < tail.frame.pixels.length; i++) {
      if (Boolean(start.frame.pixels[i]) !== Boolean(tail.frame.pixels[i])) alphaChanges++;
      if (Math.floor(i / sheet.width) >= sheet.height * (420 / 640)) assert.equal(tail.frame.pixels[i], start.frame.pixels[i], `${phase} tail motion must leave the document pile and main lower body completely still`);
    }
    assert.ok(alphaChanges > 0, `${style} ${phase} must move the actual tail silhouette, not just its interior markings`);
    metrics.tailAlphaChanges += alphaChanges;
    player.dispose();
  }
  {
    const control = { ...sheet, motion: { ...sheet.motion, ears: false } };
    const first = make(), second = make();
    first.player.frame(sheet, sheet.ids.think, { phase: "thinking" }); second.player.frame(control, sheet.ids.think, { phase: "thinking" });
    first.set(3100); second.set(3100);
    const moving = first.player.frame(sheet, sheet.ids.think, { phase: "thinking" });
    const still = second.player.frame(control, sheet.ids.think, { phase: "thinking" });
    for (let i = 0; i < moving.frame.pixels.length; i++) if (Boolean(moving.frame.pixels[i]) !== Boolean(still.frame.pixels[i])) metrics.earAlphaChanges++;
    assert.ok(metrics.earAlphaChanges > 0, `${style} twitch must move its actual ear silhouette`);
    first.player.dispose(); second.player.dispose();
  }
  {
    const control = { ...sheet, motion: { ...sheet.motion, wave: false } };
    const first = make(), second = make();
    first.player.frame(sheet, sheet.ids.happy, { phase: "success" }); second.player.frame(control, sheet.ids.happy, { phase: "success" });
    first.set(200); second.set(200);
    const waving = first.player.frame(sheet, sheet.ids.happy, { phase: "success" });
    const still = second.player.frame(control, sheet.ids.happy, { phase: "success" });
    for (let i = 0; i < waving.frame.pixels.length; i++) {
      if (Boolean(waving.frame.pixels[i]) !== Boolean(still.frame.pixels[i])) metrics.waveAlphaChanges++;
      if (i % sheet.width < sheet.width * 0.63) assert.equal(waving.frame.pixels[i], still.frame.pixels[i], "Raised-paw waving must not warp the face or resting paw");
    }
    assert.ok(metrics.waveAlphaChanges > 0, `${style} wave must move its raised-paw silhouette`);
    first.player.dispose(); second.player.dispose();
  }
  {
    const control = { ...sheet, motion: { ...sheet.motion, paws: false } };
    const first = make(), second = make();
    first.player.frame(sheet, sheet.ids.work, { phase: "running" }); second.player.frame(control, sheet.ids.work, { phase: "running" });
    first.set(2100); second.set(2100);
    const typing = first.player.frame(sheet, sheet.ids.work, { phase: "running" });
    const still = second.player.frame(control, sheet.ids.work, { phase: "running" });
    for (let i = 0; i < typing.frame.pixels.length; i++) if (typing.frame.pixels[i] !== still.frame.pixels[i]) metrics.typingPixelChanges++;
    assert.ok(metrics.typingPixelChanges > 0, `${style} gray paws must actually type`);
    first.player.dispose(); second.player.dispose();
  }
  for (const [left, right] of [[0.30, 0.43], [0.50, 0.63]]) {
    let changed = 0;
    for (let y = Math.floor(sheet.height * 0.37); y < sheet.height * 0.49; y++) for (let x = Math.floor(sheet.width * left); x < sheet.width * right; x++) {
      const i = y * sheet.width + x;
      if (sheet.frames[sheet.ids.error].pixels[i] !== sheet.frames[sheet.ids["idle-open"]].pixels[i]) changed++;
    }
    assert.ok(changed > 0, `${style} has a distinct final XX error asset for each eye`); metrics.errorEyeChanges.push(changed);
  }
  actionResults.push(metrics);
}
checks.push("Final wumi and wumi-pixel assets visibly change tail and raised-paw alpha silhouettes, keep tail motion out of the document pile, move real typing paws and supply distinct XX eye pixels");

{
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions/wumi/reaction-sheet.json"), "utf8"));
  const withoutEars = { ...sheet, motion: { ears: false } };
  const first = make(), second = make();
  first.player.frame(sheet, sheet.ids.think, { phase: "thinking" });
  second.player.frame(withoutEars, sheet.ids.think, { phase: "thinking" });
  first.set(3100); second.set(3100);
  const twitch = first.player.frame(sheet, sheet.ids.think, { phase: "thinking" });
  const still = second.player.frame(withoutEars, sheet.ids.think, { phase: "thinking" });
  let changed = 0;
  for (let i = 0; i < twitch.frame.pixels.length; i++) {
    if (twitch.frame.pixels[i] === still.frame.pixels[i]) continue;
    changed++;
    assert.ok(Math.floor(i / sheet.width) < sheet.height * 0.5, "Ear warp must not alter the lower face, arms or paws");
  }
  assert.ok(changed > 0, "The default ear polygons cause a visible local twitch");
  first.set(4300); second.set(4300);
  equalPixels(first.player.frame(sheet, sheet.ids.think, { phase: "thinking" }), second.player.frame(withoutEars, sheet.ids.think, { phase: "thinking" }));
  first.player.dispose(); second.player.dispose();
  checks.push("Ear twitch uses bounded polygon warps, leaves lower face/arms/paws unchanged and returns exactly to the unwarped pose after the twitch");
}

const earFlickResults = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  const control = { ...sheet, motion: { ...sheet.motion, ears: false } };
  const first = make(), second = make(), silhouettes = new Set();
  let leftPeak = 0, rightPeak = 0, activeSamples = 0;
  first.player.frame(sheet, sheet.ids.think, { phase: "thinking" });
  second.player.frame(control, sheet.ids.think, { phase: "thinking" });
  for (let time = 2800; time <= 4100; time += 100) {
    first.set(time); second.set(time);
    const moving = first.player.frame(sheet, sheet.ids.think, { phase: "thinking" });
    const still = second.player.frame(control, sheet.ids.think, { phase: "thinking" });
    let left = 0, right = 0;
    const delta = [];
    for (let i = 0; i < moving.frame.pixels.length; i++) {
      if ((moving.frame.pixels[i] === (sheet.transparentIndex ?? 0)) === (still.frame.pixels[i] === (sheet.transparentIndex ?? 0))) continue;
      assert.ok(Math.floor(i / sheet.width) < sheet.height * 0.5, `${style} ear flick must leave the lower face and paws intact`);
      delta.push(i);
      if (i % sheet.width < sheet.width * 0.45) left++; else right++;
    }
    leftPeak = Math.max(leftPeak, left); rightPeak = Math.max(rightPeak, right);
    if (delta.length) { activeSamples++; silhouettes.add(delta.join(",")); }
    if (time === 4100) equalPixels(moving, still);
  }
  assert.ok(leftPeak > 0 && rightPeak > 0, `${style} both visible ears must change their alpha outline`);
  assert.ok(activeSamples >= 4 && silhouettes.size >= 3, `${style} ear flick has several visible beats rather than one static displaced ear`);
  first.player.dispose(); second.player.dispose();
  for (const phase of ["idle", "waking", "dozing"]) {
    const sleeper = make(), baseline = make();
    sleeper.player.frame(sheet, sheet.ids.rest, { phase }); baseline.player.frame(control, sheet.ids.rest, { phase });
    for (const time of [3100, 3200, 3400, 3500, 9000]) {
      sleeper.set(time); baseline.set(time);
      const resting = sleeper.player.frame(sheet, sheet.ids.rest, { phase });
      const still = baseline.player.frame(control, sheet.ids.rest, { phase });
      assert.equal(resting.motion.earLeft, 0, `${style} ${phase}/rest must not flick a sleeping ear`);
      assert.equal(resting.motion.earRight, 0); equalPixels(resting, still);
    }
    sleeper.player.dispose(); baseline.player.dispose();
  }
  earFlickResults.push({ style, leftPeakAlphaChanges: leftPeak, rightPeakAlphaChanges: rightPeak,
    activeSamples, distinctFlickSilhouettes: silhouettes.size, restingFlickSuppressed: true });
}
checks.push("Both ears visibly flick through several outline-changing beats on 240px and 80px styles, return to their normal contour, and remain still on rest/waking-rest/dozing poses");

{
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions/wumi/reaction-sheet.json"), "utf8"));
  const withoutPaws = { ...sheet, motion: { paws: false } };
  for (const phase of ["running", "editing"]) {
    const first = make(), second = make();
    first.player.frame(sheet, sheet.ids.work, { phase }); second.player.frame(withoutPaws, sheet.ids.work, { phase });
    first.set(2100); second.set(2100);
    const typed = first.player.frame(sheet, sheet.ids.work, { phase });
    const untyped = second.player.frame(withoutPaws, sheet.ids.work, { phase });
    assert.equal(typed.motion.pawLeft, -typed.motion.pawRight);
    assert.notEqual(typed.motion.pawLeft, 0);
    let changed = 0;
    for (let i = 0; i < typed.frame.pixels.length; i++) {
      if (typed.frame.pixels[i] === untyped.frame.pixels[i]) continue;
      changed++; assert.ok(Math.floor(i / sheet.width) > sheet.height * 0.65, "Typing must leave the face and scarf intact");
    }
    assert.ok(changed > 0, `${phase} animates its real gray paws`);
    first.set(2300); const alternate = first.player.frame(sheet, sheet.ids.work, { phase });
    assert.equal(alternate.motion.pawLeft, -typed.motion.pawLeft);
    first.player.dispose(); second.player.dispose();
  }
  const { player, set } = make();
  player.frame(sheet, sheet.ids.work, { phase: "reading" }); set(2100);
  assert.equal(player.frame(sheet, sheet.ids.work, { phase: "reading" }).motion.pawLeft, 0);
  player.dispose();
  checks.push("Running and editing alternate the real gray paws by 1–2 native pixels while preserving face/scarf; reading keeps its normal pose");
}

{
  const sheet = synthetic();
  sheet.frames[0].id = "search";
  sheet.motion = { ears: false, paws: false, tail: { polygon: [[0.5, 0.05], [0.98, 0.05], [0.98, 0.98], [0.5, 0.98]], pivot: [0.65, 0.85], normalized: true } };
  const stationary = { ...sheet, motion: { ears: false, paws: false } };
  for (const phase of ["searching", "compacting"]) {
    const first = make(), second = make();
    first.player.frame(sheet, 0, { phase }); second.player.frame(stationary, 0, { phase });
    first.set(450); second.set(450);
    const moving = first.player.frame(sheet, 0, { phase });
    const still = second.player.frame(stationary, 0, { phase });
    assert.equal(moving.motion.tail, 2); assert.equal(moving.motion.earLeft, 0);
    assert.notDeepEqual(Array.from(moving.frame.pixels), Array.from(still.frame.pixels));
    first.player.dispose(); second.player.dispose();
  }
  checks.push("Searching and compacting reuse metadata-driven traveling tail waves on buried search poses, including legacy pinned-attachment metadata");
}

const tailWaveResults = [];
{
  // Colored bands expose independent root/middle/tip trajectories. A rigid
  // rotation cannot put the middle and tip on opposite sides at the same time.
  const edge = 128, pixels = new Uint8Array(edge * edge);
  for (let y = 16; y <= 112; y++) for (let x = 59; x <= 69; x++)
    pixels[y * edge + x] = y >= 105 ? 1 : y >= 64 && y <= 70 ? 2 : y <= 23 ? 3 : 4;
  for (let y = 118; y <= 124; y++) for (let x = 24; x <= 104; x++) pixels[y * edge + x] = 4;
  const sheet = { width: edge, height: edge, transparentIndex: 0,
    palette: [[0, 0, 0], [250, 220, 200], [100, 180, 230], [220, 100, 160], [190, 195, 205]],
    ids: { search: 0 }, frames: [{ id: "search", pixels }],
    motion: { ears: false, paws: false, tail: { normalized: false,
      polygon: [[54, 14], [74, 14], [74, 114], [54, 114]], pivot: [64, 112], rootPinned: true,
      spine: [[64, 112], [64, 80], [64, 48], [64, 16]] } } };
  const { player, set } = make(), middle = [], tip = [], identities = new Set();
  const centroid = (frame, color) => {
    let sum = 0, count = 0;
    for (let i = 0; i < frame.pixels.length; i++) if (frame.pixels[i] === color) { sum += i % edge; count++; }
    assert.ok(count > 0, "The wave must retain each marked part of the tail"); return sum / count;
  };
  let initial;
  for (let step = 0; step < 24; step++) {
    set(step * 100); const visual = player.frame(sheet, 0, { phase: "searching" });
    initial ||= visual;
    assert.equal(visual.motion.tailPhase, step);
    identities.add(visual.cacheKey); middle.push(centroid(visual.frame, 2) - 64); tip.push(centroid(visual.frame, 3) - 64);
    for (let y = 105; y < edge; y++) for (let x = 0; x < edge; x++)
      assert.equal(visual.frame.pixels[y * edge + x], pixels[y * edge + x], "Root band and document pile remain pinned pixel-for-pixel");
    assert.equal(visual.sheet.palette, sheet.palette);
    assert.ok(visual.frame.pixels.every((value) => value >= 0 && value < sheet.palette.length));
  }
  assert.ok(identities.size >= 16);
  assert.ok(middle.some((offset, index) => offset * tip[index] < -0.25), "Middle and tip bend in opposite directions during the traveling wave");
  assert.ok(Math.max(...tip) - Math.min(...tip) > Math.max(...middle) - Math.min(...middle), "Amplitude grows toward the tip");
  const middlePeak = middle.indexOf(Math.max(...middle)), tipPeak = tip.indexOf(Math.max(...tip));
  assert.ok(Math.min(Math.abs(middlePeak - tipPeak), 24 - Math.abs(middlePeak - tipPeak)) >= 2, "Tail sections reach the same side at different times");
  set(2400); const repeated = player.frame(sheet, 0, { phase: "searching" });
  assert.equal(repeated.cacheKey, initial.cacheKey, "A full wave period reuses the cached content identity");
  set(2450); const paused = player.frame(sheet, 0, { phase: "searching", animate: false });
  set(90000); const frozen = player.frame(sheet, 0, { phase: "searching", animate: false });
  equalPixels(paused, frozen); assert.equal(frozen.motion.tailPhase, paused.motion.tailPhase);
  player.frame(sheet, 0, { phase: "searching" }); set(90100);
  assert.notEqual(player.frame(sheet, 0, { phase: "searching" }).cacheKey, frozen.cacheKey);
  tailWaveResults.push({ style: "marked-chain", distinctPhases: identities.size,
    periodMs: 2400,
    middlePeakAtMs: middlePeak * 100, tipPeakAtMs: tipPeak * 100,
    middleRangePx: Math.max(...middle) - Math.min(...middle), tipRangePx: Math.max(...tip) - Math.min(...tip),
    fixedRootAndPaper: true, pauseAndPeriodCache: true });
  player.dispose();
  checks.push("An articulated root-pinned tail sends a phase-lagged wave along its spine: middle and tip bend oppositely, amplitude grows outward, and pause/period cache remain stable");
}

for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  const tail = sheet.motion.tail;
  const { player, set } = make({ maxFrames: 7 });
  const source = sheet.frames[sheet.ids.search].pixels, silhouettes = new Set();
  let pinnedPixels = 0;
  for (let step = 0; step < 36; step++) {
    set(step * 100); const visual = player.frame(sheet, sheet.ids.search, { phase: "searching" });
    const alpha = visual.frame.pixels.map((value) => value === (sheet.transparentIndex ?? 0) ? 0 : 1);
    silhouettes.add(Array.from(alpha).join(""));
    assert.equal(visual.motion.x, 0); assert.equal(visual.motion.y, 0); assert.equal(visual.motion.tilt, 0);
    assert.ok(player.stats().frames <= 7);
    for (let y = 0; y < sheet.height; y++) for (let x = 0; x < sheet.width; x++) {
      if ((y >= sheet.height * (430 / 640) && !mayFlutter(sheet, x, y) && !mayMoveSearchHead(sheet, x, y)) || y >= sheet.height * 0.94) {
        assert.equal(visual.frame.pixels[y * sheet.width + x], source[y * sheet.width + x], `${style} leaves the lower body and paper pile base still outside the explicit loose-page/head masks`);
        if (!step) pinnedPixels++;
      }
    }
  }
  assert.ok(silhouettes.size >= 12, `${style} has multiple truly different wave silhouettes`);
  tailWaveResults.push({ style, distinctAlphaSilhouettes: silhouettes.size, fixedLowerBodyAndPaperBasePixels: pinnedPixels, maxCachedFrames: player.stats().frames, flexibleRoot: tail.rootFlexible === true });
  player.dispose();
}
checks.push("Real wumi and 80px wumi-pixel search animations have at least twelve distinct silhouettes while the lower body and paper base stay fixed outside the loose-page/head masks under a seven-frame LRU limit");

const flexibleRootResults = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  const tail = sheet.motion.tail;
  assert.equal(tail.rootPinned, false); assert.equal(tail.rootFlexible, true);
  const tailOnlySheet = { ...sheet, motion: { ...sheet.motion, papers: false, searchHead: false } };
  const pivot = tail.normalized === false ? tail.pivot : tail.pivot.map((value, axis) => value * (axis ? sheet.height : sheet.width));
  const x = Math.round(pivot[0]), top = Math.round(pivot[1]), bottom = Math.round(sheet.height * 420 / 640);
  const transparent = sheet.transparentIndex ?? 0, source = sheet.frames[sheet.ids.search].pixels;
  const rootRadius = Math.max(2, Math.round(sheet.width * 0.02));
  const rootStates = new Set(), { player, set } = make();
  let peakRootChanges = 0, minTailConnectedRatio = 1;
  const anchor = bottom * sheet.width + x;
  assert.notEqual(source[anchor], transparent, `${style} test anchor lies on the stable hip`);
  for (let step = 0; step < 24; step++) {
    set(step * 100); const visual = player.frame(tailOnlySheet, sheet.ids.search, { phase: "searching" });
    const pixels = visual.frame.pixels, component = alphaComponent(pixels, sheet.width, sheet.height, transparent, anchor);
    let changes = 0, signature = "", tailOpaque = 0, tailConnected = 0;
    for (let y = top - rootRadius; y <= top + rootRadius; y++) for (let rx = x - rootRadius; rx <= x + rootRadius; rx++) {
      const index = y * sheet.width + rx;
      if (pixels[index] !== source[index]) changes++;
      signature += `${pixels[index]},`;
    }
    rootStates.add(signature); peakRootChanges = Math.max(peakRootChanges, changes);
    for (let y = top; y <= bottom; y++) {
      assert.notEqual(pixels[y * sheet.width + x], transparent, `${style} flexible root must keep an opaque bridge into the hip at wave step ${step}`);
      assert.equal(component[y * sheet.width + x], 1, `${style} root bridge stays in the same alpha component as the stable hip`);
    }
    const [left, upper, right] = regionBounds(sheet, tail, sheet.width * 0.06);
    for (let y = Math.max(0, upper); y < Math.floor(sheet.height * 0.55); y++) for (let tx = Math.max(0, left); tx <= Math.min(sheet.width - 1, right); tx++) {
      const index = y * sheet.width + tx;
      if (pixels[index] !== transparent) { tailOpaque++; if (component[index]) tailConnected++; }
    }
    assert.ok(tailOpaque > 0);
    const ratio = tailConnected / tailOpaque;
    assert.ok(ratio >= 0.995, `${style} tail silhouette remains attached to the body rather than splitting across an alpha crack (${ratio})`);
    minTailConnectedRatio = Math.min(minTailConnectedRatio, ratio);
  }
  assert.ok(rootStates.size >= 3 && peakRootChanges > 0, `${style} tail root must visibly flex instead of remaining rigidly pinned`);
  flexibleRootResults.push({ style, rootPixelStates: rootStates.size, peakRootChangedPixels: peakRootChanges,
    opaqueHipBridgeEveryPhase: true, minTailConnectedRatio, stableHipStartsAtSourceY: 420 });
  player.dispose();
}
checks.push("Real tail roots flex through several pixel states while an opaque bridge and the tail alpha component remain continuously attached to the fixed main hip throughout the full wave");

const paperFlutterResults = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  const papers = paperRegions(sheet), source = Array.from(sheet.frames[sheet.ids.search].pixels);
  assert.ok(papers.length >= 2 && papers.length <= 3, `${style} animates just two or three top loose pages`);
  assert.equal(new Set(papers.map((region) => region.phaseOffset)).size, papers.length, `${style} loose pages have staggered phases`);
  const baselineSheet = { ...sheet, motion: { ...sheet.motion, papers: false } };
  const paperBounds = papers.map((region) => regionBounds(sheet, region, 1));
  for (const [left, top, right, bottom] of paperBounds) {
    assert.ok(top >= sheet.height * 0.64 && bottom < sheet.height * 0.94, `${style} loose-page masks stay above the fixed paper base and away from the hip/tail`);
    assert.ok(left < right && top < bottom);
  }
  const perPage = [];
  for (let page = 0; page < papers.length; page++) {
    const singleSheet = { ...sheet, motion: { ...sheet.motion, papers: [papers[page]] } };
    const zeroOffsetSheet = { ...sheet, motion: { ...sheet.motion, papers: [{ ...papers[page], phaseOffset: 0 }] } };
    const first = make(), second = make(), zeroOffset = make(), states = new Set();
    let peakChanges = 0, phaseOffsetChangedPixels = 0;
    for (let time = 0; time < 2400; time += 100) {
      first.set(time); second.set(time); zeroOffset.set(time);
      const moving = first.player.frame(singleSheet, sheet.ids.search, { phase: "searching" });
      const still = second.player.frame(baselineSheet, sheet.ids.search, { phase: "searching" });
      const synchronized = zeroOffset.player.frame(zeroOffsetSheet, sheet.ids.search, { phase: "searching" });
      phaseOffsetChangedPixels = Math.max(phaseOffsetChangedPixels, differenceCount(moving, synchronized));
      let signature = "";
      const changes = differenceCount(moving, still, (index) => {
        const x = index % sheet.width, y = Math.floor(index / sheet.width);
        if (moving.frame.pixels[index] !== still.frame.pixels[index]) {
          assert.ok(withinBounds(x, y, paperBounds[page]), `${style} page ${page + 1} cannot move another part of the sprite`);
          signature += `${index}:${moving.frame.pixels[index]},`;
        }
        return true;
      });
      peakChanges = Math.max(peakChanges, changes); states.add(signature);
    }
    assert.ok(peakChanges > 0 && states.size >= 3, `${style} loose page ${page + 1} actually flutters through several pixel states`);
    if (papers[page].phaseOffset) assert.ok(phaseOffsetChangedPixels > 0, `${style} page ${page + 1} must consume its own phase offset even when enabled on its own`);
    perPage.push({ page: page + 1, peakChangedPixels: peakChanges, distinctPixelStates: states.size,
      phaseOffset: papers[page].phaseOffset, phaseOffsetChangedPixels });
    first.player.dispose(); second.player.dispose(); zeroOffset.player.dispose();
  }
  const first = make(), second = make(), compact = make();
  let peakChanges = 0, initial;
  for (let time = 0; time <= 2400; time += 100) {
    first.set(time); second.set(time); compact.set(time);
    const moving = first.player.frame(sheet, sheet.ids.search, { phase: "searching" });
    const still = second.player.frame(baselineSheet, sheet.ids.search, { phase: "searching" });
    const compacting = compact.player.frame(sheet, sheet.ids.search, { phase: "compacting" });
    initial ||= moving;
    equalPixels(moving, compacting);
    const changes = differenceCount(moving, still, (index) => {
      const x = index % sheet.width, y = Math.floor(index / sheet.width);
      if (moving.frame.pixels[index] !== still.frame.pixels[index]) {
        assert.ok(paperBounds.some((bounds) => withinBounds(x, y, bounds)), `${style} combined paper motion stays inside its loose-page masks`);
        assert.ok(y < sheet.height * 0.94, `${style} lower paper base never moves`);
      }
      return true;
    });
    peakChanges = Math.max(peakChanges, changes);
    assert.equal(moving.sheet.palette, sheet.palette);
    assert.ok(moving.frame.pixels.every((index) => Number.isInteger(index) && index >= 0 && index < sheet.palette.length));
    if (time === 2400) equalPixels(moving, initial);
  }
  assert.ok(peakChanges > 0);
  first.set(2500); const paused = first.player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  first.set(90000); const frozen = first.player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  equalPixels(paused, frozen); assert.deepEqual(paused.motion, frozen.motion);
  assert.deepEqual(Array.from(sheet.frames[sheet.ids.search].pixels), source, `${style} source pixels remain immutable`);
  paperFlutterResults.push({ style, pages: perPage, peakCombinedChangedPixels: peakChanges,
    lowerPaperBaseFixed: true, hipAndTailUnchangedByPaperMotion: true, searchingAndCompactingMatch: true,
    paletteAndPausePreserved: true, periodMs: 2400 });
  first.player.dispose(); second.player.dispose(); compact.player.dispose();
}
checks.push("Only two or three loose top pages flutter through multiple states on both styles; searching/compacting share the 2400ms cycle while the lower pile, hip, tail wave, source palette and pause remain unchanged");

const searchHeadResults = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = JSON.parse(await readFile(join(root, "assets/reactions", style, "reaction-sheet.json"), "utf8"));
  const regions = searchHeadRegions(sheet), occlusion = (sheet.motion.searchOcclusion ?? []).map((region) => scaledPolygon(sheet, region));
  assert.ok(regions.some((region) => region.id === "hood") && regions.some((region) => region.id === "neck-scarf"), `${style} has independent hood and neck/scarf layers`);
  assert.ok(occlusion.length > 0, `${style} retains foreground paper occlusion for the buried head`);
  const baselineSheet = { ...sheet, motion: { ...sheet.motion, searchHead: false } };
  const source = sheet.frames[sheet.ids.search].pixels, transparent = sheet.transparentIndex ?? 0;
  const bounds = regions.map((region) => regionBounds(sheet, region, 2));
  const perRegion = [];
  for (let region = 0; region < regions.length; region++) {
    const isolated = { ...sheet, motion: { ...sheet.motion, searchHead: [regions[region]] } };
    const first = make(), second = make(), states = new Set();
    let peakChanges = 0;
    for (let time = 0; time < 2400; time += 100) {
      first.set(time); second.set(time);
      const moving = first.player.frame(isolated, sheet.ids.search, { phase: "searching" });
      const still = second.player.frame(baselineSheet, sheet.ids.search, { phase: "searching" });
      const changed = [];
      const changes = differenceCount(moving, still, (index) => {
        if (moving.frame.pixels[index] !== still.frame.pixels[index]) {
          const x = index % sheet.width, y = Math.floor(index / sheet.width);
          assert.ok(withinBounds(x, y, bounds[region]), `${style} ${regions[region].id} cannot move another body part`);
          changed.push(`${index}:${moving.frame.pixels[index]}`);
        }
        return true;
      });
      peakChanges = Math.max(peakChanges, changes); states.add(changed.join(","));
    }
    assert.ok(peakChanges > 0 && states.size >= 3, `${style} ${regions[region].id} genuinely moves through multiple pixel states`);
    perRegion.push({ id: regions[region].id, peakChangedPixels: peakChanges, distinctPixelStates: states.size });
    first.player.dispose(); second.player.dispose();
  }
  // An eroded opaque core checks for interior alpha holes independently of the
  // implementation's warp mask; moving outer contours are allowed to change.
  const core = [];
  for (let y = 3; y < sheet.height - 3; y++) for (let x = 3; x < sheet.width - 3; x++) {
    if (!bounds.some((box) => withinBounds(x, y, box)) || occlusion.some((polygon) => withinPolygon(x, y, polygon))) continue;
    let opaque = true;
    for (let dy = -3; opaque && dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (source[(y + dy) * sheet.width + x + dx] === transparent) { opaque = false; break; }
    if (opaque) core.push(y * sheet.width + x);
  }
  assert.ok(core.length > 10, `${style} contains a substantial opaque hood/neck core`);
  const first = make({ maxFrames: 7 }), second = make(), compact = make(), alternating = make();
  const anchor = Math.round(sheet.height * 540 / 640) * sheet.width + Math.round(sheet.width * 500 / 640);
  assert.notEqual(source[anchor], transparent, `${style} stable gray-paw anchor exists`);
  let initial, peakHeadChanges = 0, protectedForegroundPixels = 0, minHeadConnectedRatio = 1;
  for (let step = 0; step <= 48; step++) {
    const time = step * 100;
    first.set(time); second.set(time); compact.set(time); alternating.set(time);
    const moving = first.player.frame(sheet, sheet.ids.search, { phase: "searching" });
    const still = second.player.frame(baselineSheet, sheet.ids.search, { phase: "searching" });
    const compacting = compact.player.frame(sheet, sheet.ids.search, { phase: "compacting" });
    const switched = alternating.player.frame(sheet, sheet.ids.search, { phase: step % 2 ? "compacting" : "searching" });
    initial ||= moving; equalPixels(moving, compacting); equalPixels(moving, switched);
    assert.equal(switched.transitioning, false, `${style} search/compact handoffs reuse the same moving pose`);
    assert.ok(first.player.stats().frames <= 7);
    assert.equal(moving.sheet.width, sheet.width); assert.equal(moving.sheet.height, sheet.height); assert.equal(moving.sheet.palette, sheet.palette);
    assert.ok(moving.frame.pixels.every((index) => Number.isInteger(index) && index >= 0 && index < sheet.palette.length));
    const component = alphaComponent(moving.frame.pixels, sheet.width, sheet.height, transparent, anchor);
    let opaqueHead = 0, connectedHead = 0, headChanges = 0;
    for (let index = 0; index < source.length; index++) {
      const x = index % sheet.width, y = Math.floor(index / sheet.width);
      if (moving.frame.pixels[index] !== still.frame.pixels[index]) {
        headChanges++; assert.ok(bounds.some((box) => withinBounds(x, y, box)), `${style} head motion stays local`);
      }
      if ((x >= sheet.width * 450 / 640 && y >= sheet.height * 480 / 640) || y >= sheet.height * 602 / 640) {
        assert.equal(moving.frame.pixels[index], source[index], `${style} gray paw and lowest paper base stay fixed`);
      }
      if (!mayFlutter(sheet, x, y) && occlusion.some((polygon) => withinPolygon(x, y, polygon))) {
        assert.equal(moving.frame.pixels[index], source[index], `${style} foreground paper hides the moving hood instead of being dragged with it`);
        if (!step) protectedForegroundPixels++;
      }
      if (bounds.some((box) => withinBounds(x, y, box)) && moving.frame.pixels[index] !== transparent) {
        opaqueHead++; if (component[index]) connectedHead++;
      }
    }
    for (const index of core) assert.notEqual(moving.frame.pixels[index], transparent, `${style} hood/neck motion cannot open an interior alpha crack at step ${step}`);
    const ratio = connectedHead / opaqueHead;
    assert.ok(ratio >= 0.99, `${style} hood and scarf remain attached to the stable body (${ratio})`);
    minHeadConnectedRatio = Math.min(minHeadConnectedRatio, ratio); peakHeadChanges = Math.max(peakHeadChanges, headChanges);
    if (step === 24 || step === 48) equalPixels(moving, initial);
  }
  assert.ok(peakHeadChanges > 0 && protectedForegroundPixels > 0);
  first.set(4900); const paused = first.player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  first.set(90000); const frozen = first.player.frame(sheet, sheet.ids.search, { phase: "searching", animate: false });
  equalPixels(paused, frozen); assert.deepEqual(paused.motion, frozen.motion);
  searchHeadResults.push({ style, regions: perRegion, peakCombinedHeadChangedPixels: peakHeadChanges,
    protectedForegroundPixels, fixedOpaqueCorePixels: core.length, minHeadConnectedRatio,
    foregroundOcclusionAndGrayPawFixed: true, searchingCompactingHandoffsDoNotFade: true,
    periodMs: 2400, pauseAndSevenFrameCachePreserved: true });
  first.player.dispose(); second.player.dispose(); compact.player.dispose(); alternating.player.dispose();
}
checks.push("Buried hood and neck/scarf genuinely sway through local pixel states while foreground paper occludes them, the opaque core stays unbroken and the gray paw/lower pile stay fixed on both styles");
checks.push("Searching/compacting share the same 2400ms articulated head cycle without handoff fades, preserve palette/dimensions under a seven-frame LRU and freeze every layer on pause");

{
  const sheet = synthetic();
  sheet.motion = { ears: false, paws: false, wave: { polygon: [[0.5, 0.05], [0.98, 0.05], [0.98, 0.98], [0.5, 0.98]], pivot: [0.65, 0.85], normalized: true, angle: 5 } };
  const stationary = { ...sheet, motion: { ears: false, paws: false } };
  const first = make(), second = make();
  first.player.frame(sheet, 7, { phase: "success" }); second.player.frame(stationary, 7, { phase: "success" });
  first.set(200); second.set(200);
  const moving = first.player.frame(sheet, 7, { phase: "success" });
  const still = second.player.frame(stationary, 7, { phase: "success" });
  assert.equal(moving.motion.wave, 1); assert.ok(Math.abs(moving.motion.tilt) <= 3);
  assert.notDeepEqual(Array.from(moving.frame.pixels), Array.from(still.frame.pixels));
  assert.equal(moving.motion.pawLeft, 0); assert.equal(moving.motion.pawRight, 0);
  first.player.dispose(); second.player.dispose();
  checks.push("Success adds a gentle head sway and one metadata-driven raised-paw wave, without turning the gesture into two-paw typing");
}

{
  const sheet = synthetic(), { player, set } = make();
  player.frame(sheet, 0, { phase: "error" });
  set(100); const stumble = player.frame(sheet, 0, { phase: "error" });
  assert.equal(stumble.motion.x, -1); assert.equal(stumble.motion.tilt, -5);
  set(300); assert.equal(player.frame(sheet, 0, { phase: "error" }).motion.x, -1);
  for (const time of [600, 3100, 9000]) {
    set(time); const settled = player.frame(sheet, 0, { phase: "error" });
    assert.equal(settled.motion.x, 0); assert.equal(settled.motion.tilt, 0);
    assert.equal(settled.motion.earLeft, 0); assert.equal(settled.motion.earRight, 0);
  }
  player.dispose();
  checks.push("Error makes one brief entry stumble, then settles into slow breathing without repeated stumbling or ear twitching");
}

{
  const sheet = synthetic(), test = make({ maxFrames: 7 }), { player } = test;
  for (let i = 0; i < 500; i++) {
    test.set(i * 100); player.frame(sheet, i % sheet.frames.length, { phase: `${i % 5}` });
    assert.ok(player.stats().frames <= 7);
  }
  const previous = player.frame(sheet, 0, { phase: "final" });
  player.reset(); assert.equal(player.stats().frames, 0);
  const next = player.frame(sheet, 0, { phase: "final" });
  assert.notEqual(previous.cacheKey, next.cacheKey, "Reset cannot reuse a content identity for a different generated frame");
  const dispose = player.dispose;
  dispose(); dispose();
  assert.equal(player.stats().frames, 0); assert.equal(player.stats().disposed, true);
  assert.throws(() => player.frame(sheet, 0), /disposed/);
  checks.push("Configurable LRU limits, reset identity safety and idempotent unbound disposal require no timers or external resources");
}

const sourceHashes = {};
for (const file of ["lib/motion.mjs", "assets/reactions/wumi/reaction-sheet.json", "assets/reactions/wumi-pixel/reaction-sheet.json"])
  sourceHashes[file] = createHash("sha256").update(await readFile(join(root, file))).digest("hex");
const report = { generatedAt: new Date().toISOString(), runtime: "pure JavaScript indexed-pixel motion; no graphical window or model requests", checks, assetResults, actionResults, earFlickResults, tailWaveResults, flexibleRootResults, paperFlutterResults, searchHeadResults, sourceHashes, passed: checks.length };
await writeFile(join(root, "tests/motion-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
