// Shipping policy: main is full-animation; legacy maintains the original 2.4 artwork.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BUILD_EDITION, FULL_ANIMATION_EDITION, approvedMotionStyle } from '../lib/build-profile.mjs';
import { STYLES, normalizeStyle, styleAssetDirectory } from '../lib/styles.mjs';
import { loadEncodedSheet, loadAnimatedCatalog } from '../lib/index.js';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const configuration = await read('build/editions.json');
const packageMetadata = await read('package.json');
assert.equal(configuration.defaultEdition, 'full-animation');
assert.deepEqual(Object.keys(configuration.editions), ['full-animation']);
assert.equal(BUILD_EDITION, configuration.defaultEdition);
assert.equal(FULL_ANIMATION_EDITION, true);
assert.equal(packageMetadata.version, configuration.editions[BUILD_EDITION].version);
assert.equal(configuration.pixelPolicy, 'legacy-only');
assert.deepEqual(configuration.publicStyles, ['umi']);
assert.deepEqual(STYLES, ['umi']);
// Direct npm packaging must obey the same public-art policy as edition staging.
assert.ok(packageMetadata.files.includes('assets/reactions/umi/*.json'));
assert.ok(!packageMetadata.files.includes('assets/reactions/*/*.json'));
assert.ok(!packageMetadata.files.includes('assets/*.json'));
assert.ok(!packageMetadata.files.some(path => /^assets\/(?:reactions\/(?:pixel|umi-pixel)\/|(?:native|terminal)-frames\.json)/.test(path)));

for (const alias of ['umi-pixel','pixel','wumi-pixel','wumi','illustration']) {
  assert.equal(normalizeStyle(alias),'umi');
  assert.equal(styleAssetDirectory(alias),'umi');
  assert.equal(loadEncodedSheet(alias),loadEncodedSheet('umi'),'Old settings migrate without a pixel asset bank');
  assert.equal(loadEncodedSheet(alias).width,240);
}
assert.equal(styleAssetDirectory('illustration'),'umi');
if (FULL_ANIMATION_EDITION) {
  const catalog=loadAnimatedCatalog();
  assert.equal(Object.keys(catalog.clips).length,29);
  for (const clip of Object.values(catalog.clips)) assert.deepEqual(Object.keys(clip.indexed).sort(),['illustration','umi']);
} else assert.throws(()=>loadAnimatedCatalog(),/edition/i);
console.log(`Single-repository ${BUILD_EDITION}: build gate, one public illustration style, historical input migration without pixel assets and whole-motion policy passed.`);
