// User-facing question scenes. Tool registration and payloads stay untouched.
import { resolveLanguage } from './language.mjs';
export function dshSceneTitle(snapshot = {}, language = 'auto') {
  const tool = String(snapshot.toolName || '');
  if (!tool) return '';
  if (!/ask[_-]?user|question|prompt/i.test(tool))
    return tool + (snapshot.toolObject ? ' · ' + snapshot.toolObject : '');
  const en = resolveLanguage(language) === 'en';
  if (snapshot.reaction === 'startled' || ['waking', 'startled'].includes(snapshot.phase))
    return en ? 'Oh! I heard you.' : '嗯？我听见啦';
  if (snapshot.reaction === 'listening' || snapshot.phase === 'listening')
    return en ? 'Mm-hm, I am listening.' : '嗯嗯，你说，我听着呢';
  if (snapshot.drowsy || snapshot.phase === 'dozing')
    return en ? 'Mmm, just a little snooze.' : '唔，我再眯一小会儿';
  return en ? 'I would love to hear your thoughts.' : '我想听听你的想法';
}
