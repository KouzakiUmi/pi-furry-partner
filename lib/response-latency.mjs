import { localize } from "./language.mjs";

// Observe local lifecycle events only. A provider hook proves request preparation,
// not that a server has accepted it or that a model is queued remotely.
export function createResponseLatency({ now = Date.now } = {}) {
  let submittedAt, requestAt, firstOutputAt, firstTextAt, waiting = false, turnActive = false;
  const reset = () => { submittedAt = requestAt = firstOutputAt = firstTextAt = undefined; waiting = turnActive = false; };
  const expireInputReceipt = () => {
    // A later input handler may consume the input without starting an agent.
    // Only an actual lifecycle hook confirms an ongoing request.
    if (waiting && !turnActive && now() - submittedAt >= 2500) reset();
  };
  return {
    handle(type, event = {}) {
      const time = now();
      if (type === "input") {
        if (event.source === "interactive" && !turnActive && !event.streamingBehavior) {
          reset(); submittedAt = time; waiting = true;
        }
      } else if (type === "agent_start" || type === "before_agent_start") {
        if (!waiting) reset();
        submittedAt ??= time; turnActive = true; waiting = true;
      } else if (type === "before_provider_request") {
        submittedAt ??= time; requestAt = time; firstOutputAt = firstTextAt = undefined;
        waiting = turnActive = true;
      } else if (type === "message_update") {
        const part = event.assistantMessageEvent || {};
        const meaningful = typeof part.delta === "string" ? part.delta.length > 0 : part.delta !== undefined;
        if ((part.type === "text_delta" || part.type === "thinking_delta") && meaningful) {
          firstOutputAt ??= time;
          if (part.type === "text_delta") { firstTextAt ??= time; waiting = false; }
        } else if (part.type?.startsWith("toolcall_")) { firstOutputAt ??= time; waiting = false; }
      } else if (type === "tool_execution_start" || type === "ui_prompt_start" || type === "session_before_compact") waiting = false;
      else if (type === "message_end" && event.message?.role === "assistant") waiting = false;
      else if (["agent_settled", "session_start", "session_shutdown"].includes(type)) reset();
    },
    isWaiting() { expireInputReceipt(); return waiting; },
    snapshot() {
      expireInputReceipt();
      const elapsedMs = waiting ? Math.max(0, now() - (requestAt ?? submittedAt ?? now())) : 0;
      return { waiting, kind: !waiting ? undefined : !turnActive ? "receipt" : requestAt === undefined ? "preparing" : firstOutputAt === undefined ? "first-output" : "first-text",
        elapsedMs, ttftMs: requestAt !== undefined && firstOutputAt !== undefined ? Math.max(0, firstOutputAt - requestAt) : undefined,
        firstTextMs: requestAt !== undefined && firstTextAt !== undefined ? Math.max(0, firstTextAt - requestAt) : undefined };
    },
  };
}

export function withResponseLatency(snapshot, response, language) {
  const info = { ...snapshot, responseWaitKind: response.kind, responseWaitMs: response.elapsedMs, ttftMs: response.ttftMs, firstTextMs: response.firstTextMs };
  if (!response.waiting || snapshot.demo || snapshot.toolCount || snapshot.awaitingUser || snapshot.reaction || ["error", "cancelled", "compacting"].includes(snapshot.phase)) return info;
  const l = (zh, en) => localize(language, zh, en);
  const seconds = Math.floor(response.elapsedMs / 1000);
  const phrase = response.kind === "receipt" ? l("我收到你的输入啦", "I've received your input.")
    : response.kind === "preparing" ? l("我收到啦，正在准备这次请求", "Got it! I'm getting this request ready.")
    : response.kind === "first-text" ? l("我收到思考内容啦，正文还在路上", "Thinking has started. I'm waiting for the answer text.")
    : seconds >= 10 ? l(`我收到啦，模型还没开口，已经等 ${seconds}s 啦`, `I've got your message. Still waiting for the model's first output (${seconds}s).`)
    : l("我收到啦，正等模型回个话", "Got it! Waiting for the model's first output.");
  const label = response.kind === "receipt" ? l("收到输入", "Input received")
    : response.kind === "preparing" ? l("准备请求", "Preparing request")
    : response.kind === "first-text" ? l("等正文", "Waiting for text") : l("等首个输出", "Waiting for first output");
  return { ...info, phrase, label, responseIndicator: `${label} ${seconds}s`,
    glyph: ["·", "··", "···"][seconds % 3], color: seconds >= 15 ? "warning" : snapshot.color };
}
