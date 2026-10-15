import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compactNativePrompt } from "../lib/native-prompt.mjs";

// Exercise the real extension factory, runner's prompt/options contract and
// native host autocomplete lifecycle. All writes stay in a work/ package copy.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work");
await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "language-integration-"));
assert.ok(scratch.startsWith(work + sep));
import { agentDir, version, modules } from "./pi-runtime.mjs";
const agent = join(modules, "@earendil-works/pi-coding-agent");
const load = (path) => import(pathToFileURL(path).href);
const { loadExtensionsCached, clearExtensionCache } = await load(join(agent, "dist/core/extensions/loader.js"));
const { ExtensionRunner } = await load(join(agent, "dist/core/extensions/runner.js"));
const { buildSystemPrompt, normalizeBuildSystemPromptOptions } = await load(join(agent, "dist/core/system-prompt.js"));
const { InteractiveMode } = await load(join(agent, "dist/modes/interactive/interactive-mode.js"));
const agentUI = await load(join(agent, "dist/index.js"));
const tuiUI = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const themeAPI = await load(join(agent, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agent, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agent, "dist/core/keybindings.js"));
const { BUILTIN_SLASH_COMMANDS } = await load(join(agent, "dist/core/slash-commands.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
themeAPI.setThemeJsonValidator(validateThemeJson); themeAPI.initTheme("dark", false);
tuiUI.setKeybindings(new KeybindingsManager());
const liveConfigBefore = await readFile(join(root, "config.json"));
const checks = [], errors = [], notices = [], active = new Set();
const options = normalizeBuildSystemPromptOptions({
  cwd: scratch, selectedTools: ["read", "bash"],
  toolSnippets: { read: "KEEP read tool snippet", bash: "KEEP bash tool snippet" },
  toolGuidelines: { read: ["KEEP tool rule exactly"] }, promptGuidelines: ["KEEP prompt rule exactly"],
  appendSystemPrompt: "KEEP APPEND_SYSTEM and another extension's instructions",
  contextFiles: [{ path: join(scratch, "AGENTS.md"), content: "KEEP AGENTS exactly\nBe concise in your responses" }],
  skills: [{ name: "fixture", description: "KEEP skill description", filePath: join(scratch, "skills/fixture/SKILL.md") }],
  sections: { date: "KEEP date 2026-10-16", third_party: "KEEP final extension section" },
});
const original = buildSystemPrompt(options);
const localized = compactNativePrompt({ systemPrompt: original, systemPromptOptions: options, piVersion: version }).systemPrompt;
const nativeTextRender = tuiUI.Text.prototype.render;
const nativeThinkingRender = agentUI.ThinkingSelectorComponent.prototype.render;
const text = (component) => component.render(100).map(stripTerminalSequences).join("\n");
const thinking = () => new agentUI.ThinkingSelectorComponent("medium", ["off", "medium", "high"], () => {}, () => {});
const baseCompletion = () => new tuiUI.CombinedAutocompleteProvider(BUILTIN_SLASH_COMMANDS, scratch);
const request = (provider) => provider.getSuggestions(["/settings"], 0, 9, { signal: new AbortController().signal });
const englishDescription = "Open settings menu", chineseDescription = "打开设置菜单";
function createHost() {
  const host = {
    autocompleteProviderWrappers: [], editorComponentFactory: undefined,
    defaultEditor: { setAutocompleteProvider(provider) { this.provider = provider; } },
    createBaseAutocompleteProvider: baseCompletion,
    setupAutocompleteProvider: InteractiveMode.prototype.setupAutocompleteProvider,
    ui: { hideOverlay() {} },
    clearExtensionTerminalInputListeners() {}, setExtensionFooter() {}, setExtensionHeader() {}, clearExtensionWidgets() {},
    footerDataProvider: { clearExtensionStatuses() {} }, footer: { invalidate() {} },
    setCustomEditorComponent(factory) { this.editorComponentFactory = factory; },
    updateTerminalTitle() {}, setWorkingIndicator() {}, setHiddenThinkingLabel() {},
  };
  host.editor = host.defaultEditor;
  const ui = InteractiveMode.prototype.createExtensionUIContext.call(host);
  ui.notify = (message, type) => notices.push({ message, type });
  ui.setStatus = () => {};
  host.setupAutocompleteProvider();
  return { host, ctx: { mode: "tui", hasUI: true, cwd: scratch, isIdle: () => true, ui } };
}
const hostState = createHost();
async function instantiate({ fresh = false, ctx = hostState.ctx } = {}) {
  if (fresh) clearExtensionCache();
  const loaded = await loadExtensionsCached([join(scratch, "index.ts")], scratch);
  assert.deepEqual(loaded.errors, []); assert.equal(loaded.extensions.length, 1);
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, scratch, {}, {});
  runner.createContext = () => ctx;
  runner.onError((error) => errors.push(error));
  const extension = loaded.extensions[0];
  const instance = {
    runner, extension,
    emit: (type, fields = {}) => runner.emit({ type, ...fields }),
    command: (args) => extension.commands.get("mascot").handler(args, ctx),
    async prompt(promptOptions = options) {
      const result = await runner.emitBeforeAgentStart({ prompt: "offline fixture" }, promptOptions);
      return buildSystemPrompt(result.systemPromptOptions);
    },
  };
  active.add(instance);
  return instance;
}
async function shutdown(instance, reason = "quit") {
  await instance.emit("session_shutdown", { reason }); active.delete(instance);
}
const saved = () => readFile(join(scratch, "config.json"), "utf8").then(JSON.parse);
try {
  for (const name of ["index.ts", "lib", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), { recursive: true });
  await mkdir(join(scratch, "assets"));
  for (const name of ["status-phrases.json", "status-copy.json", "ui-zh-CN.json"]) await cp(join(root, "assets", name), join(scratch, "assets", name));
  await writeFile(join(scratch, "config.json"), JSON.stringify({ enabled: false, animation: false, chineseUI: true, compactPrompt: true, persona: false }));
  let instance = await instantiate({ fresh: true });
  const persona = (await readFile(join(scratch, "prompts/wumi-persona.md"), "utf8")).trim();
  assert.ok(persona && localized !== original);
  for (const compact of [false, true]) for (const personaOn of [false, true]) {
    await instance.command(`prompt ${compact ? "on" : "off"}`);
    await instance.command(`persona ${personaOn ? "on" : "off"}`);
    const expected = (compact ? localized : original) + (personaOn ? `\n\n${persona}` : "");
    assert.equal(await instance.prompt(), expected);
    assert.equal(await instance.prompt(), expected, "Each new request starts from the original options and cannot accumulate persona text");
    assert.equal(options.forceSystemPrompt, undefined, "Pi's runner clones event options rather than changing future runs");
    const config = await saved(); assert.equal(config.compactPrompt, compact); assert.equal(config.persona, personaOn); assert.equal(config.chineseUI, true);
  }
  checks.push("Real Pi loader + ExtensionRunner verify all four compactPrompt/persona combinations exactly, independent saved switches and no cumulative injection across requests");

  for (const customPrompt of ["KEEP custom SYSTEM.md with English text", original.split("\n\n")[0]]) {
    const customOptions = { ...options, customPrompt };
    for (const personaOn of [false, true]) {
      await instance.command("prompt on"); await instance.command(`persona ${personaOn ? "on" : "off"}`);
      assert.equal(await instance.prompt(customOptions), buildSystemPrompt(customOptions) + (personaOn ? `\n\n${persona}` : ""));
    }
  }
  for (const forceSystemPrompt of ["", "KEEP an earlier extension's complete prompt"]) {
    await instance.command("persona off"); assert.equal(await instance.prompt({ ...options, forceSystemPrompt }), forceSystemPrompt);
    await instance.command("persona on"); assert.equal(await instance.prompt({ ...options, forceSystemPrompt }), `${forceSystemPrompt}\n\n${persona}`);
  }
  checks.push("Custom SYSTEM.md, native-looking custom SYSTEM text and earlier extension forceSystemPrompt (including empty) stay exact; only the independent persona switch appends its own template");

  for (const missing of ["pi-system-zh.md", "wumi-persona.md"]) {
    const path = join(scratch, "prompts", missing); await rename(path, path + ".saved");
    try {
      await instance.command("prompt on"); await instance.command("persona on");
      const noticeCount = notices.length;
      assert.equal(await instance.prompt(), missing === "pi-system-zh.md" ? `${original}\n\n${persona}` : localized);
      assert.equal(notices.length, noticeCount + 1);
    } finally { await rename(path + ".saved", path); }
  }
  checks.push("A missing Chinese base preserves the original plus requested persona; a missing persona preserves successful compaction; both fail open with one warning");

  await instance.command("persona off"); await instance.command("prompt on");
  await instance.emit("session_start", { reason: "startup" });
  assert.equal(hostState.host.autocompleteProviderWrappers.length, 1);
  assert.equal((await request(hostState.host.autocompleteProvider)).items[0].description, chineseDescription);
  assert.ok(text(thinking()).includes("思考档位"));
  const patchedTextRender = tuiUI.Text.prototype.render;
  assert.notEqual(patchedTextRender, nativeTextRender);
  for (const enabled of [false, true, false, true]) {
    await instance.command(`locale ${enabled ? "on" : "off"}`);
    assert.equal((await request(hostState.host.autocompleteProvider)).items[0].description, enabled ? chineseDescription : englishDescription);
    assert.equal(text(thinking()).includes("思考档位"), enabled);
    assert.equal(await instance.prompt(), localized, "Locale never changes either prompt switch");
    const config = await saved(); assert.equal(config.chineseUI, enabled); assert.equal(config.compactPrompt, true); assert.equal(config.persona, false);
  }
  checks.push("Actual native thinking UI and host-wrapped command descriptions switch Chinese/English on the next render/result while the prompt/persona settings and hidden mascot remain independent");

  const beforeStatus = await readFile(join(scratch, "config.json"), "utf8");
  for (const command of ["locale status", "prompt status", "persona status", "locale bad", "prompt bad", "persona bad"]) await instance.command(command);
  assert.equal(await readFile(join(scratch, "config.json"), "utf8"), beforeStatus);
  await instance.emit("session_start", { reason: "startup" });
  assert.equal(hostState.host.autocompleteProviderWrappers.length, 1, "Reinstalling the same live UI must not stack autocomplete wrappers");
  assert.notEqual(tuiUI.Text.prototype.render, nativeTextRender);
  checks.push("Status/invalid commands never rewrite preferences; repeated session_start on the same live host reinstalls UI hooks without stacking autocomplete factories");

  for (const reason of ["new", "resume", "fork", "reload"]) {
    const retiredProvider = hostState.host.autocompleteProvider;
    await shutdown(instance, reason);
    assert.equal(tuiUI.Text.prototype.render, nativeTextRender); assert.equal(agentUI.ThinkingSelectorComponent.prototype.render, nativeThinkingRender);
    assert.equal((await request(retiredProvider)).items[0].description, englishDescription, "Retired callbacks are inert before the host clears them");
    InteractiveMode.prototype.resetExtensionUI.call(hostState.host);
    assert.equal(hostState.host.autocompleteProviderWrappers.length, 0);
    assert.equal((await request(hostState.host.autocompleteProvider)).items[0].description, englishDescription);
    instance = await instantiate({ fresh: reason === "reload" });
    await instance.emit("session_start", { reason });
    assert.equal(hostState.host.autocompleteProviderWrappers.length, 1, "A cached module still invokes a fresh extension factory after host reset");
    assert.equal((await request(hostState.host.autocompleteProvider)).items[0].description, chineseDescription);
    assert.ok(text(thinking()).includes("思考档位"));
    assert.equal(await instance.prompt(), localized);
  }
  checks.push("Native resetExtensionUI removes autocomplete wrappers; cached factory loading for new/resume/fork and fresh reload each create a new registration flag and restore exactly one active Chinese provider; shutdown restores native prototypes and disables retired callbacks");

  const promptOnlyOptions = { ...options, sections: { ...options.sections, tools: "KEEP custom tool section", rules: "KEEP custom rules", docs: "KEEP custom docs" } };
  await instance.command("prompt on"); await instance.command("persona off");
  const promptOnly = await instance.prompt(promptOnlyOptions);
  for (const section of ["KEEP custom tool section", "KEEP custom rules", "KEEP custom docs"]) assert.ok(promptOnly.includes(section));
  const unchangedSuffix = original.slice(original.indexOf("\n\n<addendum>")); assert.ok((await instance.prompt()).endsWith(unchangedSuffix));
  checks.push("Index glue forwards the full real event options: custom sections and the exact ordered addendum/AGENTS/skills/cwd/date/extension suffix survive compaction");

  await shutdown(instance);
  InteractiveMode.prototype.resetExtensionUI.call(hostState.host);
  const rpcHost = createHost(); rpcHost.ctx.mode = "rpc";
  const rpc = await instantiate({ ctx: rpcHost.ctx });
  await rpc.emit("session_start", { reason: "startup" });
  assert.equal(rpcHost.host.autocompleteProviderWrappers.length, 0); assert.equal(tuiUI.Text.prototype.render, nativeTextRender);
  assert.equal(await rpc.prompt(), original);
  const beforeRpc = await readFile(join(scratch, "config.json"), "utf8");
  await rpc.command("locale off"); await rpc.command("prompt off"); await rpc.command("persona on");
  assert.equal(await readFile(join(scratch, "config.json"), "utf8"), beforeRpc);
  await shutdown(rpc);
  checks.push("RPC startup never installs native UI hooks or autocomplete wrappers, does not localize/inject prompts and ignores terminal preference commands without writes");

  assert.deepEqual(errors, []);
  assert.equal(tuiUI.Text.prototype.render, nativeTextRender); assert.equal(agentUI.ThinkingSelectorComponent.prototype.render, nativeThinkingRender);
  assert.deepEqual(await readFile(join(root, "config.json")), liveConfigBefore);
  checks.push("No extension errors, surviving prototype patches, model requests or changes to the deliverable/live preference file");
} finally {
  for (const instance of active) await shutdown(instance);
  assert.ok(scratch.startsWith(work + sep)); await rm(scratch, { recursive: true, force: true });
  clearExtensionCache();
}
const indexBytes = await readFile(join(root, "index.ts"));
const report = { testedAt: new Date().toISOString(), passed: true, modelRequests: 0, piVersion: version,
  source: "Actual installed Pi loader, ExtensionRunner, InteractiveMode autocomplete/resetExtensionUI and ThinkingSelectorComponent",
  indexSha256: createHash("sha256").update(indexBytes).digest("hex"), checks };
await writeFile(join(root, "tests/language-integration-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
