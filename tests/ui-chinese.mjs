import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { installChineseUi, SUPPORTED_UI_PI_VERSIONS } from "../lib/ui-chinese.mjs";

assert.deepEqual(SUPPORTED_UI_PI_VERSIONS, ["1.2.0", "1.3.0", "1.4.0"],
  "Only the explicitly reviewed releases are enabled");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const agent = join(modules, "@earendil-works/pi-coding-agent"), load = (file) => import(pathToFileURL(file).href);
const agentUI = await load(join(agent, "dist/index.js")), tuiUI = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const theme = await load(join(agent, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agent, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agent, "dist/core/keybindings.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
theme.setThemeJsonValidator(validateThemeJson); theme.initTheme("dark", false);
const keys = new KeybindingsManager(); tuiUI.setKeybindings(keys);
const text = (component, width = 140) => component.render(width).map(stripTerminalSequences).join("\n");
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const model = { provider: "Theme", id: "Thinking Level", name: "No", api: "test", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 10000 };
const config = {
  autoCompact: true, defaultModel: "Theme/Thinking Level", currentModel: model, availableDefaultModels: [model],
  showImages: true, imageWidthCells: 60, autoResizeImages: true, blockImages: false, enableSkillCommands: true,
  steeringMode: "one-at-a-time", followUpMode: "one-at-a-time", transport: "auto", sessionShareDestination: "auto", httpIdleTimeoutMs: 300000, cacheWarmingMode: "streaming",
  thinkingLevel: "medium", availableThinkingLevels: ["off", "low", "medium", "high"], modelThinkingLevels: {},
  currentTheme: "Thinking Level", terminalTheme: "dark", availableThemes: ["Thinking Level", "Theme", "dark"],
  hideThinkingBlock: false, mermaidRenderingMode: "streaming", showCacheMissNotices: false, collapseChangelog: true,
  enableInstallTelemetry: false, doubleEscapeAction: "tree", treeFilterMode: "default", showHardwareCursor: true,
  editorPaddingX: 0, outputPad: 1, autocompleteMaxVisible: 5, quietStartup: false, defaultProjectTrust: "ask",
  clearOnShrink: false, showTerminalProgress: false, tuiMode: "regular", fullscreenExitOutput: "transcript",
  fullscreenScrollbar: "auto", fullscreenCopyOnSelect: true, fullscreenWheelScrollLines: "auto", warnings: { anthropicExtraUsage: true },
};
const events = [], callbacks = new Proxy({}, { get: (_, key) => (...args) => events.push({ key, args }) });
const native = new agentUI.SettingsSelectorComponent(config, callbacks), list = native.getSettingsList();
const originalItems = list.items, originalFiltered = list.filteredItems, originalSerialized = JSON.stringify(originalItems);
const before = text(native); assert.ok(before.includes("Auto-compact"));
let enabled = true;
const targets = [tuiUI.Text, tuiUI.TruncatedText, tuiUI.SettingsList, tuiUI.SelectList, ...["SettingsSelectorComponent", "ThinkingSelectorComponent", "ModelSelectorComponent", "SessionSelectorComponent", "TreeSelectorComponent", "ThemeSelectorComponent", "OAuthSelectorComponent", "LoginDialogComponent", "ExtensionSelectorComponent", "ExtensionInputComponent", "ExtensionEditorComponent"].map((name) => agentUI[name])].filter(Boolean);
const originalDescriptors = targets.map((Class) => [Class.prototype, Object.getOwnPropertyDescriptor(Class.prototype, "render")]);
const originalSearchDescriptors = [[agentUI.SettingsSelectorComponent.prototype, "getSettingsList"], ...["handleInput", "applyFilter", "addHintLine"].map((key) => [tuiUI.SettingsList.prototype, key])].map(([prototype, key]) => [prototype, key, Object.getOwnPropertyDescriptor(prototype, key)]);
const plainTextRender = tuiUI.Text.prototype.render;
const checks = [], selectors = [];
let patch;
const assertWidths = (component) => {
  for (const width of [12, 18, 24, 40, 70, 100, 140]) for (const row of component.render(width)) assert.ok(tuiUI.visibleWidth(row) <= width, `${component.constructor.name} overflow at ${width}`);
};
try {
  patch = installChineseUi({ agentUI, tuiUI, version, isEnabled: () => enabled });
  assert.equal(patch.coverage.supported, true); assert.ok(patch.coverage.classes.includes("SettingsSelectorComponent"));
  assert.ok(text(native).includes("自动压缩上下文") && text(native).includes("Enter/Space 更改"));
  assert.equal(list.items, originalItems); assert.equal(list.filteredItems, originalFiltered); assert.equal(JSON.stringify(list.items), originalSerialized);
  list.selectItem("tui-mode"); const ui = text(native); assert.ok(ui.includes("界面模式") && ui.includes("regular"));
  list.handleInput("\r"); assert.deepEqual(events.at(-1), { key: "onTuiModeChange", args: ["fullscreen"] });
  assert.equal(list.items.find((item) => item.id === "tui-mode").currentValue, "fullscreen");
  list.selectItem("autocompact"); assertWidths(native);
  checks.push("Real native settings translate labels/descriptions before layout and Chinese hints at narrow widths; item/filtered identities and saved enum values stay native, with Enter still saving fullscreen");

  // InteractiveMode focuses getSettingsList(), rather than calling an input
  // method on SettingsSelector itself. Exercise that exact native route before
  // this new component has even rendered once.
  const searchNative = new agentUI.SettingsSelectorComponent(config, callbacks), searchable = searchNative.getSettingsList();
  const searchItems = searchable.items, searchSnapshot = JSON.stringify(searchItems);
  const query = (value) => { searchable.searchInput.setValue(value); searchable.handleInput(""); return searchable.filteredItems; };
  assert.deepEqual(query("界面模式").map((item) => item.id), ["tui-mode"]);
  assert.equal(searchable.searchInput.getValue(), "界面模式"); assert.ok(searchable.filteredItems.every((item) => searchItems.includes(item)));
  searchable.handleInput("\x1b[B"); searchable.handleInput("\x1b[A"); searchable.handleInput("\r");
  assert.deepEqual(events.at(-1), { key: "onTuiModeChange", args: ["fullscreen"] });
  assert.equal(searchable.items.find((item) => item.id === "tui-mode").currentValue, "fullscreen");
  assert.ok(query("原生滚动记录").some((item) => item.id === "tui-mode"), "Chinese descriptions also supply aliases for native settings");
  const expectedEnglish = tuiUI.fuzzyFilter(searchItems, "mode", (item) => item.label);
  assert.deepEqual(query("mode"), expectedEnglish, "English queries retain the original native fuzzy ranking and exact-match bonuses");
  const expectedTui = tuiUI.fuzzyFilter(searchItems, "TUI", (item) => item.label); assert.deepEqual(query("TUI"), expectedTui); assert.equal(expectedTui[0].id, "tui-mode");
  assert.equal(searchable.items, searchItems);
  assert.equal(JSON.stringify(searchItems), searchSnapshot.replace('"currentValue":"regular"', '"currentValue":"fullscreen"'), "Only the genuine native Enter callback may change the saved value");
  enabled = false; assert.deepEqual(query("界面模式"), []); assert.deepEqual(query("TUI"), expectedTui); enabled = true;
  assert.deepEqual(query("界面模式").map((item) => item.id), ["tui-mode"]);
  const id = (value) => value, unrelated = new tuiUI.SettingsList([{ id: "tui-mode", label: "TUI mode", currentValue: "regular" }], 10, { label: id, value: id, description: id, hint: id, cursor: "> " }, () => {}, () => {}, { enableSearch: true });
  unrelated.handleInput("界面模式"); assert.deepEqual(unrelated.filteredItems, [], "An unrelated or third-party SettingsList never gains native-setting aliases");
  checks.push("Actual native main-settings input supports Chinese label/description aliases before first render while preserving English ranking, original queries/items and Arrow/Enter enum callbacks; locale off and unrelated lists keep native English filtering");

  list.selectItem("theme"); list.handleInput("\r");
  assert.ok(text(native).includes("主题") && text(native).includes("Thinking Level"), "Theme names remain untouched inside translated settings submenus");
  const themeSubmenu = list.submenuComponent;
  themeSubmenu.inputComponent.selectList.setSelectedIndex(0); // automatic is first because no system theme exists
  list.handleInput("\r");
  assert.ok(text(native).includes("自动主题") && text(native).includes("浅色主题") && text(native).includes("深色主题"));
  assertWidths(native); list.handleInput("\x1b"); list.handleInput("\x1b");
  list.selectItem("warnings"); list.handleInput("\r"); assert.ok(text(native).includes("Anthropic 额外用量警告"));
  list.handleInput("\r"); assert.equal(events.at(-1).key, "onWarningsChange"); assert.equal(typeof events.at(-1).args[0].anthropicExtraUsage, "boolean");
  list.handleInput("\x1b");
  list.selectItem("model-thinking"); list.handleInput("\r"); assert.ok(text(native).includes("各模型思考档位") && text(native).includes(model.id));
  list.handleInput("\r"); assert.ok(text(native).includes("思考档位：") && text(native).includes(model.id));
  list.handleInput("\r"); assert.equal(events.at(-1).key, "onModelThinkingLevelChange"); assert.deepEqual(events.at(-1).args.slice(0, 2), [model.provider, model.id]);
  list.handleInput("\x1b"); list.handleInput("\x1b");
  checks.push("Actual theme/automatic-theme, warning and per-model thinking submenus are translated under their parent scope while theme/model names and callback values remain unchanged");

  let thinkingValue;
  const thinking = new agentUI.ThinkingSelectorComponent("medium", ["off", "low", "medium", "high"], (value) => { thinkingValue = value; }, () => {}, () => {}, "medium"); selectors.push(thinking);
  const thinkingItems = thinking.getSelectList().items, thinkingBefore = JSON.stringify(thinkingItems);
  thinking.focused = true;
  assert.ok(text(thinking).includes("思考档位") && text(thinking).includes("适中推理") && text(thinking).includes("默认"));
  thinking.handleInput("\r"); assert.equal(thinkingValue, "medium"); assert.equal(thinking.getSelectList().items, thinkingItems); assert.equal(JSON.stringify(thinkingItems), thinkingBefore);
  thinking.applyFilter("适中"); assert.equal(thinking.getSelectList().items.length, 0, "The main-settings alias feature does not change the separate thinking selector's search"); thinking.applyFilter("");
  assertWidths(thinking);
  checks.push("Real thinking selector translates its title, level display, descriptions and key hints without changing option identity, selection value, search input or default marker semantics");

  let modelSelection, refreshes = 0;
  const modelRuntime = { getAvailableSnapshot: () => [model], getModel: () => model, getError: () => undefined, refresh: async () => { refreshes++; return { aborted: false, errors: new Map() }; } };
  const terminal = { columns: 140, rows: 40, write() {} }, originalWrite = terminal.write;
  const tui = { terminal, requestRender() {} };
  const modelPicker = new agentUI.ModelSelectorComponent(tui, model, modelRuntime, [], (value) => { modelSelection = value; }, () => {}, undefined, () => {}, model); selectors.push(modelPicker);
  await flush(); assert.equal(refreshes, 1);
  const modelText = text(modelPicker); assert.ok(modelText.includes("仅显示已配置提供商的模型") && modelText.includes(model.id) && modelText.includes(model.provider));
  assert.ok(!modelText.includes("思考档位"), "An English model named Thinking Level must not be translated as a UI title");
  modelPicker.handleInput("\r"); assert.equal(modelSelection, model); assert.equal(terminal.write, originalWrite);
  assertWidths(modelPicker);
  checks.push("Real model picker translates fixed chrome but preserves adversarial English model/provider names and native selection; its offline catalog refresh and terminal bytes are untouched");

  let selectedPath;
  const sessionData = [{ id: "test", path: "C:/All/Recent/Named/Thinking Level.jsonl", cwd: "C:/All/Recent/Named/Settings", name: "All Recent Named Thinking Level", firstMessage: "No reasoning", messageCount: 2, created: new Date(), modified: new Date() }];
  const sessionPicker = new agentUI.SessionSelectorComponent(async () => sessionData, async () => sessionData, (path) => { selectedPath = path; }, () => {}, () => {}, () => {}, { keybindings: keys }); selectors.push(sessionPicker);
  await flush(); sessionPicker.sessionList.showPath = true;
  const sessionText = text(sessionPicker); assert.ok(sessionText.includes("恢复会话") && sessionText.includes(sessionData[0].name) && sessionText.includes(sessionData[0].path));
  const headerRender = sessionPicker.header.render; text(sessionPicker); assert.equal(sessionPicker.header.render, headerRender);
  sessionPicker.header.statusMessage = { type: "error", message: "Thinking Level / No reasoning / C:/Settings" };
  assert.ok(text(sessionPicker).includes(sessionPicker.header.statusMessage.message)); sessionPicker.header.statusMessage = null;
  sessionPicker.handleInput("\r"); assert.equal(selectedPath, sessionData[0].path); assertWidths(sessionPicker);
  checks.push("Real session picker translates only its isolated header/help; English session names, paths and dynamic errors remain exact, selection returns the original path and temporary helper methods restore immediately");

  const message = "Thinking Level / No reasoning / Theme / C:/Settings";
  const tree = [{ entry: { id: "entry1", parentId: null, type: "message", timestamp: new Date().toISOString(), message: { role: "user", content: message, timestamp: Date.now() } }, children: [] }];
  let selectedEntry;
  const treePicker = new agentUI.TreeSelectorComponent(tree, "entry1", 40, (id) => { selectedEntry = id; }, () => {}); selectors.push(treePicker);
  assert.ok(text(treePicker).includes("会话树") && text(treePicker).includes("输入以搜索：") && text(treePicker).includes(message));
  treePicker.getTreeList().searchQuery = "Type to search:"; const searchText = text(treePicker);
  assert.ok(searchText.includes("输入以搜索： Type to search:"), "Only the fixed search prefix changes; a matching English query stays exact");
  treePicker.getTreeList().searchQuery = "All Recent Named"; assert.ok(text(treePicker).includes("输入以搜索： All Recent Named"));
  treePicker.getTreeList().searchQuery = ""; treePicker.handleInput("\r"); assert.equal(selectedEntry, "entry1"); assertWidths(treePicker);
  checks.push("Real tree title/help/search prefix translate without touching message previews, matching English search queries or entry IDs; content rows stay outside the translator");

  let optionValue;
  const dialog = new agentUI.ExtensionSelectorComponent("Thinking Level", ["No reasoning", "Yes", "No"], (value) => { optionValue = value; }, () => {}); selectors.push(dialog);
  const dialogText = text(dialog); assert.ok(dialogText.includes("Thinking Level") && dialogText.includes("No reasoning") && dialogText.includes("Yes") && dialogText.includes("移动"));
  dialog.handleInput("\r"); assert.equal(optionValue, "No reasoning");
  const input = new agentUI.ExtensionInputComponent("Thinking Level", undefined, () => {}, () => {}); selectors.push(input);
  input.input.setValue(message); assert.ok(text(input).includes(message) && text(input).includes("提交"));
  const login = new agentUI.LoginDialogComponent(tui, "Thinking Level", () => {}); selectors.push(login);
  login.contentContainer.addChild(new tuiUI.Text("No reasoning"));
  const loginText = text(login); assert.ok(loginText.includes("登录 Thinking Level") && loginText.includes("No reasoning"));
  const oauth = new agentUI.OAuthSelectorComponent("login", [{ id: "Theme", name: "Thinking Level", authType: "api_key" }], () => {}, () => {}); selectors.push(oauth);
  assert.ok(text(oauth).includes("选择要配置的提供商") && text(oauth).includes("Thinking Level"));
  const themePicker = new agentUI.ThemeSelectorComponent("dark", () => {}, () => {}, () => {}); selectors.push(themePicker);
  assert.ok(text(themePicker).includes("（当前）"));
  checks.push("Native extension dialogs translate only fixed footer hints, OAuth/login chrome and theme current marker; user titles, Yes/No option strings, draft text, provider names and provider-owned instructions stay original");

  const independent = new tuiUI.Text("Thinking Level\nNo reasoning\nTheme\nC:/Settings");
  assert.deepEqual(independent.render(140), plainTextRender.call(independent, 140), "A standalone Text, such as a message/tool output, is completely outside UI translation scopes");
  enabled = false; list.selectItem("autocompact"); assert.ok(text(native).includes("Auto-compact")); assert.ok(text(thinking).includes("Thinking Level"));
  enabled = true; assert.ok(text(thinking).includes("思考档位"));
  patch.dispose(); patch.dispose();
  for (const [prototype, descriptor] of originalDescriptors) assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, "render"), descriptor);
  for (const [prototype, key, descriptor] of originalSearchDescriptors) assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, key), descriptor);
  assert.equal(tuiUI.Text.prototype.render, plainTextRender); assert.ok(text(thinking).includes("Thinking Level"));
  checks.push("The language toggle applies on the next render; standalone text remains byte-for-byte native, and idempotent disposal restores exact own/inherited method descriptors and English UI");

  for (const order of [[0, 1], [1, 0]]) {
    const sharedEnabled = () => true, instances = [installChineseUi({ agentUI, tuiUI, version, isEnabled: sharedEnabled }), installChineseUi({ agentUI, tuiUI, version, isEnabled: sharedEnabled })];
    const sharedHook = tuiUI.Text.prototype.render; instances[order[0]].dispose(); assert.equal(tuiUI.Text.prototype.render, sharedHook); assert.ok(text(thinking).includes("思考档位"));
    instances[order[1]].dispose(); assert.equal(tuiUI.Text.prototype.render, plainTextRender);
  }
  const foreignPatch = installChineseUi({ agentUI, tuiUI, version });
  const foreign = function (width) { return ["foreign".slice(0, width)]; };
  Object.defineProperty(agentUI.ThinkingSelectorComponent.prototype, "render", { configurable: true, writable: true, value: foreign });
  foreignPatch.dispose(); assert.equal(agentUI.ThinkingSelectorComponent.prototype.render, foreign);
  const reinstall = installChineseUi({ agentUI, tuiUI, version }); assert.equal(text(thinking), "foreign"); reinstall.dispose();
  assert.equal(agentUI.ThinkingSelectorComponent.prototype.render, foreign, "Reinstall/dispose wraps and restores the current foreign method without resurrecting a stale translation hook");
  const previousThinking = originalDescriptors.find(([prototype]) => prototype === agentUI.ThinkingSelectorComponent.prototype)[1];
  if (previousThinking) Object.defineProperty(agentUI.ThinkingSelectorComponent.prototype, "render", previousThinking); else delete agentUI.ThinkingSelectorComponent.prototype.render;
  const unsupported = installChineseUi({ agentUI, tuiUI, version: "1.4.1" }); assert.equal(unsupported.coverage.supported, false); assert.equal(tuiUI.Text.prototype.render, plainTextRender); unsupported.dispose();
  assert.equal(installChineseUi({ agentUI, tuiUI, version: "1.2.1" }).coverage.supported, false, "Even future patch versions require an explicit compatibility audit");
  checks.push("Shared native-prototype hooks survive two observers disposed in either order, preserve foreign takeover and fail open without hooks on unsupported Pi versions");

  const filterPrototype = tuiUI.SettingsList.prototype, originalFilter = Object.getOwnPropertyDescriptor(filterPrototype, "applyFilter");
  const interrupted = new Error("intentional foreign/native filter failure after assigning its results");
  Object.defineProperty(filterPrototype, "applyFilter", { ...originalFilter, value(query) { originalFilter.value.call(this, query); throw interrupted; } });
  let failurePatch;
  try {
    failurePatch = installChineseUi({ agentUI, tuiUI, version });
    const failing = new agentUI.SettingsSelectorComponent(config, callbacks).getSettingsList();
    const itemIdentity = failing.items, filteredIdentity = failing.filteredItems, selectedIndex = failing.selectedIndex, snapshot = JSON.stringify(failing.items);
    assert.throws(() => failing.handleInput("界面模式"), (error) => error === interrupted);
    assert.equal(failing.items, itemIdentity); assert.equal(failing.filteredItems, filteredIdentity); assert.equal(failing.selectedIndex, selectedIndex); assert.equal(JSON.stringify(failing.items), snapshot);
    assert.equal(failing.searchInput.getValue(), "界面模式", "Even a failed filter must not rewrite the user's query");
    assert.ok(text(new tuiUI.Text("Thinking Level")).includes("Thinking Level"), "An interrupted input scope must unwind before unrelated text renders");
  } finally { failurePatch?.dispose(); Object.defineProperty(filterPrototype, "applyFilter", originalFilter); }
  checks.push("A filter throwing after assigning alias results restores original item/filtered identities and selection, preserves the user's query and unwinds its scope without leaking temporary aliases");

  // The frozen v2.4.0 asset stays byte-identical; settings added by later
  // reviewed Pi releases are supplied by the adapter and must render in Chinese.
  const frozen = JSON.parse(await readFile(join(root, "assets/ui-zh-CN.json"), "utf8"));
  assert.equal(frozen.settings["share-destination"], undefined, "The frozen v2.4.0 catalogue must not gain later settings");
  const laterItems = new agentUI.SettingsSelectorComponent(config, callbacks).getSettingsList().items;
  const laterItem = laterItems.find((item) => item.id === "share-destination");
  if (laterItem) {
    // Earlier cases in this block dispose every observer, so install a fresh
    // adapter for this measurement instead of reusing the first patch.
    const laterPatch = installChineseUi({ agentUI, tuiUI, version, isEnabled: () => true });
    let laterRendered = "";
    try {
      const laterNative = new agentUI.SettingsSelectorComponent(config, callbacks), laterList = laterNative.getSettingsList();
      // The native list scrolls to its terminal height; promote this real item to
      // the top of the same list objects so its localized row is rendered without
      // inventing a private scroll API.
      const promotedItem = laterList.items.find((item) => item.id === "share-destination");
      const promoted = [promotedItem, ...laterList.items.filter((item) => item !== promotedItem)];
      laterList.items = promoted; laterList.filteredItems = promoted; laterList.selectedIndex = 0;
      laterRendered = laterNative.render(140).map(stripTerminalSequences).join("\n");
      assert.ok(promotedItem, "The reviewed runtime still exposes the later setting");
      assert.ok(laterRendered.includes("会话分享目标"), `Later-release settings fall back to the adapter catalogue: ${JSON.stringify(laterRendered.slice(0, 400))}`);
    } finally { laterPatch.dispose(); }
    assert.ok(laterItem, "The reviewed runtime still exposes the later setting");
    assert.ok(laterRendered.includes("上传会话的位置"), "Later-release setting descriptions are localized too");
    assert.ok(!laterRendered.includes("Session share destination"), "No English label leaks through for a localized later setting");
    checks.push("A setting introduced after the frozen v2.4.0 catalogue renders in Chinese from the adapter while the packaged asset keeps its reviewed bytes");
  } else checks.push("The installed runtime predates later-release settings; the adapter catalogue adds nothing it cannot display");
  const report = { testedAt: new Date().toISOString(), piVersion: version, modelRequests: 0, passed: true,
    verification: "Real reviewed Pi public native components and TUI layout with offline model/session fixtures; no credentials, vendor edits, network/model calls or native-window automation", checks, coverage: patch.coverage,
    hashes: Object.fromEntries(await Promise.all(["lib/ui-chinese.mjs", "assets/ui-zh-CN.json"].map(async (file) => [file, createHash("sha256").update(await readFile(join(root, file))).digest("hex")]))), };
  await writeFile(join(root, "tests/ui-chinese-validation.json"), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2));
} finally { patch?.dispose(); for (const component of selectors) component.dispose?.(); }
