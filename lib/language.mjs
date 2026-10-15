// Companion language is independent from the optional native Chinese UI patch.
// Unknown values never change saved preferences. User text is not translated.
export const LANGUAGES = ["zh-CN", "en"];
export function normalizeLanguage(value) {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  return ["zh", "zh-cn"].includes(key) ? "zh-CN" : key === "en" ? "en" : undefined;
}
export const isEnglish = (language) => normalizeLanguage(language) === "en";
export const localize = (language, chinese, english) => isEnglish(language) ? english : chinese;
export const nativeChineseEnabled = (settings) => settings.chineseUI && !isEnglish(settings.language);
export const compactChineseEnabled = (settings) => settings.compactPrompt && !isEnglish(settings.language);
export const personaFilename = (language) => isEnglish(language) ? "umi-persona.en.md" : "wumi-persona.md";
export const companionName = (settings) => isEnglish(settings.language) && settings.name === "呜咪" ? "Umi" : settings.name;
export const companionSubtitle = (settings) => isEnglish(settings.language) && settings.subtitle === "你的工作搭档" ? "Your coding companion" : settings.subtitle;
export const mascotDescription = (language) => localize(language,
  "呜咪：language en|zh-CN · menu · locale/prompt/persona on|off|status · layout · style · demo · pause|play · size · info · render",
  "Umi: language en|zh-CN · menu · locale/prompt/persona on|off|status · layout · style · demo · pause|play · size · info · render");

const REACTION_PHRASES = new Map([
  ["唔，我再眯一小会儿…", "Mmm, just one more little snooze…"],
  ["嗯？我听见你啦", "Hm? I heard you!"],
  ["我醒啦，让我醒醒神呀", "I'm awake! Let me shake off the sleep."],
  ["你来啦，我把耳朵竖好咯", "There you are! You've got my ears."],
  ["我在这儿呢，想做什么就跟我说", "I'm here. Tell me what you'd like to make."],
  ["你慢慢想，我眯一小会儿陪着你", "Take your time. I'll have a tiny snooze beside you."],
  ["我先眯一小会儿，有回音再接着来", "I'll snooze a little while I wait for a reply."],
  ["唔，我回神啦，接着陪你忙", "Oh! I'm back with you. Let's keep going."],
]);
const REACTION_BUBBLES = new Map([
  ["唔？", "Hm?"], ["我醒啦", "I'm up!"], ["你来啦", "Hi!"], ["唔！", "Oh!"],
]);

// Activity owns its clocks/tool events. Update only its injected vocabulary so a
// language switch cannot reset elapsed time, drop active tools or fake a turn.
export function replaceActivityCopy(target, copy, phrases) {
  for (const [key, source] of [["labels", copy.labels], ["bubbles", copy.bubbles], ["phrases", phrases.phrases]]) {
    for (const old of Object.keys(target[key])) delete target[key][old];
    Object.assign(target[key], source);
  }
}
export function localizeSnapshot(snapshot, language) {
  if (!snapshot) return snapshot;
  return { ...snapshot, language: normalizeLanguage(language) || "zh-CN",
    ...(isEnglish(language) ? {
      phrase: REACTION_PHRASES.get(snapshot.phrase) || snapshot.phrase,
      bubble: REACTION_BUBBLES.get(snapshot.bubble) || snapshot.bubble,
    } : {}) };
}
