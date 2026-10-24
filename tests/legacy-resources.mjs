import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This manifest was generated from v2.4.0 Git blobs, not the working tree.
// It also verifies extracted release archives without requiring Git.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(new URL("./fixtures/legacy-resources-v2.4.0.json", import.meta.url), "utf8"));
assert.equal(baseline.baselineTag, "v2.4.0");
assert.equal(baseline.baselineCommit, "74cac9651eaf70af80eadc596e205fbcd68d75eb");
const expected = baseline.files.map(({ path }) => path).sort();
const actual = [];
const ignored = new Set([".git", "node_modules", "work", "dist"]);
const mediaExtensions = new Set(baseline.mediaExtensions);
async function inspect(directory = "") {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (directory || !ignored.has(entry.name)) await inspect(path);
    } else if (path.startsWith("assets/") || path.startsWith("prompts/") || mediaExtensions.has(extname(path).toLowerCase())) {
      actual.push(path);
    }
  }
}
await inspect();
assert.deepEqual(actual.sort(), expected, "Legacy resources must match the v2.4.0 file inventory");
for (const file of baseline.files) {
  const bytes = await readFile(join(root, file.path));
  assert.equal(bytes.length, file.bytes, `${file.path}: original byte length`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `${file.path}: original SHA-256`);
}
console.log(JSON.stringify({ passed: true, baselineTag: baseline.baselineTag,
  baselineCommit: baseline.baselineCommit, resourceFiles: expected.length, modelRequests: 0 }, null, 2));
