import assert from "node:assert/strict";
import { cp, readFile, writeFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEMO_PERIOD_MS, DEMO_SEQUENCE } from "../lib/activity.mjs";

// Run actual extension factories and Pi rendering without a model/session runtime.
// Commands save only to a temporary package copy under this workspace's work/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work");
await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "editor-integration-"));
assert.ok(scratch.startsWith(work + sep));
import { agentDir, version, modules } from "./pi-runtime.mjs";
const agentPackage = join(modules, "@earendil-works/pi-coding-agent");
const load = (file) => import(pathToFileURL(file).href);
const { loadExtensions } = await load(join(agentPackage, "dist/core/extensions/loader.js"));
const themeAPI = await load(join(agentPackage, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agentPackage, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agentPackage, "dist/core/keybindings.js"));
const { CustomEditor } = await load(join(agentPackage, "dist/modes/interactive/components/custom-editor.js"));
const api = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
const { CURSOR_MARKER, visibleWidth, truncateToWidth, sliceByColumn, Container, TuiMainScreen, TuiAltScreen, ScrollView, VStack, CombinedAutocompleteProvider, setKeybindings, matchesKey } = api;
const originalClock = Date.now, originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
const originalWT = process.env.WT_SESSION, originalTMUX = process.env.TMUX, originalRender = process.env.PI_WINK_RENDER;
let time = 100000, nextJob = 0, succeeded = false;
const jobs = new Map(), checks = [];
let currentHeader, currentFooter, currentEditor, currentFactory;
let busy = false, redraws = 0, submits = [], escapes = 0, branchUnsubs = 0;
let renderer, hostDisposed = false;
const notices = [], statuses = new Map(), terminalWrites = [];
const terminal = {
  columns: 100, rows: 40, kittyProtocolActive: false,
  start() {}, stop() {}, hideCursor() {}, showCursor() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {},
  setTitle() {}, setProgress() {}, setProgramStatus() {}, async drainInput() {},
  write(data) { terminalWrites.push(data); },
};
const nativeWrite = terminal.write;
const facade = {
  get mode() { return renderer?.mode || "regular"; }, terminal,
  requestRender() { redraws++; },
  hasOverlay: () => renderer?.hasOverlay() || false,
  captureRenderState: () => renderer?.captureRenderState?.() || { previousViewportTop: 0 },
};
const keys = new KeybindingsManager();
setKeybindings(keys);
let theme, editorTheme;
const nativeEditor = () => {
  const editor = new CustomEditor(facade, editorTheme, keys, { embedWorkingStatus: true });
  editor.focused = true;
  editor.onSubmit = (text) => submits.push(text);
  editor.onEscape = () => { escapes++; };
  return editor;
};
const footerData = {
  getGitBranch: () => "test/中文", getExtensionStatuses: () => statuses,
  getAvailableProviderCount: () => 1,
  onBranchChange: () => () => { branchUnsubs++; },
};
const manager = { getEntryCount: () => 0, getLeafId: () => "leaf", getSessionId: () => "test-session", getEntries: () => [], getCwd: () => scratch };
const ctx = {
  mode: "tui", hasUI: true, cwd: scratch, sessionManager: manager,
  model: { id: "offline-test-model", provider: "test-provider", contextWindow: 200000 },
  isIdle: () => !busy, getContextUsage: () => ({ tokens: 1000, percent: 0.5, contextWindow: 200000 }),
  ui: {
    get theme() { if (hostDisposed) throw new Error("Stale UI context accessed"); return theme; },
    setHeader(factory) { currentHeader?.dispose?.(); currentHeader = factory?.(facade, theme); },
    setFooter(factory) { currentFooter?.dispose?.(); currentFooter = factory?.(facade, theme, footerData); },
    getEditorComponent: () => currentFactory,
    setEditorComponent(factory) {
      const text = currentEditor?.getText() || "";
      // Mirror Pi: it replaces factory instances without disposing the old editor.
      currentFactory = factory;
      currentEditor = factory ? factory(facade, editorTheme, keys) : nativeEditor();
      currentEditor.focused = true; currentEditor.setText(text);
      currentEditor.onSubmit = (value) => submits.push(value);
      currentEditor.onEscape = () => { escapes++; };
    },
    setStatus: (key, value) => value === undefined ? statuses.delete(key) : statuses.set(key, value),
    notify: (message, type) => notices.push({ message, type }),
  },
};
const tick = () => {
  assert.ok(jobs.size, "Expected an animation timer");
  const [id, job] = jobs.entries().next().value; jobs.delete(id); time += job.ms; job.fn();
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const dcsCount = () => (terminalWrites.join("").match(/\x1bP/g) || []).length;
const plain = (lines) => lines.map(stripTerminalSequences);
const marker = (lines) => {
  const rows = lines.map((line, row) => ({ row, index: line.indexOf(CURSOR_MARKER), line })).filter((item) => item.index >= 0);
  assert.equal(rows.length, 1);
  return { row: rows[0].row, col: visibleWidth(rows[0].line.slice(0, rows[0].index)) };
};
const mouse = (x, y, width, height, extra = {}) => ({ type:"click", button:"left", x, y, screenX:x, screenY:y, width, height, shift:false, alt:false, ctrl:false, ...extra });
const assertClosedFrame = (rows, width) => {
  const geometry = currentEditor.geometry, outerWidth = width - geometry.leftWidth;
  for (const row of rows) assert.ok(visibleWidth(row) <= width, `Framed editor overflow at ${width}`);
  if (outerWidth < 3) return;
  const at = (row) => sliceByColumn(stripTerminalSequences(rows[geometry.offsetY + row]), geometry.leftWidth, outerWidth);
  assert.equal(geometry.contentX, geometry.leftWidth + 1);
  assert.equal(geometry.editorWidth, outerWidth - 2);
  const top = at(0), bottom = at(currentEditor.renderedVisibleLineCount + 1);
  assert.ok(top.startsWith("╭") && top.endsWith("╮"), `Top corners must connect at ${width}`);
  assert.ok(bottom.startsWith("╰") && bottom.endsWith("╯"), `Bottom corners must connect at ${width}`);
  for (let row = 1; row <= currentEditor.renderedVisibleLineCount; row++) {
    const line = at(row);
    assert.ok(line.startsWith("│") && line.endsWith("│"), `Actual input row ${row} needs both side walls at ${width}`);
    assert.equal(visibleWidth(line), outerWidth);
  }
  for (let row = currentEditor.renderedVisibleLineCount + 2; row < geometry.nativeHeight; row++) {
    const line = at(row);
    assert.ok(line.startsWith(" ") && line.endsWith(" "), "Native completion rows align below the closed frame without dangling walls");
  }
};
const holder = (which) => ({ render: (width) => which()?.render(width) || [], invalidate() { which()?.invalidate?.(); } });
let historyLength = 0;
const history = { render: () => Array.from({ length: historyLength }, (_, i) => `history ${i}`), invalidate() {} };
function mainRenderer() {
  renderer = new TuiMainScreen(terminal);
  renderer.requestRender = () => { redraws++; };
  renderer.addChild(holder(() => currentHeader)); renderer.addChild(history);
  renderer.addChild(holder(() => currentEditor)); renderer.addChild(holder(() => currentFooter));
  return renderer;
}
function detachHostUI() {
  currentHeader?.dispose?.(); currentHeader = undefined;
  currentFooter?.dispose?.(); currentFooter = undefined;
  currentFactory = undefined; currentEditor = nativeEditor();
}

try {
  // This suite pins the original reaction/frame integration, including its
  // fallback when a full-animation pack is absent. Complete motion routing and
  // actual resources have separate approved-motion suites in the full build.
  for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), {
    recursive: true, filter: source => source !== join(root, 'assets', 'animated') });
  await writeFile(join(scratch, "config.json"), JSON.stringify({ language:"zh-CN", layout:"editor", style:"wumi", renderer:"auto", info:"compact", enabled:true, animation:true, dockSize:"auto" }));
  themeAPI.setThemeJsonValidator(validateThemeJson); themeAPI.initTheme("dark", false);
  theme = themeAPI.loadThemeFromPath(join(root, "themes/pi-furry-night.json"), "truecolor");
  editorTheme = themeAPI.getEditorTheme();
  process.env.WT_SESSION = "offline-test-windows-terminal"; delete process.env.TMUX; delete process.env.PI_WINK_RENDER;
  api.setCapabilities({images:null,trueColor:true,hyperlinks:true});
  Date.now = () => time;
  const result = await loadExtensions([join(scratch, "index.ts")], scratch);
  assert.deepEqual(result.errors, []); assert.equal(result.extensions.length, 1);
  result.runtime.getThinkingLevel = () => "medium";
  const extension = result.extensions[0];
  const emit = async (type, event = {}, targetCtx = ctx) => {
    if (type === "agent_start") busy = true;
    if (type === "agent_settled") busy = false;
    for (const handler of extension.handlers.get(type) || []) await handler({ type, ...event }, targetCtx);
  };
  const mascotCommand = extension.commands.get("mascot");
  assert.equal(typeof mascotCommand.getArgumentCompletions, "function");
  assert.deepEqual(mascotCommand.getArgumentCompletions("style u").map(({ value, label }) => ({ value, label })), [
    { value: "style umi", label: "umi" }, { value: "style umi-pixel", label: "umi-pixel" },
  ]);
  checks.push("The real extension registers hierarchical /mascot argument completions");
  const command = (args) => mascotCommand.handler(args, ctx);
  globalThis.setTimeout = (fn, ms) => { const id = { id:++nextJob, unref() {} }; jobs.set(id, { fn, ms }); return id; };
  globalThis.clearTimeout = (id) => jobs.delete(id);
  mainRenderer(); currentEditor = nativeEditor();
  await emit("session_start", { reason:"startup" }, { ...ctx, mode:"rpc" });
  assert.equal(currentHeader, undefined); assert.equal(currentFactory, undefined); assert.equal(jobs.size, 0); assert.strictEqual(terminal.write, nativeWrite);
  await emit("session_start", { reason:"startup" });
  assert.ok(currentFactory && currentHeader && currentFooter);
  assert.ok(currentEditor instanceof CustomEditor); assert.equal(currentEditor.embedWorkingStatus, true); assert.equal(jobs.size, 1);
  assert.notStrictEqual(terminal.write, nativeWrite);
  checks.push("Real Pi loader/theme/keybindings create the editor/header/footer; RPC has no terminal factories, hook or timer");

  // Actual native typing, cursor-only input, paste and submission are observed
  // without intercepting or rewriting their data. Busy phases keep priority.
  time += 6000; currentEditor.setText("");
  currentEditor.handleInput("h"); currentEditor.render(100); tick(); tick(); tick(); tick(); currentEditor.render(100);
  assert.match(currentEditor.displaySheet.frames[0].id,/^listen/);assert.equal(currentEditor.getText(),"h");
  const typingConfig=await readFile(join(scratch,"config.json"),"utf8"),typingSubmits=submits.length;
  currentEditor.handleInput("\x1b[D");time+=1900;tick();currentEditor.render(100);tick();tick();tick();tick();currentEditor.render(100);
  assert.match(currentEditor.displaySheet.frames[0].id,/^idle/);assert.equal(currentEditor.getText(),"h");
  currentEditor.handleInput("\x1b[200~hello你好🙂\x1b[201~");time+=250;currentEditor.render(100);
  assert.ok(currentEditor.getText().includes("hello你好🙂"));assert.equal(submits.length,typingSubmits);
  assert.equal(await readFile(join(scratch,"config.json"),"utf8"),typingConfig);
  currentEditor.setText("listen-submit");currentEditor.handleInput("\r");
  assert.equal(currentEditor.getText(),"");assert.equal(submits.at(-1),"listen-submit");
  currentEditor.render(100);tick();tick();tick();tick();currentEditor.render(100);
  assert.doesNotMatch(currentEditor.displaySheet.frames[0].id,/^listen/,"Submitting an emptied draft must cancel the local listening gesture");
  await emit("agent_start");await emit("tool_execution_start",{toolCallId:"typing-priority",toolName:"bash",args:{}});
  currentEditor.handleInput("x");time+=1300;tick();currentEditor.render(100);tick();tick();tick();tick();currentEditor.render(100);
  assert.match(currentEditor.displaySheet.frames[0].id,/^watch/);
  await emit("tool_execution_end",{toolCallId:"typing-priority",isError:false});await emit("agent_before_settle",{outcome:"completed"});await emit("agent_settled",{aborted:false});
  time+=3000;currentEditor.setText("");tick();currentEditor.render(100);
  checks.push("Actual typing/paste triggers a local cupped-ear listening gesture; cursor movement cannot extend it, timeout restores idle, native draft/config/submission count survive and running work keeps priority");

  // Animation off keeps state changes live, and an explicit poke can finish
  // its local reaction without silently turning the motion preference on.
  await command("pause"); assert.equal(jobs.size, 0);
  currentEditor.render(100);const beforePausedTyping=currentEditor.displaySheet.frames[0].cacheKey;
  currentEditor.handleInput("q");currentEditor.render(100);assert.equal(currentEditor.displaySheet.frames[0].cacheKey,beforePausedTyping,"Paused motion must ignore typing gestures");currentEditor.setText("");
  const latencyPreferences = await readFile(join(scratch, "config.json"), "utf8");
  await emit("input", { source: "interactive", text: "a downstream extension handles this input" });
  for (let i = 0; i < 3; i++) tick();
  assert.equal(jobs.size, 0, "Unconfirmed input receipts expire instead of looping after a handled input or preflight failure");
  assert.doesNotMatch(plain(currentEditor.render(140)).join("\n"), /我听到啦，小耳朵|让我准备一下/);
  await emit("input", { source: "interactive", text: "offline latency fixture" });
  assert.match(plain(currentEditor.render(140)).join("\n"), /我听到啦，小耳朵/);
  assert.equal(jobs.size, 1); assert.equal([...jobs.values()][0].ms, 1000);
  await emit("agent_start"); await emit("before_provider_request", { payload: {} });
  for (let i = 0; i < 15; i++) tick();
  const waitingRows = plain(currentEditor.render(140)).join("\n");
  assert.match(waitingRows, /我还在这儿陪你呢/); assert.match(waitingRows, /15s/);
  for (let width = 1; width <= 180; width++) for (const row of currentEditor.render(width)) assert.ok(visibleWidth(row) <= width);
  await emit("message_update", { assistantMessageEvent: { type: "thinking_delta", delta: "reasoning" } });
  assert.match(plain(currentEditor.render(140)).join("\n"), /我再琢磨一下/);
  await emit("message_update", { assistantMessageEvent: { type: "text_delta", delta: "answer" } });
  assert.equal(jobs.size, 0, "The metadata-only heartbeat stops at real answer text while motion remains off");
  assert.doesNotMatch(plain(currentEditor.render(140)).join("\n"), /我再琢磨一下|我还在这儿陪你呢/);
  assert.equal(await readFile(join(scratch, "config.json"), "utf8"), latencyPreferences);
  await emit("agent_settled", { aborted: false });
  await command("layout header"); await command("pause");
  const titleImageMarkers = () => currentHeader.render(140).join("\n").match(/\x1b\]777;pi-furry-partner-[^\x07\x1b]+/g) || [];
  const pausedTitle = titleImageMarkers(); assert.ok(pausedTitle.length > 0);
  await emit("agent_start"); await emit("before_provider_request", { payload: {} });
  assert.equal([...jobs.values()][0].ms, 1000);
  for (let i = 0; i < 3; i++) tick();
  assert.deepEqual(titleImageMarkers(), pausedTitle, "A waiting heartbeat cannot advance paused title image frames; state text remains live");
  await emit("message_update", { assistantMessageEvent: { type: "text_delta", delta: "answer" } });
  assert.equal(jobs.size, 0); await emit("agent_settled", { aborted: false });
  await command("layout editor");
  checks.push("Real input/provider/stream hooks show submission, first-output wait seconds and thinking-before-text; paused motion gets one 1s metadata heartbeat, no narrow overflow, preference write or lingering timer");
  await emit("agent_start");
  await emit("tool_execution_start", { toolCallId: "pause-work", toolName: "bash", args: {} });
  currentEditor.render(100); assert.match(currentEditor.displaySheet.frames[0].id, /^watch/);
  await emit("tool_execution_end", { toolCallId: "pause-work", isError: false });
  currentEditor.render(100); assert.match(currentEditor.displaySheet.frames[0].id, /^think/);
  time += 10000; currentEditor.render(100);
  assert.match(currentEditor.displaySheet.frames[0].id, /^think/, "A paused work hold cannot permanently latch the old work face after the tool ends");
  currentEditor.setText("keep my poke draft🙂");
  const beforePokeConfig = await readFile(join(scratch, "config.json"), "utf8"), beforePokeSubmits = submits.length;
  await command("poke"); assert.equal(jobs.size, 1); currentEditor.render(100);
  assert.equal(currentEditor.displaySheet.frames[0].id, "poke");
  const pokeFirst = currentEditor.displaySheet.frames[0].cacheKey;
  const pokePixels = Array.from(currentEditor.displaySheet.frames[0].pixels);
  tick(); tick(); currentEditor.render(100);
  assert.equal(currentEditor.displaySheet.frames[0].cacheKey, pokeFirst,
    "The registered whole-frame HD poke retains its body/support instead of applying the legacy deformation rig");
  assert.deepEqual(Array.from(currentEditor.displaySheet.frames[0].pixels), pokePixels);
  while (jobs.size) { tick(); currentEditor.render(100); }
  assert.match(currentEditor.displaySheet.frames[0].id, /^think/);
  assert.equal(currentEditor.getText(), "keep my poke draft🙂"); assert.equal(submits.length, beforePokeSubmits);
  assert.equal(await readFile(join(scratch, "config.json"), "utf8"), beforePokeConfig);
  await emit("agent_before_settle", { outcome: "completed" }); await emit("agent_settled", { aborted: false });
  currentEditor.setText(""); await command("play");
  checks.push("Paused work→thinking changes immediately and stays correct across a tokenless gap; regular /mascot poke holds its registered HD pose then restores the real static pose, stops its temporary timer and preserves draft/config/submission count");

  let menuNativeCalls = 0;
  currentEditor.actionHandlers.set("app.message.copy", () => { menuNativeCalls++; });
  ctx.ui.select = async (_title, options) => options.find((option) => /复制/.test(option));
  currentEditor.setText("regular menu draft🙂"); const beforeMenuSubmits = submits.length;
  assert.equal(facade.mode, "regular"); await command("menu");
  assert.equal(menuNativeCalls, 1, "The regular-mode /mascot menu command reaches a public native action without requiring mouse capture");
  assert.equal(currentEditor.getText(), "regular menu draft🙂"); assert.equal(submits.length, beforeMenuSubmits);
  const shortcut = extension.shortcuts.get("ctrl+alt+w"); assert.ok(shortcut);
  const previousShortcut = currentEditor.onExtensionShortcut; let shortcutCompletion;
  currentEditor.onExtensionShortcut = (data) => {
    if (!matchesKey(data, "ctrl+alt+w")) return false;
    shortcutCompletion = shortcut.handler(ctx); return true;
  };
  currentEditor.handleInput("\x1b\x17"); await shortcutCompletion;
  assert.equal(menuNativeCalls, 2); assert.equal(currentEditor.getText(), "regular menu draft🙂"); assert.equal(submits.length, beforeMenuSubmits);
  await shortcut.handler({ ...ctx, mode: "rpc" }); assert.equal(menuNativeCalls, 2, "Terminal quick-menu shortcuts are inert outside TUI mode");
  currentEditor.onExtensionShortcut = previousShortcut;
  currentEditor.setText("");
  checks.push("Regular-mode /mascot menu and the registered Ctrl+Alt+W shortcut reach native actions without mouse capture, changing draft text or submitting a prompt; the shortcut is inert in RPC mode");

  const beforeAgentHandlers=extension.handlers.get("before_agent_start") || [];
  assert.ok(beforeAgentHandlers.length,"Persona prompt hook must be registered");
  const originalPrompt="原始系统提示词：保持事实准确。\nTools and permissions remain unchanged.\nLiteral suffix: <END>";
  const runBeforeAgent=async(targetCtx=ctx)=>{
    let result;
    const systemPromptOptions = { customPrompt: originalPrompt, sections: {} };
    for(const handler of beforeAgentHandlers){const value=await handler({type:"before_agent_start",prompt:"hello",systemPrompt:originalPrompt,systemPromptOptions},targetCtx);if(value!==undefined)result=value;}
    return { result, systemPromptOptions };
  };
  assert.deepEqual(await runBeforeAgent(),{result:undefined,systemPromptOptions:{customPrompt:originalPrompt,sections:{}}},"Persona must be off by default");
  await command("persona on");
  const personaPrompt=await runBeforeAgent();
  const templatePath=join(scratch,"prompts/umi-persona.md");
  const template=(await readFile(templatePath,"utf8")).trim();
  assert.ok(template.length>0);
  assert.equal(personaPrompt.result,undefined,"Persona must not return a whole-prompt override");
  assert.equal(personaPrompt.systemPromptOptions.customPrompt,originalPrompt,"The original custom system prompt stays exact");
  assert.equal(personaPrompt.systemPromptOptions.forceSystemPrompt,undefined);
  assert.equal(personaPrompt.systemPromptOptions.sections.umi_persona,template,"The saved template has its own structured section");
  assert.deepEqual(await runBeforeAgent({...ctx,mode:"rpc"}),{result:undefined,systemPromptOptions:{customPrompt:originalPrompt,sections:{}}},"Persona must not inject outside TUI");
  await command("persona status");
  await command("persona off");assert.deepEqual((await runBeforeAgent()).systemPromptOptions.sections,{},"Disabling persona must remove injection from the next request");
  assert.equal(JSON.parse(await readFile(join(scratch,"config.json"),"utf8")).persona,false);
  await command("persona on");
  const missingNoticeCount=notices.length;
  await rename(templatePath,templatePath+".saved");
  try{
    assert.deepEqual((await runBeforeAgent()).systemPromptOptions.sections,{},"A missing template must fail open without replacing the original prompt");
    assert.ok(notices.length>missingNoticeCount,"A missing template must notify the user");
  }finally{await rename(templatePath+".saved",templatePath);await command("persona off");}
  checks.push("Persona hook defaults off; TUI on adds an independent structured section without a forced prompt, custom text stays exact, off retracts it, RPC never injects and missing templates fail open with a notice");

  const framePreviews = [];
  for (const language of ["en", "zh-CN"]) {
    await command(`language ${language}`);
    for (const padding of [0, 1, 3]) {
      currentEditor.setPaddingX(padding);
      for (const text of ["", "你好🙂abc", "first line\n第二行 👩‍💻e\u0301", "中文🙂".repeat(35)]) {
        currentEditor.setText(text); currentEditor.focused = true;
        for (const width of [1, 2, 3, 4, 5, 8, 20, 39, 55, 60, 80, 100, 160]) {
          const rows = currentEditor.render(width), geometry = currentEditor.geometry;
          assertClosedFrame(rows, width);
          const actual = marker(rows);
          assert.ok(actual.col >= geometry.contentX && actual.col < geometry.contentX + geometry.editorWidth, "The IME marker stays inside the text area, including impossible one-cell wide-grapheme fallbacks");
          if (geometry.editorWidth >= 4 && geometry.editorWidth === geometry.nativeRenderWidth) {
            const baseline = nativeEditor(); baseline.setPaddingX(padding); baseline.setText(text);
            const expected = marker(baseline.render(geometry.editorWidth));
            assert.equal(actual.col, expected.col + geometry.contentX);
            assert.equal(actual.row, expected.row + geometry.offsetY);
          }
        }
      }
    }
    currentEditor.setPaddingX(0); currentEditor.setText(language === "en" ? "Let's try a little idea." : "可以试试这个小点子呀。");
    const rows = currentEditor.render(100), geometry = currentEditor.geometry;
    framePreviews.push({ language, lines: plain(rows.slice(geometry.offsetY, geometry.offsetY + geometry.nativeHeight)).map((line) => sliceByColumn(line, geometry.leftWidth, 100 - geometry.leftWidth)) });
  }
  await writeFile(join(work, "editor-frame-previews.json"), JSON.stringify(framePreviews, null, 2) + "\n");
  currentEditor.setPaddingX(0); currentEditor.setText("");
  checks.push("Actual English/Chinese input frames reserve both side columns before native layout: connected corners and every visible text wall stay closed, padding/wide graphemes/emoji/multiline wrapping fit widths 1–160 and IME markers match the native inner editor or remain safely clamped in impossible one-cell layouts");

  for (const text of ["hello", "你好🙂abc", "第一行🙂\n第二行中文🙂", "中文🙂".repeat(90)]) {
    currentEditor.setText(text); currentEditor.focused = true;
    for (const width of [40,59,60,80,100,160]) {
      terminal.columns = width;
      const lines = currentEditor.render(width), geometry = currentEditor.geometry;
      assertClosedFrame(lines, width);
      const baseline = nativeEditor(); baseline.setText(text); const nativeLines = baseline.render(geometry.editorWidth);
      const actual = marker(lines), expected = marker(nativeLines);
      assert.equal(actual.col, expected.col + geometry.contentX);
      assert.equal(actual.row, expected.row + geometry.offsetY);
      for (const line of lines) assert.ok(visibleWidth(line) <= width, `editor overflow ${width}`);
      if (width < 60) assert.equal(geometry.leftWidth, 0);
    }
  }
  terminal.columns = 100; currentEditor.setText("你好🙂abc\n第二行🙂xyz");
  let lines = currentEditor.render(100), geometry = currentEditor.geometry;
  let baseline = nativeEditor(); baseline.setText(currentEditor.getText()); baseline.render(geometry.editorWidth);
  for (const x of [0,2,4,6,10]) {
    const productResult = currentEditor.handleMouse(mouse(x+geometry.contentX, geometry.offsetY+1, 100, lines.length));
    const nativeResult = baseline.handleMouse(mouse(x,1,geometry.editorWidth,geometry.nativeHeight));
    assert.deepEqual(currentEditor.getCursor(), baseline.getCursor()); assert.deepEqual(productResult,nativeResult);
  }
  const cursorBefore = currentEditor.getCursor();
  currentEditor.handleMouse(mouse(1,1,100,lines.length)); assert.deepEqual(currentEditor.getCursor(),cursorBefore);
  assert.equal(currentEditor.handleMouse(mouse(geometry.contentX+2,geometry.offsetY+1,100,lines.length,{type:"drag"})),undefined);
  checks.push("CJK/emoji/multiline/wrapped input keeps native marker coordinates plus dock offsets; clicks translate correctly and drag selection stays native");

  for (const input of ["\x01","Z","\x05","\x0b","\x19"]) { currentEditor.handleInput(input); baseline.handleInput(input); assert.equal(currentEditor.getText(),baseline.getText()); assert.deepEqual(currentEditor.getCursor(),baseline.getCursor()); }
  currentEditor.handleInput("\x1b[200~粘贴🙂\n第二行\x1b[201~");
  assert.ok(currentEditor.getExpandedText().includes("粘贴🙂\n第二行"));
  currentEditor.setText("submit🙂中文"); currentEditor.handleInput("\r"); assert.equal(submits.at(-1),"submit🙂中文");
  const beforeEscape = escapes; currentEditor.handleInput("\x1b"); assert.equal(escapes,beforeEscape+1);
  checks.push("Native editing navigation/kill-yank, bracketed paste, Enter submit and application Escape callback survive the custom editor");

  const provider = new CombinedAutocompleteProvider(Array.from({length:12},(_,i)=>({name:`cmd-${i}`,description:`中文说明 ${i} `.repeat(15)})),scratch,null);
  currentEditor.setAutocompleteProvider(provider); currentEditor.setText("/"); currentEditor.handleInput("\t"); await flush();
  assert.equal(currentEditor.isShowingAutocomplete(),true);
  for(const width of [40,60,80,120]) { lines=currentEditor.render(width); assertClosedFrame(lines,width); for(const line of lines)assert.ok(visibleWidth(line)<=width,`autocomplete overflow ${width}`); }
  lines=currentEditor.render(100);geometry=currentEditor.geometry;
  const autocompleteRow=currentEditor.renderedVisibleLineCount+2;
  currentEditor.handleMouse(mouse(geometry.contentX+3,geometry.offsetY+autocompleteRow+1,100,lines.length));
  assert.ok(currentEditor.getText().startsWith("/cmd-1"));
  assert.equal(currentEditor.isShowingAutocomplete(),false);
  currentEditor.setAutocompleteProvider(new CombinedAutocompleteProvider([],scratch,null)); currentEditor.setText("");
  terminal.rows=21; currentEditor.render(100); assert.equal(currentEditor.geometry.leftWidth,0);
  terminal.rows=40;
  checks.push("Real slash autocomplete stays within reduced width and accepts offset mouse selection; short/narrow windows collapse the dock");

  await emit("agent_start");
  const timerId=[...jobs.keys()][0];
  for(let i=0;i<50;i++){time+=2;await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"text_delta",delta:"x"}});}
  assert.equal(jobs.size,1);assert.strictEqual([...jobs.keys()][0],timerId,"Token updates must not postpone the same animation deadline");
  tick();assert.equal(jobs.size,1);
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"text_end"}});
  const streamedEdit={type:"toolCall",id:"stream-edit",name:"edit",arguments:{edits:"NEVER_ECHO_STREAMED_EDIT"}};
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_start",contentIndex:0,partial:{role:"assistant",content:[streamedEdit]}}});
  let streamedLines=plain(currentEditor.render(160)).join(" ");
  assert.match(streamedLines,/我改改呀/);assert.ok(!streamedLines.includes("NEVER_ECHO_STREAMED_EDIT"));
  for(let i=0;i<8;i++){tick();currentEditor.render(160);}assert.match(currentEditor.displaySheet.frames[0].id,/^work/);
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_delta",contentIndex:0,delta:"private edit delta",partial:{role:"assistant",content:[streamedEdit]}}});
  assert.match(plain(currentEditor.render(160)).join(" "),/我改改呀/);
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_end",contentIndex:0,toolCall:streamedEdit,partial:{role:"assistant",content:[streamedEdit]}}});
  await emit("message_end",{message:{role:"assistant",stopReason:"toolUse"}});assert.match(plain(currentEditor.render(160)).join(" "),/我改改呀/);
  await emit("tool_execution_start",{toolCallId:streamedEdit.id,toolName:streamedEdit.name,args:{path:"src/edit.ts",edits:[]}});
  assert.match(plain(currentEditor.render(160)).join(" "),/我改改呀/);
  await emit("tool_execution_end",{toolCallId:streamedEdit.id,isError:false});
  await emit("message_start",{message:{role:"assistant"}});
  const streamedWrite={type:"toolCall",id:"stream-write",name:"write",arguments:{content:"NEVER_ECHO_STREAMED_WRITE"}};
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_start",contentIndex:1,partial:{role:"assistant",content:[streamedEdit,streamedWrite]}}});
  streamedLines=plain(currentEditor.render(160)).join(" ");
  assert.match(streamedLines,/我写写呀/);assert.ok(!streamedLines.includes("NEVER_ECHO_STREAMED_WRITE"));assert.match(currentEditor.displaySheet.frames[0].id,/^work/);
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_delta",contentIndex:1,delta:"private write delta",partial:{role:"assistant",content:[streamedEdit,streamedWrite]}}});
  assert.match(plain(currentEditor.render(160)).join(" "),/我写写呀/);
  await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_end",contentIndex:1,toolCall:streamedWrite,partial:{role:"assistant",content:[streamedEdit,streamedWrite]}}});
  await emit("tool_execution_start",{toolCallId:streamedWrite.id,toolName:streamedWrite.name,args:{path:"src/new.ts",content:"NEVER_ECHO_STREAMED_WRITE"}});
  assert.match(plain(currentEditor.render(160)).join(" "),/我写写呀/);
  await emit("tool_execution_end",{toolCallId:streamedWrite.id,isError:false});
  for(const [name,bubble] of [["codemode","我写代码"],["bash","敲命令呀"],["ask_user","我问问呀"],["read","我读读呀"],["grep","我找找呀"],["web_search","我搜网页"],["tool_search","我找工具"],["mcp__jira__transition_issue","我准备呀"]]){
    await emit("message_start",{message:{role:"assistant"}});
    const call={type:"toolCall",id:`stream-${name}`,name,arguments:{private:"NEVER_ECHO_GENERIC_STREAM"}};
    await emit("message_update",{message:{role:"assistant"},assistantMessageEvent:{type:"toolcall_start",contentIndex:0,partial:{role:"assistant",content:[call]}}});
    streamedLines=plain(currentEditor.render(160)).join(" ");assert.ok(streamedLines.includes(bubble),name);assert.ok(!streamedLines.includes("NEVER_ECHO_GENERIC_STREAM"),name);assert.match(currentEditor.displaySheet.frames[0].id,/^work/);
    await emit("message_end",{message:{role:"assistant",stopReason:"length"}});
  }
  await emit("tool_execution_start",{toolCallId:"one",toolName:"read",args:{path:"src/main.ts",command:"NEVER_ECHO_SECRET"}});
  await emit("tool_execution_start",{toolCallId:"two",toolName:"bash",args:{command:"NEVER_ECHO_SECRET"}});
  assert.ok(!plain(currentEditor.render(160)).join(" ").includes("NEVER_ECHO_SECRET"));
  await emit("tool_execution_end",{toolCallId:"two",isError:false});await emit("tool_execution_end",{toolCallId:"one",isError:false});
  await emit("agent_before_settle",{outcome:"completed"});await emit("agent_settled",{aborted:false});
  checks.push("Real registered stream events give every built-in/custom tool a private-safe typing pose and category bubble before execution; parallel tools and token bursts retain one timer without secret payloads");

  const phraseData = JSON.parse(await readFile(join(scratch,"assets/status-phrases.json"),"utf8"));
  currentEditor.setWorkingStatusIndicator({kind:"working",renderInBorder:()=>"Working",renderSpinnerInBorder:()=>"*"});
  await command("demo thinking");currentEditor.setText("");
  const busyLines=plain(currentEditor.render(160));
  const activePhrase=phraseData.phrases.thinking.find((phrase)=>busyLines.some((line)=>line.includes(phrase)));
  assert.ok(activePhrase,"The dynamic Wumi phrase must replace the native busy caption");
  assert.equal(busyLines.filter((line)=>line.includes(activePhrase)).length,1,"The phrase must occur once, in the native top border");
  assert.ok(busyLines.find((line)=>line.includes(activePhrase)).trimStart().startsWith("╭──"));
  assert.ok(!busyLines.join("\n").includes("Working"));
  for(const width of [1,2,4,8,12,20,39,55,60,80,100,160]){
    const rows=currentEditor.render(width);
    for(const row of rows)assert.ok(visibleWidth(row)<=width,`busy border overflow at ${width}`);
    assert.ok(!plain(rows).join("\n").includes("Working"));
    if(width<60)assert.equal(currentEditor.geometry.offsetY,0,"Collapsed editors must not retain a spare activity row");
  }
  currentEditor.setText(Array.from({length:35},(_,i)=>`hidden input ${i}`).join("\n"));
  const scrolled=plain(currentEditor.render(100));
  assert.ok(currentEditor.scrollOffset>0);
  assert.ok(scrolled.some((line)=>line.includes(`↑ ${currentEditor.scrollOffset} 行`)),"The same top border must preserve native hidden-line counts");
  const beforeBusyEscape=escapes;currentEditor.handleInput("\x1b");assert.equal(escapes,beforeBusyEscape+1);
  currentEditor.setWorkingStatusIndicator(undefined);currentEditor.setText("");await command("demo off");
  checks.push("Busy status occupies one native top border: one dynamic Wumi phrase, no literal Working or spare activity row, hidden-line counts survive, widths 1–160 fit and Escape remains active");

  // Exercise the product's actual activity -> motion -> Sixel single-frame path.
  const advanceDock = (count = 5) => {
    let rendered;
    for (let i = 0; i < count; i++) { tick(); rendered = currentEditor.render(100); }
    return rendered;
  };
  const tourConfig=await readFile(join(scratch,"config.json"),"utf8"),tourSubmits=submits.length;
  currentEditor.setText("Keep this draft during the animation tour");const tourDraft=currentEditor.getText();
  await command("demo");currentEditor.render(100);advanceDock(6);
  assert.match(notices.at(-1).message,/全部动作/);assert.match(currentEditor.displaySheet.frames[0].id,/^rest/);
  assert.ok(currentEditor.motion.stats().logicalTime>0);
  time+=DEMO_PERIOD_MS;currentEditor.render(100);
  assert.equal(currentEditor.motion.stats().logicalTime,0,"Skipping a whole tour lap into the same waking state must restart its motion epoch once");
  assert.equal(currentEditor.getText(),tourDraft);assert.equal(submits.length,tourSubmits);assert.equal(jobs.size,1);
  assert.equal(await readFile(join(scratch,"config.json"),"utf8"),tourConfig,"Tour selection must not save or modify preferences");
  await command("demo all");
  const runningOffset=DEMO_SEQUENCE.slice(0,DEMO_SEQUENCE.findIndex(step=>step.phase==="running")).reduce((sum,step)=>sum+step.durationMs,0);
  time+=runningOffset+500;currentEditor.render(100);advanceDock(6);assert.match(currentEditor.displaySheet.frames[0].id,/^watch/);
  await command("demo off");currentEditor.render(100);advanceDock(6);assert.match(currentEditor.displaySheet.frames[0].id,/^idle/);
  await command("pause");const tourPausedConfig=await readFile(join(scratch,"config.json"),"utf8");
  await command("demo all");currentEditor.render(100);assert.equal(jobs.size,0);assert.match(notices.at(-1).message,/我先乖乖不动啦.*\/mascot play/);
  assert.equal(await readFile(join(scratch,"config.json"),"utf8"),tourPausedConfig);await command("demo off");await command("play");
  await command("layout header");const tourHeaderConfig=await readFile(join(scratch,"config.json"),"utf8");
  await command("demo");assert.match(notices.at(-1).message,/\/mascot layout editor/);assert.equal(await readFile(join(scratch,"config.json"),"utf8"),tourHeaderConfig);
  await command("demo off");await command("layout editor");currentEditor.setText("");
  checks.push("Default/all demo loops every animation without requests, extra timers, draft/submission or preference changes; whole-lap same-state motion restarts, paused/header modes give actionable hints, and off restores the actual pose");
  for (const style of ["umi", "umi-pixel"]) {
    const originalPixel = style === "umi-pixel";
    await command(`style ${style}`);
    await command("demo running"); currentEditor.render(100); advanceDock();
    assert.match(currentEditor.displaySheet.frames[0].id, originalPixel ? /^work/ : /^watch/);
    assert.equal(currentEditor.displaySheet.width, style === "umi-pixel" ? 100 : 240);
    assert.equal(currentEditor.displaySheet.frames.length, 1);
    const watchKey = currentEditor.displaySheet.frames[0].cacheKey;
    advanceDock(12);
    if (!originalPixel) assert.notEqual(currentEditor.displaySheet.frames[0].cacheKey, watchKey, "The authored magnifier sequence must advance beyond its readable first cel");
    for (const [phase, expectedId] of [["editing", /^work/], ["searching", /^search/], ["compacting", /^search/], ["error", /^error/], ["success", /^happy/]]) {
      await command(`demo ${phase}`); currentEditor.render(100);
      if (!originalPixel) assert.equal(currentEditor.motion.stats().transitioning, false,
        "Complete registered HD poses switch without legacy frame blending");
      if (!originalPixel) assert.equal(currentEditor.motion.stats().palettePairs, 0,
        "HD state changes cannot synthesize mixed source colors");
      // Distinct work/watch tool poses now honor the 1200ms readable gesture.
      advanceDock(phase === "editing" ? 30 : 5);
      assert.match(currentEditor.displaySheet.frames[0].id,
        originalPixel && ["searching", "compacting"].includes(phase) ? /^work/ : expectedId);
      assert.equal(currentEditor.displaySheet.width, originalPixel ? 100 : 240);
      assert.ok(currentEditor.motion.stats().frames <= 64);
      for (const line of currentEditor.render(100)) assert.ok(visibleWidth(line) <= 100);
    }
    await command("pause"); currentEditor.render(100);
    const frozen = currentEditor.displaySheet.frames[0].cacheKey;
    const frozenMotionTime = currentEditor.motion.stats().logicalTime;
    time += 1300; currentEditor.render(100);
    assert.equal(currentEditor.displaySheet.frames[0].cacheKey, frozen);
    assert.equal(currentEditor.motion.stats().logicalTime, frozenMotionTime);
    assert.equal(jobs.size, 0);
    await command("play"); currentEditor.render(100); assert.equal(jobs.size, 1);
  }
  await command("demo off"); await command("style umi"); currentEditor.render(100);
  checks.push("Real umi HD and original 100px pixel docks render through Sixel: HD magnifier/action poses avoid blending, original pixel retains work fallback for running/search, both stay bounded and pause completely");

  terminal.columns=100;terminal.rows=40;currentEditor.setText("");historyLength=120;
  renderer.renderNow();assert.ok(renderer.captureRenderState().previousViewportTop>0);
  const headerBefore=currentHeader.render(100);terminalWrites.length=0;
  await command("demo speaking");tick();renderer.renderNow();
  assert.deepEqual(currentHeader.render(100),headerBefore);
  assert.ok(!terminalWrites.join("").includes("\x1b[3J"));assert.ok(dcsCount()>0);
  const rawMarkers=(renderer.captureRenderState().previousLines.join("").match(/\x1b\]777;pi-furry-partner-/g)||[]).length;
  assert.ok(rawMarkers>0);assert.ok(dcsCount()<=rawMarkers,"A differential update can reuse unchanged stripe rows and must never duplicate the full set of retained image anchors");
  checks.push("Long real main-screen history keeps title stable and animates only the visible editor, with no ESC[3J or duplicate Sixel translation");

  // The public language command changes the real mounted editor without
  // restarting the activity session or submitting/replacing the user's draft.
  await command("demo off");
  currentEditor.setText("language switch draft🙂");
  const languageDraft = currentEditor.getText(), languageSubmits = submits.length;
  await emit("agent_start");
  await emit("tool_execution_start", { toolCallId: "language-keep", toolName: "bash", args: { command: "NEVER_ECHO_SECRET" } });
  time += 1200;
  await command("language en");
  assert.equal(currentEditor.getText(), languageDraft);
  assert.equal(submits.length, languageSubmits);
  assert.ok(plain(currentHeader.render(160)).join("\n").includes("Umi · Your coding companion"));
  const englishRows = plain(currentEditor.render(160)).join("\n");
  assert.ok(englishRows.includes("bash"), "The active tool must remain attached across the language switch");
  assert.ok(!/[\u3400-\u9fff]/u.test(englishRows), "English editor should contain no untranslated companion labels, phrases, bubbles or keyboard hints");
  // This assertion checks language preservation, so allow the generated test
  // directory to fit even when the suite runs inside a nested build stage.
  // Narrow-width truncation is covered separately by the footer layout suite.
  const englishFooter = plain(currentFooter.render(Math.max(160, visibleWidth(scratch) + 80))).join("\n");
  assert.ok(englishFooter.includes("test/中文"), "Language must not rewrite the user's branch name");
  assert.ok(!/[\u3400-\u9fff]/u.test(englishFooter.replace("test/中文", "")));
  assert.equal(jobs.size, 1);
  const savedEnglish = JSON.parse(await readFile(join(scratch, "config.json"), "utf8"));
  assert.equal(savedEnglish.language, "en"); assert.equal(savedEnglish.chineseUI, true); assert.equal(savedEnglish.compactPrompt, true);
  await command("demo all");assert.match(notices.at(-1).message,/every animation in a loop/);assert.ok(!/[\u3400-\u9fff]/u.test(notices.at(-1).message));
  await command("demo off");assert.match(notices.at(-1).message,/real task state/);
  await command("language zh-CN");
  assert.equal(currentEditor.getText(), languageDraft);
  assert.equal(submits.length, languageSubmits);
  assert.ok(plain(currentEditor.render(160)).join("\n").includes("bash"));
  assert.ok(plain(currentHeader.render(160)).join("\n").includes("呜咪 · 你的工作搭档"));
  await emit("tool_execution_end", { toolCallId: "language-keep", isError: false });
  await emit("agent_before_settle", { outcome: "completed" }); await emit("agent_settled", { aborted: false });
  currentEditor.setText("");
  checks.push("Actual mounted editor/header/footer switch English and back while a real tool event is active: draft, submission count, active tool and single animation timer survive, native Chinese/prompt preferences persist and no Chinese companion text leaks into English");

  const main=renderer;
  renderer=new TuiAltScreen(terminal,false,undefined,{mouse:false});renderer.requestRender=()=>{redraws++};
  const editorHolder=holder(()=>currentEditor);
  const scroll=new ScrollView(editorHolder,{primary:true,follow:"none",scrollbar:"always"});
  const blank={render:()=>[],invalidate(){}};
  renderer.setLayoutRoot(new VStack([{component:scroll,basis:6,shrink:0},{component:blank,grow:1}]));
  terminalWrites.length=0;renderer.start();renderer.renderNow();
  let visibleMarkers=renderer.getScreenLines().filter((line)=>line.includes("\x1b]777;pi-furry-partner-")).length;
  assert.ok(visibleMarkers>0 && visibleMarkers<8);assert.equal(dcsCount(),visibleMarkers);
  terminalWrites.length=0;scroll.scrollTo(3);renderer.renderNow();
  visibleMarkers=renderer.getScreenLines().filter((line)=>line.includes("\x1b]777;pi-furry-partner-")).length;
  assert.ok(visibleMarkers>0);assert.equal(dcsCount(),visibleMarkers);
  const overlay=renderer.showOverlay({render:()=>["POP"],invalidate(){}},{width:3,row:2,col:3,nonCapturing:true});
  terminalWrites.length=0;renderer.renderNow();assert.equal(dcsCount(),0);
  overlay.hide();terminalWrites.length=0;renderer.renderNow();assert.ok(dcsCount()>0);
  renderer.stop({preserveScreen:true});renderer=main;
  checks.push("Real fullscreen layout clips the actual dock to visible row stripes, and a narrow overlay suppresses Sixel until dismissed");

  api.setCapabilities({images:"kitty",trueColor:true,hyperlinks:true});
  for(const args of ["pause","play","style pixel","style illustration","style wumi-pixel","style wumi","size small","size large","info native","info compact","layout header","style illustration","style pixel","layout editor","render blocks","render kitty","render auto","off","on"]){
    const outgoingEditor = currentEditor;
    await command(args);
    if (outgoingEditor !== currentEditor && outgoingEditor?.motion) {
      const writesBefore = terminalWrites.length, timersBefore = jobs.size;
      for (const width of [100, 40, 1, 0]) assert.deepEqual(outgoingEditor.render(width), [], `Retired editor renders nothing after ${args}`);
      outgoingEditor.dispose();
      outgoingEditor.handleInput("must not enter the retired draft");
      assert.equal(outgoingEditor.handleMouse(mouse(0, 0, 100, 40)), undefined);
      assert.equal(terminalWrites.length, writesBefore);
      assert.equal(jobs.size, timersBefore);
    }
    assert.ok(jobs.size<=1,`More than one timer after ${args}`);
    const editorLines=currentEditor.render(100);currentHeader?.render(100);currentFooter?.render(100);
    if(args==="render kitty") assert.ok(editorLines.some((line)=>line.includes("\x1b_Ga=T")),"Explicit Kitty mode must reach the extension's native image branch");
    if(args==="off"){assert.ok(terminalWrites.join("").includes("\x1b_Ga=d,d=I,"),"Disposal must release Kitty image IDs");assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);assert.equal(currentFactory,undefined);}
  }
  const kittyBeforeOverlay = currentEditor.render(100);
  assert.ok(kittyBeforeOverlay.some((line) => line.includes("\x1b_Ga=T")), "Kitty rows render before a popup opens");
  const kittyOverlay = renderer.showOverlay({ render: () => ["popup body"], invalidate() {} }, { row: 2, col: 26, width: 20, nonCapturing: true });
  const kittyDuringOverlay = currentEditor.render(100);
  assert.ok(kittyDuringOverlay.some((line) => line.includes("\x1b_Ga=T")), "A non-overlapping popup retains high-resolution Kitty rows");
  renderer.renderNow();
  assert.ok(renderer.captureRenderState().previousLines.some((line) => line.includes("popup body")), "Pi composites popup text beside the retained Kitty rows");
  assert.ok(renderer.captureRenderState().previousLines.some((line) => line.includes("\x1b_G")));
  kittyOverlay.hide(); renderer.renderNow();
  const kittyAfterOverlay = currentEditor.render(100);
  assert.ok(kittyAfterOverlay.some((line) => line.includes("\x1b_Ga=T")), "Kitty rows remain available after the popup closes");
  assert.ok(renderer.captureRenderState().previousLines.some((line) => line.includes("\x1b_G")));
  checks.push("Kitty keeps high-resolution mascot rows beside Pi overlays instead of falling back to terminal blocks; per-row overlap deletion and restoration are unit-covered at final terminal coordinates");
  assert.ok(branchUnsubs>0);
  let foreignHeaderDisposals=0, foreignFooterDisposals=0;
  const foreignHeader={render:()=>["foreign header"],invalidate(){},dispose(){foreignHeaderDisposals++}};
  const foreignFooter={render:()=>["foreign footer"],invalidate(){},dispose(){foreignFooterDisposals++}};
  ctx.ui.setHeader(()=>foreignHeader);ctx.ui.setFooter(()=>foreignFooter);
  await command("off");
  assert.strictEqual(currentHeader,foreignHeader);assert.strictEqual(currentFooter,foreignFooter);
  assert.equal(foreignHeaderDisposals,0);assert.equal(foreignFooterDisposals,0);
  assert.strictEqual(terminal.write,nativeWrite);assert.equal(jobs.size,0);
  await command("on");
  assert.equal(foreignHeaderDisposals,1);assert.equal(foreignFooterDisposals,1);
  checks.push("External header/footer takeover revokes ownership: mascot off leaves foreign components intact, while explicit on can reclaim its configured UI");
  await command("demo thinking");await command("off");assert.strictEqual(terminal.write,nativeWrite);assert.equal(jobs.size,0);
  await command("on");currentEditor.render(100);
  const shutdownEditor = currentEditor;
  const writeBeforeShutdown=terminal.write;assert.notStrictEqual(writeBeforeShutdown,nativeWrite);
  await emit("session_shutdown",{reason:"reload"});assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);
  detachHostUI();hostDisposed=true;
  assert.deepEqual(shutdownEditor.render(100), []);
  assert.equal(await shutdownEditor.openQuickActions(), false);
  // A stale context is never accessed by a timer after teardown.
  assert.equal(jobs.size,0);hostDisposed=false;
  await emit("session_start",{reason:"reload"});assert.equal(jobs.size,1);currentEditor.render(100);
  await emit("session_shutdown",{reason:"quit"});assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);detachHostUI();
  checks.push("Repeated style/layout/size/info/render/off/on changes exercise the native Kitty branch, retain a single timer/hook and release image IDs on reload/quit");

  const report={testedAt:new Date(originalClock()).toISOString(),piVersion:version,modelRequests:0,passed:true,verification:"Real Pi extension loader, CustomEditor, Theme, Keybindings and main/fullscreen rendering with fake terminal/clock; no model session or credentials",checks};
  await writeFile(join(root,"tests/integration-validation.json"),JSON.stringify(report,null,2)+"\n");
  succeeded=true;console.log(JSON.stringify(report,null,2));
} finally {
  currentHeader?.dispose?.();currentFooter?.dispose?.();currentEditor?.dispose?.();
  globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;Date.now=originalClock;
  if(originalWT===undefined)delete process.env.WT_SESSION;else process.env.WT_SESSION=originalWT;
  if(originalTMUX===undefined)delete process.env.TMUX;else process.env.TMUX=originalTMUX;
  if(originalRender===undefined)delete process.env.PI_WINK_RENDER;else process.env.PI_WINK_RENDER=originalRender;
  if(succeeded && scratch.startsWith(work+sep) && scratch.slice(work.length+1).startsWith("editor-integration-"))await rm(scratch,{recursive:true,force:true});
}
