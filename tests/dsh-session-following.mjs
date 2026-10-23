import assert from 'node:assert/strict';
import { createActivity } from '../lib/activity.mjs';
import { createDshBridge } from '../lib/dsh-bridge.mjs';
import { observeDshSessions, selectDshSessionId } from '../lib/dsh-session-observer.mjs';

function observable(value) {
  const subscribers = new Set();
  return {
    getSnapshot: () => value,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    set(next) { value = next; for (const fn of subscribers) fn(); },
    listeners: () => subscribers.size,
  };
}
function makeBinding(sessionId, running = false, entries = []) {
  const session = observable({ sessionId, running, openState: 'open' });
  const eventSource = observable({ entries, revision: 0, change: { kind: 'replace', entries } });
  let seq = entries.filter(e => e.type === 'event').at(-1)?.event.seq ?? -1;
  return {
    sessionId, session, eventSource, ctx: { sessionId },
    emit(type, data = {}, transient = false) {
      seq = Math.max(seq, ...eventSource.getSnapshot().entries.filter(e => e.type === 'event').map(e => e.event.seq));
      const entry = { type: transient ? 'transient' : 'event', event: { type, data, seq: transient ? seq + 0.5 : ++seq } };
      const current = eventSource.getSnapshot();
      eventSource.set({ entries: [...current.entries, entry], revision: current.revision + 1,
        change: { kind: 'append', entries: [entry] } });
      return entry;
    },
  };
}
let clock = 10000;
const activity = createActivity({ now: () => clock });
activity.start({ wake: false });
const bridge = createDshBridge({ activity });
const first = makeBinding('first');
const second = makeBinding('second');
const list = observable({ byId: {
  first: { id: 'first', retainedBy: { mainView: 1 } },
  second: { id: 'second', retainedBy: {} },
}, ids: ['first', 'second'] });
const bindings = { first, second };
let notifications = 0;
const stop = observeDshSessions({ sessions: { list, binding: id => bindings[id] }, bridge,
  onChange: () => notifications++ });
assert.equal(bridge.getActiveSessionId(), 'first');
assert.equal(activity.snapshot().phase, 'idle');
first.session.set({ sessionId: 'first', running: true });
first.emit('turn/start');
assert.equal(activity.snapshot().phase, 'thinking');
first.emit('assistant/live-chunk', { attemptId: 'a', chunk: { type: 'text-delta', text: 'Hello', index: 0 } }, true);
assert.equal(activity.snapshot().phase, 'speaking');
first.emit('tool/call', { callId: 'read', name: 'read_file', arguments: '{"path":"sample.txt"}' });
assert.equal(activity.snapshot().phase, 'reading');
assert.equal(activity.snapshot().toolObject, 'sample.txt');
// Coarse lifecycle publications must not erase tools learned from the event feed.
first.session.set({ sessionId: 'first', running: true, openState: 'open' });
assert.equal(activity.snapshot().phase, 'reading');
assert.equal(activity.snapshot().toolCount, 1);
first.emit('tool/result', { message: { toolCallId: 'read', isError: false } });
first.emit('tool/call', { callId: 'exec', name: 'run_command', arguments: '{}' });
assert.equal(activity.snapshot().phase, 'running');
first.emit('tool/result', { message: { toolCallId: 'exec', isError: false } });
clock += 1500;
first.emit('tool/call', { callId: 'search', name: 'grep_search', arguments: '{"pattern":"test"}' });
assert.equal(activity.snapshot().phase, 'searching');
first.emit('tool/result', { message: { toolCallId: 'search', isError: false } });
first.emit('tool/call', { callId: 'ask', name: 'ask_user_question', arguments: '{}' });
assert.equal(activity.snapshot().phase, 'waiting');
first.emit('tool/result', { message: { toolCallId: 'ask', isError: false } });
// Actual DSH ToolResultMessage uses toolCallId, and parallel calls settle independently.
first.emit('tool/call', { callId: 'parallel-read', name: 'read_file', arguments: '{}' });
first.emit('tool/call', { callId: 'bash', name: 'bash', arguments: '{}' });
assert.equal(activity.snapshot().phase, 'running');
assert.equal(activity.snapshot().toolCount, 2);
first.emit('tool/result', { message: { toolCallId: 'bash', isError: false } });
assert.equal(activity.snapshot().phase, 'reading');
assert.equal(activity.snapshot().toolCount, 1);
first.emit('tool/result', { message: { toolCallId: 'parallel-read', isError: false } });
first.emit('step/start', { turn: 1, step: 2 });
first.emit('assistant/live-chunk', { chunk: { type: 'reasoning-delta', text: 'next step' } }, true);
assert.equal(activity.snapshot().phase, 'thinking');
assert.equal(activity.snapshot().toolCount, 0);
assert.equal(activity.snapshot().toolName, '');
clock += 1500;
assert.equal(activity.snapshot().visualPhase, 'thinking');
first.emit('compaction/start');
assert.equal(activity.snapshot().phase, 'compacting');
first.session.set({ sessionId: 'first', running: true });
assert.equal(activity.snapshot().phase, 'compacting', 'Coarse running snapshots preserve event-derived compaction');
first.emit('compaction/end');
first.emit('turn/end', { reason: { kind: 'completed' } });
first.session.set({ sessionId: 'first', running: false });
assert.equal(activity.snapshot().phase, 'success');
clock += 3000;
assert.equal(activity.snapshot().phase, 'idle');
// Loading older pages or replacing a window must not replay finished turns.
const prior = first.eventSource.getSnapshot();
const historical = { type: 'event', event: { seq: -1, type: 'tool/call', data: { callId: 'old', name: 'read_file' } } };
first.eventSource.set({ ...prior, entries: [historical, ...prior.entries], revision: prior.revision + 1,
  change: { kind: 'prepend', entries: [historical] } });
assert.equal(activity.snapshot().phase, 'idle');
first.eventSource.set({ ...first.eventSource.getSnapshot(), revision: prior.revision + 2,
  change: { kind: 'replace', entries: first.eventSource.getSnapshot().entries } });
assert.equal(activity.snapshot().phase, 'idle');
// A cold binding first publishes an empty window, then asynchronously loads history.
const lateHistory = [{ type: 'event', event: { seq: 90, type: 'turn/start', data: {} } },
  { type: 'event', event: { seq: 91, type: 'turn/end', data: { reason: { kind: 'error' } } } }];
second.eventSource.set({ entries: [], revision: 1, change: { kind: 'replace', entries: [] } });
// Select another foreground Session; old subscriptions must be released.
list.set({ byId: { first: { id: 'first', retainedBy: {} }, second: { id: 'second', retainedBy: { mainView: 1 } } } });
assert.equal(bridge.getActiveSessionId(), 'second');
second.eventSource.set({ entries: lateHistory, revision: 2, change: { kind: 'replace', entries: lateHistory } });
assert.equal(activity.snapshot().phase, 'idle', 'Delayed history must not replay a former error');

assert.equal(first.eventSource.listeners(), 0);
first.emit('turn/start');
assert.equal(activity.snapshot().phase, 'idle');
second.session.set({ sessionId: 'second', running: true });
second.emit('tool/call', { callId: 'other', name: 'write_file', arguments: '{}' });
assert.equal(activity.snapshot().phase, 'editing');
second.emit('turn/end', { reason: { kind: 'aborted' } });
assert.equal(activity.snapshot().phase, 'cancelled');
assert.equal(selectDshSessionId({ activeId: 'legacy' }), 'legacy');
assert.equal(selectDshSessionId({ byId: { a: { id: 'a', retainedBy: { mainView: 1 } }, b: { id: 'b', retainedBy: { mainView: 1 } } } }, 'b'), 'b');
stop();
assert.equal(second.eventSource.listeners(), 0);
assert.equal(list.listeners(), 0);
assert.ok(notifications > 0);
// Attaching while already running hydrates only the latest active turn.
const live = makeBinding('live', true, [
  { type: 'event', event: { seq: 1, type: 'turn/start', data: {} } },
  { type: 'event', event: { seq: 2, type: 'turn/end', data: { reason: { kind: 'completed' } } } },
  { type: 'event', event: { seq: 3, type: 'turn/start', data: {} } },
  { type: 'event', event: { seq: 4, type: 'tool/call', data: { callId: 'already-reading', name: 'read_file' } } },
]);
const liveList = observable({ byId: { live: { id: 'live', retainedBy: { mainView: 1 } } } });
const off = observeDshSessions({ sessions: { list: liveList, binding: () => live }, bridge });
assert.equal(activity.snapshot().phase, 'reading');
assert.equal(activity.snapshot().toolCount, 1);
off();
console.log('DSH Session contract regression: live state, foreground switching, tools, stream, history and teardown passed.');
