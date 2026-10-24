import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Companion language is independent from the optional native Chinese UI patch.
// Unknown values never change saved preferences. User text is not translated.
export const LANGUAGES = ["auto", "zh-CN", "en"];
export function normalizeLanguage(value) {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  return ["zh", "zh-cn"].includes(key) ? "zh-CN" : ["en", "auto"].includes(key) ? key : undefined;
}
function localeLanguage(value) {
  if (typeof value !== "string") return undefined;
  for (const item of value.split(":")) {
    const locale = item.trim().split(/[.@]/, 1)[0].replaceAll("_", "-");
    if (/^(?:C|POSIX)$/i.test(locale)) return "en";
    if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale)) return /^zh(?:-|$)/i.test(locale) ? "zh-CN" : "en";
  }
  return undefined;
}
function windowsUiLocale(env) {
  try {
    const executable = join(env.SystemRoot || env.SYSTEMROOT || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = spawnSync(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[Console]::Out.Write((Get-UICulture).Name)"],
      { encoding: "utf8", timeout: 1500, maxBuffer: 4096, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    return result.status === 0 ? result.stdout.trim() : undefined;
  } catch { return undefined; }
}
export function detectSystemLanguage({ env = process.env, platform = process.platform,
  readWindowsLocale = () => windowsUiLocale(env), readIntlLocale = () => Intl.DateTimeFormat().resolvedOptions().locale } = {}) {
  for (const key of ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"]) {
    const language = localeLanguage(env[key]);
    if (language) return language;
  }
  if (platform === "win32") {
    try { const language = localeLanguage(readWindowsLocale()); if (language) return language; } catch { /* Use Intl below. */ }
  }
  try { return localeLanguage(readIntlLocale()) || "en"; } catch { return "en"; }
}
let detectedLanguage;
export function systemLanguage({ refresh = false } = {}) {
  if (refresh || !detectedLanguage) detectedLanguage = detectSystemLanguage();
  return detectedLanguage;
}
export function resolveLanguage(value, detected) {
  const language = normalizeLanguage(value);
  return language && language !== "auto" ? language : detected || systemLanguage();
}
export const isEnglish = (language) => resolveLanguage(language) === "en";
export const localize = (language, chinese, english) => isEnglish(language) ? english : chinese;
export const nativeChineseEnabled = (settings) => settings.chineseUI && !isEnglish(settings.language);
export const compactChineseEnabled = (settings) => settings.compactPrompt && !isEnglish(settings.language);
export const compactPromptEnabled = (settings) => settings.compactPrompt;
export const compactPromptFilename = (language) => isEnglish(language) ? "pi-system-en.md" : "pi-system-zh.md";
export const personaFilename = (language) => isEnglish(language) ? "umi-persona.en.md" : "wumi-persona.md";
export const companionName = (settings) => isEnglish(settings.language) && settings.name === "呜咪" ? "Umi" : settings.name;
export const companionSubtitle = (settings) => isEnglish(settings.language) && settings.subtitle === "你的工作搭档" ? "Your coding companion" : settings.subtitle;
export const mascotDescription = (language) => localize(language,
  "呜咪：language auto|en|zh-CN · menu · poke · locale/prompt/persona on|off|status · layout · style · demo · pause|play · size · info · render",
  "Umi: language auto|en|zh-CN · menu · poke · locale/prompt/persona on|off|status · layout · style · demo · pause|play · size · info · render");

const REACTION_PHRASES = new Map([
  ["唔，我再眯一小会儿…", "Mmm, just one more little snooze…"],
  ["嗯？我听见你啦", "Hm? I heard you!"],
  ["我醒啦，让我醒醒神呀", "I'm awake! Let me shake off the sleep."],
  ["你来啦，我把耳朵竖好咯", "There you are! You've got my ears."],
  ["我在这儿呢，想做什么就跟我说", "I'm here. Tell me what you'd like to make."],
  ["你慢慢想，我眯一小会儿陪着你", "Take your time. I'll have a tiny snooze beside you."],
  ["我先眯一小会儿，有回音再接着来", "I'll snooze a little while I wait for a reply."],
  ["唔，我回神啦，接着陪你忙", "Oh! I'm back with you. Let's keep going."],
  ["嗯嗯，我听着呢，你慢慢说呀", "I'm all ears. Take your time."],
  ["呜…我在认真看这里呢，等我一下嘛", "Mmm… I'm keeping an eye on this bit. One little moment!"],
  ["呜呀，我还在这儿等你呢", "Eep! I'm still right here with you."],
  ["呜呀！耳朵都被你戳抖啦", "Eep! You made my ears wiggle!"],
]);
// Missing optional vocabulary still speaks as Umi; localization changes text
// only, leaving the real phase, clocks and tool metadata untouched.
const FALLBACK_LABELS = new Map([
  ["我在呢", "I'm here"], ["我醒啦", "I'm awake"], ["我想想呀", "Let me think"],
  ["我讲给你听", "I'll explain"], ["我仔细瞧瞧", "Let me take a look"],
  ["我改改这儿", "Paws busy. I'm on it"], ["我看着这一步呢", "I've got an eye on this"],
  ["我找找线索", "Let me dig around"], ["我再等一会儿", "I'll wait a little longer"],
  ["我先收笔啦", "That's my bit for now"], ["我这步卡住啦", "I've hit a snag"],
  ["我先停下啦", "I've paused"], ["我理理前面聊的", "Let me gather the key bits"],
]);
const REACTION_BUBBLES = new Map([
  ["我写写呀", "Writing it"], ["我写代码", "Coding"], ["敲命令呀", "Command"],
  ["我问问呀", "Asking you"], ["我读读呀", "Reading"], ["我找找呀", "Searching"],
  ["我搜网页", "Web search"], ["我找工具", "Find tools"], ["我准备呀", "Preparing"],
  ["唔？", "Hm?"], ["我醒啦", "I'm up!"], ["你来啦", "Hi!"], ["唔！", "Oh!"],
  ["z · z", "z z"], ["z · z · z", "z z z"],
  ["我瞧瞧", "Let me see"], ["我改改呀", "Paws busy"], ["我看着呢", "I'm on it"],
  ["我翻翻看", "Digging"], ["我停下啦", "Paused"], ["我等你呀", "I'm here"],
  ["我等一会", "One moment"], ["我来敲两下", "Paws busy"], ["我听着呢", "All ears"],
  ["呜呀！", "Eep!"],
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
  return { ...snapshot, language: resolveLanguage(language),
    ...(isEnglish(language) ? {
      label: FALLBACK_LABELS.get(snapshot.label) || snapshot.label,
      phrase: REACTION_PHRASES.get(snapshot.phrase) || FALLBACK_LABELS.get(snapshot.phrase) || snapshot.phrase,
      bubble: REACTION_BUBBLES.get(snapshot.bubble) || snapshot.bubble,
    } : {}) };
}
