// Shared Pi/DSH gesture modules. Time and translations are host-independent.
import { EXPRESSIONS } from './expressions.mjs';
export const GESTURES = Object.freeze([
  { id: "wave", durationMs: 3200, face: "happy", labels: ["挥挥爪", "Wave"], words: ["嘿，这边这边，我在呢。", "Hey, over here! I'm right here."] },
  { id: "nod", durationMs: 2600, face: "idle-open", labels: ["点点头", "Nod"], words: ["嗯嗯，我听着呀。", "Mm-hm, I'm listening."] },
  { id: "peek", durationMs: 3400, face: "idle-open", labels: ["歪头探看", "Peek"], words: ["嗯？让我也瞧一眼嘛。", "Hm? Let me take a little peek."] },
  { id: "stretch", durationMs: 3800, face: "rest", labels: ["伸懒腰", "Stretch"], words: ["唔——伸伸爪子，舒服啦。", "Mmm—stretching my paws. That's better."] },
  { id: "ear-flick", durationMs: 2600, face: "idle-open", labels: ["抖抖耳朵", "Ear flick"], words: ["嗷，耳朵动了一下，嘿嘿。", "Awoo, little ear twitch. Hehe."] },
  { id: "nuzzle", durationMs: 3000, face: "idle-blink", labels: ["蹭蹭", "Nuzzle"], words: ["呜……蹭一下，就一下嘛。", "Mmm… just one little nuzzle?"] },
  { id: "bounce", durationMs: 2800, face: "happy", labels: ["开心晃晃", "Happy bounce"], words: ["嘿嘿，有你陪着就很开心呀。", "Hehe, happy to have you here."] },
  { id: "head-shake", durationMs: 2800, face: "idle-open", labels: ["晃晃脑袋", "Head sway"], words: ["晃晃脑袋，再打起精神来。", "Little head shake. Ears up again!"] },
  ...EXPRESSIONS.map(e => ({ ...e, durationMs: e.id === 'cry' ? 4200 : 3600 })),
].map((g) => Object.freeze({ ...g, labels: Object.freeze(g.labels), words: Object.freeze(g.words) })));
export const GESTURE_IDS = Object.freeze(GESTURES.map((g) => g.id));
export const AUTO_GESTURE_IDS = Object.freeze(GESTURES.filter(g => !g.face.startsWith('emotion-') || g.automatic).map(g => g.id));
export const GESTURE_PERIOD_MS = GESTURES.reduce((n, g) => n + g.durationMs + 600, 0);
export function gestureById(id) { return GESTURES.find((g) => g.id === id); }
export function gestureDurationMs(id, durations = {}) {
  const supplied = durations?.clips?.[id]?.periodMs ?? durations?.[id]?.periodMs ?? durations?.[id];
  return Number.isInteger(supplied) && supplied >= 80 && supplied <= 15000 ? supplied : gestureById(id)?.durationMs;
}
export function gestureAt(mode, elapsedMs, durations = {}) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (mode !== "all") {
    const g = gestureById(mode), durationMs = gestureDurationMs(mode, durations);
    return g && elapsedMs < durationMs ? { ...g, durationMs, elapsedMs } : null;
  }
  const periodMs = GESTURES.reduce((sum, g) => sum + gestureDurationMs(g.id, durations) + 600, 0);
  let at = elapsedMs % periodMs;
  for (const source of GESTURES) {
    const g = { ...source, durationMs: gestureDurationMs(source.id, durations) };
    if (at < g.durationMs) return { ...g, elapsedMs: at };
    if (at < g.durationMs + 600) return null;
    at -= g.durationMs + 600;
  }
  return null;
}
export function sampleGestureMotion(id, elapsedMs, width = 240) {
  const g = gestureById(id);
  if (!g || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= g.durationMs) return {};
  const u = elapsedMs / g.durationMs;
  // Smooth entry/exit: every module starts and finishes at the neutral pose.
  const ramp = (v) => { const t = Math.max(0, Math.min(1, v)); return t*t*(3-2*t); };
  const e = ramp(u / .16) * ramp((1-u) / .20);
  const s = Math.sin(u * Math.PI * 4), pixels = width / 240;
  const q = (x) => Math.round(x * 8) / 8 || 0;
  const m = { x: 0, y: 0, tilt: 0, scale: 1, earLeft: 0, earRight: 0, pawLeft: 0, pawRight: 0, wave: 0 };
  if (id === "wave") { m.wave = q(s * 1.6 * e); m.tilt = q(s * 3 * e); }
  if (id === "nod") { m.y = q((1-Math.cos(u*Math.PI*4)) * 1.6 * pixels * e); m.scale = 1 - .012*e*(1-Math.cos(u*Math.PI*4)); }
  if (id === "peek") { m.tilt = q(Math.sin(u*Math.PI)*11*e); m.x = q(Math.sin(u*Math.PI)*2*pixels*e); m.earRight = q(-e); }
  if (id === "stretch") { m.scale = 1 + .025*e; m.y = q(-2*pixels*e); m.pawLeft = m.pawRight = q(-1.2*e); }
  if (id === "ear-flick") { m.earLeft = q(Math.sin(u*Math.PI*10)*2.4*e); m.earRight = q(Math.sin(Math.max(0,u-.12)*Math.PI*10)*1.8*e); }
  if (id === "nuzzle") { m.tilt = q(s*7*e); m.x = q(s*2*pixels*e); m.y = q(e*pixels); }
  if (id === "bounce") { m.y = q(-(Math.sin(u*Math.PI*3)**2)*3*pixels*e); m.tilt = q(s*4*e); m.wave=q(s*e); }
  if (id === "head-shake") { m.tilt=q(s*9*e); m.earLeft=q(s*e); m.earRight=q(-s*e); }
  if (g.face.startsWith('emotion-')) {
    // Authored fist/palm silhouettes remain intact. A slow breath and small
    // change of posture carry the expression without applying the old paw rig.
    m.y = q(-(Math.sin(u*Math.PI)**2) * .7 * pixels * e);
    m.tilt = q(Math.sin(u*Math.PI*2) * (['shy','affection','joy'].includes(id) ? 2 : .8) * e);
    m.scale = 1 + .004 * Math.sin(u*Math.PI)**2 * e;
  }
  m.scale = q(m.scale * 1024) / 1024;
  m.scaleAnchorY = .86;
  return m;
}
