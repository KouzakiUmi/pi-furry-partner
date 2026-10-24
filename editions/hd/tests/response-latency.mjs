import assert from "node:assert/strict";
import { createResponseLatency, withResponseLatency } from "../lib/response-latency.mjs";
let time = 0;
const latency = createResponseLatency({ now: () => time });
const base = { phase: "thinking", label: "thinking", phrase: "original", color: "accent", busy: true, toolCount: 0, elapsedMs: 70000 };
latency.handle("input", { source: "interactive" });
assert.equal(latency.snapshot().kind, "receipt");
time = 2000; latency.handle("agent_start");
assert.equal(latency.snapshot().elapsedMs, 2000);
latency.handle("before_provider_request");
time = 17000;
let view = withResponseLatency(base, latency.snapshot(), "en");
assert.equal(view.responseWaitKind, "first-output"); assert.equal(view.responseWaitMs, 15000);
assert.match(view.responseIndicator, /15s/); assert.match(view.phrase, /I'm still here with you/);
assert.equal(view.elapsedMs, base.elapsedMs); assert.equal(view.phase, "thinking");
latency.handle("message_start", { message: { role: "assistant" } });
latency.handle("message_update", { assistantMessageEvent: { type: "text_start" } });
assert.equal(latency.snapshot().kind, "first-output", "Empty assistant/text-start is not a first token");
latency.handle("message_update", { assistantMessageEvent: { type: "thinking_delta", delta: "" } });
assert.equal(latency.snapshot().ttftMs, undefined);
latency.handle("message_update", { assistantMessageEvent: { type: "thinking_delta", delta: "a" } });
assert.equal(latency.snapshot().kind, "first-text"); assert.equal(latency.snapshot().ttftMs, 15000);
time += 6000;
view = withResponseLatency(base, latency.snapshot(), "zh-CN");
assert.match(view.phrase, /我再琢磨一下/); assert.match(view.responseIndicator, /21s/);
latency.handle("message_update", { assistantMessageEvent: { type: "text_delta", delta: "Hi" } });
assert.equal(latency.isWaiting(), false); assert.equal(latency.snapshot().firstTextMs, 21000);
assert.equal(withResponseLatency(base, latency.snapshot(), "en").phrase, "original");
latency.handle("before_provider_request"); time += 3000;
latency.handle("message_update", { assistantMessageEvent: { type: "toolcall_delta", delta: "tool" } });
assert.equal(latency.isWaiting(), false); assert.equal(latency.snapshot().ttftMs, 3000);
latency.handle("before_provider_request");
for (const changed of [{ ...base, toolCount: 1 }, { ...base, reaction: "poked" }, { ...base, demo: true }, { ...base, awaitingUser: true }, { ...base, phase: "error" }]) assert.equal(withResponseLatency(changed, latency.snapshot(), "en").phrase, "original");
latency.handle("input", { source: "interactive", streamingBehavior: "followUp" });
assert.equal(latency.snapshot().kind, "first-output", "Queued input does not restart the current request's wait clock");
latency.handle("agent_settled"); assert.equal(latency.isWaiting(), false);
assert.equal(latency.snapshot().ttftMs, undefined);
latency.handle("input", { source: "rpc" }); assert.equal(latency.isWaiting(), false);
latency.handle("input", { source: "interactive" }); time += 2500;
assert.equal(latency.isWaiting(), false, "A later handled input cannot leave a permanent preparing indicator");
latency.handle("input", { source: "interactive" }); latency.handle("before_agent_start"); time += 10000;
assert.equal(latency.isWaiting(), true); assert.equal(latency.snapshot().kind, "preparing");
latency.handle("session_start"); assert.equal(latency.isWaiting(), false);
// Lifecycle observations are accurate without exposing backend vocabulary or
// pretending that an unstarted read/search/run has already made progress.
for (const language of ["zh-CN", "en"]) for (const kind of ["receipt", "preparing", "first-output", "first-text"]) {
  for (const elapsedMs of [0, 9000, 10000, 61000]) {
    const result = withResponseLatency(base, { waiting: true, kind, elapsedMs }, language);
    assert.doesNotMatch(result.phrase + " " + result.label, /模型|首个|回包|请求|服务端|正文|思考内容|\b(?:model|token|server|agent|request)\b|first output|answer text/i);
    assert.doesNotMatch(result.phrase, /读完|找到了|完成了|(?:finished|completed|found it|read the file)/i);
    assert.ok(language === "en" ? /\b(?:I|me|my)\b/i.test(result.phrase) : /我/.test(result.phrase));
    assert.equal(result.responseWaitMs, elapsedMs); assert.equal(result.responseWaitKind, kind);
    assert.match(result.responseIndicator, new RegExp(`${Math.floor(elapsedMs / 1000)}s$`));
    assert.equal(result.phase, base.phase); assert.equal(result.elapsedMs, base.elapsedMs);
  }
}
console.log(JSON.stringify({ passed: true, modelRequests: 0, checks: ["Submitted/preparing, true first delta, thinking-before-text and repeated provider request clocks", "Meaningful output ends waiting; empty starts do not fake TTFT; queued input does not reset a live request", "Chinese/English status respects active tools, demos, poke, user questions and failures without mutating the real phase"] }, null, 2));
