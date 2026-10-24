// Original-resource Pi actions. Every entry uses an existing simple-frame
// state or poke; no HD gesture catalog, player or artwork is required.
export const ACTIONS = Object.freeze([
  ['idle', 3000, '陪你待着', 'Idle'], ['waking', 6000, '睡醒招呼', 'Wake up'],
  ['thinking', 3500, '想想办法', 'Think'], ['speaking', 4000, '讲给你听', 'Speak'],
  ['reading', 3500, '仔细阅读', 'Read'], ['editing', 3500, '敲敲键盘', 'Edit'],
  ['running', 7400, '放大镜巡看', 'Inspect execution'], ['searching', 7200, '找找线索', 'Search'],
  ['compacting', 7200, '整理资料', 'Organize'], ['waiting', 12500, '等待与打盹', 'Wait and doze'],
  ['success', 3000, '开心收尾', 'Celebrate'], ['error', 3000, '这步卡住啦', 'Oops'],
  ['cancelled', 2000, '先歇一下', 'Rest'], ['poke', 1100, '戳戳回应', 'Poke response'],
].map(([id, durationMs, zh, en]) => Object.freeze({ id, durationMs, labels: Object.freeze([zh, en]) })));
export const ACTION_IDS = Object.freeze(ACTIONS.map(action => action.id));
export const actionById = id => ACTIONS.find(action => action.id === id);
