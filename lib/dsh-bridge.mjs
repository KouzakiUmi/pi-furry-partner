// Pure state & event bridge mapping DeepSeek Harness (DSH) session events,
// streaming partial blocks, tool calls, interactive prompts, and input drafts
// into pi-furry-partner's activity and response-latency state machines.

import { toolResultFailed } from "./activity.mjs";

export function extractToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      const match = raw.match(/"(path|file_path|filePath|pattern)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (match) return { [match[1]]: match[2] };
    }
  }
  return {};
}

function toolCallFinished(status) {
  return ["completed", "done", "success", "error", "failed", "cancelled", "aborted"].includes(String(status || "running").toLowerCase());
}

function normalizeRunningCalls(runningCalls) {
  const result = new Map();
  if (!runningCalls) return result;
  const entries = Array.isArray(runningCalls)
    ? runningCalls.map((call, idx) => [call?.id || call?.toolCallId || `call-${idx}`, call])
    : runningCalls instanceof Map
      ? [...runningCalls.entries()]
      : typeof runningCalls === "object"
        ? Object.entries(runningCalls)
        : [];
  for (const [key, call] of entries) {
    if (!call || typeof call !== "object") continue;
    if (toolCallFinished(call.status)) continue;
    const id = String(call.id || call.toolCallId || key);
    const toolName = String(call.name || call.toolName || call.tool || "tool");
    const args = extractToolArgs(call.input ?? call.args ?? call.arguments);
    result.set(id, { id, toolName, args });
  }
  return result;
}

function measurePartial(partial) {
  if (!partial || typeof partial !== "object") return { reasoningLen: 0, textLen: 0, toolCalls: [] };
  let reasoningLen = typeof partial.reasoning === "string" ? partial.reasoning.length : 0;
  let textLen = typeof partial.content === "string" ? partial.content.length : typeof partial.text === "string" ? partial.text.length : 0;
  const toolCalls = [];
  if (Array.isArray(partial.blocks)) {
    for (const [idx, block] of partial.blocks.entries()) {
      if (!block || typeof block !== "object") continue;
      const type = String(block.type || "").toLowerCase();
      const content = typeof block.text === "string" ? block.text : typeof block.content === "string" ? block.content : typeof block.thinking === "string" ? block.thinking : "";
      if (type === "thinking" || type === "reasoning") {
        reasoningLen += content.length;
      } else if (type === "text") {
        textLen += content.length;
      } else if (type === "tool_use" || type === "tool_call" || type === "toolcall") {
        toolCalls.push({
          id: String(block.id || block.toolCallId || `partial-tool-${idx}`),
          name: String(block.name || block.toolName || "tool"),
          input: block.input ?? block.args,
          status: block.status || "running",
        });
      }
    }
  }
  return { reasoningLen, textLen, toolCalls };
}

export function createDshBridge({ activity, responseLatency }) {
  let activeSessionId;
  let turnActive = false;
  let compacting = false;
  let promptWaiting = false;
  let lastReasoningLen = 0;
  let lastTextLen = 0;
  let lastDraft = "";
  const activeTools = new Map();
  // Keep only id/name for partial calls: their streamed input can be private.
  const pendingTools = new Map();

  function clearTurnTrackers() {
    for (const id of activeTools.keys()) {
      activity.handle("tool_execution_end", { toolCallId: id, isError: false });
    }
    activeTools.clear();
    for (const id of pendingTools.keys()) activity.handle("tool_call_cancelled", { toolCallId: id });
    pendingTools.clear();
    if (lastTextLen > 0) {
      activity.handle("message_update", { assistantMessageEvent: { type: "text_end" } });
    }
    lastReasoningLen = 0;
    lastTextLen = 0;
  }

  function startTurn() {
    if (turnActive) return;
    turnActive = true;
    lastReasoningLen = 0;
    lastTextLen = 0;
    activity.clearTyping();
    responseLatency?.handle("agent_start");
    responseLatency?.handle("before_provider_request");
    activity.handle("agent_start");
  }

  function settleTurn(reason = {}) {
    if (!turnActive && !compacting && activeTools.size === 0 && pendingTools.size === 0) return;
    clearTurnTrackers();
    if (promptWaiting) {
      promptWaiting = false;
      activity.handle("ui_prompt_end");
    }
    turnActive = false;
    compacting = false;
    const kind = String(reason?.kind || reason?.outcome || reason || "complete").toLowerCase();
    const isAborted = ["interrupted", "cancelled", "canceled", "aborted", "abort"].includes(kind) || Boolean(reason?.aborted);
    const isError = ["error", "failed", "failure"].includes(kind) || Boolean(reason?.error);
    const outcome = isAborted ? "aborted" : isError ? "error" : "completed";
    activity.handle("agent_before_settle", { outcome });
    activity.handle("agent_settled", { aborted: isAborted });
    responseLatency?.handle("agent_settled");
  }

  return {
    getActiveSessionId() {
      return activeSessionId;
    },

    handleSessionEvent(entry) {
      if (!entry || typeof entry !== "object") return;
      if (entry.event) entry = { ...entry.event, sessionId: entry.sessionId ?? entry.event.sessionId };
      if (entry.sessionId && activeSessionId && entry.sessionId !== activeSessionId) return;
      if (entry.sessionId && !activeSessionId) activeSessionId = entry.sessionId;
      const type = String(entry.type || "");
      const data = entry.data || {};

      if (type === "turn/start") {
        startTurn();
        return;
      }
      if (type === "turn/end") {
        settleTurn(data.reason || data);
        return;
      }
      if (type === "tool/call" || type === "tool/ptc-dispatch-start") {
        startTurn();
        const id = String(data.callId || data.subCallId || data.id || "");
        if (id && !activeTools.has(id)) {
          const toolName = String(data.name || data.toolName || "tool");
          const args = extractToolArgs(data.arguments ?? data.input ?? data.args);
          activeTools.set(id, { id, toolName, args });
          responseLatency?.handle("tool_execution_start");
          activity.handle("tool_execution_start", { toolCallId: id, toolName, args });
        }
        return;
      }
      if (type === "tool/result" || type === "tool/ptc-dispatch") {
        const result = data.message || data;
        const id = String(data.subCallId || result.toolCallId || result.callId || data.toolCallId || data.callId || "");
        const ended = activeTools.get(id);
        if (ended) {
          activeTools.delete(id);
          activity.handle("tool_execution_end", { toolCallId: id,
            isError: toolResultFailed({ toolName: ended.toolName, isError: result.isError, result }) });
        }
        return;
      }
      if (type === "assistant/live-chunk") {
        const chunk = data.chunk;
        if (!chunk) return;
        startTurn();
        let part;
        if (chunk.type === "text-delta" && typeof chunk.text === "string" && chunk.text.length > 0) part = { type: "text_delta", delta: chunk.text };
        else if (chunk.type === "reasoning-delta" && typeof chunk.text === "string" && chunk.text.length > 0) part = { type: "thinking_delta", delta: chunk.text };
        // Block boundaries are placeholders, not evidence of new content.
        // In particular a tool block must never impersonate reasoning.
        else if (chunk.type === "block-start" && chunk.blockType === "text") part = { type: "text_start" };
        else if (chunk.type === "block-start" && ["thinking", "reasoning"].includes(chunk.blockType)) part = { type: "thinking_start" };
        else if (chunk.type === "block-end" && chunk.block?.type === "text") part = { type: "text_end" };
        if (part) {
          responseLatency?.handle("message_update", { assistantMessageEvent: part });
          activity.handle("message_update", { assistantMessageEvent: part });
        }
        return;
      }
      if (type === "assistant/message") {
        const blocks = data.message?.content || [];
        const text = blocks.filter(block => block.type === "text").map(block => block.text || "").join("");
        if (text) {
          startTurn();
          const part = { type: "text_delta", delta: text.slice(0, 32) };
          responseLatency?.handle("message_update", { assistantMessageEvent: part });
          activity.handle("message_update", { assistantMessageEvent: part });
        }
        return;
      }
      if (type === "step/start") {
        startTurn();
        activity.handle("message_start", { message: { role: "assistant" } });
        return;
      }

      if (type === "compaction/start") {
        if (!compacting) {
          compacting = true;
          responseLatency?.handle("session_before_compact");
          activity.handle("session_before_compact");
        }
        return;
      }
      if (type === "compaction/end" || type === "compaction/complete") {
        if (compacting) {
          compacting = false;
          activity.handle("session_compact");
        }
        return;
      }
      if (type === "compaction/error" || type === "compaction/failed") {
        compacting = false;
        activity.handle("session_compact_failed", { aborted: Boolean(data.aborted) });
      }
    },

    syncConversationState(state = {}) {
      const nextSessionId = state.sessionId ?? activeSessionId;
      if (nextSessionId && nextSessionId !== activeSessionId) {
        activeSessionId = nextSessionId;
        activeTools.clear();
        pendingTools.clear();
        lastReasoningLen = 0;
        lastTextLen = 0;
        lastDraft = "";
        promptWaiting = false;
        compacting = false;
        const status = String(state.status || "").toLowerCase();
        const isBusy = Boolean(
          state.busy ||
          ["thinking", "tool_calling", "running", "streaming", "compacting"].includes(status) ||
          state.partial
        );
        turnActive = isBusy;
        responseLatency?.handle("session_start");
        if (isBusy) {
          responseLatency?.handle("agent_start");
          responseLatency?.handle("before_provider_request");
        }
        activity.start({ isBusy, wake: false });
      }

      const status = String(state.status || "").toLowerCase();
      const partialInfo = measurePartial(state.partial);
      const tracksTools = state.runningCalls !== undefined || state.partial !== undefined || typeof state.status === "string";
      const nextTools = tracksTools ? normalizeRunningCalls(state.runningCalls) : new Map(activeTools);
      const partialTools = new Map(partialInfo.toolCalls.filter(call => !toolCallFinished(call.status)).map((call) => [call.id, call]));
      for (const [id, call] of partialTools) {
        if (nextTools.has(id)) continue;
        const pending = pendingTools.get(id);
        // Legacy DSH may never publish runningCalls: only promote a previously
        // observed partial call whose later snapshot explicitly says running.
        if (state.runningCalls === undefined && (pending || activeTools.has(id)) && String(call.status).toLowerCase() === "running") {
          nextTools.set(id, activeTools.get(id) || { id, toolName: call.name, args: extractToolArgs(call.input) });
          continue;
        }
        if (activeTools.has(id)) continue;
        pendingTools.set(id, { id, toolName: call.name });
        const synthetic = { type: "toolCall", id, name: call.name };
        activity.handle("message_update", { assistantMessageEvent: {
          type: pending ? "toolcall_delta" : "toolcall_start", contentIndex: 0,
          partial: { role: "assistant", content: [synthetic] },
        } });
      }
      for (const id of [...pendingTools.keys()]) {
        if (!partialTools.has(id) && !nextTools.has(id) && !activeTools.has(id)) {
          pendingTools.delete(id);
          activity.handle("tool_call_cancelled", { toolCallId: id });
        }
      }

      const isCompacting = Boolean(state.compacting || status === "compacting");
      const hasPrompt = Boolean(state.pendingInteraction || state.pendingQuestion || state.awaitingUser);
      const isBusy = Boolean(
        state.busy !== undefined
          ? state.busy
          : ["thinking", "tool_calling", "running", "streaming", "compacting"].includes(status) ||
            state.partial != null ||
            nextTools.size > 0
      );

      if (isBusy && !turnActive) {
        startTurn();
      }

      const tracksCompaction = typeof state.status === "string" || Object.hasOwn(state, "compacting");
      if (tracksCompaction && isCompacting !== compacting) {
        compacting = isCompacting;
        if (compacting) {
          responseLatency?.handle("session_before_compact");
          activity.handle("session_before_compact");
        } else {
          activity.handle("session_compact");
        }
      }

      const tracksPrompt = typeof state.status === "string" || ["pendingInteraction", "pendingQuestion", "awaitingUser"].some(key => Object.hasOwn(state, key));
      if (tracksPrompt && hasPrompt !== promptWaiting) {
        promptWaiting = hasPrompt;
        if (promptWaiting) {
          responseLatency?.handle("ui_prompt_start");
          activity.handle("ui_prompt_start");
        } else {
          activity.handle("ui_prompt_end");
        }
      }

      // Diff running tools
      for (const [id] of activeTools) {
        if (!nextTools.has(id)) {
          activeTools.delete(id);
          const failedIds = state.failedToolIds;
          const isError = Array.isArray(failedIds) ? failedIds.includes(id) : Boolean(failedIds?.[id]);
          activity.handle("tool_execution_end", { toolCallId: id, isError });
        }
      }
      for (const [id, tool] of nextTools) {
        if (!activeTools.has(id)) {
          pendingTools.delete(id);
          activeTools.set(id, tool);
          responseLatency?.handle("tool_execution_start");
          activity.handle("tool_execution_start", {
            toolCallId: id,
            toolName: tool.toolName,
            args: tool.args,
          });
        }
      }

      // Diff streaming partial content
      if (state.partial) {
        if (partialInfo.textLen > lastTextLen) {
          const delta = "x".repeat(Math.min(32, partialInfo.textLen - lastTextLen));
          responseLatency?.handle("message_update", {
            assistantMessageEvent: { type: "text_delta", delta },
          });
          activity.handle("message_update", {
            // Length growth proves actual text arrived, even for the first partial.
            assistantMessageEvent: { type: "text_delta", delta },
          });
          lastTextLen = partialInfo.textLen;
        } else if (partialInfo.reasoningLen > lastReasoningLen) {
          const delta = "x".repeat(Math.min(32, partialInfo.reasoningLen - lastReasoningLen));
          responseLatency?.handle("message_update", {
            assistantMessageEvent: { type: "thinking_delta", delta },
          });
          activity.handle("message_update", {
            assistantMessageEvent: { type: "thinking_delta", delta },
          });
          lastReasoningLen = partialInfo.reasoningLen;
        }
      } else if (lastTextLen > 0 || lastReasoningLen > 0) {
        if (lastTextLen > 0) {
          activity.handle("message_update", { assistantMessageEvent: { type: "text_end" } });
        }
        lastTextLen = 0;
        lastReasoningLen = 0;
      }

      if (!isBusy && turnActive) {
        settleTurn(state.turnEndReason || (state.error ? { kind: "error" } : { kind: "complete" }));
      }
    },

    syncInputDraft(draft, { submitted = false } = {}) {
      const text = typeof draft === "string" ? draft : "";
      if (text === lastDraft && !submitted) return;
      const previous = lastDraft;
      lastDraft = text;
      if (submitted || (text === "" && previous.trim().length > 0 && turnActive)) {
        activity.clearTyping();
        if (submitted) {
          responseLatency?.handle("input", { source: "interactive", text: previous || text });
        }
        return;
      }
      if (text.trim().length > 0) {
        if (text !== previous) activity.noteTyping();
      } else {
        activity.clearTyping();
      }
    },

    noteInputSubmitted(text = "") {
      lastDraft = "";
      activity.clearTyping();
      responseLatency?.handle("input", { source: "interactive", text: String(text || "") });
    },

    reset() {
      activeSessionId = undefined;
      turnActive = false;
      compacting = false;
      promptWaiting = false;
      lastReasoningLen = 0;
      lastTextLen = 0;
      lastDraft = "";
      activeTools.clear();
      pendingTools.clear();
      responseLatency?.handle("session_shutdown");
      activity.handle("session_shutdown");
    },
  };
}
