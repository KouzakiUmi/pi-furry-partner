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
]);
const REACTION_BUBBLES = new Map([
  ["唔？", "Hm?"], ["我醒啦", "I'm up!"], ["你来啦", "Hi!"], ["唔！", "Oh!"],
  ["z · z", "z z"], ["z · z · z", "z z z"],
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
      phrase: REACTION_PHRASES.get(snapshot.phrase) || snapshot.phrase,
      bubble: REACTION_BUBBLES.get(snapshot.bubble) || snapshot.bubble,
    } : {}) };
}
