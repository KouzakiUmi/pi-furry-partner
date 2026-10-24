import assert from 'node:assert/strict';
import { createActivity } from '../lib/hd/activity.mjs';
import { createApprovedMotionPlayer } from '../lib/hd/player.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

function harness() {
  const { catalog, data } = approvedMotionFixture();
  let clock = 0;
  const activity = createActivity({ now: () => clock });
  activity.start({ isBusy: true, wake: false });
  const player = createApprovedMotionPlayer({ catalog, now: () => clock, minimumActionMs: 1200,
    loadIndexed: path => data[path] });
  const handle = (at, type, event) => { clock = at; activity.handle(type, event); return paint(at); };
  function paint(at) {
    clock = at;
    const snap = activity.snapshot(), facts = structuredClone(snap);
    const selected = player.sample(snap);
    if (selected) player.indexedFrame(selected);
    assert.deepEqual(snap, facts, 'Retaining animation never changes business facts');
    return { selected, snap };
  }
  const start = (at, name, id) => handle(at, 'tool_execution_start', { toolName: name, toolCallId: id });
  const end = (at, id) => handle(at, 'tool_execution_end', { toolCallId: id });
  return { activity, player, paint, handle, start, end };
}

// A real tool boundary does not reset the same motion clock, even when its
// current loop has already repeated. Work aliases share the same keyboard.
for (const [first, second, id] of [['read', 'read', 'watch'], ['read', 'open', 'watch'],
  ['edit', 'edit', 'work'], ['bash', 'edit', 'work'], ['grep', 'find', 'search']]) {
  const h = harness();
  h.start(0, first, 'a');
  h.paint(400);
  const before = h.paint(1800).selected;
  const ended = h.end(1900, 'a');
  assert.equal(ended.snap.phase, 'thinking');
  assert.equal(ended.snap.toolCount, 0);
  assert.equal(ended.selected.clipId, id);
  assert.equal(ended.selected.playbackMs, before.playbackMs + 100);
  const gap = h.paint(2500).selected;
  assert.equal(gap.clipId, id);
  assert.equal(gap.playbackMs, before.playbackMs + 700);
  const next = h.start(2600, second, 'b');
  assert.equal(next.snap.toolCount, 1);
  assert.equal(next.snap.pendingNextState, null);
  assert.equal(next.selected.clipId, id);
  assert.equal(next.selected.playbackMs, before.playbackMs + 800,
    'New call of the same animation never restarts its first frame');
  const again = h.end(2700, 'b');
  assert.equal(again.selected.playbackMs, before.playbackMs + 900);
  assert.equal(h.paint(4699).selected.clipId, id);
  const released = h.paint(4700).selected;
  assert.equal(released.clipId, id === 'work' ? 'work-exit' : 'think');
  if (id === 'work') assert.equal(h.paint(5100).selected.clipId, 'think');
  h.player.dispose();
}

// Lifecycle notifications are placeholders. Neither cancel nor renew the gap.
{
  const h = harness();
  h.start(0, 'read', 'a'); h.paint(2000); h.end(2000, 'a');
  h.handle(2400, 'message_start', { message: { role: 'assistant' } });
  h.handle(2500, 'message_update', { assistantMessageEvent: { type: 'thinking_start' } });
  h.handle(2800, 'message_update', { assistantMessageEvent: { type: 'text_start' } });
  h.handle(3000, 'message_update', { assistantMessageEvent: { type: 'text_delta', delta: '' } });
  h.handle(3300, 'message_update', { assistantMessageEvent: { type: 'text_end' } });
  h.handle(3700, 'message_end', { message: { role: 'assistant', stopReason: 'toolUse' } });
  assert.equal(h.paint(3999).selected.clipId, 'watch');
  const released = h.paint(4000);
  assert.equal(released.selected.clipId, 'think');
  assert.equal(released.snap.busy, true);
  assert.equal(released.snap.toolCount, 0);
  assert.equal(released.snap.pendingNextState, null);
  h.player.dispose();
}

// Fresh content or an interaction supersedes the waiting visual immediately
// once ordinary dwell is met; real speech/error bypasses even short dwell.
for (const [type, event, expected] of [
  ['message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'new' } }, 'think'],
  ['message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'new' } }, null],
  ['ui_prompt_start', {}, 'wait'],
  ['session_before_compact', {}, 'search'],
  ['agent_settled', { aborted: true }, 'rest'],
]) {
  const h = harness();
  h.start(0, 'read', 'a'); h.paint(1800); h.end(1900, 'a');
  const next = h.handle(2000, type, event);
  assert.equal(next.snap.pendingNextState, null);
  assert.equal(next.selected?.clipId ?? null, expected);
  h.player.dispose();
}

// A 20ms edit still enters, types, and holds its live loop across the gap.
{
  const h = harness();
  h.start(0, 'edit', 'a'); h.end(20, 'a');
  assert.equal(h.paint(399).selected.clipId, 'work-enter');
  assert.equal(h.paint(400).selected.clipId, 'work');
  const before = h.paint(1200).selected;
  assert.equal(before.clipId, 'work');
  const next = h.start(1400, 'edit', 'b').selected;
  assert.equal(next.clipId, 'work');
  assert.equal(next.playbackMs, before.playbackMs + 200);
  h.player.dispose();
}
console.log('Tool gap: truthful state, fixed 2s deadline, real-content handoff and continuous same-animation clock passed.');
