import assert from 'node:assert/strict';
import { createActivity } from '../lib/activity.mjs';
import { ACTIONS } from '../lib/actions.mjs';
let clock = 10000;
const activity = createActivity({ now: () => clock, random: () => 0 });
for (const action of ACTIONS) {
  activity.start({ wake: false });
  assert.equal(activity.setAction(action.id), true);
  let view = activity.snapshot();
  assert.equal(view.actionMode, action.id);
  assert.equal(view.busy, false);
  assert.equal(view.toolCount, 0);
  if (action.id === 'poke') assert.equal(view.reaction, 'poked');
  else assert.equal(view.phase, action.id);
  clock += action.durationMs - 1;
  assert.equal(activity.snapshot().actionMode, action.id);
  clock++;
  view = activity.snapshot();
  assert.equal(view.actionMode, undefined);
  assert.equal(view.phase, 'idle');
  assert.equal(view.reaction, undefined);
}
activity.start({ wake: false });
activity.setAction('all'); clock += 1e7;
assert.equal(activity.snapshot().actionMode, 'all');
activity.setAction('off'); assert.equal(activity.snapshot().demo, false);
activity.setAction('searching'); activity.noteTyping();
assert.equal(activity.snapshot().actionMode, undefined);
assert.equal(activity.snapshot().reaction, 'listening');
for (const event of ['agent_start', 'tool_execution_start', 'ui_prompt_start', 'session_before_compact', 'session_shutdown']) {
  activity.start({ wake: false }); activity.setAction('all');
  activity.handle(event, { toolCallId: 'real', toolName: 'read' });
  assert.equal(activity.snapshot().actionMode, undefined);
  if (event !== 'session_shutdown') assert.equal(activity.setAction('thinking'), false);
  assert.equal(activity.setAction('off'), true);
}
activity.start({ wake: false }); activity.setAction('reading');
assert.equal(activity.setAction('ear-flick'), false);
assert.equal(activity.snapshot().actionMode, 'reading');
activity.setDemo('waiting');
assert.equal(activity.snapshot().actionMode, undefined);
assert.equal(activity.snapshot().phase, 'waiting');
console.log('Original-resource actions: every registered action executes and expires; all/off, typing, real-task preemption, busy guards, unsupported HD names and demo handoff passed.');
