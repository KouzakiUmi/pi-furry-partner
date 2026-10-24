#!/usr/bin/env node
// Build a portable GitHub Pages directory without third-party dependencies.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { styleAssetDirectory } from "../lib/styles.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { withSearchFrames } from "../lib/search.mjs";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";
import { withPokeFrame } from "../lib/poke.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseTag = `v${pkg.version}`;
const out = join(root, "dist");
await mkdir(join(out, "assets"), { recursive: true });
await mkdir(join(out, "runtime"), { recursive: true });
const html = (await readFile(join(root, "site/index.html"), "utf8"))
  .replace(/(pi install git:github\.com\/KouzakiUmi\/pi-furry-partner@)(?:legacy-)?v[0-9A-Za-z.+-]+/g, `$1${releaseTag}`)
  .replace(/(\/releases\/tag\/)(?:legacy-)?v[0-9A-Za-z.+-]+/g, `$1${releaseTag}`)
  .replace(/下载 v[0-9A-Za-z.+-]+/g, `下载 Pi ${pkg.version}`)
  .replace(/(<span class="version">)[^<]+(<\/span>)/, `$1Pi ${pkg.version}$2`);
await writeFile(join(out, "index.html"), html);
for (const file of ["styles.css", "app.js"]) await copyFile(join(root, "site", file), join(out, file));
for (const file of await readdir(join(root, "site/assets"))) await copyFile(join(root, "site/assets", file), join(out, "assets", file));
// .js is served as JavaScript even by Windows static servers that map .mjs to
// text/plain. Preserve the exact ESM content while using portable public URLs.
for (const file of ["activity", "actions", "motion", "poke", "listen"]) {
  const source = await readFile(join(root, "lib", `${file}.mjs`), "utf8");
  await writeFile(join(out, "runtime", `${file}.js`), source.replace(/\.mjs(["'])/g, '.js$1'));
}
for (const file of ["status-phrases.json", "status-copy.json"]) await copyFile(join(root, "assets", file), join(out, "assets", file));
await copyFile(join(root, "assets/poses/think.png"), join(out, "assets/umi-think.png"));
const sheets = {};
for (const style of ["umi", "umi-pixel"]) {
  const directory = join(root, "assets/reactions", styleAssetDirectory(style));
  const base = JSON.parse(await readFile(join(directory, "reaction-sheet.json"), "utf8"));
  assert.equal(base.frames.length, 21);
  const poked = withPokeFrame(base, JSON.parse(await readFile(join(directory, "poke-patch.json"), "utf8")));
  const watch = JSON.parse(await readFile(join(directory, "watch-frames.json"), "utf8"));
  const listen = JSON.parse(await readFile(join(directory, "listen-frames.json"), "utf8"));
  const watched = withWatchFrames(poked, watch);
  let data = withListenFrames(watched, listen),searchCount=0;
  try{const search=JSON.parse(await readFile(join(directory,"search-frames.json"),"utf8"));data=withSearchFrames(data,search);searchCount=search.frames.length;}
  catch(error){if(error.code!=="ENOENT")throw error;}
  assert.equal(data.frames.length, base.frames.length + 1 + watch.frames.length + listen.frames.length+searchCount);
  sheets[style] = { width: data.width, height: data.height, palette: data.palette, ids: data.ids,
    transparentIndex: data.transparentIndex, motion: data.motion,
    frames: data.frames.map(({ id, pixels }) => {
      assert.equal(pixels.length, data.width * data.height);
      assert.ok(pixels.every((value) => value < 256 && value < data.palette.length && value >= 0));
      return { id, pixels: Buffer.from(pixels).toString("base64") };
    }),
  };
}
await writeFile(join(out, "assets/animation-sheets.json"), JSON.stringify(sheets));
await writeFile(join(out, ".nojekyll"), "");
const hashes = {};
for (const file of ["index.html", "styles.css", "app.js", "runtime/activity.js", "runtime/actions.js", "runtime/motion.js", "runtime/poke.js", "runtime/listen.js", "assets/animation-sheets.json"]) hashes[file] = createHash("sha256").update(await readFile(join(out, file))).digest("hex");
const manifest = { product: "pi-furry-partner", version: pkg.version, characterName: "Umi", basePathCompatible: true, buildDependencies: [], characterLicense: "ARR", copyright: "呜咪角色及动画素材保留全部版权。", sheets: Object.fromEntries(Object.entries(sheets).map(([key, value]) => [key, { width: value.width, height: value.height, frames: value.frames.length }])), hashes };
await writeFile(join(out, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${out} (${Object.keys(sheets).length} character styles, ${Object.values(sheets).reduce((sum, sheet) => sum + sheet.frames.length, 0)} total runtime frames).`);
