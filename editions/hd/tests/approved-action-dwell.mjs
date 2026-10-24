import assert from 'node:assert/strict';
import { createApprovedMotionPlayer } from '../lib/hd/player.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
const { catalog, data } = approvedMotionFixture();
function harness(options = {}) {
  let clock = 0;
  const player = createApprovedMotionPlayer({ catalog, now: () => clock, minimumActionMs: 1200,
    loadIndexed: path => data[path], ...options });
  const sample = (time, phase, extra = {}, present = true) => {
    clock = time;
    const snapshot = { phase, ...extra };
    const before = structuredClone(snapshot);
    const selection = player.sample(snapshot);
    if (selection && present) player.indexedFrame(selection);
    assert.deepEqual(snapshot, before, 'Visual dwell never changes activity facts');
    return selection;
  };
  return { player, sample, clock: time => { clock = time; } };
}
// A 20ms edit is still visible as a complete entry, readable loop, and exit.
{
  const { sample } = harness();
  assert.equal(sample(0, 'editing').clipId, 'work-enter');
  assert.equal(sample(20, 'thinking', { toolCount: 0 }).clipId, 'work-enter');
  assert.equal(sample(399, 'thinking').clipId, 'work-enter');
  assert.equal(sample(400, 'thinking').clipId, 'work');
  assert.equal(sample(1199, 'thinking').clipId, 'work');
  assert.equal(sample(1200, 'thinking').clipId, 'work-exit');
  assert.equal(sample(1599, 'thinking').clipId, 'work-exit');
  assert.equal(sample(1600, 'thinking').clipId, 'think');
}
// Normal turn completion is truthful immediately, while the last edit finishes.
{
  const { sample } = harness();
  const success = { face: 'happy', toolCount: 0, expressionElapsedMs: 900 };
  sample(0, 'editing');
  assert.equal(sample(20, 'success', success).clipId, 'work-enter');
  assert.equal(sample(400, 'success', success).clipId, 'work');
  assert.equal(sample(1199, 'success', success).clipId, 'work');
  assert.equal(sample(1200, 'success', success).clipId, 'work-exit');
  assert.equal(sample(1599, 'success', success).clipId, 'work-exit');
  const joy = sample(1600, 'success', success);
  assert.equal(joy.clipId, 'joy'); assert.equal(joy.elapsedMs, 0, 'Deferred joy starts at its visible first frame');
  assert.equal(joy.loop, false);
  assert.equal(sample(1620, 'idle').clipId, 'joy');
  assert.equal(sample(2799, 'idle').clipId, 'joy');
  assert.equal(sample(2800, 'idle').clipId, 'idle');
}
// A new success target cannot lend its single-shot clock to a held read loop.
{
  const { sample } = harness();
  sample(0, 'reading');
  const held = sample(20, 'success', { face: 'happy', expressionElapsedMs: 850 });
  assert.equal(held.clipId, 'watch'); assert.equal(held.elapsedMs, 20); assert.equal(held.loop, true);
  const selected = sample(1200, 'success', { face: 'happy', expressionElapsedMs: 2030 });
  assert.equal(selected.clipId, 'joy'); assert.equal(selected.elapsedMs, 0); assert.equal(selected.loop, false);
}
// Only the latest target survives. Brief intervening stages are not queued.
{
  const { sample } = harness();
  assert.equal(sample(0, 'reading').clipId, 'watch');
  assert.equal(sample(20, 'thinking').clipId, 'watch');
  assert.equal(sample(40, 'searching').clipId, 'watch');
  assert.equal(sample(1200, 'thinking').clipId, 'think');
  assert.equal(sample(1201, 'reading').clipId, 'watch', 'Thinking gives way immediately to real tool activity');
  assert.equal(sample(1220, 'idle').clipId, 'watch');
  assert.equal(sample(2401, 'idle').clipId, 'idle');
  assert.equal(sample(2402, 'searching').clipId, 'search', 'Idle never delays active work');
}
for (const [phase, extra, expected] of [
  ['waiting', {}, 'wait'], ['cancelled', {}, 'rest'], ['listening', {}, 'listen'],
  ['thinking', { awaitingUser: true }, 'think'], ['speaking', {}, null], ['error', {}, null],
  ['idle', { gesture: { id: 'joy', elapsedMs: 0 } }, 'joy'],
]) {
  const { sample } = harness();
  sample(0, 'editing');
  assert.equal(sample(20, phase, extra)?.clipId ?? null, expected, `${phase} immediately preempts work`);
}
// A target waiting behind keyboard exit is replaceable until it is visible.
{
  const { sample } = harness();
  sample(0, 'editing'); sample(400, 'editing');
  assert.equal(sample(1200, 'searching').clipId, 'work-exit');
  assert.equal(sample(1220, 'reading').clipId, 'work-exit');
  assert.equal(sample(1600, 'thinking').clipId, 'think', 'Obsolete pending search/read never play after exit');
}
// The real asynchronous indexed path starts its clock on successful decode.
{
  let release;
  const { sample } = harness({ loadIndexed: path => new Promise(resolve => { release = () => resolve(data[path]); }) });
  sample(0, 'reading');
  sample(900, 'thinking');
  release(); await Promise.resolve(); await Promise.resolve();
  sample(900, 'thinking');
  assert.equal(sample(2099, 'thinking').clipId, 'watch');
  assert.equal(sample(2100, 'thinking').clipId, 'think');
}
// All non-idle automatic stages receive dwell, including compaction.
for (const [phase, id] of [['thinking', 'think'], ['reading', 'watch'], ['searching', 'search'], ['compacting', 'search']]) {
  const { sample } = harness();
  assert.equal(sample(0, phase).clipId, id);
  assert.equal(sample(20, 'idle').clipId, id);
  assert.equal(sample(1200, 'idle').clipId, 'idle');
}
// Repeating the same manual action gets its own visible minimum.
{
  const { sample } = harness();
  sample(0, 'idle', { gesture: { id: 'joy', elapsedMs: 0 } });
  sample(1000, 'idle', { gesture: { id: 'joy', elapsedMs: 1000 } });
  sample(1010, 'idle', { gesture: { id: 'joy', elapsedMs: 0 } });
  assert.equal(sample(1020, 'idle').clipId, 'joy');
  assert.equal(sample(2209, 'idle').clipId, 'joy');
  assert.equal(sample(2210, 'idle').clipId, 'idle');
}
// A cold clip starts its dwell when it is actually painted, not requested.
{
  const { player, sample, clock } = harness({ loadIndexed: () => new Promise(() => {}) });
  const cold = sample(0, 'reading', {}, false);
  assert.equal(sample(600, 'thinking', {}, false).elapsedMs, 0);
  const shown = sample(1000, 'thinking', {}, false);
  clock(1000); assert.equal(player.markPresented(cold), false, 'A stale frame cannot start a new presentation clock');
  assert.equal(player.markPresented(shown, 1000), true);
  assert.equal(sample(2199, 'thinking', {}, false).clipId, 'watch');
  assert.equal(sample(2200, 'thinking', {}, false).clipId, 'think');
  assert.equal(cold.clipId, 'watch');
}
// Unavailable resources have a finite grace and never pin the old state.
{
  const { sample } = harness({ loadIndexed: () => new Promise(() => {}) });
  sample(0, 'reading', {}, false);
  assert.equal(sample(2399, 'thinking', {}, false).clipId, 'watch');
  assert.equal(sample(2400, 'thinking', {}, false).clipId, 'think');
}
// Delayed entry and loop are each budgeted from their visible presentation.
{
  const { player, sample, clock } = harness({ loadIndexed: () => new Promise(() => {}) });
  sample(0, 'editing', {}, false);
  let frame = sample(700, 'thinking', {}, false);
  assert.equal(frame.clipId, 'work-enter'); assert.equal(frame.elapsedMs, 0);
  clock(700); player.markPresented(frame);
  assert.equal(sample(1099, 'thinking', {}, false).clipId, 'work-enter');
  frame = sample(1100, 'thinking', {}, false);
  assert.equal(frame.clipId, 'work');
  frame = sample(1500, 'thinking', {}, false); clock(1500); player.markPresented(frame);
  assert.equal(sample(2299, 'thinking', {}, false).clipId, 'work');
  frame = sample(2300, 'thinking', {}, false); assert.equal(frame.clipId, 'work-exit');
  clock(2300); player.markPresented(frame);
  assert.equal(sample(2700, 'thinking', {}, false).clipId, 'think');
}
// A permanently missing keyboard cannot wait forever either.
{
  const { sample } = harness({ loadIndexed: () => new Promise(() => {}) });
  sample(0, 'editing', {}, false);
  assert.equal(sample(1600, 'thinking', {}, false).clipId, 'work');
  assert.equal(sample(3600, 'thinking', {}, false).clipId, 'work-exit');
  assert.equal(sample(5200, 'thinking', {}, false).clipId, 'think');
}
// Every idle variant retains its complete native timeline, independent of
// ordinary action loading/dwell clocks. Registration never changes at handoff.
{
  const fixture = approvedMotionFixture();
  const ids = ['idle', 'idle-center', 'idle-right'];
  const rectangle = structuredClone(fixture.catalog.clips.idle.paintRect);
  for (const id of ids) {
    const clip = structuredClone(fixture.catalog.clips.idle);
    clip.id = id; clip.periodMs = 4458; clip.frameCount = 107;
    clip.hires = { baseUrl: `hires/${id}/`, frames: Array.from({ length: 107 }, (_, i) =>
      ({ id: `${id}-${i}`, file: `${i}.webp`, atMs: i * 1000 / 24, sourceFrame: i })) };
    for (const style of ['umi', 'illustration']) {
      const path = `indexed/${style}/${id}.json`;
      const raw = structuredClone(fixture.data[`indexed/${style}/idle.json`]);
      raw.clipId = id; raw.periodMs = 4458;
      raw.frames = Array.from({ length: 54 }, (_, i) => ({ id: `${id}-${i}`, atMs: i * 2000 / 24,
        sourceFrame: i * 2, pixels: [0, 1, i % 2 ? 2 : 1, 0] }));
      fixture.data[path] = raw;
      clip.indexed[style] = { file: path, width: 2, height: 2, frameCount: 54 };
    }
    fixture.catalog.clips[id] = clip;
  }
  fixture.catalog.idleVariants = ids;
  let clock = 0;
  const draws = [.5, .99, .1, .5];
  const player = createApprovedMotionPlayer({ catalog: fixture.catalog, now: () => clock,
    minimumActionMs: 1200, random: () => draws.shift() ?? .5,
    loadIndexed: path => fixture.data[path] });
  for (const [cycle, id] of ['idle-center', 'idle-right', 'idle'].entries()) {
    clock = cycle * 4458;
    let selected = player.sample({ phase: 'idle' });
    assert.equal(selected.clipId, id); assert.equal(selected.frame.sourceFrame, 0);
    assert.equal(selected.elapsedMs, 0); assert.deepEqual(selected.clip.paintRect, rectangle);
    assert.equal(player.indexedFrame(selected).frame.sourceFrame, 0);
    clock += 4417;
    selected = player.sample({ phase: 'idle' });
    assert.equal(selected.clipId, id); assert.equal(selected.frame.sourceFrame, 106);
    assert.equal(selected.elapsedMs, 4417);
    assert.equal(player.indexedFrame(selected).frame.sourceFrame, 106);
    clock = (cycle + 1) * 4458 - 1;
    selected = player.sample({ phase: 'idle' });
    assert.equal(selected.clipId, id); assert.equal(selected.frame.sourceFrame, 106);
    assert.deepEqual(selected.clip.paintRect, rectangle);
  }
  clock = 3 * 4458;
  assert.equal(player.sample({ phase: 'reading' }).clipId, 'watch', 'Activity still immediately preempts any idle variant');
}
// Opt-out retains the existing low-level timing contract.
{
  const { sample } = harness({ minimumActionMs: 0 });
  sample(0, 'editing');
  assert.equal(sample(20, 'thinking').clipId, 'work-exit');
  assert.equal(sample(420, 'thinking').clipId, 'think');
}
console.log('Approved action dwell: visible clocks, keyboard lifecycle, preemption, latest target and bounded loading passed.');
