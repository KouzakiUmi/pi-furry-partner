import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STYLES, normalizeStyle, styleAssetDirectory } from "../lib/styles.mjs";
import { modules } from "./pi-runtime.mjs";

// Load the real extension against isolated configs; commands never mount a UI,
// submit a prompt or write to the installed companion.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, "work");
await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "style-ids-"));
const { loadExtensionsCached, clearExtensionCache } = await import(pathToFileURL(join(modules, "@earendil-works/pi-coding-agent/dist/core/extensions/loader.js")));
const checks = [], notices = [];
const ctx = { mode: "tui", ui: { notify: (message, type) => notices.push({ message, type }), setStatus() {} } };
let instance;
const saved = () => readFile(join(scratch, "config.json"), "utf8").then(JSON.parse);
async function load(config) {
  if (config) await writeFile(join(scratch, "config.json"), JSON.stringify({ enabled: false, language: "en", ...config }));
  clearExtensionCache();
  const loaded = await loadExtensionsCached([join(scratch, "index.ts")], scratch);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  instance = loaded.extensions[0];
  return (args) => instance.commands.get("mascot").handler(args, ctx);
}
try {
  for (const name of ["index.ts", "lib", "package.json"]) await cp(join(root, name), join(scratch, name), { recursive: true });
  await mkdir(join(scratch, "assets"));
  for (const name of ["status-copy.json", "status-phrases.json", "status-copy.en.json", "status-phrases.en.json", "ui-zh-CN.json"]) await cp(join(root, "assets", name), join(scratch, "assets", name));
  assert.deepEqual(STYLES, ["umi", "umi-pixel", "pixel", "illustration"]);
  assert.equal(JSON.parse(await readFile(join(root, "config.json"), "utf8")).style, "umi");
  for (const style of STYLES) {
    const sheet = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory(style), "reaction-sheet.json"), "utf8"));
    assert.ok(sheet.frames.length > 1);
    if (style.startsWith("umi")) assert.equal(sheet.width, style === "umi-pixel" ? 80 : 240);
  }
  for (const input of [undefined, null, {}, "../wumi", "constructor", "__proto__", "toString", "unknown"]) {
    assert.equal(normalizeStyle(input), undefined);
    assert.equal(styleAssetDirectory(input), undefined);
  }
  checks.push("Every canonical public style resolves to real unchanged assets; unsupported IDs cannot become asset paths");

  for (const [legacy, canonical] of [["wumi", "umi"], ["wumi-pixel", "umi-pixel"]]) {
    let command = await load({ style: legacy });
    await command("");
    assert.ok(notices.at(-1).message.includes(` · ${canonical} · `));
    assert.ok(notices.at(-1).message.includes("style umi|umi-pixel|pixel|illustration"));
    assert.ok(!notices.at(-1).message.includes("wumi"));
    await command("pause");
    assert.equal((await saved()).style, canonical, "A loaded old config is saved under its canonical ID");
    for (const value of [legacy, canonical, legacy.toUpperCase()]) {
      await command(`style ${value}`);
      assert.equal((await saved()).style, canonical);
      assert.ok(notices.at(-1).message.includes(` · ${canonical} · `));
    }
    command = await load();
    await command("");
    assert.ok(notices.at(-1).message.includes(` · ${canonical} · `), "The new saved ID survives a real fresh extension load");
    await command("layout header");
    const before = await readFile(join(scratch, "config.json"), "utf8");
    for (const value of [legacy, canonical]) {
      await command(`style ${value}`);
      assert.equal(await readFile(join(scratch, "config.json"), "utf8"), before);
      assert.ok(notices.at(-1).message.includes("reaction poses belong beside the editor"));
    }
  }
  const command = await load({});
  await command("pause"); assert.equal((await saved()).style, "umi");
  checks.push("Real Pi loader normalizes both legacy configs and aliases; canonical commands/help/status/save/reload work, default is umi, and header guards accept either spelling");
  console.log(JSON.stringify({ passed: true, modelRequests: 0, checks }, null, 2));
} finally {
  if (scratch.startsWith(work + sep) && scratch.slice(work.length + 1).startsWith("style-ids-")) await rm(scratch, { recursive: true, force: true });
}
