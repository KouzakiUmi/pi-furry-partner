// Pi HD owns this integration. DSH transport events and Legacy preparation
// states must never enter the HD timeline through a shared adapter.
import { createActivity } from './activity.mjs';
import { createApprovedMotionPlayer, approvedMotionStaticFrame } from './player.mjs';
export { DEMO_STATES } from './activity.mjs';

export const HD_PI_ACTIVITY_EVENTS = Object.freeze([
  'agent_start', 'message_start', 'message_update', 'message_end',
  'tool_execution_start', 'tool_execution_end', 'agent_before_settle',
  'agent_settled', 'ui_prompt_start', 'ui_prompt_end',
  'session_before_compact', 'session_compact', 'session_compact_failed',
]);
const allowed = new Set([...HD_PI_ACTIVITY_EVENTS, 'session_shutdown']);

export function createPiHdActivity(options = {}) {
  const activity = createActivity(options);
  return {
    ...activity,
    handle(type, event = {}) {
      if (!allowed.has(type)) return false;
      // Partial tool arguments are composition, not execution. Do not start
      // Legacy preparation poses, retain arguments, or extend the tool gap.
      if (type === 'message_update' && event.assistantMessageEvent?.type?.startsWith('toolcall_')) return false;
      activity.handle(type, event);
      return true;
    },
  };
}

export function createPiHdMotionPlayer(options = {}) {
  return createApprovedMotionPlayer({ minimumActionMs: 1200, ...options });
}

// Missing/paused complete motion keeps one authored HD pose. This deliberately
// has no sprite deformation, blending, or dependency on the Legacy player.
export function piHdStaticFrame(sheet, index, options = {}) {
  // Live speech may select an authored mouth cel. Pausing still closes it
  // through the HD static-pose policy; neither path animates the old body rig.
  const selected = options.animate && sheet.frames[index];
  const visual = selected ? {
    frame: selected, cacheKey: `pi-hd-pose:${sheet.approvedStaticRevision || ''}:${selected.id}`,
    nextInMs: Infinity, transitioning: false,
    motion: { x: 0, y: 0, tilt: 0, scale: 1 },
  } : approvedMotionStaticFrame(sheet, index, options);
  return { ...visual, sheet: { ...sheet, frames: [visual.frame], ids: { [visual.frame.id]: 0 } }, frameIndex: 0 };
}
