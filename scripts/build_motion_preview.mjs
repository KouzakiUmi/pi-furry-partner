#!/usr/bin/env node
// Offline export through the exact production activity, dock and motion code.
// No browser/CSS animation, extension installation, model or network request.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createActivity } from "../lib/activity.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { activityBorder, renderDock } from "../lib/editor-layout.mjs";
import { samplePixels } from "../lib/renderer.mjs";
import { createEditorControls } from "../lib/editor-controls.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { withSearchFrames } from "../lib/search.mjs";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const work = resolve(option("--work", join(root, "work/editor-motion-preview")));
const fps = Number(option("--fps", "20"));
assert.ok(fps === 10 || fps === 20, "Use 10 or 20 fps for exact GIF frame durations");
const tick = 1000 / fps, edge = 240;
await mkdir(work, { recursive: true });
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sheets = {};
for (const style of ["wumi", "wumi-pixel"]) {
  const directory = join(root, "assets/reactions", style);
  sheets[style] = withListenFrames(withWatchFrames(withPokeFrame(await readJson(join(directory, "reaction-sheet.json")), await readJson(join(directory, "poke-patch.json"))), await readJson(join(directory, "watch-frames.json"))), await readJson(join(directory, "listen-frames.json")));
  try{sheets[style]=withSearchFrames(sheets[style],await readJson(join(directory,"search-frames.json")));}catch(error){if(error.code!=="ENOENT")throw error;}
  for (const id of ["idle-open", "think", "talk-closed", "talk-small", "talk-medium", "talk-wide", "work", "error", "happy", "search", "wait", "wait-blink"]) {
    assert.ok(sheets[style].ids[id] !== undefined, `Missing final ${style}/${id}`);
  }
  assert.ok((sheets[style].motion?.searchVideo?.sequence || sheets[style].motion?.tail) && sheets[style].motion?.wave, "Final search action and success wave are required");
  assert.ok(sheets[style].palette.length <= 256);
}
const phrases = await readJson(join(root, "assets/status-phrases.json"));
const copy = await readJson(join(root, "assets/status-copy.json"));
const preferences = await readJson(join(root, "config.json"));
const segments = [
  { phase: "waking", label: "睡醒", durationMs: 5000 },
  { phase: "thinking", label: "思考", durationMs: 2000 },
  { phase: "speaking", label: "说话", durationMs: 2500 },
  { phase: "running", label: "运行", durationMs: 1800 },
  { phase: "searching", label: "搜索", durationMs: 2000 },
  { phase: "error", label: "错误", durationMs: 1500 },
  { phase: "success", label: "完成", durationMs: 2000 },
];
let cumulative = 0;
for (const segment of segments) { segment.startMs = cumulative; cumulative += segment.durationMs; segment.endMs = cumulative; }
let time = 0;
const activity = createActivity({ phrases: phrases.phrases, labels: copy.labels, bubbles: copy.bubbles,
  rotationMs: phrases.rotationMs, now: () => time, random: () => 0.314159 });
activity.start({ isBusy: false, wake: true });
const player = createMotionPlayer({ now: () => time, maxFrames: 64 });
const events = [];
function event(type, data = {}) { activity.handle(type, data); events.push({ atMs: time, type }); }
function enter(phase) {
  if (phase === "thinking") event("agent_start");
  if (phase === "speaking") event("message_update", { assistantMessageEvent: { type: "text_start" } });
  if (phase === "running") {
    event("message_update", { assistantMessageEvent: { type: "text_end" } });
    event("tool_execution_start", { toolCallId: "preview-run", toolName: "bash", args: {} });
  }
  if (phase === "searching") {
    event("tool_execution_end", { toolCallId: "preview-run", isError: false });
    event("tool_execution_start", { toolCallId: "preview-search", toolName: "search", args: { pattern: "startup" } });
  }
  if (phase === "error") {
    event("tool_execution_end", { toolCallId: "preview-search", isError: true });
    event("agent_before_settle", { outcome: "error" }); event("agent_settled");
  }
  if (phase === "success") {
    event("agent_start"); event("agent_before_settle", { outcome: "success" }); event("agent_settled");
  }
}
const theme = { fg: (_token, text) => text };
const width = (text) => [...String(text)].length;
const truncate = (text, length) => [...String(text)].slice(0, Math.max(0, length)).join("");
const cells = (text) => [...String(text)].reduce((sum, character) => sum +
  (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]|\p{Extended_Pictographic}/u.test(character) ? 2 : 1), 0);
const truncateCells = (text, length, ellipsis = "…") => {
  if (cells(text) <= length) return text;
  const available = Math.max(0, length - cells(ellipsis));
  let result = "";
  for (const character of String(text)) { if (cells(result + character) > available) break; result += character; }
  return result + (length >= cells(ellipsis) ? ellipsis : "");
};
const sliceCells = (text, start, end) => {
  let column = 0, result = "";
  for (const character of String(text)) {
    const size = cells(character);
    if (column >= start && column + size <= end) result += character;
    column += size;
  }
  return result;
};
const toolbar = createEditorControls({ visibleWidth: cells,
  getState: () => ({ animation: true, persona: preferences.persona === true, style: "wumi", hasText: false }) });
const toolbarWidth = 90;
const toolbarText = toolbar.render(toolbarWidth, theme);
const controls = { text: toolbarText, width: toolbarWidth, buttons: toolbar.regions.map((region) => ({
  id: region.id, label: sliceCells(toolbarText, region.start, region.end), start: region.start, end: region.end,
  group: ["model", "thinking", "menu"].includes(region.id) ? "right" : "left", enabled: region.enabled,
})), staticIllustrationOnly: true, nativeMouseRouting: "fullscreen" };
toolbar.dispose();
function capture(snapshot, motionPlayer, atMs, durationMs, chunks, frames, extra = {}) {
  const borderText = activityBorder({ snapshot, width: 90, theme,
    visibleWidth: cells, truncateToWidth: truncateCells, borderColor: (text) => text });
  assert.ok(cells(borderText) <= 90, "Top-border preview must fit its input width");
  let display, visual;
  const instrumentedPlayer = { frame(...parameters) { visual = motionPlayer.frame(...parameters); return visual; } };
  // The production dock selects pose/blink aliases and applies the real motion.
  renderDock({
    geometry: { collapsed: false, columns: 120, rows: 120, leftWidth: 123 },
    sheet: sheets.wumi, snapshot, theme, visibleWidth: width, truncateToWidth: truncate,
    renderAvatar(value) { display = value; return Array(120).fill(""); },
    renderPixels() { return []; }, samplePixels,
    motionPlayer: instrumentedPlayer, animate: true,
  });
  assert.ok(display?.sheet?.frames[display.frameIndex]);
  const frame = display.sheet.frames[display.frameIndex];
  const pixels = Buffer.from(samplePixels(frame, display.sheet.width, display.sheet.height, edge, edge));
  chunks.push(pixels);
  frames.push({ atMs, durationMs, phase: snapshot.phase, label: snapshot.label,
    phrase: snapshot.phrase, bubble: snapshot.bubble, color: snapshot.color, glyph: snapshot.glyph, borderText,
    toolName: snapshot.toolName, toolObject: snapshot.toolObject, elapsedMs: snapshot.elapsedMs, toolCount: snapshot.toolCount,
    sourceFace: snapshot.face, renderedFace: frame.id, blink: snapshot.blink,
    drowsy: snapshot.drowsy, reaction: snapshot.reaction, visualPhase: snapshot.visualPhase,
    transitioning: visual.transitioning, motion: visual.motion,
    sha256: createHash("sha256").update(pixels).digest("hex"), ...extra });
}
const chunks = [], frames = [];
let previousPhase;
for (time = 0; time < cumulative; time += tick) {
  const segment = segments.find((item) => time >= item.startMs && time < item.endMs);
  if (segment.phase !== previousPhase) { enter(segment.phase); previousPhase = segment.phase; }
  if (segment.phase === "speaking") event("message_update", { assistantMessageEvent: { type: "text_delta" } });
  const snapshot = activity.snapshot();
  assert.equal(snapshot.phase, segment.phase);
  assert.equal(snapshot.label, copy.labels[segment.phase], "Preview must use the installed first-person status labels");
  capture(snapshot, player, time, tick, chunks, frames);
}
await writeFile(join(work, "character-frames.bin"), Buffer.concat(chunks));
// Keep the ten-second waiting threshold real, while omitting the uneventful
// middle 7.8 seconds from this separate, explicitly labelled preview clip.
let waitingTime = 0;
const waitingActivity = createActivity({ phrases: phrases.phrases, labels: copy.labels, bubbles: copy.bubbles,
  rotationMs: phrases.rotationMs, now: () => waitingTime, random: () => 0.314159 });
const waitingPlayer = createMotionPlayer({ now: () => waitingTime, maxFrames: 64 });
const waitingChunks = [], waitingFrames = [], waitingEvents = [];
waitingActivity.start({ wake: false });
const waitingEvent = (type, data = {}) => {
  waitingActivity.handle(type, data); waitingEvents.push({ atMs: waitingTime, type });
};
waitingEvent("ui_prompt_start");
const waitingSegments = [
  { phase: "waiting", label: "歪头等待", realStartMs: 0, durationMs: 2200 },
  { phase: "waiting", label: "真实等待十秒后打盹", realStartMs: 10000, durationMs: 1800 },
  { phase: "thinking", label: "收到请求后惊醒", realStartMs: 11800, durationMs: 1000 },
];
let playbackMs = 0;
for (const segment of waitingSegments) {
  segment.startMs = playbackMs;
  segment.endMs = playbackMs + segment.durationMs;
  waitingTime = segment.realStartMs;
  if (segment.phase === "thinking") { waitingEvent("ui_prompt_end"); waitingEvent("agent_start"); }
  for (let offset = 0; offset < segment.durationMs; offset += tick) {
    waitingTime = segment.realStartMs + offset;
    const snapshot = waitingActivity.snapshot();
    assert.equal(snapshot.phase, segment.phase);
    capture(snapshot, waitingPlayer, waitingTime, tick, waitingChunks, waitingFrames, { playbackMs: playbackMs + offset });
  }
  playbackMs += segment.durationMs;
}
await writeFile(join(work, "waiting-frames.bin"), Buffer.concat(waitingChunks));
const waitingChecks = { durationMs: playbackMs, realClockEndMs: waitingTime + tick, omittedMs: 7800,
  productionTimingUsed: true, fps, frames: waitingFrames.length,
  waitFaces: [...new Set(waitingFrames.filter((frame) => !frame.drowsy && frame.phase === "waiting").map((frame) => frame.sourceFace))],
  drowsyAtMs: waitingFrames.find((frame) => frame.drowsy)?.atMs,
  startleDurationMs: waitingFrames.filter((frame) => frame.reaction === "startled").length * tick,
  actualStartleDurationMs: 650,
  resumedThinking: waitingFrames.some((frame) => frame.phase === "thinking" && !frame.reaction),
};
assert.ok(waitingChecks.waitFaces.includes("wait") && waitingChecks.waitFaces.includes("wait-blink"));
assert.equal(waitingChecks.drowsyAtMs, 10000);
assert.ok(waitingChecks.startleDurationMs >= 650 && waitingChecks.startleDurationMs < 650 + tick);
assert.ok(waitingChecks.resumedThinking);
waitingPlayer.dispose();
const tailLoops = [];
for (const style of ["wumi", "wumi-pixel"]) {
  const sheet = sheets[style];
  const searchSequence=sheet.motion.searchVideo?.sequence;
  if(!searchSequence)assert.ok(sheet.motion.tail.spine?.length >= 3, "Legacy articulated tail spine is required");
  let tailTime = 0;
  const tailPlayer = createMotionPlayer({ now: () => tailTime });
  const tailChunks = [], tailFrames = [];
  const periodMs=searchSequence?.periodMs||2400,stepMs=searchSequence?50:100;
  for (tailTime = 0; tailTime < periodMs; tailTime += stepMs) {
    const visual = tailPlayer.frame(sheet, sheet.ids.search, { phase: "searching" });
    if(searchSequence){assert.ok(Number.isInteger(visual.motion.searchSequenceStep));assert.equal(visual.motion.tailPhase,undefined);assert.equal(visual.motion.paperPhase,undefined);assert.equal(visual.motion.burrowPhase,undefined);}
    else assert.equal(visual.motion.tailPhase, tailTime / 100);
    const pixels = Buffer.from(visual.frame.pixels);
    tailChunks.push(pixels);
    tailFrames.push({ atMs: tailTime, durationMs: Math.min(stepMs,periodMs-tailTime), motion: visual.motion,
      sha256: createHash("sha256").update(pixels).digest("hex") });
  }
  const file = `tail-${style}-frames.bin`;
  await writeFile(join(work, file), Buffer.concat(tailChunks));
  tailLoops.push({ style, width: sheet.width, height: sheet.height, palette: sheet.palette,
    transparentIndex: sheet.transparentIndex ?? 0, framesFile: file, frames: tailFrames,
    periodMs, bakedMotion:Boolean(searchSequence), rootPinned: searchSequence?false:sheet.motion.tail.rootPinned === true, rootFlexible: searchSequence?true:sheet.motion.tail.rootFlexible === true, spinePoints: searchSequence?0:sheet.motion.tail.spine.length,
    distinctFrames: new Set(tailFrames.map((frame) => frame.sha256)).size });
  tailPlayer.dispose();
}
const comparisons = [];
for (const style of ["wumi", "wumi-pixel"]) for (const id of ["think", "talk-wide"]) {
  const sheet = sheets[style], file = `comparison-${style}-${id}.bin`;
  await writeFile(join(work, file), Buffer.from(sheet.frames[sheet.ids[id]].pixels));
  comparisons.push({ style, id, file, width: sheet.width, height: sheet.height, palette: sheet.palette });
}
const provenance = {};
for (const path of ["lib/activity.mjs", "lib/motion.mjs", "lib/editor-layout.mjs", "lib/editor-controls.mjs", "lib/renderer.mjs", "lib/poke.mjs", "lib/watch.mjs", "lib/listen.mjs", "config.json", "assets/status-copy.json", "assets/status-phrases.json", "assets/reactions/wumi/reaction-sheet.json", "assets/reactions/wumi-pixel/reaction-sheet.json", "assets/reactions/wumi/poke-patch.json", "assets/reactions/wumi-pixel/poke-patch.json", "assets/reactions/wumi/watch-frames.json", "assets/reactions/wumi-pixel/watch-frames.json", "assets/reactions/wumi/listen-frames.json", "assets/reactions/wumi-pixel/listen-frames.json", "lib/search.mjs", "assets/reactions/wumi/search-frames.json", "assets/reactions/wumi-pixel/search-frames.json"]) {
  provenance[path] = createHash("sha256").update(await readFile(join(root, path))).digest("hex");
}
const distinct = (phase) => new Set(frames.filter((frame) => frame.phase === phase).map((frame) => frame.sha256)).size;
const check = {
  productionModulesUsed: ["lib/activity.mjs", "lib/editor-layout.mjs", "lib/motion.mjs", "lib/renderer.mjs", "lib/editor-controls.mjs"],
  firstPersonCopyUsed: true, controlButtons: controls.buttons.map((item) => item.label),
  statusPlacement: "input top border only", extraStatusRows: 0,
  modelRequests: 0, simulatedEventsOnly: true, durationMs: cumulative, fps,
  requestedFrames: frames.length, transitions: frames.filter((frame) => frame.transitioning).length,
  speakingMouths: [...new Set(frames.filter((frame) => frame.phase === "speaking").map((frame) => frame.sourceFace))],
  runningScanMotion: frames.some((frame) => frame.phase === "running" && frame.motion.watchSequenceStep !== undefined),
  searchTailMotion: frames.some((frame) => frame.phase === "searching" && (frame.motion.tail || frame.motion.searchSequenceStep !== undefined)),
  successWaveMotion: frames.some((frame) => frame.phase === "success" && frame.motion.wave),
  distinctFramesByPhase: Object.fromEntries(segments.map((segment) => [segment.phase, distinct(segment.phase)])),
};
assert.equal(check.durationMs, 16800);
assert.ok(["talk-closed", "talk-small", "talk-medium", "talk-wide"].every((id) => check.speakingMouths.includes(id)));
assert.ok(check.runningScanMotion && check.searchTailMotion && check.successWaveMotion && check.transitions > 0);
assert.ok(check.distinctFramesByPhase.error > 1);
const manifest = { schemaVersion: 1, characterWidth: edge, characterHeight: edge,
  palette: sheets.wumi.palette, transparentIndex: sheets.wumi.transparentIndex ?? 0,
  framesFile: "character-frames.bin", frames, segments, events, comparisons, controls, provenance, checks: check,
  waiting: { framesFile: "waiting-frames.bin", frames: waitingFrames, segments: waitingSegments,
    events: waitingEvents, checks: waitingChecks },
  tailLoops,
  disclaimer: "Effect preview composited from actual production animation pixels; not a terminal screenshot." };
await writeFile(join(work, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
player.dispose();
if (!args.includes("--no-render")) {
  const render = spawnSync(option("--python", "python"), [join(root, "scripts/render_motion_preview.py"), "--input", work, "--output", root], { encoding: "utf8" });
  if (render.stdout) process.stdout.write(render.stdout);
  if (render.status !== 0) throw new Error(render.stderr || `Preview render exited ${render.status}`);
}
console.log(JSON.stringify({ work, ...check }, null, 2));
