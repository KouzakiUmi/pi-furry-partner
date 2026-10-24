// Read actual Pi resources without a DSH Host or browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadAnimatedCatalog, loadAnimatedAsset } from '../lib/pi-resources.mjs';
import { normalizeApprovedMotionCatalog, decodeApprovedMotionIndexed } from '../lib/approved-motion.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';
const catalog = loadAnimatedCatalog(), normalized = normalizeApprovedMotionCatalog(catalog);
assert.equal(Object.keys(normalized.clips).length, 29);
assert.deepEqual(normalized.anchor, [320,608]);
assert.equal(normalized.chain.enterDurationMs,400); assert.equal(normalized.chain.exitDurationMs,400);
let logicalEntries=0;
for(const clip of Object.values(normalized.clips)) {
 assert.equal(clip.qa.accepted,true);
 for(const [style,metadata] of Object.entries(clip.indexed)) {
  const asset=loadAnimatedAsset(metadata.file,catalog.revision); assert.ok(asset);
  if(metadata.sha256) assert.equal(createHash('sha256').update(asset.bytes).digest('hex'),metadata.sha256);
  const decoded=decodeApprovedMotionIndexed(decodeApprovedMotionNodeResource(asset.bytes),normalized,clip,style);
  assert.ok(decoded,`${clip.id}/${style} decodes`); assert.equal(decoded.frames.length,metadata.frameCount); logicalEntries++;
 }
}
assert.equal(logicalEntries,58);
assert.equal(loadAnimatedAsset('../package.json',catalog.revision),null);
assert.equal(loadAnimatedAsset('indexed/umi/idle.uix.gz','wrong-revision'),null);
console.log('Actual Pi animated pack: 29 approved clips / 58 indexed entries, original hashes, decoding, timing/viewport metadata and path/revision gates passed.');
