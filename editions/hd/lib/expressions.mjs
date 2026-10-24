// Authored keyframes shared by Pi and DSH. Labels are local UI, never prompts.
export const EXPRESSIONS = Object.freeze([
  { id: 'joy', labels: ['笑得眯起眼', 'Happy smile'], words: ['嘿嘿，开心都藏不住啦。', 'Hehe, I can’t hide this smile.'], fallback: 'happy', automatic: true },
  { id: 'grumpy', labels: ['叉腰鼓鼓脸', 'Pout'], words: ['哼唔，我就鼓一下脸嘛。', 'Hmph… just a little pout.'], fallback: 'concern' },
  { id: 'sad', labels: ['有点委屈', 'A little sad'], words: ['呜……让我缓一小会儿嘛。', 'Aw… give me a little moment.'], fallback: 'concern' },
  { id: 'cry', labels: ['揉揉眼睛', 'Teary eyes'], words: ['呜，揉揉眼睛就好啦。', 'Sniff… just rubbing my eyes.'], fallback: 'concern' },
  { id: 'shy', labels: ['害羞搓搓爪', 'Shy paws'], words: ['唔，突然这样看着我，会害羞的呀。', 'Mmm, you’re making me a little shy.'], fallback: 'idle-blink', automatic: true },
  { id: 'flustered', labels: ['爪忙脚乱', 'Flustered'], words: ['呜哇，爪子都不知道往哪儿放啦。', 'Wah, where do I put my paws?'], fallback: 'concern' },
  { id: 'surprise', labels: ['诶，吓一小跳', 'Surprised'], words: ['诶？耳朵都跟着竖起来啦。', 'Oh! That perked my ears right up.'], fallback: 'concern' },
  { id: 'proud', labels: ['叉腰小得意', 'A little proud'], words: ['嘿嘿，容我叉一小会儿腰。', 'Hehe, let me enjoy this tiny proud moment.'], fallback: 'happy', automatic: true },
  { id: 'affection', labels: ['喜欢，举爪爪', 'Happy paws'], words: ['喜欢和你待在一起，嘿嘿。', 'I like being here with you. Hehe.'], fallback: 'happy', automatic: true },
].map(e => Object.freeze({ ...e, face: `emotion-${e.id}`, labels: Object.freeze(e.labels), words: Object.freeze(e.words) })));

export function withExpressionFrames(sheet, asset) {
  if (!asset || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length !== EXPRESSIONS.length ||
      !Array.isArray(asset.palette) || asset.palette.length < sheet.palette.length || asset.palette.length > 512 ||
      JSON.stringify(asset.palette.slice(0,sheet.palette.length)) !== JSON.stringify(sheet.palette) ||
      asset.palette.some(c => !Array.isArray(c) || c.length!==3 || c.some(n=>!Number.isInteger(n)||n<0||n>255))) return sheet;
  const expected = new Set(EXPRESSIONS.map(e => e.face));
  const count = sheet.width * sheet.height;
  if (!Number.isSafeInteger(count) || count < 1 || count * asset.frames.length > 6000000) return sheet;
  for (const f of asset.frames) {
    if (!expected.delete(f?.id) || sheet.ids[f.id] !== undefined || !Array.isArray(f.pixels) ||
        f.pixels.length !== count || f.pixels.some(p => !Number.isInteger(p) || p < 0 || p >= asset.palette.length)) return sheet;
  }
  if (expected.size) return sheet;
  const ids = { ...sheet.ids };
  asset.frames.forEach((f, i) => { ids[f.id] = sheet.frames.length + i; });
  return { ...sheet, palette:asset.palette, ids, frames: [...sheet.frames, ...asset.frames] };
}

export function stateExpressionId(snapshot = {}, face = snapshot.face) {
  // Real task phases remain truthful; these only select authored drawings.
  if (!snapshot.gesture && snapshot.phase === 'success' && /^happy/.test(face)) {
    return 'joy';
  }
  if (snapshot.reaction === 'startled' && face === 'concern') return 'surprise';
  if (snapshot.phase === 'waiting' && !snapshot.drowsy && face === 'concern') return 'flustered';
  return null;
}

export function expressionFaceFor(sheet, face, snapshot = {}) {
  const stateId = stateExpressionId(snapshot, face);
  // Ordinary HD remakes retain the original task state's open/blink frames.
  // A new static expression must not collapse both halves to one drawing.
  // Explicit emotion gestures still select their authored emotion-* frame.
  const pairedBase = String(face).replace(/-blink$/, '');
  if (stateId && sheet.ids[face] !== undefined &&
      sheet.ids[pairedBase] !== undefined && sheet.ids[`${pairedBase}-blink`] !== undefined) return face;
  const desired = stateId ? `emotion-${stateId}` : face;
  if (sheet.ids[desired] !== undefined) return desired;
  const fallback = EXPRESSIONS.find(e => e.face === face)?.fallback;
  return fallback && sheet.ids[fallback] !== undefined ? fallback : face;
}
