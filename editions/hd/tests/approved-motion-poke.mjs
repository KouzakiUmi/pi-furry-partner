import assert from 'node:assert/strict';
import { createMotionPlayer } from '../lib/motion.mjs';
import { approvedMotionPokeFrame, approvedMotionStaticFrame } from '../lib/hd/player.mjs';
const width = 80, height = 80, pixels = new Array(width * height).fill(0);
for (let row = 20; row < 60; row++) for (let col = 20; col < 60; col++) pixels[row * width + col] = row % 2 ? 1 : 2;
const sheet = { width, height, palette: [[0, 0, 0], [70, 90, 120], [220, 230, 240]], transparentIndex: 0,
  ids: { poke: 0, 'idle-open': 1 }, frames: [{ id: 'poke', pixels }, { id: 'idle-open', pixels }], motion: { approvedWholeFrames: true, ears: false, paws: false } };
const original = pixels.slice();
let clock = 0;
const player = createMotionPlayer({ now: () => clock });
const sample = time => {
  clock = time;
  const ordinary = player.frame(sheet, 0, { animate: true, phase: 'poked', reactionElapsedMs: time });
  return approvedMotionPokeFrame(ordinary, time);
};
const first = sample(0), feedback = sample(100), settled = sample(1050);
assert.notDeepEqual(feedback.frame.pixels, first.frame.pixels, 'An explicit paused poke changes actual displayed pixels');
assert.notEqual(feedback.frame.cacheKey, first.frame.cacheKey);
assert.deepEqual(settled.frame.pixels, first.frame.pixels, 'The finite interaction returns exactly to its approved source');
for (let time = 0; time <= 1100; time += 50) {
  const frame = sample(time);
  assert.equal(frame.motion.scale, 1); assert.equal(frame.motion.y, 0);
  assert.ok(Math.abs(frame.motion.x) <= 2);
  for (const color of [0, 1, 2]) assert.equal(frame.frame.pixels.filter(p => p === color).length, pixels.filter(p => p === color).length,
    'Translation preserves every original silhouette/color pixel without edge clipping');
  assert.equal(frame.sheet.palette, sheet.palette);
  assert.equal(frame.sheet.frames[frame.frameIndex], frame.frame);
}
assert.deepEqual(pixels, original, 'No source mutation');
const staticFrame = approvedMotionStaticFrame(sheet, 1, { phase: 'idle' });
assert.equal(staticFrame.frame.id, 'idle-open'); assert.deepEqual(staticFrame.frame.pixels, pixels);
const legacy = { ...first, sheet: { ...first.sheet, motion: {} } };
const poseFeedback = approvedMotionPokeFrame(legacy, 100);
// The HD pose stage is one static cel without approved-motion metadata. It
// receives the same rigid feedback so a poke never stalls on an inert image.
assert.notDeepEqual(poseFeedback.frame.pixels, legacy.frame.pixels, 'The HD pose stage moves instead of staying inert');
assert.equal(poseFeedback.sheet.width, width); assert.equal(poseFeedback.motion.y, 0); assert.equal(poseFeedback.motion.scale, 1);
for (const color of [0, 1, 2]) assert.equal(poseFeedback.frame.pixels.filter(p => p === color).length, legacy.frame.pixels.filter(p => p === color).length);
assert.deepEqual(pixels, original, 'Pose feedback leaves the source array untouched');
player.dispose();
console.log('Approved paused poke: actual complete-frame feedback, bounded rigid translation, every color/alpha pixel preserved, no source mutation, finite return and HD pose-cel feedback passed.');
