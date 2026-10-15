import { POKE_DURATION_MS } from "./poke.mjs";
import { LISTEN_DURATION_MS } from "./listen.mjs";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const LABELS = { idle: "随时开始", waking: "刚刚醒来", thinking: "正在思考", speaking: "正在回答", reading: "读取文件", editing: "修改文件", running: "执行命令", searching: "搜索资料", waiting: "等待下一步", success: "本轮结束", error: "遇到问题", cancelled: "已暂停", compacting: "整理上下文" };
export const DEMO_STATES = Object.keys(LABELS);
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
  if (/read|open|fetch|view/.test(n)) return "reading";
  if (/edit|write|patch|create|save/.test(n)) return "editing";
  if (/search|find|grep|glob|list|^ls$/.test(n)) return "searching";
  return "running";
}
function toolObject(args) {
  // Only show an explicit file/search argument. Commands and arbitrary payloads
  // can include credentials and are deliberately not echoed into the UI.
  const value = args?.path ?? args?.file_path ?? args?.filePath ?? args?.pattern;
  if (typeof value !== "string") return "";
  const compact = value.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/");
  return clean(compact).slice(0, 80);
}

export function createActivity({ phrases = {}, labels = {}, bubbles = {}, rotationMs = 6500, now = Date.now, random = Math.random } = {}) {
  const labelFor = (state) => labels[state] || LABELS[state] || "我在呢";
  let seed = Math.floor(random() * 0x7fffffff), phase = "idle", phaseSince = now(), started = now();
  let busy = false, lastTextAt = -Infinity, streamOpen = false, outcome, terminalUntil = 0;
  let wakeAt = -Infinity, promptDepth = 0, compacting = false, demo, toolWarningUntil = 0;
  let waitingAt = -Infinity, lastCurrent, startleAt = -Infinity;
  let visualWorkUntil = -Infinity, visualWorkPhase = "running";
  let effectiveKey = "", effectiveSince = now(), demoRevision = 0;
  let pokeAt = -Infinity, pokeContext = "idle", pokeIndex = 0;
  let typingUntil = -Infinity, listeningActive = false;
  const tools = new Map();
  const setPhase = (next) => { if (phase !== next) { phase = next; phaseSince = now(); } };
  const wasDozing = () => lastCurrent === "waiting" && now() - waitingAt >= 10000;
  const reset = () => { tools.clear(); promptDepth = 0; compacting = false; streamOpen = false; outcome = undefined; terminalUntil = 0; toolWarningUntil = 0; lastTextAt = -Infinity; demo = undefined; wakeAt = -Infinity; effectiveKey = ""; waitingAt = -Infinity; lastCurrent = undefined; startleAt = -Infinity; visualWorkUntil = -Infinity; typingUntil = -Infinity; listeningActive = false; };

  return {
    start({ isBusy = false, wake = true } = {}) {
      reset(); pokeAt = -Infinity; busy = isBusy; started = now(); phaseSince = now(); phase = isBusy ? "thinking" : "idle";
      if (!isBusy && wake) wakeAt = now();
    },
    poke() {
      const state = this.snapshot();
      pokeContext = state.phase === "waiting" ? "waiting" : state.busy || ["thinking", "speaking", "reading", "editing", "running", "searching", "compacting"].includes(state.phase) ? "busy" : "idle";
      pokeIndex = Math.floor(random() * 0x7fffffff);
      pokeAt = now();
    },
    isPoked() { return now() - pokeAt >= 0 && now() - pokeAt < POKE_DURATION_MS; },
    noteTyping() {
      const state = this.snapshot();
      const eligible = (state.phase === "idle" || state.phase === "waking" && !busy || state.awaitingUser) && ![...tools.values()].some((tool) => tool.phase !== "waiting");
      if (!eligible) return false;
      if (state.phase === "waking") wakeAt = -Infinity;
      typingUntil = now() + LISTEN_DURATION_MS;
      listeningActive = true;
      return true;
    },
    clearTyping() { typingUntil = -Infinity; listeningActive = false; },
    isListening() { return listeningActive && now() < typingUntil; },
    setDemo(next) {
      if (next === "off") { demo = undefined; return; }
      if (!DEMO_STATES.includes(next)) return;
      demo = next; demoRevision++; phaseSince = now(); lastTextAt = now();
    },
    handle(type, event = {}) {
      if (type === "agent_start") {
        const wakeUp = wasDozing() || now() - startleAt < 650;
        reset(); if (wakeUp) startleAt = now();
        busy = true; seed = Math.floor(random() * 0x7fffffff); started = now(); phaseSince = now(); phase = "thinking"; return;
      }
      if (type === "session_shutdown") { reset(); pokeAt = -Infinity; busy = false; phase = "idle"; return; }
      if (type === "ui_prompt_start") { promptDepth++; return; }
      if (type === "ui_prompt_end") {
        if (promptDepth === 1 && wasDozing()) startleAt = now();
        promptDepth = Math.max(0, promptDepth - 1); return;
      }
      if (type === "session_before_compact") { compacting = true; setPhase("compacting"); return; }
      if (type === "session_compact" || type === "session_compact_failed") {
        compacting = false;
        if (type === "session_compact_failed") {
          setPhase(event.aborted ? "cancelled" : "error"); terminalUntil = now() + (event.aborted ? 2200 : 5000);
        } else setPhase(busy ? "thinking" : "idle");
        return;
      }
      if (type === "message_start" && event.message?.role === "assistant") { streamOpen = false; setPhase("thinking"); return; }
      if (type === "message_update") {
        const part = event.assistantMessageEvent?.type || "";
        if (part === "text_start" || part === "text_delta") {
          streamOpen = true; lastTextAt = now(); setPhase("speaking");
        } else if (part === "text_end") { streamOpen = false; setPhase("thinking"); }
        else if (part.startsWith("thinking_") || part.startsWith("toolcall_")) { streamOpen = false; setPhase("thinking"); }
        return;
      }
      if (type === "tool_execution_start") {
        const nextPhase = toolPhase(event.toolName || "");
        tools.set(event.toolCallId, { name: clean(event.toolName), phase: nextPhase, object: toolObject(event.args), started: now() });
        if (["editing", "running"].includes(nextPhase)) { visualWorkUntil = now() + 1200; visualWorkPhase = nextPhase; }
        streamOpen = false; return;
      }
      if (type === "tool_execution_end") {
        tools.delete(event.toolCallId);
        if (event.isError) toolWarningUntil = now() + 1800;
        if (!tools.size) setPhase("thinking");
        return;
      }
      if (type === "message_end" && event.message?.role === "assistant") {
        streamOpen = false;
        if (event.message.stopReason === "error") { setPhase("waiting"); toolWarningUntil = now() + 1800; }
        else if (event.message.stopReason === "aborted") setPhase("cancelled");
        else setPhase("thinking");
        return;
      }
      if (type === "agent_before_settle") { outcome = event.outcome; return; }
      if (type === "agent_settled") {
        busy = false; tools.clear(); streamOpen = false; compacting = false; promptDepth = 0;
        setPhase(event.aborted || outcome === "aborted" ? "cancelled" : outcome === "error" ? "error" : "success");
        terminalUntil = now() + (phase === "error" ? 6000 : 2600);
      }
    },
    snapshot() {
      const time = now();
      if (!busy && terminalUntil && time >= terminalUntil) { terminalUntil = 0; setPhase("idle"); }
      const active = [...tools.values()].at(-1);
      let current = demo || (promptDepth ? "waiting" : compacting ? "compacting" : active ? active.phase : phase);
      const wakeElapsed = time - wakeAt;
      if (!demo && !busy && current === "idle" && wakeElapsed >= 0 && wakeElapsed < 5000) current = "waking";
      const awaitingUser = current === "waiting" && (promptDepth > 0 || active?.phase === "waiting" || demo === "waiting");
      const copyKey = awaitingUser ? "waiting_user" : current;
      const label = labels[copyKey] || labelFor(current);
      if (current !== lastCurrent) {
        if (lastCurrent === "waiting" && time - waitingAt >= 10000 && !["waiting", "error", "cancelled"].includes(current)) startleAt = time;
        if (current === "waiting") waitingAt = time;
        lastCurrent = current;
      }
      const drowsy = current === "waiting" && time - waitingAt >= 10000;
      const key = `${copyKey}:${active?.name || ""}:${active?.object || ""}:${demo ? demoRevision : ""}`;
      if (key !== effectiveKey) { effectiveKey = key; effectiveSince = time; }
      const since = current === "waking" ? (demo ? phaseSince : wakeAt) : effectiveSince;
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
        const activeSpeech = demo === "speaking" || (streamOpen && time - lastTextAt < 900);
        face = activeSpeech ? speechFace(elapsed) : "talk-closed";
        bubble = activeSpeech ? ["·", "··", "···"][pulse % 3] : "·";
      } else if (current === "thinking") { face = blink ? "idle-blink" : "think"; bubble = "·".repeat(pulse % 3 + 1); }
      else if (["reading", "editing", "running", "searching"].includes(current)) { face = current === "searching" ? "search" : current === "running" ? blink ? "watch-blink" : "watch" : blink ? "idle-blink" : "work"; bubble = { reading: "读一读", editing: "改一改", running: "执行中", searching: "找一找" }[current]; }
      else if (current === "compacting") { face = "search"; bubble = ["▱", "▰", "▱"][pulse % 3]; }
      else if (current === "success") { face = "happy"; bubble = "✓"; }
      else if (current === "error") { face = "error"; bubble = "!"; }
      else if (current === "cancelled") { face = "rest"; bubble = "歇一会"; }
      else if (current === "waiting") { face = toolWarningUntil > time ? "concern" : blink ? "wait-blink" : "wait"; bubble = promptDepth ? "到你啦" : "稍等"; }
      else { face = blink ? "idle-blink" : "idle-open"; bubble = "♪"; }
      if (!["waking", "thinking", "speaking"].includes(current) && (bubbles[copyKey] || bubbles[current])) bubble = bubbles[copyKey] || bubbles[current];
      if (awaitingUser && !bubbles.waiting_user) bubble = "我等你呀";
      const holdingWork = !demo && current === "thinking" && time < visualWorkUntil;
      if (holdingWork) { face = visualWorkPhase === "running" ? blink ? "watch-blink" : "watch" : blink ? "work-blink" : "work"; bubble = bubbles[visualWorkPhase] || "我来敲两下"; }
      if (drowsy) { face = "rest"; bubble = ["z", "z · z", "z · z · z"][Math.floor((time - waitingAt - 10000) / 900) % 3]; phrase = awaitingUser ? "你慢慢想，我眯一小会儿陪着你" : "我先眯一小会儿，有回音再接着来"; }
      // This reaction only changes the drawing; the real agent phase stays live.
      const startled = !["waiting", "error", "cancelled"].includes(current) && time - startleAt >= 0 && time - startleAt < 650;
      if (startled) { face = "concern"; bubble = "唔！"; phrase = "唔，我回神啦，接着陪你忙"; }
      const color = current === "error" ? "error" : current === "success" ? "success" : current === "waiting" || current === "cancelled" ? "warning" : "accent";
      const moving = !["idle", "error", "success", "cancelled"].includes(current);
      const glyph = moving ? SPINNER[Math.floor(elapsed / 160) % SPINNER.length] : current === "success" ? "✓" : current === "error" ? "!" : current === "cancelled" ? "Ⅱ" : "🐾";
      const poked = time - pokeAt >= 0 && time - pokeAt < POKE_DURATION_MS;
      const canListen = (current === "idle" || awaitingUser) && ![...tools.values()].some((tool) => tool.phase !== "waiting");
      if (!canListen) { typingUntil = -Infinity; listeningActive = false; }
      const listening = canListen && time < typingUntil;
      listeningActive = listening;
      if (listening) {
        const pool = phrases.listening || ["嗯嗯，我听着呢，你慢慢说呀"];
        phrase = pool[hash(`${seed}:listening`) % pool.length];
        bubble = bubbles.listening || "我听着呢";
        face = blink ? "listen-blink" : "listen";
      }
      if (poked) {
        const pool = phrases[`poke_${pokeContext}`] || [pokeContext === "busy" ? "呜…我在认真看这里呢，等我一下嘛" : pokeContext === "waiting" ? "呜呀，我还在这儿等你呢" : "呜呀！耳朵都被你戳抖啦"];
        phrase = pool[pokeIndex % pool.length];
        bubble = bubbles[`poke_${pokeContext}`] || "呜呀！";
        face = "poke";
      }
      return {
        phase: current, label, phrase, face, bubble, color, glyph, awaitingUser, blink: startled || poked ? false : blink,
        drowsy: drowsy && !listening, reaction: poked ? "poked" : listening ? "listening" : startled ? "startled" : undefined, visualPhase: holdingWork ? visualWorkPhase : current,
        pokeContext: poked ? pokeContext : undefined, reactionElapsedMs: poked ? time - pokeAt : undefined, reactionStrength: poked ? pokeContext === "busy" ? .55 : pokeContext === "waiting" ? .8 : 1 : undefined,
        busy, demo: Boolean(demo), toolCount: tools.size, toolName: active?.name || "", toolObject: active?.object || "",
        elapsedMs: busy ? Math.max(0, time - started) : 0, phaseElapsedMs: elapsed,
        intervalMs: current === "speaking" ? 100 : current === "idle" ? 240 : moving ? 160 : 350,
      };
    },
  };
}
