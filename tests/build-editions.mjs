// Shipping policy: one source tree, build-time edition, one real legacy pixel bank.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BUILD_EDITION, FULL_ANIMATION_EDITION, approvedMotionStyle } from '../lib/build-profile.mjs';
import { STYLES, normalizeStyle, styleAssetDirectory } from '../lib/styles.mjs';
import { loadEncodedSheet, loadAnimatedCatalog } from '../lib/index.js';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const provenance = await read('build/legacy-pixel-provenance.json');
assert.ok(['hd-remaster','full-animation'].includes(BUILD_EDITION));
assert.deepEqual(STYLES,['umi','umi-pixel']);
for (const alias of ['umi-pixel','pixel','wumi-pixel']) {
  assert.equal(normalizeStyle(alias),'umi-pixel');
  assert.equal(styleAssetDirectory(alias),'pixel');
  const sheet=loadEncodedSheet(alias);
  assert.equal(sheet.width,100);
  assert.ok(sheet.frames.length>=16 && sheet.frames.length<30);
  assert.equal(sheet.motion?.approvedWholeFrames,undefined);
  assert.deepEqual(sheet.gestureCatalog.clips,{});
  assert.equal(approvedMotionStyle(alias),false);
}
assert.equal(styleAssetDirectory('illustration'),'umi');
for (const row of provenance.files) {
  const bytes=await readFile(new URL(row.path,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,`Original pixel source ${row.path} stays byte exact`);
}
const files=await readdir(new URL('assets/reactions/pixel/',root));
assert.ok(files.every(name=>!name.startsWith('gesture-')&&!['watch-frames.json','search-frames.json','expression-frames.json'].includes(name)));
if (FULL_ANIMATION_EDITION) {
  const catalog=loadAnimatedCatalog();
  assert.equal(Object.keys(catalog.clips).length,19);
  for (const clip of Object.values(catalog.clips)) assert.deepEqual(Object.keys(clip.indexed).sort(),['illustration','umi']);
} else assert.throws(()=>loadAnimatedCatalog(),/edition/i);
console.log(`Single-repository ${BUILD_EDITION}: build gate, two public styles, all legacy aliases, exact original pixel bytes and illustration-only whole-motion policy passed.`);
