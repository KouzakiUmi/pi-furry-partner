import assert from 'node:assert/strict';
import { createActivity } from '../lib/hd/activity.mjs';
import { createApprovedMotionPlayer } from '../lib/hd/player.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

const { catalog, data } = approvedMotionFixture();
let clock = 0;
const activity = createActivity({ now: () => clock });
const player = createApprovedMotionPlayer({ catalog, now: () => clock,
  minimumActionMs: 1200, loadIndexed: path => data[path] });
activity.start({ isBusy: true, wake: false });
function paint(at) {
  clock = at;
  const snapshot = activity.snapshot(), selection = player.sample(snapshot);
  if (selection) player.indexedFrame(selection);
  return { snapshot, selection };
}
function stream(type) {
  activity.handle('message_update', { assistantMessageEvent: { type, contentIndex: 0,
    partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'next', name: 'read',
      arguments: { path: 'PRIVATE_STREAMED_ARGUMENT' } }] } } });
}
activity.handle('tool_execution_start', { toolCallId: 'read', toolName: 'read' });
paint(0); paint(1800);
activity.handle('tool_execution_end', { toolCallId: 'read' });
const ended = paint(1900);
for (const at of [2000, 2300, 2600]) {
  clock = at; stream('toolcall_delta');
  const { snapshot, selection } = paint(at);
  assert.equal(snapshot.phase, 'thinking');
  assert.equal(snapshot.toolCount, 0, 'Transport partials do not become main executing tools');
  assert.equal(snapshot.pendingNextState.remainingMs, 3800 - at);
  assert.equal(selection.clipId, 'watch');
  assert.equal(selection.playbackEpoch, ended.selection.playbackEpoch);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_STREAMED_ARGUMENT'));
}
clock = 2700;
activity.handle('message_start', { message: { role: 'assistant' } });
assert.equal(paint(3800).selection.clipId, 'think', 'Discarded composition cannot revive completed reading');
clock = 4000;
stream('toolcall_start');
const preparing = paint(4000);
assert.equal(preparing.snapshot.phase, 'thinking', 'Preparation never fakes an executing tool');
assert.equal(preparing.snapshot.toolCount, 0);
assert.equal(preparing.snapshot.preparing, true, 'Streaming arguments is a preparation pose, not execution');
assert.equal(preparing.selection.clipId, 'work-enter', 'Preparation keeps the keyboard while the command is still being written');
activity.handle('tool_execution_start', { toolCallId: 'next', toolName: 'bash' });
assert.equal(paint(4000).snapshot.phase, 'running');
// The preparation keyboard still plays its authored 400ms exit, but the old
// 1200ms readable dwell no longer applies: execution is on screen by 4400.
assert.equal(paint(4000).selection.clipId, 'work-enter', 'Execution keeps the keyboard and does not wait out a separate preview dwell');
assert.equal(paint(4399).selection.clipId, 'work-enter');
assert.equal(paint(4400).selection.clipId, 'work', 'A started command is on the keyboard once entry finishes');
player.dispose();
console.log('Main action isolation: streamed partials preserve the original gap/clock and hold the preparation keyboard, and a started command stays on that keyboard without waiting out the preview dwell.');
