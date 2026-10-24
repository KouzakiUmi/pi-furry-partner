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
  const phrase = response.kind === "receipt" ? l("我听到啦，小耳朵转过来咯", "I hear you. My ears are all yours!")
    : response.kind === "preparing" ? l("好呀，让我准备一下，马上陪你忙", "I'm getting ready. One little moment!")
    : response.kind === "first-text" ? l("我再琢磨一下，想清楚就讲给你听", "Let me think it through a little more. I'll tell you when I'm ready.")
    : seconds >= 10 ? l("我还在这儿陪你呢，谢谢你等我呀", "I'm still here with you. Thanks for waiting…")
    : l("我听到啦，给我一小会儿…", "I heard you. Give me a little moment…");
  const label = response.kind === "receipt" ? l("我听到啦", "I hear you")
    : response.kind === "preparing" ? l("我准备一下", "Getting ready")
    : response.kind === "first-text" ? l("我想清楚点", "Thinking it through") : l("陪我一下呀", "One little moment");
  return { ...info, phrase, label, responseIndicator: `${label} ${seconds}s`,
    glyph: ["·", "··", "···"][seconds % 3], color: seconds >= 15 ? "warning" : snapshot.color };
}
