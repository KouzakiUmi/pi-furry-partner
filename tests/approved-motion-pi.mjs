import assert from 'node:assert/strict';
import { createApprovedMotionPlayer, approvedMotionStaticFrame } from '../lib/approved-motion.mjs';
import { renderDock } from '../lib/editor-layout.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
import { approvedMotionStyle } from '../lib/build-profile.mjs';
const { catalog, data } = approvedMotionFixture();
let clock = 0, ordinaryCalls = 0, captured;
const player = createApprovedMotionPlayer({ catalog, now: () => clock, loadIndexed: path => data[path] });
const base = { width: 2, height: 2, transparentIndex: 0, approvedStaticRevision: 'static', palette: [[0, 0, 0], [20, 30, 40]],
  ids: { 'idle-open': 0, 'talk-closed': 1, 'work': 2, 'watch': 4 },
  frames: [{ id: 'idle-open', pixels: [0, 1, 0, 1] }, { id: 'talk-closed', pixels: [1, 0, 1, 0] },
    { id: 'work', pixels: [1, 1, 1, 0] }, { id: 'watch', pixels: [1, 1, 0, 1] }, { id: 'watch-video-000', pixels: [1, 0, 0, 0] }] };
const geometry = { collapsed: false, columns: 16, rows: 8, leftWidth: 19 };
const render = (snapshot, { style = 'umi', animate = true } = {}) => {
  const approved = player.sample(snapshot, { style, animate });
  return renderDock({ geometry, sheet: base, snapshot, animate,
    motionPlayer: { frame: (sheet, index, options) => !animate && approvedMotionStyle(style) ? approvedMotionStaticFrame(sheet, index, options)
      : player.indexedFrame(approved, style) || (ordinaryCalls++, { sheet, frameIndex: index }) },
    renderAvatar: frame => { captured = frame; return Array.from({ length: 8 }, () => ' '.repeat(16)); },
    theme: { fg: (_, text) => text }, visibleWidth: text => Array.from(text).length,
    truncateToWidth: (text, width) => Array.from(text).slice(0, width).join('') });
};
for (const style of ['umi', 'illustration']) {
  clock = 0;
  render({ phase: 'running', face: 'work', bubble: 'real tool' }, { style });
  assert.equal(captured.sheet.clipId, 'work-enter');
  const entryIdentity = captured.sheet.frames[captured.frameIndex].cacheKey;
  assert.equal(captured.sheet.width, 2); assert.equal(captured.columns, 16); assert.equal(captured.rows, 8);
  const sampled = [];
  for (clock = 0; clock < 400; clock += 50) {
    render({ phase: 'editing', face: 'work', bubble: 'real tool', blink: Boolean(clock % 100) }, { style });
    sampled.push(captured.sheet.frames[captured.frameIndex].atMs);
  }
  assert.deepEqual(sampled, [0, 50, 100, 150, 200, 250, 300, 350]);
  clock = 400; render({ phase: 'editing', face: 'work', bubble: 'real tool' }, { style });
  assert.equal(captured.sheet.clipId, 'work');
  assert.notEqual(captured.sheet.frames[captured.frameIndex].cacheKey, entryIdentity,
    'Kitty/Sixel cache identity includes the actual clip even when frameIndex returns to zero');
  assert.deepEqual(Array.from(captured.sheet.frames[captured.frameIndex].pixels), data[`indexed/${style}/work.json`].frames[0].pixels);
  clock = 450;
  const snapshot = { phase: 'idle', face: 'idle-open', bubble: 'idle now', busy: false };
  render(snapshot, { style }); assert.equal(captured.sheet.clipId, 'work-exit'); assert.equal(snapshot.phase, 'idle');
  clock = 850; render(snapshot, { style }); assert.equal(captured.sheet.clipId, 'idle');
}
render({ phase: 'speaking', face: 'talk-closed', bubble: 'speaking' });
assert.equal(captured.sheet, base); assert.equal(ordinaryCalls, 1, 'Independent mouth/blink stays with the ordinary motion player');
render({ phase: 'reading', face: 'watch', bubble: 'reading' }, { animate: false });
assert.equal(captured.sheet.frames[captured.frameIndex].id, 'watch', 'Pause ignores a video alias and chooses the actual approved static frame');
render({ phase: 'running', face: 'watch', bubble: 'executing' }, { animate: false });
assert.equal(captured.sheet.frames[captured.frameIndex].id, 'work', 'Paused execution uses keyboard artwork even with a stale watch face');
render({ phase: 'idle', face: 'idle-blink', bubble: 'idle' }, { animate: false });
assert.equal(captured.sheet.frames[captured.frameIndex].id, 'idle-open', 'Pause cannot select a filmed or blink frame');
for (const style of ['umi-pixel', 'pixel']) {
  const callsBefore = ordinaryCalls;
  render({ phase: 'editing', face: 'work', bubble: 'real tool' }, { style });
  assert.equal(captured.sheet, base, 'Old pixel uses the ordinary motion chain');
  render({ phase: 'running', face: 'watch', bubble: 'running' }, { style, animate: false });
  assert.equal(captured.sheet, base, 'Pixel pause keeps the ordinary static source');
  assert.equal(ordinaryCalls, callsBefore + 2);
  assert.equal(player.stats().keyboardStage, null);
}
render({ phase: 'idle', face: 'idle-open' }, { style: 'umi' });
assert.equal(captured.sheet.clipId, 'idle', 'Switching back to illustration restores complete motion');
player.dispose();
console.log('Approved Pi dock: two illustration IDs, old-pixel fallback/pause/switching, fixed viewport, 20fps400ms transitions and static sources passed.');
