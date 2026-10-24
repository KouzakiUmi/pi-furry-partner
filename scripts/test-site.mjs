#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { styleAssetDirectory } from "../lib/styles.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { withSearchFrames } from "../lib/search.mjs";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const out = join(root, "dist");
const [html, css, app, manifest, sheets] = await Promise.all([
  readFile(join(out, "index.html"), "utf8"), readFile(join(out, "styles.css"), "utf8"), readFile(join(out, "app.js"), "utf8"),
  readFile(join(out, "build-manifest.json"), "utf8").then(JSON.parse), readFile(join(out, "assets/animation-sheets.json"), "utf8").then(JSON.parse),
]);
const checks = [];
function check(name, assertion) { assertion(); checks.push(name); }
check("Chinese first responsive standalone page", () => { assert.match(html, /lang="zh-CN"/); assert.match(html, /name="viewport"/); assert.match(html, /pi-furry-partner/); assert.match(css, /@media\(max-width:600px\)/); });
check("Actual character runtime, not an iframe", () => { assert.doesNotMatch(html, /<iframe/i); assert.match(app, /createMotionPlayer/); assert.match(app, /createActivity/); });
check("Canonical Umi style controls and sheet keys", () => { assert.deepEqual(Object.keys(sheets), ["umi", "umi-pixel"]); assert.match(html, /data-style="umi"/); assert.match(html, /data-style="umi-pixel"/); assert.doesNotMatch(html, /data-style="wumi/); assert.match(app, /style = "umi"/); });
check("Ten selectable animation states and two styles", () => { assert.equal((html.match(/data-state=/g) || []).length, 10); assert.equal((html.match(/data-style=/g) || []).length, 2); });
check("Poke has button, keyboard portrait, real activity timing and busy/idle strength", () => { assert.match(html, /id="poke"/); assert.match(html, /id="mascot"[^>]+role="button"[^>]+tabindex="0"/); assert.match(app, /activity\.poke\(\)/); assert.match(app, /reactionElapsedMs: snapshot\.reactionElapsedMs/); assert.match(app, /reactionStrength: snapshot\.reactionStrength/); });
check("Typing uses real listening events and keeps paused motion static", () => { assert.match(html, /<textarea id="demo-input"/); assert.match(app, /activity\.noteTyping\(\)/); assert.match(app, /activity\.clearTyping\(\)/); assert.match(app, /!paused && input\.value\.trim\(\)/); });
check("Caption text cannot shrink or paint over paws", () => { assert.match(css, /\.speech:lang\(en\)\{gap:2ch\}/); assert.match(css, /\.speech>span\[aria-hidden\]\{flex:0 0 2ch;min-width:2ch/); assert.match(css, /#bubble\{[^}]*min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/); assert.match(app, /\$\("\.speech"\)\.setAttribute\("lang"/); });
check("Pause, reduced motion and hidden-page suspension", () => { assert.match(app, /prefers-reduced-motion/); assert.match(app, /visibilitychange/); assert.match(app, /aria-pressed/); assert.match(css, /prefers-reduced-motion/); });
check("Three independent demo switches and no model calls", () => { assert.equal((html.match(/role="switch"/g) || []).length, 3); assert.match(app, /const toggleState = \{ locale: true, prompt: true, persona: false \}/); assert.doesNotMatch(app, /fetch\(["']https?:|XMLHttpRequest|sendBeacon|WebSocket/); });
check("Install copy fallback and pinned Pi version", () => { assert.ok(html.includes(`pi install git:github.com/KouzakiUmi/pi-furry-partner@v${pkg.version}`)); assert.ok(html.includes(`/releases/tag/v${pkg.version}`)); assert.ok(!html.includes(`@legacy-v${pkg.version}`)); assert.match(app, /navigator\.clipboard/); assert.match(app, /selectNodeContents/); });
check("Character ARR and code license separated", () => { assert.match(html, /呜咪角色及动画素材保留全部版权/); assert.match(html, /代码和文档采用 Apache-2.0/); assert.match(html, /All Rights Reserved/); });
check("Keyboard accessible named controls and visible focus", () => { assert.match(html, /skip-link/); assert.match(html, /aria-label="选择动画状态"/); assert.match(css, /focus-visible/); assert.match(html, /<noscript>/); });
check("Relative local URLs work under repository subpath", () => { for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) { if (!/^(?:https?:|#)/.test(url)) assert.ok(url.startsWith("./"), url); } assert.doesNotMatch(html, /(?:src|href)="\//); });
check("All build hashes match", () => { assert.equal(manifest.version, pkg.version); assert.equal(manifest.characterName, "Umi"); assert.match(html, />UMI <span>/); assert.doesNotMatch(html, /\bWUMI\b|\bWumi\b/); });
for (const [file, expected] of Object.entries(manifest.hashes)) assert.equal(createHash("sha256").update(await readFile(join(out, file))).digest("hex"), expected);
for (const file of ["activity", "actions", "motion", "poke", "listen"]) {
  const source = await readFile(join(out, "runtime", `${file}.js`), "utf8");
  assert.equal(source, (await readFile(join(root, "lib", `${file}.mjs`), "utf8")).replace(/\.mjs(["'])/g, '.js$1'));
  for (const [, dependency] of source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
    assert.ok(dependency.endsWith('.js'));
    await access(join(out, 'runtime', dependency));
  }
}
const { createActivity: createSiteActivity } = await import('../dist/runtime/activity.js');
let actionClock = 0;
const siteActivity = createSiteActivity({ now: () => actionClock });
siteActivity.start({ wake: false });
assert.equal(siteActivity.setAction('reading'), true);
assert.equal(siteActivity.snapshot().actionMode, 'reading');
actionClock = 3500;
assert.equal(siteActivity.snapshot().actionMode, undefined);
checks.push('Built browser activity loads all dependencies and runs finite original actions');
assert.match(await readFile(join(out, "runtime/activity.js"), "utf8"), /from "\.\/poke\.js"/);
await access(join(out, "runtime/poke.js"));
await access(join(out, "runtime/listen.js"));
for (const [style, data] of Object.entries(sheets)) {
  const original = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory(style), "reaction-sheet.json"), "utf8"));
  assert.equal(original.frames.length, 21);
  for (let i = 0; i < original.frames.length; i++) assert.deepEqual([...Buffer.from(data.frames[i].pixels, "base64")], original.frames[i].pixels);
  const patch = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory(style), "poke-patch.json"), "utf8"));
  const watch = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory(style), "watch-frames.json"), "utf8"));
  const listen = JSON.parse(await readFile(join(root, "assets/reactions", styleAssetDirectory(style), "listen-frames.json"), "utf8"));
  let runtime = withListenFrames(withWatchFrames(withPokeFrame(original, patch), watch), listen),searchCount=0;
  try{const search=JSON.parse(await readFile(join(root,"assets/reactions",styleAssetDirectory(style),"search-frames.json"),"utf8"));runtime=withSearchFrames(runtime,search);searchCount=search.frames.length;}
  catch(error){if(error.code!=="ENOENT")throw error;}
  assert.equal(data.frames.length, original.frames.length + 1 + watch.frames.length + listen.frames.length+searchCount); assert.deepEqual(data.motion, runtime.motion); assert.deepEqual(data.ids, runtime.ids);
  for (const { id } of runtime.frames.slice(original.frames.length)) assert.deepEqual([...Buffer.from(data.frames[data.ids[id]].pixels, "base64")], runtime.frames[runtime.ids[id]].pixels);
}
checks.push("Original frames and every authored interaction frame exactly match plugin", "Shared runtime files match plugin with only portable dependency URLs");
const runtimeImports = [...app.matchAll(/import\("(\.\/runtime\/[^\"]+)"\)/g)];
assert.equal(runtimeImports.length, 2);
for (const [, specifier] of runtimeImports) {
  assert.match(specifier, /\.js$/);
  await access(join(out, specifier));
}
checks.push("Portable JavaScript MIME extensions for every browser module import");
assert.ok(app.indexOf("try {") < app.indexOf('import("./runtime/'));
assert.match(app, /catch \(error\)[\s\S]*静态角色预览[\s\S]*button\.disabled = true/);
checks.push("Runtime dependency failures reach explicit static preview fallback");
// Exercise the failure path with unavailable runtime/assets, without a browser
// dependency or actual network. This catches a loading label left stuck forever.
const fallbackNodes = new Map(), fallbackButtons = [{ disabled: false }, { disabled: false }];
const fakeNode = () => ({ textContent: "", setAttribute() {}, replaceChildren() {}, append() {}, addEventListener() {}, getContext() { return {}; } });
const fallbackDocument = {
  hidden: false,
  querySelector(selector) { if (!fallbackNodes.has(selector)) fallbackNodes.set(selector, fakeNode()); return fallbackNodes.get(selector); },
  querySelectorAll(selector) { return selector === "[data-state], [data-style], #pause, #poke" ? fallbackButtons : []; },
  createElement: fakeNode, createTextNode: (text) => text, addEventListener() {},
};
const fallbackApp = app.replaceAll("import.meta.url", '"https://example.invalid/pi-furry-partner/app.js"');
await new vm.Script(`(async()=>{${fallbackApp}\n})()`, { importModuleDynamically: () => Promise.reject(new Error("Runtime unavailable")) }).runInNewContext({
  document: fallbackDocument, matchMedia: () => ({ matches: false, addEventListener() {} }),
  performance: { now: () => 0 }, fetch: () => Promise.reject(new Error("Offline test")),
  URL, console: { error() {} },
});
assert.equal(fallbackNodes.get("#frame-status").textContent, "静态角色预览");
assert.match(fallbackNodes.get("#demo-note").textContent, /动画暂时没有加载成功/);
assert.ok(fallbackButtons.every((button) => button.disabled));
checks.push("Unavailable runtime/assets actually show static fallback and disable inert controls");
for (const [, url] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)(?:#[^"]*)?"/g)) await access(join(out, url));
checks.push("All local HTML asset links exist");
console.log(`${checks.length} site checks passed.\n${checks.map((name) => `✓ ${name}`).join("\n")}`);
