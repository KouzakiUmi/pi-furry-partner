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
