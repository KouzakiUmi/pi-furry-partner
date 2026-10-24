import assert from 'node:assert/strict';
import { createActivity } from '../lib/activity.mjs';
import { localizeSnapshot } from '../lib/language.mjs';
import { readFileSync } from 'node:fs';

let clock = 10000;
const copy = JSON.parse(readFileSync(new URL('../assets/status-copy.json', import.meta.url), 'utf8'));
const activity = createActivity({ ...copy, now: () => clock });
const stream = (id, name, type = 'toolcall_start') => activity.handle('message_update', {
  assistantMessageEvent: { type, contentIndex: 0, partial: { role: 'assistant', content: [
    { type: 'toolCall', id, name, arguments: { command: 'PRIVATE_STREAMED_ARGUMENT' } },
  ] } },
});
const phase = (expected, count) => {
  const snapshot = activity.snapshot();
  assert.equal(snapshot.phase, expected);
  assert.equal(snapshot.toolCount, count);
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_STREAMED_ARGUMENT'));
  return snapshot;
};
activity.start({ isBusy: true, wake: false });
for (const [name, bubble] of [['write', '我写写呀'], ['bash', '敲命令呀'],
  ['web_search', '我搜网页'], ['tool_search', '我找工具'], ['mcp_custom', '我准备呀']]) {
  stream(name, name);
  const pending = phase('editing', 1);
  assert.match(pending.face, /work|idle-blink/);
  assert.equal(pending.bubble, bubble);
  assert.equal(pending.toolObject, '');
  assert.doesNotMatch(localizeSnapshot(pending, 'en').bubble, /[\u3400-\u9fff]/);
  activity.handle('tool_call_cancelled', { toolCallId: name });
  phase('thinking', 0);
}

stream('read', 'read');
activity.handle('message_end', { message: { role: 'assistant', stopReason: 'toolUse' } });
phase('editing', 1);
activity.handle('tool_execution_start', { toolCallId: 'read', toolName: 'read', args: { path: 'src/app.ts' } });
assert.match(phase('reading', 1).face, /work|idle-blink/, 'Keep legacy reading frame routing');
stream('parallel', 'write');
phase('reading', 2);
activity.handle('tool_call_cancelled', { toolCallId: 'parallel' });
phase('reading', 1);
activity.handle('tool_execution_end', { toolCallId: 'read' });
phase('thinking', 0);
activity.handle('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'Answer' } });
phase('speaking', 0);

activity.handle('agent_start');
stream('run', 'bash');
activity.handle('tool_execution_start', { toolCallId: 'run', toolName: 'bash' });
assert.match(phase('running', 1).face, /^watch/, 'Keep legacy execution frame routing');
activity.handle('tool_execution_end', { toolCallId: 'run' });
phase('thinking', 0);
clock += 1200;
assert.equal(activity.snapshot().visualPhase, 'thinking', 'No full-animation 2s state gap is imported');

for (const stopReason of ['length', 'error', 'aborted']) {
  activity.handle('agent_start'); stream('cancel', 'write');
  activity.handle('message_end', { message: { role: 'assistant', stopReason } });
  assert.equal(activity.snapshot().toolCount, 0);
}
activity.handle('agent_start'); stream('reset', 'read');
activity.handle('session_shutdown'); phase('idle', 0);
console.log('Legacy streaming: private-safe simple-frame preparation, category translations, real-tool handoff, cancellation/parallel/reset cleanup, unchanged reading/execution routing, and no main animation dwell imported.');
