import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createActivity, DEMO_STATES } from "../lib/activity.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const make = () => {
  let time = 100000, randomCalls = 0;
  const phrases = Object.fromEntries(DEMO_STATES.map((phase) => [phase, Array.from({ length: 64 }, (_, i) => `${phase} phrase ${i}`)]));
  const activity = createActivity({ phrases, now: () => time, random: () => { randomCalls++; return 0.25; } });
  const advance = (ms) => { time += ms; return activity.snapshot(); };
  return { activity, advance, get time() { return time; }, get randomCalls() { return randomCalls; } };
};
const update = (type, extra = {}) => ({ message: { role: "assistant" }, assistantMessageEvent: { type, ...extra } });

{
  const { activity, advance } = make();
  activity.start();
  assert.equal(activity.snapshot().phase, "waking");
  assert.equal(activity.snapshot().label, "刚刚醒来", "A real wake phase must select its label after overriding idle");
  assert.equal(activity.snapshot().face, "rest");
  assert.equal(advance(1199).face, "rest");
  assert.equal(advance(1).face, "think");
  assert.equal(advance(900).face, "idle-open");
  assert.equal(advance(1000).face, "happy");
  assert.equal(advance(1000).face, "idle-wink");
  assert.equal(advance(899).phase, "waking");
  assert.equal(advance(1).phase, "idle");
  activity.start({ wake: false });
  assert.equal(activity.snapshot().phase, "idle");
  activity.start({ isBusy: true });
  assert.equal(activity.snapshot().phase, "thinking");
  assert.equal(activity.snapshot().busy, true);
  checks.push("Startup wakes over exactly 5 seconds with 1200/2100/3100/4100ms stages; idle opt-out and resumed busy sessions use the injected clock");
}

{
  const {activity,advance}=make();activity.start({wake:false});activity.handle("agent_start");
  activity.handle("ui_prompt_start");assert.equal(activity.snapshot().phase,"waiting");
  assert.equal(advance(9999).drowsy,false);
  const sleepy=advance(1);assert.equal(sleepy.phase,"waiting");assert.equal(sleepy.drowsy,true);assert.equal(sleepy.face,"rest");
  const firstBubble=sleepy.bubble;assert.notEqual(advance(900).bubble,firstBubble);
  activity.handle("ui_prompt_end");const awake=activity.snapshot();
  assert.equal(awake.phase,"thinking");assert.equal(awake.reaction,"startled");assert.equal(awake.drowsy,false);assert.equal(awake.face,"concern");
  assert.equal(advance(649).reaction,"startled");assert.equal(advance(1).reaction,undefined);
  activity.handle("ui_prompt_start");activity.snapshot();assert.equal(advance(500).drowsy,false);
  activity.handle("ui_prompt_end");assert.equal(activity.snapshot().reaction,undefined,"A short prompt must not cause a wake-up reaction");
  checks.push("Waiting dozes at exactly 10 seconds, cycles sleepy bubbles and wakes for 650ms without changing the real phase; brief waits do not startle");
}

{
  const {activity,advance}=make();activity.start({wake:false});activity.handle("agent_start");
  activity.handle("tool_execution_start",{toolCallId:"question",toolName:"ask_user",args:{question:"NEVER_ECHO_SECRET"}});
  activity.handle("ui_prompt_start");activity.handle("ui_prompt_start");activity.snapshot();advance(10000);
  activity.handle("ui_prompt_end");assert.equal(activity.snapshot().phase,"waiting");assert.equal(activity.snapshot().reaction,undefined);
  activity.handle("ui_prompt_end");assert.equal(activity.snapshot().phase,"waiting","The active ask_user tool remains waiting until its result arrives");
  advance(1000);activity.handle("tool_execution_end",{toolCallId:"question",isError:false});
  assert.equal(activity.snapshot().phase,"thinking");assert.equal(activity.snapshot().reaction,"startled","Reaction restarts when the real waiting phase finally exits");
  advance(300);activity.handle("agent_start");assert.equal(activity.snapshot().phase,"thinking");assert.equal(activity.snapshot().reaction,"startled","A new run preserves a recent wake reaction through reset");
  assert.equal(advance(650).reaction,undefined);
  activity.handle("ui_prompt_start");activity.snapshot();advance(10000);activity.handle("agent_start");
  assert.equal(activity.snapshot().phase,"thinking");assert.equal(activity.snapshot().reaction,"startled");
  assert.ok(!JSON.stringify(activity.snapshot()).includes("NEVER_ECHO_SECRET"));
  checks.push("Nested prompts and active ask_user tools stay waiting until completion; the actual phase exit and new runs preserve a finite wake reaction without leaking question payloads");
}

{
  for(const outcome of ["error","aborted"]){
    const {activity,advance}=make();activity.start({wake:false});activity.handle("agent_start");
    activity.handle("ui_prompt_start");activity.snapshot();advance(10000);
    activity.handle("agent_before_settle",{outcome});activity.handle("agent_settled",{aborted:outcome==="aborted"});
    const stopped=activity.snapshot();assert.equal(stopped.phase,outcome==="error"?"error":"cancelled");assert.equal(stopped.reaction,undefined);
  }
  const {activity,advance}=make();activity.start({wake:false});activity.setDemo("waking");
  assert.equal(activity.snapshot().face,"rest");assert.equal(advance(4100).face,"idle-wink");assert.equal(advance(1900).face,"rest");
  activity.setDemo("off");assert.equal(activity.snapshot().phase,"idle","Wake demo timing must not leak into actual startup state");
  checks.push("Final error/cancel bypass wake reactions, and the 6-second waking demo loops independently without changing actual startup state");
}

{
  const test = make();
  const { activity, advance } = test;
  activity.start({ wake: false }); activity.handle("agent_start");
  assert.equal(test.randomCalls, 2, "Randomness is sampled only for stable session/run seeds");
  assert.equal(activity.snapshot().phase, "thinking");
  activity.handle("message_update", update("thinking_start"));
  assert.equal(activity.snapshot().phase, "thinking");
  const dots = new Set();
  for (let i = 0; i < 3; i++) { dots.add(activity.snapshot().bubble); advance(320); }
  assert.deepEqual([...dots].sort(), ["·", "··", "···"]);
  activity.handle("message_update", update("thinking_end"));
  activity.handle("message_update", update("text_start"));
  assert.equal(activity.snapshot().phase, "speaking");
  const mouths = new Set();
  for (let i = 0; i < 6; i++) { mouths.add(activity.snapshot().face); advance(135); }
  assert.ok(mouths.size >= 3);
  assert.ok(mouths.has("talk-small") && mouths.has("talk-medium") && mouths.has("talk-wide"));
  assert.equal(advance(91).face, "talk-closed", "Mouth closes when no new text arrives for 900ms");
  activity.handle("message_update", update("text_delta", { delta: "hello" }));
  assert.equal(activity.snapshot().phase, "speaking");
  activity.handle("message_update", update("text_end"));
  assert.equal(activity.snapshot().phase, "thinking");
  assert.ok(!activity.snapshot().face.startsWith("talk-"));
  assert.equal(test.randomCalls, 2);
  checks.push("Thinking bubbles cycle through middle dots; real speech has at least three mouth shapes, 900ms silence closes mouth and text_end stops speech immediately");
}

{
  let time = 100000;
  const phrases = { idle: ["IDLE"], waiting: ["SYSTEM_WAIT_0", "SYSTEM_WAIT_1"], waiting_user: ["USER_WAIT_0", "USER_WAIT_1"] };
  const activity = createActivity({ now: () => time, random: () => 0.25, phrases,
    labels: { waiting: "SYSTEM_WAIT_LABEL", waiting_user: "USER_WAIT_LABEL" },
    bubbles: { waiting: "SYSTEM_WAIT_BUBBLE", waiting_user: "USER_WAIT_BUBBLE" } });
  activity.start({ wake: false }); assert.equal(activity.snapshot().glyph, "🐾", "Idle uses the paw glyph");
  activity.handle("agent_start"); activity.handle("message_end", { message: { role: "assistant", stopReason: "error" } });
  const system = activity.snapshot();
  assert.equal(system.phase, "waiting"); assert.equal(system.awaitingUser, false);
  assert.ok(phrases.waiting.includes(system.phrase)); assert.equal(system.label, "SYSTEM_WAIT_LABEL"); assert.equal(system.bubble, "SYSTEM_WAIT_BUBBLE");
  time += 1000; activity.handle("ui_prompt_start"); const user = activity.snapshot();
  assert.equal(user.phase, "waiting", "Copy selection must not introduce a new activity phase"); assert.equal(user.awaitingUser, true);
  assert.ok(phrases.waiting_user.includes(user.phrase)); assert.equal(user.label, "USER_WAIT_LABEL"); assert.equal(user.bubble, "USER_WAIT_BUBBLE");
  time += 100; activity.handle("ui_prompt_start"); assert.equal(activity.snapshot().phrase, user.phrase);
  activity.handle("ui_prompt_end"); assert.equal(activity.snapshot().awaitingUser, true);
  time += 6399; assert.equal(activity.snapshot().phrase, user.phrase, "The user copy pool receives a full new 6.5s window when it replaces an existing system wait");
  time++; assert.notEqual(activity.snapshot().phrase, user.phrase);
  activity.handle("ui_prompt_end"); const retry = activity.snapshot();
  assert.equal(retry.phase, "waiting"); assert.equal(retry.awaitingUser, false);
  assert.ok(phrases.waiting.includes(retry.phrase)); assert.equal(retry.label, "SYSTEM_WAIT_LABEL"); assert.equal(retry.bubble, "SYSTEM_WAIT_BUBBLE");
  activity.handle("agent_start");
  activity.handle("tool_execution_start", { toolCallId: "question", toolName: "ask_user", args: { question: "PRIVATE_QUESTION_NEVER_DISPLAY", command: "PRIVATE_COMMAND_NEVER_DISPLAY" } });
  const toolWait = activity.snapshot();
  assert.equal(toolWait.phase, "waiting"); assert.equal(toolWait.awaitingUser, true, "An ask_user tool selects user copy even without ui_prompt_start");
  assert.ok(phrases.waiting_user.includes(toolWait.phrase)); assert.equal(toolWait.bubble, "USER_WAIT_BUBBLE");
  time += 6499; assert.equal(activity.snapshot().phrase, toolWait.phrase);
  time++; assert.notEqual(activity.snapshot().phrase, toolWait.phrase);
  assert.ok(!JSON.stringify(activity.snapshot()).includes("PRIVATE_"));
  activity.handle("tool_execution_end", { toolCallId: "question", isError: false });
  assert.equal(activity.snapshot().awaitingUser, false);
  activity.setDemo("waiting"); const demo = activity.snapshot();
  assert.equal(demo.phase, "waiting"); assert.equal(demo.awaitingUser, true); assert.ok(phrases.waiting_user.includes(demo.phrase));
  assert.equal(DEMO_STATES.includes("waiting_user"), false); activity.setDemo("off");
  const legacy = createActivity({ now: () => time, random: () => 0, phrases: { waiting: ["LEGACY_WAIT"] } });
  legacy.start({ wake: false }); legacy.handle("ui_prompt_start");
  assert.equal(legacy.snapshot().phase, "waiting"); assert.equal(legacy.snapshot().awaitingUser, true); assert.equal(legacy.snapshot().phrase, "LEGACY_WAIT");
  assert.equal(legacy.snapshot().bubble, "我等你呀");
  checks.push("Prompt/ask_user/demo waits select a distinct user copy pool without changing phase; system retry waits keep system copy, each pool gets a 6.5s window, nested prompts remain accurate, legacy pools fall back and private payloads never leak");
}

{
  const {activity,advance}=make();activity.start({wake:false});activity.handle("agent_start");activity.snapshot();
  activity.handle("tool_execution_start",{toolCallId:"fast",toolName:"apply_patch",args:{patch:"NEVER_ECHO_SECRET"}});
  activity.handle("tool_execution_end",{toolCallId:"fast",isError:false});
  const fast=activity.snapshot();assert.equal(fast.phase,"thinking");assert.equal(fast.toolCount,0);assert.equal(fast.visualPhase,"editing");assert.match(fast.face,/^work/);
  assert.equal(advance(1199).visualPhase,"editing");assert.equal(advance(1).visualPhase,"thinking");
  activity.handle("tool_execution_start",{toolCallId:"fast-run",toolName:"bash",args:{command:"NEVER_ECHO_SECRET"}});
  activity.handle("tool_execution_end",{toolCallId:"fast-run",isError:false});assert.equal(activity.snapshot().visualPhase,"running");
  activity.handle("message_update",update("text_delta",{delta:"immediate text"}));
  assert.equal(activity.snapshot().phase,"speaking");assert.equal(activity.snapshot().visualPhase,"speaking");assert.ok(activity.snapshot().face.startsWith("talk-"));
  activity.handle("ui_prompt_start");assert.equal(activity.snapshot().phase,"waiting");assert.equal(activity.snapshot().visualPhase,"waiting");
  activity.handle("ui_prompt_end");activity.handle("tool_execution_start",{toolCallId:"search",toolName:"grep",args:{pattern:"file"}});
  assert.equal(activity.snapshot().phase,"searching");assert.equal(activity.snapshot().visualPhase,"searching");
  activity.handle("agent_before_settle",{outcome:"error"});activity.handle("agent_settled",{aborted:false});assert.equal(activity.snapshot().phase,"error");assert.equal(activity.snapshot().visualPhase,"error");
  assert.ok(!JSON.stringify(activity.snapshot()).includes("NEVER_ECHO_SECRET"));
  checks.push("Tools that start/end between renders still show typing for 1200ms while real phase/tool metadata update immediately; speech, waiting, searching and final error bypass the visual hold");
}

{
  const { activity } = make();
  activity.start({ wake: false }); activity.handle("agent_start");
  activity.handle("tool_execution_start", { toolCallId: "read", toolName: "read", args: { path: "C:\\app\\src\\main.ts", command: "NEVER_ECHO_SECRET" } });
  assert.equal(activity.snapshot().phase, "reading");
  assert.equal(activity.snapshot().toolObject, "src/main.ts");
  activity.handle("tool_execution_start", { toolCallId: "bash", toolName: "bash", parentToolCallId: "read", args: { command: "curl -H 'Authorization: Bearer NEVER_ECHO_SECRET'" } });
  let snapshot = activity.snapshot();
  assert.equal(snapshot.phase, "running"); assert.equal(snapshot.toolCount, 2);
  assert.equal(snapshot.toolObject, "");
  assert.ok(!JSON.stringify(snapshot).includes("NEVER_ECHO_SECRET"));
  activity.handle("tool_execution_end", { toolCallId: "bash", isError: false });
  assert.equal(activity.snapshot().phase, "reading"); assert.equal(activity.snapshot().toolCount, 1);
  activity.handle("ui_prompt_start"); activity.handle("ui_prompt_start");
  assert.equal(activity.snapshot().phase, "waiting"); assert.equal(activity.snapshot().bubble, "我等你呀");
  activity.handle("ui_prompt_end"); assert.equal(activity.snapshot().phase, "waiting");
  activity.handle("session_before_compact"); assert.equal(activity.snapshot().phase, "waiting", "A user prompt takes priority over compaction");
  activity.handle("ui_prompt_end"); assert.equal(activity.snapshot().phase, "compacting");
  activity.handle("session_compact"); assert.equal(activity.snapshot().phase, "reading");
  activity.handle("tool_execution_end", { toolCallId: "read", isError: false });
  assert.equal(activity.snapshot().phase, "thinking"); assert.equal(activity.snapshot().toolCount, 0);
  activity.handle("tool_execution_start", { toolCallId: "edit", toolName: "apply_patch", args: { patch: "NEVER_ECHO_SECRET" } });
  assert.equal(activity.snapshot().phase, "editing"); assert.equal(activity.snapshot().toolObject, "");
  activity.handle("tool_execution_end", { toolCallId: "edit", isError: true });
  activity.handle("tool_execution_start", { toolCallId: "find", toolName: "grep", args: { pattern: "render", arbitraryPayload: "NEVER_ECHO_SECRET" } });
  assert.equal(activity.snapshot().phase, "searching"); assert.equal(activity.snapshot().toolObject, "render");
  activity.handle("session_shutdown");
  snapshot = activity.snapshot();
  assert.equal(snapshot.phase, "idle"); assert.equal(snapshot.toolCount, 0); assert.equal(snapshot.busy, false);
  checks.push("Parallel/nested tool ids, file/search classification and prompt/compaction priorities work; commands, patches and arbitrary secret payloads never enter snapshots");
}

{
  const { activity, advance } = make();
  activity.start({ wake: false }); activity.handle("agent_start");
  activity.handle("message_start", { message: { role: "assistant" } });
  activity.handle("message_update", update("text_delta", { delta: "partial" }));
  activity.handle("message_end", { message: { role: "assistant", stopReason: "error", errorMessage: "NEVER_ECHO_SECRET" } });
  assert.equal(activity.snapshot().phase, "waiting"); assert.equal(activity.snapshot().busy, true);
  assert.equal(activity.snapshot().face, "concern");
  activity.handle("agent_end", { messages: [] });
  assert.equal(activity.snapshot().busy, true, "Low-level agent_end may be followed by retry");
  advance(2000); assert.equal(activity.snapshot().phase, "waiting");
  activity.handle("message_start", { message: { role: "assistant" } });
  assert.equal(activity.snapshot().phase, "thinking");
  activity.handle("message_update", update("text_start"));
  activity.handle("message_end", { message: { role: "assistant", stopReason: "stop" } });
  activity.handle("agent_before_settle", { outcome: "completed" });
  activity.handle("agent_settled", { aborted: false });
  assert.equal(activity.snapshot().phase, "success"); assert.equal(activity.snapshot().busy, false);
  assert.equal(advance(2600).phase, "idle");

  activity.handle("agent_start");
  activity.handle("agent_before_settle", { outcome: "error" }); activity.handle("agent_settled", { aborted: false });
  assert.equal(activity.snapshot().phase, "error"); assert.equal(activity.snapshot().face, "error");
  assert.equal(advance(5999).phase, "error"); assert.equal(advance(1).phase, "idle");

  activity.handle("agent_start");
  activity.handle("message_end", { message: { role: "assistant", stopReason: "aborted" } });
  assert.equal(activity.snapshot().phase, "cancelled");
  activity.handle("agent_before_settle", { outcome: "aborted" }); activity.handle("agent_settled", { aborted: false });
  assert.equal(activity.snapshot().phase, "cancelled"); assert.equal(advance(2600).phase, "idle");
  activity.handle("agent_start"); activity.handle("agent_before_settle", { outcome: "error" }); activity.handle("agent_settled", { aborted: true });
  assert.equal(activity.snapshot().phase, "cancelled", "Explicit user abort has priority over a recorded error");
  checks.push("Retry waiting stays busy through agent_end, subsequent response recovers; settlement distinguishes success, final error and user abort with timed return to idle");
}

{
  const { activity, advance } = make();
  activity.start({ wake: false });
  activity.handle("session_before_compact", { reason: "manual", willRetry: false });
  assert.equal(activity.snapshot().phase, "compacting");
  activity.handle("session_compact", { reason: "manual", willRetry: false });
  assert.equal(activity.snapshot().phase, "idle");
  activity.handle("session_before_compact"); activity.handle("session_compact_failed", { aborted: false });
  assert.equal(activity.snapshot().phase, "error"); assert.equal(advance(5000).phase, "idle");
  activity.handle("session_before_compact"); activity.handle("session_compact_failed", { aborted: true });
  assert.equal(activity.snapshot().phase, "cancelled"); assert.equal(advance(2200).phase, "idle");
  activity.handle("agent_start"); activity.handle("session_before_compact"); activity.handle("session_compact", { willRetry: true });
  assert.equal(activity.snapshot().phase, "thinking"); assert.equal(activity.snapshot().busy, true);
  checks.push("Manual/automatic compaction success, failure and abort recover to the appropriate idle or active state");
}

{
  const { activity, advance } = make();
  activity.start({ wake: false });
  for (const phase of DEMO_STATES) {
    activity.setDemo(phase);
    assert.equal(activity.snapshot().phase, phase); assert.equal(activity.snapshot().demo, true);
    assert.ok(activity.snapshot().face && activity.snapshot().phrase);
  }
  activity.setDemo("speaking"); advance(2000);
  assert.equal(activity.snapshot().phase, "speaking"); assert.ok(activity.snapshot().face.startsWith("talk-"));
  activity.setDemo("off"); assert.equal(activity.snapshot().phase, "idle"); assert.equal(activity.snapshot().demo, false);
  activity.setDemo("invalid-state"); assert.equal(activity.snapshot().phase, "idle");
  activity.setDemo("thinking"); activity.handle("agent_start"); assert.equal(activity.snapshot().demo, false);
  checks.push("All declared demo expressions render, speaking demo outlives token timeout, off/invalid commands and new runs restore actual state");
}

{
  const { activity, advance } = make();
  activity.start({ wake: false }); activity.handle("agent_start");
  const initial = activity.snapshot().phrase;
  assert.equal(advance(6499).phrase, initial);
  assert.notEqual(advance(1).phrase, initial);
  assert.equal(activity.snapshot().phrase, activity.snapshot().phrase);

  // A phase starting near the previous phase's rotation boundary must receive
  // its own full 6.5s. Timer ticks and tool metadata must not reset the phrase.
  activity.handle("agent_start"); advance(6400);
  activity.handle("tool_execution_start", { toolCallId: "late", toolName: "read", args: { path: "src/app.ts" } });
  const reading = activity.snapshot().phrase;
  assert.equal(advance(100).phrase, reading, "A new tool phase must not inherit the previous phase's phrase deadline");
  assert.equal(advance(6399).phrase, reading);
  assert.notEqual(advance(1).phrase, reading);

  advance(6400); activity.handle("ui_prompt_start");
  const waiting = activity.snapshot().phrase;
  assert.equal(advance(6499).phrase, waiting);
  assert.notEqual(advance(1).phrase, waiting);
  checks.push("Phrase selection is deterministic and stable for 6.5s from each effective phase transition, including late tools and prompt overrides");
}

const report = { testedAt: new Date().toISOString(), modelRequests: 0, passed: true, verification: "Product activity controller with deterministic injected clock and randomness", checks };
await writeFile(join(root, "tests/activity-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
