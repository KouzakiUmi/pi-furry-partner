import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createActivity } from "../lib/activity.mjs";
import { createResponseLatency, withResponseLatency } from "../lib/response-latency.mjs";
import { createDshBridge, extractToolArgs } from "../lib/dsh-bridge.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copy = JSON.parse(readFileSync(join(root, "assets/status-copy.json"), "utf8"));
const phrases = JSON.parse(readFileSync(join(root, "assets/status-phrases.json"), "utf8"));

let nowMs = 10_000;
const activity = createActivity({
  labels: copy.labels,
  bubbles: copy.bubbles,
  phrases: phrases.phrases,
  rotationMs: phrases.rotationMs,
  now: () => nowMs,
});
const responseLatency = createResponseLatency({ now: () => nowMs });
const bridge = createDshBridge({ activity, responseLatency });

activity.start({ wake: false });
assert.equal(activity.snapshot().phase, "idle");

// Discarded streamed calls must leave no activity entry, completion gap, or error.
function lifecycleHarness() {
  const activity = createActivity({ now: () => nowMs });
  const events = [];
  const bridge = createDshBridge({ activity: {
    start: (...args) => activity.start(...args),
    clearTyping: () => activity.clearTyping(),
    handle(type, event) { events.push({ type, event }); activity.handle(type, event); },
  } });
  const partial = { blocks: [{ type: "tool_use", id: "partial-read", name: "read_file", status: "running" }] };
  const sync = (extra = {}) => bridge.syncConversationState({ sessionId: "lifecycle", busy: true, status: "tool_calling", partial, ...extra });
  return { activity, bridge, events, partial, sync };
}

{
  const { activity, bridge, sync } = lifecycleHarness();
  sync({ runningCalls: {} });
  assert.equal(activity.snapshot().toolCount, 1);
  sync({ partial: null, runningCalls: {} });
  assert.equal(activity.snapshot().toolCount, 0, "Discarding a partial cancels the pending activity entry");
  assert.equal(activity.snapshot().pendingNextState, null);
  assert.equal(activity.snapshot().reaction, undefined);
  bridge.handleSessionEvent({ type: "assistant/live-chunk", data: { chunk: { type: "text-delta", text: "Answer" } } });
  assert.equal(activity.snapshot().phase, "speaking");
}

{
  const { activity, events, sync } = lifecycleHarness();
  sync();
  assert.equal(activity.snapshot().phase, "editing");
  for (let i = 0; i < 5; i++) {
    sync();
    assert.equal(activity.snapshot().phase, "reading", "Legacy calls remain active across repeated snapshots");
    assert.equal(activity.snapshot().toolCount, 1);
  }
  assert.equal(events.filter(({ type }) => type === "tool_execution_start").length, 1);
  assert.equal(events.filter(({ type }) => type === "tool_execution_end").length, 0);
  sync({ partial: { blocks: [{ type: "tool_use", id: "partial-read", name: "read_file", status: "completed" }] } });
  assert.equal(activity.snapshot().toolCount, 0, "A completed legacy partial ends the tool");
  assert.equal(events.filter(({ type }) => type === "tool_execution_end").length, 1);
}

{
  const { activity, events, sync } = lifecycleHarness();
  for (let i = 0; i < 4; i++) sync({ runningCalls: {} });
  assert.equal(activity.snapshot().phase, "editing", "An explicit empty runningCalls is authoritative");
  assert.equal(events.filter(({ type }) => type === "tool_execution_start").length, 0);
}

{
  const { activity, sync } = lifecycleHarness();
  const runningCalls = { real: { id: "real", name: "read_file", status: "running" } };
  sync({ runningCalls });
  assert.equal(activity.snapshot().toolCount, 2);
  sync({ partial: null, runningCalls });
  assert.equal(activity.snapshot().toolCount, 1, "Cancelling a partial preserves parallel executing calls");
  assert.equal(activity.snapshot().phase, "reading");
  activity.handle("tool_call_cancelled", { toolCallId: "real" });
  assert.equal(activity.snapshot().toolCount, 1, "Cancellation cannot end a real executing tool");
  activity.handle("tool_call_cancelled", { toolCallId: "unknown" });
  assert.equal(activity.snapshot().toolCount, 1);
}

{
  const { activity, events, sync } = lifecycleHarness();
  sync(); sync(); sync();
  sync({ partial: null });
  assert.equal(activity.snapshot().toolCount, 0, "A disappearing legacy partial ends the tool once");
  sync({ partial: null });
  assert.equal(events.filter(({ type }) => type === "tool_execution_end").length, 1);
}

// 1. Typing in DSH composer triggers listening reaction; clearing stops it
bridge.syncInputDraft("帮我看看这段代码");
assert.equal(activity.snapshot().reaction, "listening");
assert.match(activity.snapshot().face, /^listen/);
bridge.syncInputDraft("");
assert.equal(activity.snapshot().reaction, undefined);

// 2. Submitting input + turn/start enters thinking and tracks response latency
bridge.noteInputSubmitted("帮我看看这段代码");
assert.equal(responseLatency.snapshot().waiting, true);
assert.equal(responseLatency.snapshot().kind, "receipt");

nowMs += 200;
bridge.handleSessionEvent({
  sessionId: "sess-1",
  type: "turn/start",
  data: { turnId: "turn-1" },
});
assert.equal(activity.snapshot().phase, "thinking");
assert.equal(responseLatency.snapshot().waiting, true);
assert.equal(responseLatency.snapshot().kind, "first-output");
const waitView = withResponseLatency(activity.snapshot(), responseLatency.snapshot(), "zh-CN");
assert.match(waitView.responseIndicator, /0s$/);

// 3. Streaming reasoning blocks keeps phase in thinking
nowMs += 400;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "thinking",
  partial: {
    blocks: [{ type: "thinking", text: "正在分析调用链与模块边界..." }],
  },
});
assert.equal(activity.snapshot().phase, "thinking");
assert.equal(responseLatency.snapshot().kind, "first-text");

// 4. A partial tool call types before its real runningCalls entry arrives.
nowMs += 300;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  partial: { blocks: [{ type: "tool_use", id: "stream-read", name: "read_file", input: '{"path":"NEVER_ECHO_STREAMED_CONTENT"}', status: "running" }] },
});
assert.equal(activity.snapshot().phase, "editing");
assert.equal(activity.snapshot().bubble, "我读读呀");
assert.equal(activity.snapshot().toolName, "read_file");
assert.equal(activity.snapshot().toolObject, "");
assert.ok(!JSON.stringify(activity.snapshot()).includes("NEVER_ECHO_STREAMED_CONTENT"));
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  partial: { blocks: [{ type: "tool_use", id: "stream-read", name: "read_file", input: '{"path":"NEVER_ECHO_STREAMED_CONTENT"}', status: "running" }] },
  runningCalls: { "stream-read": { id: "stream-read", name: "read_file", input: '{"file_path":"src/components/App.tsx"}', status: "running" } },
});
assert.equal(activity.snapshot().phase, "reading");
assert.equal(activity.snapshot().toolObject, "components/App.tsx");

// 5. Running tool calls map to reading, searching, editing, running
nowMs += 300;
assert.deepEqual(extractToolArgs('{"file_path":"src/components/App.tsx"}'), { file_path: "src/components/App.tsx" });
assert.deepEqual(extractToolArgs('{"path":"lib/index.js", "unclosed": '), { path: "lib/index.js" });

bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  runningCalls: {
    "call-read": { id: "call-read", name: "read_file", input: '{"file_path":"src/components/App.tsx"}', status: "running" },
  },
});
assert.equal(activity.snapshot().phase, "reading");
assert.equal(activity.snapshot().toolName, "read_file");
assert.equal(activity.snapshot().toolObject, "components/App.tsx");
assert.equal(responseLatency.snapshot().waiting, false);

nowMs += 300;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  runningCalls: {
    "call-grep": { id: "call-grep", name: "grep_search", input: { pattern: "useSessionStatus" }, status: "running" },
  },
});
assert.equal(activity.snapshot().phase, "searching");
assert.equal(activity.snapshot().toolObject, "useSessionStatus");

nowMs += 300;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  runningCalls: {
    "call-edit": { id: "call-edit", name: "edit_file", input: { path: "lib/client.js" }, status: "running" },
  },
});
assert.equal(activity.snapshot().phase, "editing");

// 6. Pending interaction (ask_question / permission approval) enters waiting (awaitingUser)
nowMs += 300;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "tool_calling",
  runningCalls: {},
  pendingInteraction: { kind: "question", id: "q-1" },
});
assert.equal(activity.snapshot().phase, "waiting");
assert.equal(activity.snapshot().awaitingUser, true);

nowMs += 300;
bridge.syncConversationState({
  sessionId: "sess-1",
  status: "thinking",
  pendingInteraction: null,
  partial: {
    blocks: [{ type: "text", text: "我已经改好啦，这里是修改说明：" }],
  },
});
assert.equal(activity.snapshot().phase, "speaking");
assert.match(activity.snapshot().face, /^talk-/);

// 7. Compaction events
nowMs += 200;
bridge.handleSessionEvent({ sessionId: "sess-1", type: "compaction/start" });
assert.equal(activity.snapshot().phase, "compacting");
nowMs += 200;
bridge.handleSessionEvent({ sessionId: "sess-1", type: "compaction/end" });
assert.equal(activity.snapshot().phase, "thinking");

// 8. Turn end outcomes: complete -> success, error -> error, interrupted -> cancelled
nowMs += 200;
bridge.handleSessionEvent({
  sessionId: "sess-1",
  type: "turn/end",
  data: { turnId: "turn-1", reason: { kind: "complete" } },
});
assert.equal(activity.snapshot().phase, "success");

nowMs += 3000;
assert.equal(activity.snapshot().phase, "idle");

// Error outcome
bridge.handleSessionEvent({ sessionId: "sess-1", type: "turn/start" });
nowMs += 200;
bridge.handleSessionEvent({
  sessionId: "sess-1",
  type: "turn/end",
  data: { turnId: "turn-2", reason: { kind: "error", message: "API failed" } },
});
assert.equal(activity.snapshot().phase, "error");

// Cancelled outcome
bridge.handleSessionEvent({ sessionId: "sess-1", type: "turn/start" });
nowMs += 200;
bridge.handleSessionEvent({
  sessionId: "sess-1",
  type: "turn/end",
  data: { turnId: "turn-3", reason: { kind: "interrupted" } },
});
assert.equal(activity.snapshot().phase, "cancelled");

// 9. Switching active session syncs cleanly
bridge.syncConversationState({
  sessionId: "sess-2",
  status: "idle",
  busy: false,
});
assert.equal(bridge.getActiveSessionId(), "sess-2");
assert.equal(activity.snapshot().phase, "idle");
