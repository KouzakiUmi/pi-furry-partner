#!/usr/bin/env node
// Build a portable GitHub Pages directory without third-party dependencies.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadEncodedSheet } from "../lib/pi-resources.mjs";
import { STYLES } from "../lib/styles.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const out = join(root, "dist");
await mkdir(join(out, "assets"), { recursive: true });
await mkdir(join(out, "runtime"), { recursive: true });
const html = (await readFile(join(root, "site/index.html"), "utf8"))
  .replace(/(<span class="version">)v[^<]+(<\/span>)/, `$1v${pkg.version}$2`);
await writeFile(join(out, "index.html"), html);
for (const file of ["styles.css", "app.js"]) await copyFile(join(root, "site", file), join(out, file));
for (const file of await readdir(join(root, "site/assets"))) await copyFile(join(root, "site/assets", file), join(out, "assets", file));
// .js is served as JavaScript even by Windows static servers that map .mjs to
// text/plain. Preserve the exact ESM content while using portable public URLs.
const runtimeFiles = ["activity", "motion", "poke", "listen", "gestures", "expressions"];
for (const file of runtimeFiles) {
  const source = await readFile(join(root, "lib", file === "activity" ? "hd/activity.mjs" : `${file}.mjs`), "utf8");
  const portable = file === "activity" ? source.replace(/from (["'])\.\.\//g, 'from $1./') : source;
  await writeFile(join(out, "runtime", `${file}.js`), portable.replace(/\.mjs(["'])/g, '.js$1'));
}
for (const file of ["status-phrases.json", "status-copy.json"]) await copyFile(join(root, "assets", file), join(out, "assets", file));
await copyFile(join(root, "assets/poses/think.png"), join(out, "assets/umi-think.png"));
const sheets = {};
for (const style of STYLES) {
  const data = loadEncodedSheet(style);
  // The current browser preview consumes exact byte indices. Reject unsupported
  // encodings explicitly instead of truncating a future wider palette.
  assert.equal(data.pixelsEncoding, 'u8');
  for (const frame of data.frames) assert.equal(Buffer.from(frame.pixels, 'base64').length, data.width * data.height);
  sheets[style] = data;
}
await writeFile(join(out, "assets/animation-sheets.json"), JSON.stringify(sheets));
await writeFile(join(out, ".nojekyll"), "");
const hashes = {};
for (const file of ["index.html", "styles.css", "app.js", ...runtimeFiles.map(file => `runtime/${file}.js`), "assets/animation-sheets.json"]) hashes[file] = createHash("sha256").update(await readFile(join(out, file))).digest("hex");
const manifest = { product: "pi-furry-partner", version: pkg.version, characterName: "Umi", basePathCompatible: true, buildDependencies: [], characterLicense: "ARR", copyright: "呜咪角色及动画素材保留全部版权。", sheets: Object.fromEntries(Object.entries(sheets).map(([key, value]) => [key, { width: value.width, height: value.height, frames: value.frames.length }])), hashes };
await writeFile(join(out, "build-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${out} (${Object.keys(sheets).length} character styles, ${Object.values(sheets).reduce((sum, sheet) => sum + sheet.frames.length, 0)} total runtime frames).`);
