import assert from 'node:assert/strict';
import { createActivity, toolResultFailed } from '../lib/activity.mjs';
import { createApprovedMotionPlayer } from '../lib/approved-motion.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

const text = text => ({ content: [{ type: 'text', text }] });
assert.equal(toolResultFailed({ toolName: 'bash', result: text('(no output)\n[exit code: 1]') }), true);
assert.equal(toolResultFailed({ toolName: 'pwsh', result: text('output\n[exit code: 7]') }), true);
assert.equal(toolResultFailed({ toolName: 'bash', result: { structuredContent: { exit_code: 1 } } }), true);
assert.equal(toolResultFailed({ toolName: 'bash', result: { value: { kind: 'foreground', exitCode: 1 } } }), true);
assert.equal(toolResultFailed({ toolName: 'edit', isError: true }), true);
for (const result of [text('error: sample; command exit 1'), text('[exit code: 1]'),
  text('sample\n[exit code: 1]\nmore output'), text('sample\n[exit code: 0]'),
  { structuredContent: { exit_code: 0 }, ...text('sample\n[exit code: 1]') },
  { content: [{ type: 'text', text: 'sample\n[exit code: 1]' }, { type: 'text', text: '' }] }]) {
  assert.equal(toolResultFailed({ toolName: 'bash', result }), false);
}
assert.equal(toolResultFailed({ toolName: 'read', result: text('sample\n[exit code: 1]') }), false);
assert.equal(toolResultFailed({ toolName: 'read', result: { value: { exitCode: 1 } } }), false);
assert.equal(toolResultFailed({ toolName: 'edit', isError: 'false' }), false);

function setup() {
  let time = 100, wall = 100;
  const activity = createActivity({ now: () => time, gapNow: () => wall, random: () => .5 });
  activity.start({ wake: false }); activity.handle('agent_start');
  const start = (name = 'bash', id = name) => activity.handle('tool_execution_start', { toolCallId: id, toolName: name, args: { command: 'NEVER_ECHO_COMMAND' } });
  const end = (id = 'bash', extra = {}) => activity.handle('tool_execution_end', { toolCallId: id, ...extra });
  const snapshot = at => { if (at !== undefined) wall = time = at; return activity.snapshot(); };
  const fail = () => { start(); end('bash', { isError: true, result: text('NEVER_ECHO_OUTPUT') }); return snapshot(); };
  return { activity, start, end, fail, snapshot, wall: at => wall = at };
}
{
  const { activity, fail, snapshot } = setup();
  const s = fail(); assert.equal(s.phase, 'thinking'); assert.equal(s.toolCount, 0); assert.equal(s.busy, true);
  assert.equal(s.pendingNextState, null); assert.equal(s.reaction, 'error'); assert.equal(s.visualPhase, 'error'); assert.equal(s.face, 'error');
  assert.equal(s.color, 'error'); assert.equal(s.blink, false); assert.equal(activity.isToolError(), true); assert.equal(activity.toolErrorRemainingMs(), 1800);
  assert.ok(!JSON.stringify(s).includes('NEVER_ECHO'));
  assert.equal(snapshot(1899).reaction, 'error'); assert.equal(activity.toolErrorRemainingMs(), 1);
  assert.equal(snapshot(1900).reaction, undefined); assert.equal(snapshot().phase, 'thinking');
  assert.equal(activity.toolErrorRemainingMs(), 0);
}
{
  const { activity, fail, snapshot, start, end } = setup(); fail();
  snapshot(200); start('edit'); let s = snapshot(); assert.equal(s.phase, 'editing'); assert.equal(s.toolCount, 1); assert.equal(s.reaction, 'error');
  snapshot(300); activity.handle('message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'next real thought' } });
  assert.equal(snapshot().reaction, 'error'); snapshot(400); end('edit');
  assert.equal(snapshot().pendingNextState, null, 'Success during error reaction cannot queue a stale visual gap');
  snapshot(700); end('edit', { isError: true }); end('missing', { isError: true });
  assert.equal(activity.toolErrorRemainingMs(), 1200, 'Unknown/replayed failed results cannot renew the reaction');
  assert.equal(snapshot(1900).reaction, undefined);
}
{
  const { activity, start, end, snapshot } = setup(); start('read', 'a'); start('bash', 'b'); end('b', { isError: true });
  const s = snapshot(); assert.equal(s.phase, 'reading'); assert.equal(s.toolCount, 1); assert.equal(s.reaction, 'error');
  assert.equal(snapshot(1900).phase, 'reading'); assert.equal(snapshot().reaction, undefined);
}
for (const [type, event] of [
  ['message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'answer' } }],
  ['ui_prompt_start', {}], ['tool_execution_start', { toolCallId: 'question', toolName: 'ask_user_question' }],
  ['session_before_compact', {}], ['message_end', { message: { role: 'assistant', stopReason: 'aborted' } }],
  ['agent_before_settle', { outcome: 'completed' }], ['agent_settled', { aborted: true }],
  ['session_shutdown', {}], ['agent_start', {}],
]) {
  const { activity, fail, snapshot } = setup(); fail(); activity.handle(type, event);
  assert.notEqual(snapshot().reaction, 'error', `${type} immediately supersedes a finite error reaction`);
  assert.equal(activity.toolErrorRemainingMs(), 0);
}
{
  const { activity, fail, wall, snapshot } = setup(); fail(); wall(1899); assert.equal(activity.toolErrorRemainingMs(), 1);
  wall(1900); assert.equal(activity.isToolError(), false); assert.equal(snapshot().reaction, undefined, 'Paused drawing clock cannot freeze error expiry');
}
{
  const { activity, start, end, snapshot } = setup();
  const { catalog, data } = approvedMotionFixture();
  const player = createApprovedMotionPlayer({ catalog, minimumActionMs: 1200, loadIndexed: path => data[path], now: () => 100 });
  start(); const enter = player.sample(snapshot(), { time: 100 }); player.indexedFrame(enter, 'umi');
  assert.equal(enter.clipId, 'work-enter'); end('bash', { isError: true });
  assert.equal(player.sample(snapshot(), { time: 110 }), null, 'Error immediately bypasses keyboard entry/minimum display/gap');
  player.dispose();
}
console.log('Tool errors: native result contracts, strict shell exit markers, 1800ms truthful reaction, priorities, parallel tools, dedupe, wall expiry and display preemption passed.');
