import assert from 'node:assert/strict';
import { createActivity } from '../lib/hd/activity.mjs';
function setup(options = {}) {
  let time = 0;
  const activity = createActivity({ now: () => time, random: () => .25, ...options });
  activity.start({ isBusy: true, wake: false });
  return { activity, at: next => { time = next; return activity.snapshot(); } };
}
const begin = (activity, id = 'private-id', name = 'bash') => activity.handle('tool_execution_start',
  { toolCallId: id, toolName: name, args: { command: 'SECRET_COMMAND', path: '/SECRET_PATH/file' } });
const end = (activity, id = 'private-id', extra = {}) => activity.handle('tool_execution_end', { toolCallId: id, ...extra });
for (const [name, visualPhase] of [['read_file', 'reading'], ['edit', 'editing'], ['bash', 'running'], ['grep', 'searching']]) {
  const { activity, at } = setup();
  begin(activity, 'private-id', name); at(20); end(activity);
  let snap = activity.snapshot();
  assert.equal(snap.phase, 'thinking'); assert.equal(snap.toolCount, 0); assert.equal(snap.busy, true);
  assert.equal(snap.visualPhase, visualPhase);
  assert.deepEqual(snap.pendingNextState, { visualPhase, remainingMs: 2000 });
  assert.equal(snap.toolName, ''); assert.equal(snap.toolObject, '');
  const serialized = JSON.stringify(snap.pendingNextState);
  for (const secret of ['private-id', 'SECRET_COMMAND', 'SECRET_PATH', 'toolName', 'args']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(at(2019).pendingNextState, { visualPhase, remainingMs: 1 });
  snap = at(2020); assert.equal(snap.pendingNextState, null); assert.equal(snap.visualPhase, 'thinking');
  assert.equal(snap.phase, 'thinking'); assert.equal(snap.toolCount, 0);
}
// Unknown and repeated results do not create, refresh, or extend a gap.
{
  const { activity, at } = setup();
  end(activity, 'unknown'); assert.equal(activity.snapshot().pendingNextState, null);
  begin(activity); at(20); end(activity);
  at(1000); end(activity); end(activity, 'unknown', { isError: true });
  assert.deepEqual(activity.snapshot().pendingNextState, { visualPhase: 'running', remainingMs: 1020 });
  assert.equal(at(2020).pendingNextState, null);
}
// Completing one parallel tool keeps the surviving tool's real visual state.
{
  const { activity, at } = setup();
  begin(activity, 'read', 'read_file'); begin(activity, 'edit', 'edit');
  end(activity, 'edit');
  let snap = activity.snapshot();
  assert.equal(snap.phase, 'reading'); assert.equal(snap.toolCount, 1); assert.equal(snap.pendingNextState, null);
  at(50); end(activity, 'read');
  assert.deepEqual(activity.snapshot().pendingNextState, { visualPhase: 'reading', remainingMs: 2000 });
  at(100); begin(activity, 'next', 'grep');
  snap = activity.snapshot(); assert.equal(snap.phase, 'searching'); assert.equal(snap.pendingNextState, null);
}
// Transport placeholders neither cancel nor renew the original completion
// deadline. Repeated same-kind calls can therefore keep one visual action.
{
  const { activity, at } = setup();
  begin(activity, 'edit-1', 'edit'); at(20); end(activity, 'edit-1');
  const placeholders = [
    ['message_start', { message: { role: 'assistant' } }],
    ['message_end', { message: { role: 'assistant', stopReason: 'toolUse' } }],
    ...['text_start', 'text_end', 'thinking_start', 'thinking_end', 'toolcall_start', 'toolcall_end', 'text_delta', 'thinking_delta']
      .map(type => ['message_update', { assistantMessageEvent: { type, delta: '' } }]),
  ];
  for (const [index, [type, event]] of placeholders.entries()) {
    const time = 100 + index * 100;
    at(time); activity.handle(type, event);
    const snap = activity.snapshot();
    assert.equal(snap.phase, 'thinking'); assert.equal(snap.toolCount, 0);
    assert.deepEqual(snap.pendingNextState, { visualPhase: 'editing', remainingMs: 2020 - time }, `${type} preserves the fixed deadline`);
    assert.equal(snap.visualPhase, 'editing');
  }
  at(1500); begin(activity, 'edit-2', 'edit');
  assert.equal(activity.snapshot().phase, 'editing'); assert.equal(activity.snapshot().pendingNextState, null);
  end(activity, 'edit-2');
  assert.deepEqual(activity.snapshot().pendingNextState, { visualPhase: 'editing', remainingMs: 2000 });
  assert.equal(at(3500).pendingNextState, null);
}
// Empty text/block markers do not invent speaking, even outside a gap.
{
  const { activity } = setup();
  activity.handle('message_update', { assistantMessageEvent: { type: 'text_start' } });
  assert.equal(activity.snapshot().phase, 'thinking');
  activity.handle('message_update', { assistantMessageEvent: { type: 'text_delta', delta: '' } });
  assert.equal(activity.snapshot().phase, 'thinking');
  activity.handle('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'Hello' } });
  assert.equal(activity.snapshot().phase, 'speaking');
}
// Every actual next-state signal clears both gap and the legacy work hold.
for (const [type, event] of [
  ['message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'Actual thought' } }],
  ['message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'Actual answer' } }],
  ['message_end', { message: { role: 'assistant', stopReason: 'aborted' } }],
  ['message_end', { message: { role: 'assistant', stopReason: 'error' } }],
  ['ui_prompt_start', {}], ['session_before_compact', {}], ['session_compact', {}],
  ['session_compact_failed', { aborted: false }],
  ['agent_before_settle', { outcome: 'success' }], ['agent_settled', {}],
  ['agent_settled', { aborted: true }], ['session_shutdown', {}], ['agent_start', {}],
]) {
  const { activity, at } = setup();
  begin(activity); at(20); end(activity);
  assert.ok(activity.snapshot().pendingNextState);
  activity.handle(type, event);
  const snap = activity.snapshot();
  assert.equal(snap.pendingNextState, null, `${type} clears pending state`);
  assert.notEqual(snap.visualPhase, 'running', `${type} clears old visual hold`);
}
for (const method of ['clearGap', 'notifyNextState']) {
  const { activity, at } = setup();
  begin(activity); at(20); end(activity);
  activity[method](); activity[method]();
  const snap = activity.snapshot();
  assert.equal(snap.pendingNextState, null); assert.equal(snap.phase, 'thinking');
  assert.equal(snap.toolCount, 0); assert.equal(snap.busy, true); assert.equal(snap.visualPhase, 'thinking');
}
// User questions/errors are not ordinary tool gaps; malformed message updates
// are not evidence that a next state has arrived.
{
  const { activity, at } = setup();
  begin(activity, 'question', 'ask_user'); end(activity, 'question');
  assert.equal(activity.snapshot().pendingNextState, null);
  begin(activity); at(20); end(activity, 'private-id', { isError: true });
  assert.equal(activity.snapshot().pendingNextState, null);
  assert.equal(activity.snapshot().reaction, 'error', 'A real failure has its own finite visual response');
  activity.handle('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'Actual answer' } });
  begin(activity); end(activity);
  activity.handle('message_update', {});
  activity.handle('message_start', { message: { role: 'user' } });
  assert.ok(activity.snapshot().pendingNextState);
  activity.start({ isBusy: true, wake: false }); assert.equal(activity.snapshot().pendingNextState, null);
}
// The configurable timeout is measured from result completion, independent of
// the old 1200ms typing hold, and no timers/background processes are created.
{
  const { activity, at } = setup({ gapTimeoutMs: 50 });
  begin(activity); at(20); end(activity);
  assert.equal(at(69).pendingNextState.remainingMs, 1);
  assert.equal(at(70).pendingNextState, null); assert.equal(activity.snapshot().visualPhase, 'thinking');
}
{
  const { activity } = setup({ gapTimeoutMs: 0 });
  begin(activity); end(activity); assert.equal(activity.snapshot().pendingNextState, null);
}
// Wall-clock gap expiry is independent of paused animation/logical time.
{
  let logicalTime = 50, wallTime = 1000;
  const activity = createActivity({ now: () => logicalTime, gapNow: () => wallTime, random: () => .25 });
  activity.start({ isBusy: true, wake: false });
  begin(activity); end(activity);
  assert.deepEqual(activity.snapshot().pendingNextState, { visualPhase: 'running', remainingMs: 2000 });
  wallTime = 2999;
  assert.equal(activity.snapshot().pendingNextState.remainingMs, 1);
  assert.equal(logicalTime, 50, 'Animation clock stays frozen throughout the gap');
  wallTime = 3000;
  const snap = activity.snapshot();
  assert.equal(snap.pendingNextState, null); assert.equal(snap.visualPhase, 'thinking');
  assert.equal(snap.phase, 'thinking'); assert.equal(snap.toolCount, 0);
  logicalTime = 100000;
  assert.equal(activity.snapshot().pendingNextState, null, 'Resuming animation cannot revive an expired gap');
}
console.log('Activity next-state gap: truthful facts, safe metadata, 2s completion timeout, parallel tools, dedupe and real-state clears passed.');
