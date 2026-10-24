import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2]);
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const pkg = await read('package.json');
const { loadEncodedSheet, loadAnimatedCatalog, loadAnimatedAsset } = await import(pathToFileURL(join(root, 'lib/index.js')));
for (const style of ['umi', 'umi-pixel', 'wumi', 'wumi-pixel', 'illustration', 'pixel']) {
  const sheet = loadEncodedSheet(style);
  assert.ok(sheet.frames.length > 1 && sheet.width > 0, `Packaged style alias ${style} resolves to real frames`);
}
const { STYLES } = await import(pathToFileURL(join(root, 'lib/styles.mjs')));
assert.deepEqual(STYLES, ['umi']);
assert.equal(pkg.umiDistribution.pixelPolicy, 'legacy-only');
const header = await read('assets/illustration/native-frames.json');
assert.equal(header.frames.length, 15);
assert.equal(header.loopDurationMs, 4800);
let logicalEntries = 0;
if (pkg.umiDistribution.track === 'full-animation') {
  const { normalizeApprovedMotionCatalog, decodeApprovedMotionIndexed, APPROVED_AUXILIARY_IDS, APPROVED_IDLE_VARIANT_IDS } = await import(pathToFileURL(join(root, 'lib/approved-motion.mjs')));
  const { decodeApprovedMotionNodeResource } = await import(pathToFileURL(join(root, 'lib/approved-motion-node.mjs')));
  const catalog = normalizeApprovedMotionCatalog(loadAnimatedCatalog());
  const required = ['idle','think','listen','wait','rest','work','watch','search','joy','grumpy','sad','cry','shy','flustered','surprise','proud','affection','work-enter','work-exit'];
  const ids = Object.keys(catalog.clips).sort();
  for (const id of required) assert.ok(catalog.clips[id], `Required approved clip ${id} remains playable`);
  assert.ok(ids.every(id => required.includes(id) || APPROVED_AUXILIARY_IDS.includes(id) || APPROVED_IDLE_VARIANT_IDS.includes(id)));
  assert.deepEqual(ids, pkg.umiDistribution.approvedMotionClipIds);
  assert.equal(ids.length, pkg.umiDistribution.approvedMotionClipCount);
  for (const clip of Object.values(catalog.clips)) for (const [style, meta] of Object.entries(clip.indexed)) {
    const asset = loadAnimatedAsset(meta.file, catalog.revision);
    assert.ok(asset);
    const raw = decodeApprovedMotionNodeResource(asset.bytes);
    assert.ok(decodeApprovedMotionIndexed(raw, catalog, clip, style), `${clip.id}/${style} is playable from the actual package`);
    logicalEntries++;
  }
}
console.log(JSON.stringify({ passed: true, root, version: pkg.version, profile: pkg.umiDistribution.resourceProfile,
  styleAliases: 6, headerFrames: 15, playableAnimatedEntries: logicalEntries, installed: false }));
