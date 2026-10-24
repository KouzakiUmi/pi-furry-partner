import { gestureById, gestureDurationMs } from "./gestures.mjs";

// Local desktop-pet behaviour. Never sends prompts or changes agent state.
const PET_LINES = {
  hello: [["嘿嘿，我在这儿陪你呀。", "Hey, I'm right here with you."], ["耳朵竖好啦，今天想做什么？", "Ears up! What are we making today?"]],
  stretch: [["唔——伸个懒腰，再陪你一会儿。", "Mmm—little stretch. Staying right here."], ["我挪挪爪子，你继续呀。", "Just stretching my paws. Take your time."]],
  curious: [["嗯？想到什么好玩的了吗？", "Hm? Got a fun idea?"], ["我探个头，嘿嘿，没有催你哦。", "Just peeking over. No rush, hehe."]],
  pat: [["呜……这个力度刚刚好，再摸一下嘛。", "Mmm… that's just right. One more head pat?"], ["嘿嘿，耳朵都要被你摸软啦。", "Hehe, you're making my ears go all floppy."]],
  busyPat: [["嗯嗯，收到摸摸啦，我先把这里看好哦。", "Mm-hm, head pat received. Keeping an eye on this first."], ["嘿嘿，等我忙完再蹭蹭你。", "Hehe, I'll nuzzle you when I'm done here."]],
  return: [["回来啦？我给你留着位置呢。", "You're back! Saved your spot."], ["嗷呜，欢迎回来，接着一起吧。", "Awoo, welcome back. Let's pick up together."]],
  rest: [["盯了好一会儿啦，要不要一起伸伸爪？", "We've been here a while. Little stretch together?"], ["我去喝口水，你也歇歇眼睛嘛。", "Water break for me. Rest your eyes a little too?"]],
};

export function createDesktopCompanion({ now = () => performance.now(), random = Math.random, gestureDurations = () => ({}) } = {}) {
  let nextAt = now() + 45000, lastInteraction = -Infinity, lastReturn = -Infinity;
  let current = null, serial = 0, count = 0, restAt = now() + 30 * 60000;
  let pointerX = null, strokeDistance = 0, strokeAt = -Infinity;
  function clear() { current = null; }
  function start(kind, busy = false) {
    const key = kind === "pat" && busy ? "busyPat" : kind;
    const actions = { hello: "wave", curious: "peek", pat: "affection", return: "wave", rest: "stretch" };
    const gesture = gestureById(actions[kind] || kind);
    const pool = PET_LINES[key] || [gesture.words];
    current = { id: ++serial, kind, lines: pool[Math.floor(random() * pool.length)], startedAt: now(), until: now() + (busy ? 5200 : Math.max(5200, gestureDurationMs(gesture.id, gestureDurations()))), gestureId: busy ? null : gesture.id, busy };
    lastInteraction = now();
    return current;
  }
  return {
    tick({ mode = "gentle", enabled = true, visible = true, minimized = false, animation = true, busy = false, phase = "idle", reaction, demo = false } = {}) {
      const time = now();
      if (current?.gestureId && !current.busy) current.until = current.startedAt + Math.max(5200, gestureDurationMs(current.gestureId, gestureDurations()));
      if (!enabled || !visible || minimized || !animation || demo) { clear(); return null; }
      if (current && (time >= current.until || (busy && !current.busy) || reaction)) clear();
      const idle = !busy && phase === "idle" && !reaction;
      if (mode === "off") { if (current?.kind !== "pat") clear(); return current; }
      if (idle && !current && time >= nextAt && time - lastInteraction > 20000) {
        const idleActions = ["hello", "stretch", "curious", "ear-flick", "nod", "nuzzle", "bounce", "head-shake", "joy", "shy", "proud", "affection"];
        const kind = time >= restAt ? "rest" : idleActions[count++ % idleActions.length];
        if (kind === "rest") restAt = time + 30 * 60000;
        start(kind);
        nextAt = time + (mode === "lively" ? 45000 : 100000) + random() * 40000;
      }
      // Do not queue greetings behind a long-running task.
      if (!idle) nextAt = Math.max(nextAt, time + 20000);
      return current;
    },
    stroke(x, { busy = false, allowed = true } = {}) {
      const time = now();
      if (!allowed || !Number.isFinite(x)) { pointerX = null; strokeDistance = 0; return false; }
      if (time - strokeAt > 1200) strokeDistance = 0;
      if (pointerX !== null) strokeDistance += Math.min(35, Math.abs(x - pointerX));
      pointerX = x; strokeAt = time;
      if (strokeDistance < 100 || time - lastInteraction < 8000) return false;
      strokeDistance = 0;
      start("pat", busy);
      return true;
    },
    leave() { pointerX = null; strokeDistance = 0; },
    returned({ awayMs, allowed = true } = {}) {
      if (!allowed || awayMs < 60000 || now() - lastReturn < 5 * 60000) return false;
      lastReturn = now(); start("return"); return true;
    },
    interrupt() { clear(); lastInteraction = now(); nextAt = now() + 45000; },
  };
}
