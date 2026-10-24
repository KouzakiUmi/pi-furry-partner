import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { modules } from "./pi-runtime.mjs";
import { createActivity, DEMO_STATES } from "../lib/activity.mjs";
import { createEditorControls } from "../lib/editor-controls.mjs";
import { activityLine, activityBorder } from "../lib/editor-layout.mjs";
import { createStatusFooter } from "../lib/footer.mjs";
import { createQuickActions, buildUsageDetails } from "../lib/quick-actions.mjs";
import { createChineseAutocompleteFactory } from "../lib/command-chinese.mjs";
import { normalizeLanguage, resolveLanguage, detectSystemLanguage, replaceActivityCopy, localizeSnapshot, nativeChineseEnabled, compactChineseEnabled, compactPromptEnabled, compactPromptFilename, companionName, companionSubtitle, personaFilename, mascotDescription } from "../lib/language.mjs";

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [copy, phrases, englishCopy, englishPhrases] = await Promise.all([
  read("../assets/status-copy.json"), read("../assets/status-phrases.json"), read("../assets/status-copy.en.json"), read("../assets/status-phrases.en.json"),
]);
const checks = [];
const { visibleWidth: terminalWidth } = await import(pathToFileURL(join(modules, "@earendil-works/pi-tui/dist/index.js")).href);
const cjk = /[\u3400-\u9fff]/u;
for (const [value, expected] of [["zh", "zh-CN"], ["ZH-cn", "zh-CN"], ["en", "en"], [" EN ", "en"], ["auto", "auto"], ["en-US", undefined], [undefined, undefined]]) assert.equal(normalizeLanguage(value), expected);
for (const [env, expected] of [
  [{ LC_ALL: "zh_TW.UTF-8", LANG: "en_US.UTF-8" }, "zh-CN"],
  [{ LC_MESSAGES: "en_GB.UTF-8", LANGUAGE: "zh_CN:en" }, "en"],
  [{ LANGUAGE: "zh-HK:en", LANG: "en_US.UTF-8" }, "zh-CN"],
  [{ LANG: "ja_JP.UTF-8" }, "en"], [{ LANG: "C.UTF-8" }, "en"],
  [{ LC_ALL: "", LANG: "zh_CN.UTF-8" }, "zh-CN"],
]) assert.equal(detectSystemLanguage({ env, platform: "linux", readIntlLocale: () => "en-US" }), expected);
let probes = 0;
assert.equal(detectSystemLanguage({ env: {}, platform: "win32", readWindowsLocale: () => { probes++; return "zh-CN"; }, readIntlLocale: () => "en-US" }), "zh-CN");
assert.equal(probes, 1);
assert.equal(detectSystemLanguage({ env: { LANG: "en_US" }, platform: "win32", readWindowsLocale: () => assert.fail("Explicit locale must skip Windows probe") }), "en");
assert.equal(detectSystemLanguage({ env: {}, platform: "win32", readWindowsLocale: () => { throw Error("unavailable"); }, readIntlLocale: () => "zh-Hant-TW" }), "zh-CN");
assert.equal(detectSystemLanguage({ env: {}, platform: "linux", readIntlLocale: () => { throw Error("unavailable"); } }), "en");
assert.equal(resolveLanguage("auto", "en"), "en"); assert.equal(resolveLanguage(undefined, "zh-CN"), "zh-CN");
assert.equal(resolveLanguage("en", "zh-CN"), "en"); assert.equal(resolveLanguage("zh", "en"), "zh-CN");
checks.push("Auto language honors explicit locale priority, Windows UI culture, Intl fallback and safe English fallback; explicit choices override system detection");
for (const language of ["en", "zh-CN"]) for (const chineseUI of [true, false]) for (const compactPrompt of [true, false]) {
  const settings = { language, chineseUI, compactPrompt };
  assert.equal(nativeChineseEnabled(settings), language !== "en" && chineseUI);
  assert.equal(compactChineseEnabled(settings), language !== "en" && compactPrompt);
  assert.equal(compactPromptEnabled(settings), compactPrompt);
  assert.equal(compactPromptFilename(language), language === "en" ? "pi-system-en.md" : "pi-system-zh.md");
  assert.deepEqual(settings, { language, chineseUI, compactPrompt });
}
assert.equal(personaFilename("en"), "umi-persona.en.md"); assert.equal(personaFilename("zh-CN"), "umi-persona.md");
assert.equal(companionName({ language: "en", name: "呜咪" }), "Umi");
assert.equal(companionSubtitle({ language: "en", subtitle: "你的工作搭档" }), "Your coding companion");
assert.equal(companionName({ language: "en", name: "我的伙伴" }), "我的伙伴");
assert.equal(companionSubtitle({ language: "en", subtitle: "CUSTOM 保留" }), "CUSTOM 保留");
checks.push("Language aliases are explicit; native Chinese UI and compact-prompt gates preserve independent preferences; default branding localizes but custom names/subtitles stay exact");

assert.deepEqual(Object.keys(englishCopy.labels).sort(), Object.keys(copy.labels).sort());
assert.deepEqual(Object.keys(englishCopy.bubbles).sort(), Object.keys(copy.bubbles).sort());
assert.deepEqual(Object.keys(englishPhrases.phrases).sort(), Object.keys(phrases.phrases).sort());
for (const key of Object.keys(copy.labels)) {
  assert.ok(englishCopy.labels[key] && !cjk.test(englishCopy.labels[key]));
  assert.ok(englishCopy.bubbles[key] && !cjk.test(englishCopy.bubbles[key]));
  assert.equal(englishPhrases.phrases[key].length, phrases.phrases[key].length);
  assert.ok(englishPhrases.phrases[key].every((text) => text && !cjk.test(text)));
}
for (const [key, bubble] of Object.entries(englishCopy.bubbles)) assert.ok(terminalWidth(bubble) <= 10, `${key} needs two cells of paw clearance on each side`);
for (const bubble of ["唔？", "我醒啦", "你来啦", "唔！", "z", "z · z", "z · z · z"]) {
  const localized = localizeSnapshot({ bubble, phrase: "", drowsy: bubble.startsWith("z") }, "en");
  assert.ok(terminalWidth(localized.bubble) <= 10, `${bubble}: waking and dozing bubbles must keep English paw clearance`);
  assert.ok(!cjk.test(localized.bubble));
}
for (const [key, bubble] of Object.entries({
  preparing_code: "我写代码", preparing_command: "敲命令呀", preparing_question: "我问问呀", preparing_read: "我读读呀",
  preparing_search: "我找找呀", preparing_web: "我搜网页", preparing_tools: "我找工具", preparing_tool: "我准备呀",
})) assert.equal(localizeSnapshot({ bubble, phrase: "" }, "en").bubble, englishCopy.bubbles[key]);
checks.push("All English resource bubbles, including streamed tool preparation, poke/listening extras and hardcoded waking/dozing translations fit ten real terminal cells");
for (const vocabulary of [copy, englishCopy, phrases, englishPhrases]) {
  const text = JSON.stringify(vocabulary);
  assert.doesNotMatch(text, /模型|回包|首个输出|服务端|请求|\b(?:model|token|server|agent|request)\b|first output|answer text/i,
    "Companion narration must not become a third-person backend status report");
}
for (const vocabulary of [phrases, englishPhrases]) for (const key of ["waiting", "waiting_user"]) {
  assert.ok(vocabulary.phrases[key].every((text) => !/读完|找到了|完成了|(?:finished|completed|found it|read the file)/i.test(text)),
    "Waiting copy cannot claim completed work without an actual result");
}
{
  let clock = 2000;
  const sparse = createActivity({ now: () => clock, random: () => .25 });
  sparse.start({ wake: false });
  for (const phase of DEMO_STATES) {
    sparse.setDemo(phase); clock += 2500;
    const chinese = sparse.snapshot(), english = localizeSnapshot(chinese, "en");
    assert.match(chinese.label, /我/, "Missing optional copy still uses Umi's first-person voice");
    assert.ok(!cjk.test([english.label, english.phrase, english.bubble].join("\n")), `${phase}: sparse fallback must localize`);
    assert.equal(english.phase, chinese.phase); assert.equal(english.elapsedMs, chinese.elapsedMs);
  }
}
checks.push("Conversational resources avoid backend narration and premature completion claims; sparse-copy fallbacks retain a first-person voice and localize without changing state or clocks");
const voice = { labels: {}, bubbles: {}, phrases: {} };
replaceActivityCopy(voice, copy, phrases);
let time = 2000;
const activity = createActivity({ ...voice, now: () => time, random: () => .25 });
activity.start({ wake: false }); activity.handle("agent_start");
activity.handle("tool_execution_start", { toolCallId: "keep", toolName: "bash" });
time += 1200;
const prior = activity.snapshot();
const refs = Object.values(voice);
replaceActivityCopy(voice, englishCopy, englishPhrases);
assert.deepEqual(Object.values(voice), refs);
const after = localizeSnapshot(activity.snapshot(), "en");
assert.equal(after.phase, prior.phase); assert.equal(after.elapsedMs, prior.elapsedMs); assert.equal(after.toolCount, 1); assert.equal(after.toolName, "bash");
assert.equal(after.label, englishCopy.labels.running); assert.equal(after.language, "en");
for (const state of DEMO_STATES) {
  activity.setDemo(state);
  for (const age of [0, 1500, 2500, 3500, 4500, 10500]) {
    time += age;
    const value = localizeSnapshot(activity.snapshot(), "en");
    assert.ok(!cjk.test([value.label, value.phrase, value.bubble].join("\n")), `${state} at ${age} leaked Chinese copy`);
    assert.ok(terminalWidth(value.bubble) <= 10, `${state} at ${age}: runtime bubble must leave room beside both paws`);
  }
}
activity.start({ wake: false }); activity.handle("agent_start"); activity.handle("ui_prompt_start"); activity.snapshot(); time += 11000;
assert.equal(localizeSnapshot(activity.snapshot(), "en").drowsy, true);
activity.handle("ui_prompt_end");
assert.equal(localizeSnapshot(activity.snapshot(), "en").reaction, "startled");
assert.ok(!cjk.test(localizeSnapshot(activity.snapshot(), "en").phrase));
replaceActivityCopy(voice, copy, phrases); activity.setDemo("running");
assert.equal(localizeSnapshot(activity.snapshot(), "zh-CN").label, copy.labels.running);
checks.push("Both vocabularies cover every state; in-place language changes preserve active tools/clocks, and waking, dozing, startled and all demo phases have no Chinese fallback text in English");

const visibleWidth = (text) => [...text].reduce((sum, ch) => sum + (cjk.test(ch) || ch === "🐾" ? 2 : 1), 0);
const truncateToWidth = (text, width, ending = "") => {
  if (visibleWidth(text) <= width) return text;
  let out = ""; for (const ch of text) { if (visibleWidth(out + ch + ending) > width) break; out += ch; } return out + (width >= visibleWidth(ending) ? ending : "");
};
const theme = { fg: (_token, text) => text, bold: (text) => text };
let language = "en", mode = "fullscreen";
const controls = createEditorControls({ visibleWidth, getLanguage: () => language, getState: () => ({ mode, hasText: true }) });
for (mode of ["fullscreen", "regular"]) for (let width = 0; width < 181; width++) {
  const text = controls.render(width, theme);
  assert.ok(visibleWidth(text) <= width); assert.ok(!cjk.test(text));
  if (mode === "regular") assert.equal(controls.regions.length, 0);
}
mode = "fullscreen"; assert.ok(controls.render(140, theme).includes("[Send]"));
assert.ok(controls.render(140, theme).includes("[Motion: On]"));
language = "zh-CN"; assert.ok(controls.render(140, theme).includes("[发送]"));
assert.ok(controls.render(140, theme).includes("[表情：开]"));
const pausedControls = createEditorControls({ visibleWidth, getLanguage: () => language, getState: () => ({ mode: "fullscreen", animation: false }) });
assert.ok(pausedControls.render(140, theme).includes("[表情：关]"));
language = "en"; assert.ok(pausedControls.render(140, theme).includes("[Motion: Off]")); pausedControls.dispose();
language = "en";
const running = localizeSnapshot({ ...after, toolCount: 2, toolObject: "" }, language);
assert.ok(activityLine(running, 140, theme, visibleWidth, truncateToWidth).includes("2 tools"));
assert.ok(activityBorder({ snapshot: running, width: 140, hiddenLineCount: 4, theme, visibleWidth, truncateToWidth }).includes("4 lines"));
checks.push("English toolbar and regular-mode keyboard hints fit every width, retain mouse-mode semantics, switch live and localize tool/hidden-line units");

const ctx = { cwd: "/project", model: { id: "test-model", provider: "test", contextWindow: 1000 }, isIdle: () => true,
  sessionManager: { getEntries: () => [], getSessionId: () => "fixture", getCwd: () => "/project" }, getContextUsage: () => undefined, ui: {} };
const footer = createStatusFooter({ ctx, tui: { requestRender() {} }, theme, footerData: {}, visibleWidth, truncateToWidth, getThinkingLevel: () => "high", getLanguage: () => language });
assert.ok(footer.render(140)[0].includes("Thinking high"));
assert.ok(!cjk.test(footer.render(140).join("\n")));
assert.ok(!cjk.test(buildUsageDetails(ctx, () => "high", "en").join("\n")));
assert.ok(buildUsageDetails(ctx, () => "high", "en").some((line) => line.includes("Not reported")));
let selectedTitle, selectedLabels, detailTitle, detailLines;
ctx.ui.select = async (title, labels) => { selectedTitle = title; selectedLabels = labels; return labels.find((label) => /session's usage/.test(label)); };
ctx.ui.notify = () => assert.fail("Unexpected notification");
const actions = createQuickActions({ ctx, pi: {}, getEditor: () => ({}), getLanguage: () => language, showDetails: async (title, lines) => { detailTitle = title; detailLines = lines; } });
assert.equal(await actions.run(), true);
assert.ok(!cjk.test([selectedTitle, ...selectedLabels, detailTitle, ...detailLines].join("\n")));
checks.push("Footer, missing usage/context and the real quick-action menu/read-only panel use English copy without inventing usage or changing tool behavior");

let chineseEnabled = false;
const factory = createChineseAutocompleteFactory({ isEnabled: () => chineseEnabled, getLanguage: () => language });
const provider = factory({ getSuggestions: async () => ({ prefix: "/m", items: [{ value: "mascot", description: mascotDescription("zh-CN") }, { value: "my-command", description: "中文 user command remains" }] }), applyCompletion() {} });
assert.equal((await provider.getSuggestions(["/m"], 0, 2, {})).items[0].description, mascotDescription("en"));
assert.equal((await provider.getSuggestions(["/m"], 0, 2, {})).items[1].description, "中文 user command remains");
language = "zh-CN";
assert.equal((await provider.getSuggestions(["/m"], 0, 2, {})).items[0].description, mascotDescription("zh-CN"), "Companion help follows language even with locale off");
controls.dispose(); actions.dispose(); footer.dispose();
checks.push("The companion's autocomplete description follows language independently from the native locale patch; unrelated custom command text remains exact");

const report = { passed: true, modelRequests: 0, checks };
await writeFile(new URL("./language-validation.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
