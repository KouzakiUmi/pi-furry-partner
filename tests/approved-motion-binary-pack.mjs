// Portable artifact audit: repository provenance binds the original exact payload.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';
import { decodeApprovedMotionIndexed, normalizeApprovedMotionCatalog } from '../lib/approved-motion.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supplied = process.argv.indexOf('--catalog');
const catalogPath = supplied >= 0 ? resolve(process.argv[supplied + 1]) : resolve(root, 'assets/animated/catalog.json');
const read = path => readFileSync(path);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(read(catalogPath));
const normalized = normalizeApprovedMotionCatalog(catalog);
assert.equal(Object.keys(normalized.clips).length, 29);
assert.deepEqual(catalog.anchor, [320, 608]);
assert.deepEqual(catalog.logicalCanvas, { width: 640, height: 640 });
assert.equal(catalog.chain.enterDurationMs, 400);
assert.equal(catalog.chain.exitDurationMs, 400);
const provenanceBytes = read(resolve(root, 'assets/animated', catalog.indexedBinaryProvenance.file));
assert.equal(sha(provenanceBytes), catalog.indexedBinaryProvenance.sha256);
const provenance = JSON.parse(provenanceBytes), files = new Map();
assert.equal(catalog.revision, provenance.revision, 'Distribution filtering cannot change the binary resource revision');
assert.equal(provenance.paletteIndicesClockExact, true);
assert.equal(provenance.HDReencoded, false);
let logicalEntries = 0, indices = 0;
for (const [id, clip] of Object.entries(catalog.clips)) {
  assert.deepEqual(Object.keys(clip.indexed).sort(), ['illustration', 'umi'], `${id}: illustration-only complete motion`);
  assert.equal(clip.indexed.illustration.file, clip.indexed.umi.file);
  for (const [style, entry] of Object.entries(clip.indexed)) {
    if (!files.has(entry.file)) files.set(entry.file, []);
    files.get(entry.file).push({ clip, style, entry }); logicalEntries++;
  }
}
assert.equal(files.size, 29); assert.equal(logicalEntries, 58);
for (const [file, refs] of files) {
  const record = provenance.files.find(r => r.file === file);
  assert.ok(record, file);
  assert.equal(record.fullIndicesEqual, true);
  assert.equal(record.paletteClockMetadataEqualExceptRevision, true);
  const packed = read(resolve(root, 'assets/animated', file));
  assert.equal(sha(packed), record.sha256, `${file}: container hash binds palette and all metadata`);
  const raw = decodeApprovedMotionNodeResource(packed);
  assert.equal(raw.revision, provenance.revision);
  assert.equal(raw.frames.length, record.frameCount);
  assert.equal(raw.transparentIndex, 0);
  assert.ok(raw.palette.length >= 2 && raw.palette.length <= 512);
  assert.ok(raw.palette.every(c => c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255)));
  const payloadHash = createHash('sha256');
  for (const frame of raw.frames) {
    const pixels = frame.pixels;
    assert.equal(pixels.length, raw.width * raw.height);
    if (pixels.BYTES_PER_ELEMENT === 1) payloadHash.update(pixels);
    else {
      const le = Buffer.alloc(pixels.length * 2);
      for (let j = 0; j < pixels.length; j++) le.writeUInt16LE(pixels[j], j * 2);
      payloadHash.update(le);
    }
    indices += pixels.length;
  }
  assert.equal(payloadHash.digest('hex'), record.payloadSha256, `${file}: original exact decoded index payload`);
  for (const { clip, style, entry } of refs) {
    assert.equal(entry.sha256, record.sha256);
    assert.equal(entry.sourceJsonSha256, record.sourceJsonSha256);
    assert.ok(decodeApprovedMotionIndexed(raw, catalog, clip, style), `${file}: palette/QA/clock accepted through ${style}`);
  }
}
console.log(JSON.stringify({ passed: true, physicalFiles: files.size, logicalEntries, verifiedIndices: indices,
  packedPaletteMetadataHashExact: true, decodedPayloadHashExact: true, workBackupRequired: false }));
