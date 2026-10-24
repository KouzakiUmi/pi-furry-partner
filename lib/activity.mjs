import { POKE_DURATION_MS } from "./poke.mjs";
import { LISTEN_DURATION_MS } from "./listen.mjs";
import { GESTURE_IDS, AUTO_GESTURE_IDS, gestureAt } from "./gestures.mjs";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const LABELS = { idle: "我在呢", waking: "我醒啦", thinking: "我想想呀", speaking: "我讲给你听", reading: "我仔细瞧瞧", editing: "我改改这儿", running: "我看着这一步呢", searching: "我找找线索", waiting: "我再等一会儿", success: "我先收笔啦", error: "我这步卡住啦", cancelled: "我先停下啦", compacting: "我理理前面聊的" };
export const DEMO_STATES = Object.keys(LABELS);
// Display-only tour. Durations leave gestures readable, show a complete
// magnifier loop, and let the waiting pose doze before its wake-up reaction.
export const DEMO_SEQUENCE = Object.freeze([
  { phase: "waking", durationMs: 6000 }, { phase: "idle", durationMs: 3000 },
  { phase: "idle", reaction: "listening", durationMs: 2400 },
  { phase: "thinking", durationMs: 3500 }, { phase: "speaking", durationMs: 4000 },
  { phase: "reading", durationMs: 3500 }, { phase: "editing", durationMs: 3500 },
  { phase: "running", durationMs: 7400 }, { phase: "searching", durationMs: 7200 },
  { phase: "compacting", durationMs: 7200 }, { phase: "waiting", durationMs: 12500 },
  { phase: "thinking", reaction: "startled", durationMs: 1600 },
  { phase: "success", durationMs: 3000 }, { phase: "idle", reaction: "poked", durationMs: 1100 },
  { phase: "error", durationMs: 3000 }, { phase: "cancelled", durationMs: 2000 },
].map(Object.freeze));
export const DEMO_PERIOD_MS = DEMO_SEQUENCE.reduce((sum, step) => sum + step.durationMs, 0);
const clean = (s) => String(s ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
// Keep adjacent shapes on the way into and out of a syllable. Brief closed
// rests separate the phrases; token cadence must not become a jaw metronome.
const SPEECH_BEATS = [
  ["closed", 180], ["small", 100], ["medium", 130], ["wide", 100], ["medium", 120], ["small", 100], ["closed", 240],
  ["small", 110], ["medium", 140], ["small", 100], ["medium", 110], ["wide", 120], ["medium", 130], ["small", 100], ["closed", 310],
  ["small", 100], ["medium", 150], ["wide", 110], ["medium", 130], ["small", 100], ["medium", 120], ["small", 100], ["closed", 270],
];
const SPEECH_PERIOD = SPEECH_BEATS.reduce((total, [, duration]) => total + duration, 0);
function speechFace(elapsed) {
  let at = Math.max(0, elapsed) % SPEECH_PERIOD;
  for (const [shape, duration] of SPEECH_BEATS) {
    if (at < duration) return `talk-${shape}`;
    at -= duration;
  }
  return "talk-closed";
}
function hash(value) { let n = 2166136261; for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return n >>> 0; }
function toolPhase(name) {
  const n = name.toLowerCase();
  if (/ask[_-]?user|question|prompt/.test(n)) return "waiting";
  if (/read|open|fetch|view|get[_-]?search[_-]?content/.test(n)) return "reading";
  if (/edit|write|patch|create|save/.test(n)) return "editing";
  if (/search|find|grep|glob|list|source[_-]?check|^ls$/.test(n)) return "searching";
  return "running";
}
function toolAction(name) { return /write/i.test(name) ? "write" : toolPhase(name) === "editing" ? "edit" : undefined; }
const TOOL_BUBBLE_DEFAULTS = {
  editing: "我改改呀", writing: "我写写呀", preparing_code: "我写代码", preparing_command: "敲命令呀",
  preparing_question: "我问问呀", preparing_read: "我读读呀", preparing_search: "我找找呀",
  preparing_web: "我搜网页", preparing_tools: "我找工具", preparing_tool: "我准备呀",
};
function preparationBubbleKey(name) {
  const words = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const has = (...values) => values.some((value) => words.has(value));
  if (has("question", "prompt") || (words.has("ask") && words.has("user"))) return "preparing_question";
  if (words.has("codemode") || (words.has("code") && words.has("mode")) || (words.has("tool") && words.has("parallel"))) return "preparing_code";
  if ((words.has("tool") && words.has("search")) || (words.has("web") && words.has("enable"))) return "preparing_tools";
  if ((words.has("web") && words.has("search")) || (words.has("source") && words.has("check"))) return "preparing_web";
  if (has("edit", "patch")) return "editing";
  if (words.has("write") || (words.has("file") && has("create", "save"))) return "writing";
  if (has("bash", "powershell", "shell", "command", "execute", "exec", "run")) return "preparing_command";
  if (has("read", "open", "fetch", "view") || (words.has("get") && words.has("content"))) return "preparing_read";
  if (has("search", "find", "grep", "glob", "list", "ls")) return "preparing_search";
  return "preparing_tool";
}
function streamedTool(event) {
  const update = event.assistantMessageEvent;
  if (!update || !update.type?.startsWith("toolcall_")) return undefined;
  const call = update.type === "toolcall_end" ? update.toolCall : update.partial?.content?.[update.contentIndex];
  return call?.type === "toolCall" && typeof call.name === "string" ? call : undefined;
}
function toolObject(args) {
  // Only show an explicit file/search argument. Commands and arbitrary payloads
  // can include credentials and are deliberately not echoed into the UI.
  const value = args?.path ?? args?.file_path ?? args?.filePath ?? args?.pattern;
  if (typeof value !== "string") return "";
  const compact = value.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/");
  return clean(compact).slice(0, 80);
}

// Normalize only authoritative result facts. DSH's shell renderer deliberately
// reports process exits separately from tool infrastructure failures; its
// persisted result drops the original value, leaving this exact final marker.
// Never search arbitrary output for "error", commands, or exit-like prose.
export function toolResultFailed({ toolName = "", isError = false, result } = {}) {
  if (isError === true || result?.isError === true) return true;
  const shellName = String(toolName).toLowerCase().split("__").at(-1);
  if (!["bash", "pwsh", "powershell", "exec_command"].includes(shellName)) return false;
  const value = result?.structuredContent ?? result?.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const exit = value.exit_code ?? value.exitCode;
    if (Number.isInteger(exit)) return exit !== 0;
  }
  const blocks = result?.content;
  if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0]?.type !== "text" || typeof blocks[0].text !== "string") return false;
  const marker = /\n\[exit code: (\d+)\]$/.exec(blocks[0].text);
  return marker !== null && Number(marker[1]) !== 0;
}

export function createActivity({ phrases = {}, labels = {}, bubbles = {}, rotationMs = 6500, now = Date.now, random = Math.random, autoGestures = false, gestureDurations = () => ({}), gapTimeoutMs = 2000, gapNow = now, interactionClips, canWelcome = () => true } = {}) {
  const labelFor = (state) => labels[state] || LABELS[state] || "我在呢";
  let seed = Math.floor(random() * 0x7fffffff), phase = "idle", phaseSince = now(), started = now();
  let busy = false, lastTextAt = -Infinity, streamOpen = false, outcome, terminalUntil = 0;
  let wakeAt = -Infinity, promptDepth = 0, compacting = false, demo, toolWarningUntil = 0;
  let waitingAt = -Infinity, lastCurrent, startleAt = -Infinity;
  let visualWorkUntil = -Infinity, visualWorkPhase = "running", visualWorkBubbleKey, stateGap = null;
  let toolErrorUntil = -Infinity, toolErrorAt = -Infinity;
  const clearToolError = () => { toolErrorUntil = toolErrorAt = -Infinity; };
  const gapDuration = Math.max(0, Math.min(10000, Number(gapTimeoutMs) || 0));
  const clearGap = () => { stateGap = null; visualWorkUntil = -Infinity; };
  let effectiveKey = "", effectiveSince = now(), demoRevision = 0, demoStartedAt = 0;
  let pokeAt = -Infinity, pokeContext = "idle", pokeIndex = 0;
  let interaction = null, interactionSerial = 0, lastPokeClip = null;
  const lastContextClip = {};
  const nativeInteractions = typeof interactionClips === "function";
  function clearInteraction(kind) {
    if (!interaction || kind && interaction.kind !== kind) return;
    if (interaction.kind === "welcome") wakeAt = -Infinity;
    if (interaction.kind === "poke") pokeAt = -Infinity;
    interaction = null;
  }
  function beginInteraction(id, kind) {
    interaction = { id, kind, epoch: ++interactionSerial, startedAt: gapNow(), presentedAt: null };
  }
  function interactionView() {
    if (!interaction) return null;
    if (interaction.kind === "welcome" && !canWelcome()) { clearInteraction(); return null; }
    const clip = interactionClips?.()?.[interaction.id];
    const durationMs = Number(clip?.periodMs), age = gapNow() - (interaction.presentedAt ?? interaction.startedAt);
    // A missing/cold resource may wait briefly for its first actual frame,
    // then expires instead of reviving later or queuing behind real work.
    if (interaction.presentedAt === null && age >= 1200 || interaction.presentedAt !== null && age >= durationMs) { clearInteraction(); return null; }
    if (!clip || clip.qa?.accepted !== true || !Number.isFinite(durationMs) || durationMs < 80 || durationMs > 15000) return null;
    return { id: interaction.id, kind: interaction.kind, epoch: interaction.epoch, durationMs,
      elapsedMs: interaction.presentedAt === null ? 0 : Math.max(0, age),
      remainingMs: interaction.presentedAt === null ? 1200 - age + durationMs : durationMs - age };
  }
  let typingUntil = -Infinity, listeningActive = false;
  let gestureMode, gestureStarted = 0;
  const tools = new Map(), pendingTools = new Map();
  const allTools = () => [...pendingTools.values(), ...tools.values()];
  const activeTool = () => [...tools.values()].at(-1) || [...pendingTools.values()].at(-1);
  const setPhase = (next) => { if (phase !== next) { phase = next; phaseSince = now(); } };
  const wasDozing = () => lastCurrent === "waiting" && now() - waitingAt >= 10000;
  const reset = () => { clearGap(); clearToolError(); clearInteraction(); gestureMode = undefined; tools.clear(); pendingTools.clear(); promptDepth = 0; compacting = false; streamOpen = false; outcome = undefined; terminalUntil = 0; toolWarningUntil = 0; lastTextAt = -Infinity; demo = undefined; wakeAt = -Infinity; effectiveKey = ""; waitingAt = -Infinity; lastCurrent = undefined; startleAt = -Infinity; visualWorkUntil = -Infinity; visualWorkBubbleKey = undefined; typingUntil = -Infinity; listeningActive = false; };
  const demoView = (time) => {
    if (!demo) return undefined;
    const age = Math.max(0, time - demoStartedAt);
    if (demo !== "all") return { phase: demo, elapsed: demo === "waking" ? age % 6000 : age,
      epoch: `${demoRevision}:${demo === "waking" ? Math.floor(age / 6000) : 0}:0`, step: 0 };
    const cycle = Math.floor(age / DEMO_PERIOD_MS);
    let elapsed = age % DEMO_PERIOD_MS;
    for (const [step, value] of DEMO_SEQUENCE.entries()) {
      if (elapsed < value.durationMs) return { ...value, elapsed, epoch: `${demoRevision}:${cycle}:${step}`, step };
      elapsed -= value.durationMs;
    }
  };

  return {
    // Adapters may explicitly confirm actual next-state content without a
    // message delta. Structural step/block markers are not such evidence.
    // Clearing the visual gap never changes task facts.
    clearGap,
    notifyNextState: clearGap,
    cancelInteraction: clearInteraction,
    markInteractionPresented(epoch) {
      if (!interaction || interaction.epoch !== epoch || interaction.presentedAt !== null || !interactionView()) return false;
      interaction.presentedAt = gapNow(); return true;
    },
    isToolError() { return this.snapshot().reaction === "error"; },
    toolErrorRemainingMs() { return this.isToolError() ? Math.max(0, toolErrorUntil - gapNow()) : 0; },
    start({ isBusy = false, wake = true } = {}) {
      reset(); pokeAt = -Infinity; busy = isBusy; started = now(); phaseSince = now(); phase = isBusy ? "thinking" : "idle";
      if (!isBusy && wake) { wakeAt = now(); if (nativeInteractions && canWelcome()) beginInteraction("wave", "welcome"); }
    },
    poke() {
      const state = this.snapshot();
      pokeContext = state.phase === "waiting" ? "waiting" : state.busy || ["thinking", "speaking", "reading", "editing", "running", "searching", "compacting"].includes(state.phase) ? "busy" : "idle";
      if (nativeInteractions) {
        if (interactionView()?.kind === "poke") return false; // One finite response, no click backlog.
        if (["speaking", "error", "cancelled", "compacting"].includes(state.phase) || state.reaction === "error") return false;
        const pools = { idle: ["bounce", "ear-flick"], busy: ["head-shake", "ear-flick"], waiting: ["ear-flick", "head-shake"] };
        const clips = interactionClips() || {};
        const pool = pools[pokeContext].filter(id => clips[id]?.qa?.accepted === true);
        const different = pool.filter(id => id !== lastPokeClip && id !== lastContextClip[pokeContext]);
        const choices = different.length ? different : pool.filter(id => id !== lastContextClip[pokeContext]);
        const selected = (choices.length ? choices : pool)[Math.floor(Math.max(0, Math.min(.999999, random())) * (choices.length || pool.length))];
        if (selected) {
          clearInteraction(); beginInteraction(selected, "poke");
          lastPokeClip = lastContextClip[pokeContext] = selected;
          pokeIndex = Math.floor(random() * 0x7fffffff); pokeAt = -Infinity; return true;
        }
      }
      pokeIndex = Math.floor(random() * 0x7fffffff);
      pokeAt = now(); return true;
    },
    isPoked() { return interactionView()?.kind === "poke" || now() - pokeAt >= 0 && now() - pokeAt < POKE_DURATION_MS; },
    noteTyping() {
      if (demo === "all") return false;
      const state = this.snapshot();
      const eligible = (state.phase === "idle" || state.phase === "waking" && !busy || state.awaitingUser) && !allTools().some((tool) => tool.phase !== "waiting");
      if (!eligible) return false;
      clearInteraction();
      if (state.phase === "waking") wakeAt = -Infinity;
      typingUntil = now() + LISTEN_DURATION_MS;
      listeningActive = true;
      return true;
    },
    clearTyping() { typingUntil = -Infinity; listeningActive = false; },
    isListening() { return listeningActive && now() < typingUntil; },
    playGesture(id = "all") {
      if (id === "off") { gestureMode = undefined; return true; }
      if (id !== "all" && !GESTURE_IDS.includes(id)) return false;
      const state = this.snapshot();
      if (state.busy || state.awaitingUser || state.phase !== "idle" || state.reaction) return false;
      clearInteraction(); demo = undefined; gestureMode = id; gestureStarted = now(); return true;
    },
    setDemo(next = "all") {
      gestureMode = undefined;
      if (next === "off") { demo = undefined; return; }
      if (next !== "all" && !DEMO_STATES.includes(next)) return;
      clearInteraction(); demo = next; demoRevision++; demoStartedAt = now();
    },
    handle(type, event = {}) {
      if (type === "agent_start") {
        const wakeUp = wasDozing() || now() - startleAt < 650;
        reset(); if (wakeUp) startleAt = now();
        busy = true; seed = Math.floor(random() * 0x7fffffff); started = now(); phaseSince = now(); phase = "thinking"; return;
      }
      if (type === "session_shutdown") { reset(); pokeAt = -Infinity; busy = false; phase = "idle"; return; }
      if (type === "ui_prompt_start") { clearInteraction(); clearGap(); clearToolError(); promptDepth++; return; }
      if (type === "ui_prompt_end") {
        if (promptDepth === 1 && wasDozing()) startleAt = now();
        promptDepth = Math.max(0, promptDepth - 1); return;
      }
      if (type === "session_before_compact") { clearInteraction(); clearGap(); clearToolError(); compacting = true; setPhase("compacting"); return; }
      if (type === "session_compact" || type === "session_compact_failed") {
        clearInteraction(); clearGap(); clearToolError(); compacting = false;
        if (type === "session_compact_failed") {
          setPhase(event.aborted ? "cancelled" : "error"); terminalUntil = now() + (event.aborted ? 2200 : 5000);
        } else setPhase(busy ? "thinking" : "idle");
        return;
      }
      if (type === "message_start" && event.message?.role === "assistant") { pendingTools.clear(); streamOpen = false; setPhase("thinking"); return; }
      if (type === "message_update") {
        const part = event.assistantMessageEvent?.type || "";
        const delta = event.assistantMessageEvent?.delta;
        const hasContent = typeof delta === "string" && delta.length > 0;
        // Block openings/closings and empty chunks are transport markers. In
        // particular text_start is not proof that the assistant has spoken.
        if ((part === "text_delta" || part === "thinking_delta") && hasContent) clearGap();
        if (part === "text_delta" && hasContent) {
          clearInteraction(); clearToolError();
          streamOpen = true; lastTextAt = now(); setPhase("speaking");
        } else if (part === "text_end") { streamOpen = false; setPhase("thinking"); }
        else if (part.startsWith("thinking_") && (part !== "thinking_delta" || hasContent)) { streamOpen = false; setPhase("thinking"); }
        else if (part.startsWith("toolcall_")) {
          streamOpen = false;
          const call = streamedTool(event);
          if (call) pendingTools.set(call.id, { name: clean(call.name), phase: "editing", bubbleKey: preparationBubbleKey(call.name), object: "", started: now() });
          else if (!pendingTools.size) setPhase("thinking");
        }
        return;
      }
      if (type === "tool_execution_start") {
        clearGap();
        const nextPhase = toolPhase(event.toolName || ""), action = toolAction(event.toolName || "");
        const bubbleKey = nextPhase === "editing" ? action === "write" ? "writing" : "editing" : nextPhase;
        if (nextPhase === "waiting") { clearInteraction(); clearToolError(); }
        else if (interaction?.kind === "welcome") clearInteraction();
        pendingTools.delete(event.toolCallId);
        tools.set(event.toolCallId, { name: clean(event.toolName), phase: nextPhase, action, bubbleKey, object: toolObject(event.args), started: now() });
        if (["editing", "running"].includes(nextPhase)) { visualWorkUntil = now() + 1200; visualWorkPhase = nextPhase; visualWorkBubbleKey = bubbleKey; }
        streamOpen = false; return;
      }
      if (type === "tool_execution_end") {
        const ended = tools.get(event.toolCallId);
        if (!ended) return; // Duplicate/unknown results cannot refresh a gap.
        tools.delete(event.toolCallId); pendingTools.delete(event.toolCallId);
        const failed = toolResultFailed({ toolName: ended.name, isError: event.isError, result: event.result });
        if (failed) {
          clearInteraction(); clearGap();
          // A tool failure is a finite drawing reaction, never a terminal task
          // outcome. New tool facts remain live while the reaction is readable.
          toolErrorAt = gapNow(); toolErrorUntil = toolErrorAt + 1800;
        }
        if (!tools.size && !pendingTools.size) {
          setPhase("thinking");
          if (!failed && gapNow() >= toolErrorUntil && busy && !promptDepth && !compacting && gapDuration &&
              ["reading", "editing", "running", "searching"].includes(ended.phase)) {
            // Only coarse visual metadata survives. Never retain tool identity,
            // argument objects, file names, commands, or result contents here.
            clearGap();
            stateGap = { visualPhase: ended.phase, until: gapNow() + gapDuration };
          }
        }
        return;
      }
      if (type === "message_end" && event.message?.role === "assistant") {
        streamOpen = false;
        if (event.message.stopReason === "error") { clearInteraction(); clearGap(); clearToolError(); setPhase("waiting"); toolWarningUntil = now() + 1800; }
        else if (event.message.stopReason === "aborted") { clearInteraction(); clearGap(); clearToolError(); setPhase("cancelled"); }
        else { if (!["toolUse", "deferred"].includes(event.message.stopReason)) pendingTools.clear(); setPhase("thinking"); }
        return;
      }
      if (type === "agent_before_settle") { clearInteraction(); clearGap(); clearToolError(); outcome = event.outcome; return; }
      if (type === "agent_settled") {
        clearInteraction(); clearGap(); clearToolError(); busy = false; tools.clear(); pendingTools.clear(); streamOpen = false; compacting = false; promptDepth = 0;
        setPhase(event.aborted || outcome === "aborted" ? "cancelled" : outcome === "error" ? "error" : "success");
        terminalUntil = now() + (phase === "error" ? 6000 : 2600);
      }
    },
    snapshot() {
      const time = now();
      const gapTime = gapNow();
      const nativeInteraction = interactionView();
      if (stateGap && gapTime >= stateGap.until) stateGap = null;
      if (!busy && terminalUntil && time >= terminalUntil) { terminalUntil = 0; setPhase("idle"); }
      const active = activeTool();
      let actual = promptDepth ? "waiting" : compacting ? "compacting" : active ? active.phase : phase;
      const wakeElapsed = time - wakeAt;
      if (!busy && actual === "idle" && wakeElapsed >= 0 && wakeElapsed < 5000) actual = "waking";
      const actualAwaitingUser = actual === "waiting" && (promptDepth > 0 || active?.phase === "waiting");
      // Only real events update these clocks. The tour overlays the result,
      // including when snapshots skip steps or jump directly into a later lap.
      if (actual !== lastCurrent) {
        if (lastCurrent === "waiting" && time - waitingAt >= 10000 && !["waiting", "error", "cancelled"].includes(actual)) startleAt = time;
        if (actual === "waiting") waitingAt = time;
        lastCurrent = actual;
      }
      const key = `${actualAwaitingUser ? "waiting_user" : actual}:${active?.name || ""}:${active?.object || ""}`;
      if (key !== effectiveKey) { effectiveKey = key; effectiveSince = time; }
      const view = demoView(time);
      const current = view?.phase || actual;
      const pendingNextState = !view && stateGap && gapTime >= toolErrorUntil && actual === "thinking" && busy && !tools.size
        ? { visualPhase: stateGap.visualPhase, remainingMs: Math.max(0, stateGap.until - gapTime) } : null;
      const awaitingUser = current === "waiting" && (view ? true : actualAwaitingUser);
      const copyKey = awaitingUser ? "waiting_user" : current;
      const bubbleKey = !view && current === "editing" && active?.bubbleKey ? active.bubbleKey : copyKey;
      const label = labels[copyKey] || labelFor(current);
      const waitingElapsed = view ? view.elapsed : time - waitingAt;
      const drowsy = current === "waiting" && waitingElapsed >= 10000;
      const since = view ? time - view.elapsed : current === "waking" ? wakeAt : effectiveSince;
      const elapsed = Math.max(0, time - since);
      const cycle = Math.floor(elapsed / Math.max(3000, rotationMs));
      const pool = phrases[copyKey] || phrases[current] || phrases.idle || [label];
      let phrase = pool[(hash(`${seed}:${copyKey}`) + cycle) % pool.length];
      let bubble, face;
      const blink = Math.floor(time / 170) % 29 === 0;
      const pulse = Math.floor(elapsed / 320);
      if (current === "waking") {
        const t = demo ? elapsed % 6000 : wakeElapsed;
        if (t < 1200) { face = "rest"; bubble = "z · z"; phrase = "唔，我再眯一小会儿…"; }
        else if (t < 2100) { face = "think"; bubble = "唔？"; phrase = "嗯？我听见你啦"; }
        else if (t < 3100) { face = "idle-open"; bubble = "我醒啦"; phrase = "我醒啦，让我醒醒神呀"; }
        else if (t < 4100) { face = "happy"; bubble = "你来啦"; phrase = "你来啦，我把耳朵竖好咯"; }
        else { face = "idle-wink"; bubble = "♪"; phrase = "我在这儿呢，想做什么就跟我说"; }
      } else if (current === "speaking") {
        const activeSpeech = Boolean(view) || (streamOpen && time - lastTextAt < 900);
        face = activeSpeech ? speechFace(elapsed) : "talk-closed";
        bubble = activeSpeech ? ["·", "··", "···"][pulse % 3] : "·";
      } else if (current === "thinking") { face = blink ? "idle-blink" : "think"; bubble = "·".repeat(pulse % 3 + 1); }
      else if (["reading", "editing", "running", "searching"].includes(current)) { face = current === "searching" ? "search" : current === "reading" ? blink ? "watch-blink" : "watch" : blink ? "work-blink" : "work"; bubble = TOOL_BUBBLE_DEFAULTS[bubbleKey] || { reading: "我瞧瞧", editing: "我改改呀", running: "我看着呢", searching: "我翻翻看" }[current]; }
      else if (current === "compacting") { face = "search"; bubble = ["▱", "▰", "▱"][pulse % 3]; }
      else if (current === "success") { face = "happy"; bubble = "✓"; }
      else if (current === "error") { face = "error"; bubble = "!"; }
      else if (current === "cancelled") { face = "rest"; bubble = "我停下啦"; }
      else if (current === "waiting") { face = toolWarningUntil > time ? "concern" : blink ? "wait-blink" : "wait"; bubble = promptDepth ? "我等你呀" : "我等一会"; }
      else { face = blink ? "idle-blink" : "idle-open"; bubble = "♪"; }
      if (!["waking", "thinking", "speaking"].includes(current) && (bubbles[bubbleKey] || bubbles[current])) bubble = bubbles[bubbleKey] || bubbles[current];
      if (awaitingUser && !bubbles.waiting_user) bubble = "我等你呀";
      const holdingWork = !demo && current === "thinking" && time < visualWorkUntil;
      if (holdingWork) { face = blink ? "work-blink" : "work"; const holdBubbleKey = visualWorkBubbleKey || visualWorkPhase; bubble = bubbles[holdBubbleKey] || TOOL_BUBBLE_DEFAULTS[holdBubbleKey] || "我来敲两下"; }
      if (pendingNextState) {
        const held = pendingNextState.visualPhase;
        face = held === "reading" ? blink ? "watch-blink" : "watch" : held === "searching" ? "search" : blink ? "work-blink" : "work";
        bubble = bubbles[held] || { reading: "我瞧瞧", editing: "我改改呀", running: "我看着呢", searching: "我翻翻看" }[held];
      }
      if (drowsy) { face = "rest"; bubble = ["z", "z · z", "z · z · z"][Math.floor((waitingElapsed - 10000) / 900) % 3]; phrase = awaitingUser ? "你慢慢想，我眯一小会儿陪着你" : "我先眯一小会儿，有回音再接着来"; }
      // This reaction only changes the drawing; the real agent phase stays live.
      const startled = view ? view.reaction === "startled" && elapsed < 650 : !["waiting", "error", "cancelled"].includes(current) && time - startleAt >= 0 && time - startleAt < 650;
      if (startled) { face = "concern"; bubble = "唔！"; phrase = "唔，我回神啦，接着陪你忙"; }
      const toolError = !view && gapTime < toolErrorUntil && busy && !actualAwaitingUser && !compacting &&
        !["waiting", "speaking", "cancelled", "error", "success"].includes(current);
      if (toolError) {
        face = "error"; bubble = bubbles.error || "!";
        phrase = (phrases.error || [labelFor("error")])[0];
      }
      const color = toolError || current === "error" ? "error" : current === "success" ? "success" : current === "waiting" || current === "cancelled" ? "warning" : "accent";
      const moving = !["idle", "error", "success", "cancelled"].includes(current);
      const glyph = toolError ? "!" : moving ? SPINNER[Math.floor(elapsed / 160) % SPINNER.length] : current === "success" ? "✓" : current === "error" ? "!" : current === "cancelled" ? "Ⅱ" : "🐾";
      const poked = demo === "all" ? view.reaction === "poked" : nativeInteraction?.kind === "poke" || time - pokeAt >= 0 && time - pokeAt < POKE_DURATION_MS;
      const reactionContext = demo === "all" ? "idle" : pokeContext;
      const listenEligible = demo && demo !== "all" ? current === "idle" || awaitingUser : actual === "idle" || actualAwaitingUser;
      const canListen = listenEligible && !allTools().some((tool) => tool.phase !== "waiting");
      if (!canListen) { typingUntil = -Infinity; listeningActive = false; }
      const actualListening = canListen && time < typingUntil;
      listeningActive = actualListening;
      const listening = demo === "all" ? view.reaction === "listening" : actualListening;
      if (listening) {
        const pool = phrases.listening || ["嗯嗯，我听着呢，你慢慢说呀"];
        phrase = pool[hash(`${seed}:listening`) % pool.length];
        bubble = bubbles.listening || "我听着呢";
        face = blink ? "listen-blink" : "listen";
      }
      if (poked) {
        const pool = phrases[`poke_${reactionContext}`] || [reactionContext === "busy" ? "呜…我在认真看这里呢，等我一下嘛" : reactionContext === "waiting" ? "呜呀，我还在这儿等你呢" : "呜呀！耳朵都被你戳抖啦"];
        phrase = pool[(demo === "all" ? hash(view.epoch) : pokeIndex) % pool.length];
        bubble = bubbles[`poke_${reactionContext}`] || "呜呀！";
        face = "poke";
      }
      let gesture = null;
      const canGesture = !nativeInteraction && !busy && current === "idle" && !demo && !poked && !listening && !startled;
      if (!canGesture) gestureMode = undefined;
      if (canGesture && gestureMode) {
        gesture = gestureAt(gestureMode, time - gestureStarted, gestureDurations());
        if (!gesture && gestureMode !== "all") gestureMode = undefined;
      } else if (canGesture && autoGestures && time - effectiveSince >= 45000) {
        const age = time - effectiveSince - 45000;
        const id = AUTO_GESTURE_IDS[Math.floor(age / 120000) % AUTO_GESTURE_IDS.length];
        gesture = gestureAt(id, age % 120000, gestureDurations());
      }
      if (gesture) { face = gesture.face; phrase = gesture.words[0]; bubble = gesture.labels[0]; }
      if (nativeInteractions && !view && (nativeInteraction?.kind === "welcome" || current === "waking")) {
        face = "idle-open"; bubble = "你来啦"; phrase = "你来啦，我把耳朵竖好咯";
      }
      return {
        gesture, gestureMode, interaction: view ? null : nativeInteraction,
        phase: current, label: toolError ? labelFor("error") : label, phrase, face, bubble, color, glyph, awaitingUser, blink: toolError || startled || poked ? false : blink,
        drowsy: drowsy && !listening, reaction: poked ? "poked" : listening ? "listening" : toolError ? "error" : startled ? "startled" : undefined, visualPhase: toolError ? "error" : pendingNextState?.visualPhase || (holdingWork ? visualWorkPhase : current),
        pendingNextState,
        pokeContext: poked ? reactionContext : undefined, reactionElapsedMs: poked ? demo === "all" ? elapsed : nativeInteraction?.kind === "poke" ? nativeInteraction.elapsedMs : time - pokeAt : undefined, reactionStrength: poked ? reactionContext === "busy" ? .55 : reactionContext === "waiting" ? .8 : 1 : undefined,
        busy, demo: Boolean(demo), toolCount: tools.size + pendingTools.size, toolName: active?.name || "", toolObject: active?.object || "",
        demoMode: demo, demoEpoch: view?.epoch, demoStep: view?.step,
        elapsedMs: busy ? Math.max(0, time - started) : 0, phaseElapsedMs: elapsed,
        // Filmed expressions use their real event clock even if the first
        // render is late. This metadata never extends the underlying state.
        expressionElapsedMs: toolError ? Math.max(0, gapTime - toolErrorAt) : startled ? view ? elapsed : Math.max(0, time - startleAt) : current === 'success' ? view ? elapsed : Math.max(0, time - phaseSince) :
          current === 'waiting' && toolWarningUntil > time ? Math.max(0, time - (toolWarningUntil - 1800)) : undefined,
        intervalMs: gesture ? 50 : current === "speaking" ? 100 : current === "idle" ? 240 : moving ? 160 : 350,
      };
    },
  };
}
