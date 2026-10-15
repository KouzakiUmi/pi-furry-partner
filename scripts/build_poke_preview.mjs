#!/usr/bin/env node
// Export an offline poke comparison from the production activity/dock/motion.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createActivity } from "../lib/activity.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { renderDock } from "../lib/editor-layout.mjs";
import { withPokeFrame, POKE_DURATION_MS } from "../lib/poke.mjs";
import { samplePixels } from "../lib/renderer.mjs";
import { styleAssetDirectory } from "../lib/styles.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const work = resolve(option("--work", join(root, "work/poke-preview")));
const output = resolve(option("--output", join(work, "Umi-poke-preview.gif")));
await mkdir(work, { recursive: true });
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const directory = join(root, "assets/reactions", styleAssetDirectory("umi"));
const base = await read(join(directory, "reaction-sheet.json"));
const sheet = withListenFrames(withWatchFrames(withPokeFrame(base, await read(join(directory, "poke-patch.json"))), await read(join(directory, "watch-frames.json"))), await read(join(directory, "listen-frames.json")));
assert.equal(sheet.frames.length, 26);
const copy = await read(join(root, "assets/status-copy.json"));
const phrases = await read(join(root, "assets/status-phrases.json"));
const themes = { fg: (_token, text) => text, bold: (text) => text };
let time = 0;
const contexts = [
  { id: "idle", label: "空闲 · 放松一点", english: "Idle" },
  { id: "busy", label: "工作中 · 轻轻回应", english: "Working" },
  { id: "waiting", label: "等你回答 · 耳朵竖好", english: "Waiting for you" },
].map((context, i) => {
  const activity = createActivity({ phrases: phrases.phrases, labels: copy.labels, bubbles: copy.bubbles,
    rotationMs: phrases.rotationMs, now: () => time, random: () => .32 + i * .1 });
  activity.start({ wake: false });
  if (context.id !== "idle") activity.handle("agent_start");
  if (context.id === "busy") activity.handle("tool_execution_start", { toolCallId: "demo-tool", toolName: "bash" });
  if (context.id === "waiting") activity.handle("ui_prompt_start");
  return { ...context, activity, player: createMotionPlayer({ now: () => time }), frames: [] };
});
const chunks = [], timeline = [], edge = 240, durationMs = 4000, stepMs = 50, pokeAtMs = 800;
for (time = 0; time < durationMs; time += stepMs) {
  if (time === pokeAtMs) for (const context of contexts) context.activity.poke();
  const views = [];
  for (const context of contexts) {
    const snapshot = context.activity.snapshot();
    let display;
    renderDock({ geometry: { collapsed: false, columns: 120, rows: 120 }, sheet, snapshot,
      renderAvatar(value) { display = value; return Array(120).fill(""); }, theme: themes,
      visibleWidth: (text) => [...text].length, truncateToWidth: (text, width) => [...text].slice(0, width).join(""),
      samplePixels, renderPixels: () => [], motionPlayer: context.player });
    const frame = display.sheet.frames[display.frameIndex];
    chunks.push(Buffer.from(samplePixels(frame, display.sheet.width, display.sheet.height, edge, edge)));
    views.push({ context: context.id, phase: snapshot.phase, bubble: snapshot.bubble, phrase: snapshot.phrase,
      poked: snapshot.reaction === "poked", strength: snapshot.reactionStrength, palette: frame.palette || display.sheet.palette });
    if (snapshot.reaction === "poked") assert.equal(snapshot.pokeContext, context.id);
    context.frames.push(snapshot);
  }
  timeline.push({ atMs: time, views });
}
for (const context of contexts) {
  const reactions = context.frames.filter((frame) => frame.reaction === "poked");
  assert.equal(reactions.length * stepMs, POKE_DURATION_MS);
  assert.equal(context.frames[0].phase, context.frames.at(-1).phase, "Poking cannot change the real activity phase");
  assert.ok(context.frames.at(-1).face !== "poke");
  context.player.dispose();
}
await writeFile(join(work, "pixels.bin"), Buffer.concat(chunks));
await writeFile(join(work, "manifest.json"), JSON.stringify({ width: edge, height: edge, durationMs, stepMs, pokeAtMs,
  contexts: contexts.map(({ id, label, english }) => ({ id, label, english })), timeline, noModelRequests: true,
  actualModules: ["activity", "editor-layout", "motion", "poke", "watch", "listen", "renderer"], notATerminalScreenshot: true }, null, 2));
const rendered = spawnSync(option("--python", "python"), [join(root, "scripts/render_poke_preview.py"), "--input", work, "--output", output], { encoding: "utf8" });
if (rendered.stdout) process.stdout.write(rendered.stdout);
if (rendered.status !== 0) throw new Error(rendered.stderr || `Render failed: ${rendered.status}`);
