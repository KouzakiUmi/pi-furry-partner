import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { APPROVED_INDEXED_MAX_BYTES, decodeApprovedMotionBinary, decodeApprovedMotionResource } from '../lib/approved-motion-codec.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';
import { decodeApprovedMotionIndexed, createApprovedMotionPlayer } from '../lib/approved-motion.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

const { catalog, data } = approvedMotionFixture();
const source = data['indexed/umi/idle.json'];
function encode(raw, encoding = raw.palette.length > 256 ? 'u16le' : 'u8') {
  const metadata = { ...raw, frames: raw.frames.map(({ pixels, ...frame }) => frame) };
  let head = Buffer.from(JSON.stringify({ encoding, data: metadata }));
  if (head.length % 2) head = Buffer.concat([head, Buffer.from(' ')]);
  const n = raw.frames.reduce((sum, f) => sum + f.pixels.length, 0), size = encoding === 'u16le' ? 2 : 1;
  const out = Buffer.alloc(16 + head.length + n * size);
  out.write('UMIIDX01'); out.writeUInt32LE(head.length, 8); out.writeUInt32LE(n * size, 12); head.copy(out, 16);
  let at = 16 + head.length;
  for (const f of raw.frames) for (const value of f.pixels) {
    if (size === 1) out[at++] = value; else { out.writeUInt16LE(value, at); at += 2; }
  }
  return out;
}
const bytes = encode(source), gz = gzipSync(bytes);
const decoded = decodeApprovedMotionBinary(bytes);
assert.ok(decoded);
assert.deepEqual(decoded.palette, source.palette);
assert.deepEqual(decoded.frames.map(f => [...f.pixels]), source.frames.map(f => f.pixels));
assert.deepEqual(decodeApprovedMotionNodeResource(Buffer.from(JSON.stringify(source))), source, 'Old JSON remains accepted');
assert.deepEqual((await decodeApprovedMotionResource(gz)).frames.map(f => [...f.pixels]), source.frames.map(f => f.pixels));
assert.deepEqual((await decodeApprovedMotionResource(bytes)).palette, source.palette, 'Already-decompressed HTTP bytes do not gunzip twice');
assert.ok(decodeApprovedMotionIndexed(bytes, catalog, catalog.clips.idle, 'umi'));
assert.ok(decodeApprovedMotionIndexed(decodeApprovedMotionNodeResource(gz), catalog, catalog.clips.idle, 'umi'));
const wrapped = Buffer.concat([Buffer.from([7]), bytes, Buffer.from([8, 9])]);
assert.ok(decodeApprovedMotionBinary(wrapped.subarray(1, 1 + bytes.length)), 'Exact byteOffset/byteLength of pooled views');

const wide = structuredClone(source);
wide.palette = Array.from({ length: 320 }, (_, i) => [i % 256, 12, 34]);
wide.frames[0].pixels[1] = 300;
wide.palette[0] = [91, 7, 19];
const word = decodeApprovedMotionBinary(encode(wide));
assert.ok(word.frames[0].pixels instanceof Uint16Array);
assert.equal(word.frames[0].pixels[1], 300, 'LE payload does not truncate indices above 255');
assert.deepEqual(word.palette[0], [91, 7, 19], 'Transparent RGB is preserved; transparent index remains zero');
const odd = Buffer.concat([Buffer.from([0]), encode(wide)]);
assert.equal(decodeApprovedMotionBinary(odd.subarray(1)).frames[0].pixels[1], 300, 'Unaligned u16 payload/view supported');

for (const bad of [Buffer.alloc(0), bytes.subarray(0, 15), bytes.subarray(0, bytes.length - 1),
  Buffer.concat([bytes, Buffer.from([0])])]) assert.equal(decodeApprovedMotionBinary(bad), null);
for (const mutate of [b => b[0] = 0, b => b.writeUInt32LE(0xffffffff, 8), b => b.writeUInt32LE(1, 12),
  b => b.fill(0xff, 16, 20)]) { const bad = Buffer.from(bytes); mutate(bad); assert.equal(decodeApprovedMotionBinary(bad), null); }
for (const mutate of [r => r.width = 0, r => r.height = 641, r => r.width = 1.5,
  r => r.transparentIndex = 1, r => r.transparentIndex = -1, r => r.transparentIndex = null,
  r => r.palette[0][0] = 256, r => r.palette[1] = [1, 2],
  r => r.frames[1].atMs = 0, r => r.frames[0].atMs = 1,
  r => r.frames[1].id = r.frames[0].id, r => r.frames[0].pixels[1] = 250]) {
  const bad = structuredClone(source); mutate(bad); assert.equal(decodeApprovedMotionBinary(encode(bad)), null);
}
const badWord = structuredClone(wide); badWord.frames[0].pixels[0] = 65535;
assert.equal(decodeApprovedMotionBinary(encode(badWord)), null);
assert.equal(decodeApprovedMotionBinary(encode(source, 'u16le')), null, 'Encoding must match exact palette range');
const stale = structuredClone(source); stale.revision = 'stale';
assert.equal(decodeApprovedMotionIndexed(encode(stale), catalog, catalog.clips.idle, 'umi'), null);
const unapproved = structuredClone(source); unapproved.qa.sourceVideoSha256 = 'd'.repeat(64);
assert.equal(decodeApprovedMotionIndexed(encode(unapproved), catalog, catalog.clips.idle, 'umi'), null);
await assert.rejects(decodeApprovedMotionResource(gz.subarray(0, gz.length - 4)), 'Truncated gzip rejected');
const badCrc = Buffer.from(gz); badCrc[badCrc.length - 8] ^= 1;
await assert.rejects(decodeApprovedMotionResource(badCrc));
assert.throws(() => decodeApprovedMotionNodeResource(badCrc));
const bomb = gzipSync(Buffer.alloc(APPROVED_INDEXED_MAX_BYTES + 1));
await assert.rejects(decodeApprovedMotionResource(bomb), /limit/);
assert.throws(() => decodeApprovedMotionNodeResource(bomb));
const abort = new AbortController(); abort.abort();
await assert.rejects(decodeApprovedMotionResource(gz, { signal: abort.signal }), { name: 'AbortError' });

let notifyReady;
const binaryPlayer = createApprovedMotionPlayer({ catalog,
  loadIndexed: async path => decodeApprovedMotionResource(gzipSync(encode(data[path]))),
  onReady: () => notifyReady?.() });
try {
  for (const phase of ['idle', 'thinking', 'waiting', 'running']) {
    const selection = binaryPlayer.sample({ phase });
    let timeout;
    try {
      // Stream decompression may outlive many event-loop turns on a busy host.
      // Wait for the production readiness notification, not a fixed spin count.
      await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(
          `${phase}: indexed resource did not become ready: ${JSON.stringify(binaryPlayer.stats())}`)), 5000);
        notifyReady = resolve;
        assert.equal(binaryPlayer.indexedFrame(selection), null, 'Cold resource uses the loading fallback');
      });
    } finally {
      clearTimeout(timeout);
      notifyReady = undefined;
    }
    assert.ok(binaryPlayer.indexedFrame(selection)); assert.ok(binaryPlayer.stats().clips <= 2);
  }
} finally {
  binaryPlayer.dispose();
}
console.log('Exact indexed codec: u8/u16le, offsets, malformed bounds/UTF8/indices/transparency/clocks, gzip CRC/bomb/abort, legacy JSON and two-clip playback passed.');
