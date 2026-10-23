import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMotionPlayer } from '../lib/motion.mjs';
import { loadEncodedSheet } from '../lib/index.js';

const encoded = loadEncodedSheet('umi');
const sheet = { ...encoded, frames: encoded.frames.map(frame => {
  const bytes = Buffer.from(frame.pixels, 'base64');
  const pixels = encoded.pixelsEncoding === 'u16le'
    ? Uint16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readUInt16LE(i * 2))
    : Uint8Array.from(bytes);
  return { ...frame, pixels };
}) };
const hash = frame => createHash('sha256').update(Buffer.from(frame.pixels.buffer,
  frame.pixels.byteOffset, frame.pixels.byteLength)).digest('hex');
const states = [['idle-open', 'idle'], ['think', 'thinking'], ['work', 'editing'],
  ['listen', 'listening'], ['wait', 'waiting'], ['happy', 'success'], ['error', 'error'], ['rest', 'dozing']];
for (const [face, phase] of states) {
  let clock = 0;
  const player = createMotionPlayer({ now: () => clock, allowWholeFrameMotion: true });
  const seen = new Set();
  for (clock = 0; clock <= 6000; clock += 150) {
    const result = player.frame(sheet, sheet.ids[face], { phase });
    seen.add(hash(result.frame));
    for (const key of ['earLeft', 'earRight', 'pawLeft', 'pawRight', 'wave', 'tail'])
      assert.equal(result.motion[key], 0, `${face}: obsolete region ${key} stays disabled`);
    assert.equal(result.motion.scale, 1, `${face}: ordinary loop cannot breathe by resizing`);
  }
  assert.ok(seen.size > 1, `${face}: original simple motion must produce distinct frames`);
  const paused = player.frame(sheet, sheet.ids[face], { phase, animate: false });
  clock += 10000;
  const held = player.frame(sheet, sheet.ids[face], { phase, animate: false });
  assert.equal(hash(held.frame), hash(paused.frame), `${face}: pause freezes actual pixels`);
  player.dispose();
}

// Blink is a source-frame change, not a new body movement or scale animation.
{
  let clock = 0;
  const player = createMotionPlayer({ now: () => clock, allowWholeFrameMotion: true });
  player.frame(sheet, sheet.ids['idle-open'], { phase: 'idle' });
  clock = 2200;
  const open = player.frame(sheet, sheet.ids['idle-open'], { phase: 'idle' });
  const blink = player.frame(sheet, sheet.ids['idle-blink'], { phase: 'idle', blink: true });
  assert.deepEqual(blink.motion, open.motion, 'Blink does not restart or resize body motion');
  assert.equal(open.motion.scale, 1);
  player.dispose();
}

for (const [face, phase] of [['watch', 'running'], ['search', 'searching']]) {
  let clock = 0;
  const player = createMotionPlayer({ now: () => clock, allowWholeFrameMotion: true });
  for (clock = 0; clock <= 7000; clock += 150) {
    const result = player.frame(sheet, sheet.ids[face], { phase });
    const id = result.motion[`${face}FrameId`];
    assert.ok(id, `${face}: uses real baked sequence`);
    assert.equal(hash(result.frame), hash(sheet.frames[sheet.ids[id]]), `${face}: no second motion over video`);
    for (const key of ['x', 'y', 'tilt']) assert.equal(result.motion[key], 0);
  }
  player.dispose();
}

// Default stays conservative for the full-animation fallback and other callers.
{
  let clock = 0;
  const player = createMotionPlayer({ now: () => clock });
  const seen = new Set();
  for (clock = 0; clock < 6000; clock += 300)
    seen.add(hash(player.frame(sheet, sheet.ids['idle-open'], { phase: 'idle' }).frame));
  assert.equal(seen.size, 1);
  player.dispose();
}
// The approved poke drawing must not regain the old squash/scale deformation.
{
  let clock = 0;
  const player = createMotionPlayer({ now: () => clock, allowWholeFrameMotion: true });
  const seen = new Set();
  for (clock = 0; clock <= 900; clock += 100) {
    const result = player.frame(sheet, sheet.ids.poke, { phase: 'poked', reactionElapsedMs: clock });
    seen.add(hash(result.frame));
    assert.equal(result.motion.scale, 1);
  }
  assert.equal(seen.size, 1);
  player.dispose();
}
console.log('Ordinary simple motion: 8 states move; obsolete masks off; pause/blink stable; watch/search unmodified; full fallback remains static.');
