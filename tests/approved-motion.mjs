import assert from 'node:assert/strict';
import { createApprovedMotionPlayer, normalizeApprovedMotionCatalog, decodeApprovedMotionIndexed, approvedMotionPath } from '../lib/approved-motion.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const { catalog, data } = approvedMotionFixture();
let clock = 0;
const player = createApprovedMotionPlayer({ catalog, now: () => clock, loadIndexed: path => data[path] });
const sample = (phase, extra = {}, opts = {}) => player.sample({ phase, ...extra }, opts);
assert.equal(Object.keys(player.catalog().clips).length, 19);
assert.equal(normalizeApprovedMotionCatalog({ ...catalog, logicalCanvas: { width: 639, height: 640 } }), null);
for (const path of ['../x', '/x', 'x\\y', 'x/../y', 'https://x', 'x?y', 'x%2fy']) assert.equal(approvedMotionPath(path), false);
const unsafe = structuredClone(catalog); unsafe.clips.idle.hires.baseUrl = undefined;
assert.equal(normalizeApprovedMotionCatalog(unsafe).clips.idle, undefined);
const wrong = structuredClone(data['indexed/umi/idle.json']); wrong.qa.sourceVideoSha256 = 'f'.repeat(64);
assert.equal(decodeApprovedMotionIndexed(wrong, catalog, catalog.clips.idle, 'umi'), null);
const corrupt = structuredClone(data['indexed/umi/idle.json']); corrupt.frames[1].pixels[1] = 999;
assert.equal(decodeApprovedMotionIndexed(corrupt, catalog, catalog.clips.idle, 'umi'), null);
const wide = structuredClone(data['indexed/umi/idle.json']);
wide.palette = Array.from({ length: 320 }, (_, i) => [i % 256, 40, 60]); wide.frames[0].pixels[1] = 300;
const wideDecoded = decodeApprovedMotionIndexed(wide, catalog, catalog.clips.idle, 'umi');
assert.ok(wideDecoded.frames[0].pixels instanceof Uint16Array);
assert.equal(wideDecoded.frames[0].pixels[1], 300, 'Independent indexed palettes retain indices above one byte');
for (const [phase, id] of [['idle', 'idle'], ['thinking', 'think'], ['listening', 'listen'], ['waiting', 'wait'], ['dozing', 'rest'], ['cancelled', 'rest'], ['running', 'watch'], ['searching', 'search'], ['compacting', 'search']]) {
  player.reset(); clock = 0;
  const snap = { phase, face: phase === 'waiting' ? 'wait' : 'idle-open' };
  assert.equal(player.sample(snap).clipId, id);
  for (clock = 125; clock <= 3125; clock += 250) {
    const selected = player.sample({ ...snap, blink: Boolean(clock % 2) });
    assert.equal(selected.clipId, id);
    assert.equal(selected.elapsedMs, clock % 1000, 'Blink does not restart a filmed loop');
    const frame = player.indexedFrame(selected);
    assert.deepEqual(frame.motion, { x: 0, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, tail: 0, wave: 0 });
    assert.equal(frame.transitioning, false);
    assert.equal(frame.sheet.frames[frame.frameIndex], frame.frame);
  }
}
player.reset(); clock = 0;
const workSnapshot = { phase: 'reading', tool: 'read', blink: false };
assert.equal(player.sample(workSnapshot).clipId, 'work-enter');
clock = 399; assert.equal(sample('editing', { blink: true }).clipId, 'work-enter');
assert.equal(player.indexedFrame(sample('editing')).frame.atMs, 350, 'Pi uses the approved 20fps transition samples');
clock = 400; assert.equal(sample('editing').clipId, 'work');
clock = 650; assert.equal(sample('reading').elapsedMs, 250, 'Reading/editing share a keyboard epoch');
const truthfulIdle = { phase: 'idle', visualPhase: 'editing', face: 'idle-open', busy: false };
clock = 750; assert.equal(player.sample(truthfulIdle).clipId, 'work-exit');
assert.deepEqual(truthfulIdle, { phase: 'idle', visualPhase: 'editing', face: 'idle-open', busy: false }, 'A visual exit cannot mutate activity facts');
clock = 1149; assert.equal(player.sample(truthfulIdle).clipId, 'work-exit');
clock = 1150; assert.equal(player.sample(truthfulIdle).clipId, 'idle');
clock = 1200; assert.equal(sample('reading').clipId, 'work-enter');
clock = 1250; assert.equal(sample('idle').clipId, 'work-exit', 'Short work retains a bounded exit');
clock = 1260; assert.equal(sample('reading').clipId, 'work', 'Reentry during exit reuses the visible keyboard');
for (const interrupt of ['speaking', 'error', 'poked', 'listening']) {
  const result = sample(interrupt);
  assert.equal(result?.clipId ?? null, interrupt === 'listening' ? 'listen' : null);
  assert.equal(player.stats().keyboardStage, null);
  assert.equal(sample('reading').clipId, 'work-enter', 'A hard interruption clears the previous chain');
}
assert.equal(sample('idle', {}, { animate: false }), null);
assert.equal(player.stats().keyboardStage, null);
assert.equal(sample('idle', {}, { enabled: false }), null);
assert.equal(sample('idle', { gesture: { id: 'wave', elapsedMs: 100 } }), null, 'Unapproved ordinary gestures keep the normal player');
for (const id of ['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']) {
  const selection = sample('idle', { gesture: { id, elapsedMs: 550 } });
  assert.equal(selection.clipId, id); assert.equal(selection.elapsedMs, 550);
  assert.equal(player.indexedFrame(selection).frame.atMs, 500);
}
assert.equal(sample('success', { face: 'happy', phaseElapsedMs: 50 }).clipId, 'joy');
assert.equal(sample('idle', { reaction: 'startled', face: 'concern', reactionElapsedMs: 400 }).clipId, 'surprise');
assert.equal(sample('waiting', { face: 'concern', expressionElapsedMs: 100 }).clipId, 'flustered');
const priorReplay = sample('idle', { gesture: { id: 'proud', elapsedMs: 550 } });
const replay = sample('idle', { gesture: { id: 'proud', elapsedMs: 0 } });
assert.notEqual(replay.playbackEpoch, priorReplay.playbackEpoch, 'Replaying the same manual action resets its HD cursor');
assert.equal(replay.frameIndex, 0);
for (const style of ['umi', 'illustration']) {
  const selection = sample('idle', {}, { style });
  assert.equal(selection.elapsedMs, 0);
  assert.ok(player.indexedFrame(selection, style));
  assert.ok(player.stats().clips <= 2);
}
for (const style of ['umi-pixel', 'pixel']) {
  assert.equal(sample('editing', {}, { style }), null, 'Old pixel never selects the new keyboard chain');
  assert.equal(sample('idle', {}, { style, animate: false }), null);
  assert.equal(player.nextSelection({ clipId: 'work-enter', style }), null);
  assert.equal(player.stats().keyboardStage, null);
}
player.dispose(); assert.equal(sample('idle'), null);

let wakeups = 0;
const pending = new Map();
const asyncPlayer = createApprovedMotionPlayer({ catalog, onReady: () => wakeups++,
  loadIndexed: path => new Promise(resolve => pending.set(path, resolve)) });
let selection = asyncPlayer.sample({ phase: 'idle' }, { style: 'umi' });
assert.equal(asyncPlayer.indexedFrame(selection), null);
assert.equal(asyncPlayer.sample({ phase: 'idle' }, { style: 'umi-pixel' }), null);
assert.equal(pending.size, 1, 'Switching to old pixel cannot fetch a new indexed rendition');
pending.get('indexed/umi/idle.json')(data['indexed/umi/idle.json']);
await Promise.resolve();
assert.equal(wakeups, 0, 'Aborted and inactive styles cannot trigger display takeover');
selection = asyncPlayer.sample({ phase: 'idle' }, { style: 'illustration' });
asyncPlayer.indexedFrame(selection);
pending.get('indexed/illustration/idle.json')(data['indexed/illustration/idle.json']); await Promise.resolve();
assert.equal(wakeups, 1); assert.ok(asyncPlayer.stats().clips <= 2);
const last = asyncPlayer.sample({ phase: 'thinking' }, { style: 'illustration' }); asyncPlayer.indexedFrame(last);
asyncPlayer.dispose(); pending.get('indexed/illustration/think.json')(data['indexed/illustration/think.json']); await Promise.resolve();
assert.equal(wakeups, 1); assert.equal(asyncPlayer.stats().clips, 0);
let coldTime = 0;
const coldPending = new Map();
const coldPlayer = createApprovedMotionPlayer({ catalog, now: () => coldTime,
  loadIndexed: path => new Promise(resolve => coldPending.set(path, resolve)) });
const entering = coldPlayer.sample({ phase: 'editing' });
assert.equal(coldPlayer.indexedFrame(entering), null);
assert.ok(coldPending.has('indexed/umi/work-enter.json'));
assert.ok(coldPending.has('indexed/umi/work.json'), 'Entry primes the upcoming keyboard loop before its 400ms deadline');
coldPending.get('indexed/umi/work-enter.json')(data['indexed/umi/work-enter.json']); await Promise.resolve();
const firstEntry = coldPlayer.indexedFrame(entering);
assert.equal(firstEntry.approvedMotion.clipId, 'work-enter');
coldTime = 400;
const looping = coldPlayer.sample({ phase: 'editing' });
assert.equal(coldPlayer.indexedFrame(looping), firstEntry, 'Late loop data holds an actual approved keyboard frame');
assert.equal(coldPending.has('indexed/umi/work-exit.json'), false, 'Do not evict the held entry to preload exit before loop data arrives');
coldPending.get('indexed/umi/work.json')(data['indexed/umi/work.json']); await Promise.resolve();
assert.equal(coldPlayer.indexedFrame(looping).approvedMotion.clipId, 'work');
assert.ok(coldPending.has('indexed/umi/work-exit.json'), 'Working primes its 400ms exit');
assert.ok(coldPlayer.stats().clips <= 2); assert.ok(coldPlayer.stats().downloads <= 2);
coldPlayer.dispose();
console.log('Approved motion: all families/emotions, complete-frame pixels, 400ms keyboard lifecycle, real-state priority, QA/path gates and bounded async/style/disposal cache passed.');
