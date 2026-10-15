import assert from "node:assert/strict";
import { cp, readFile, writeFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const { CURSOR_MARKER, visibleWidth, truncateToWidth, Container, TuiMainScreen, TuiAltScreen, ScrollView, VStack, CombinedAutocompleteProvider, setKeybindings, matchesKey } = api;
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
  for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), { recursive: true });
  await writeFile(join(scratch, "config.json"), JSON.stringify({ layout:"editor", style:"wumi", renderer:"auto", info:"compact", enabled:true, animation:true, dockSize:"auto" }));
  themeAPI.setThemeJsonValidator(validateThemeJson); themeAPI.initTheme("dark", false);
  theme = themeAPI.loadThemeFromPath(join(root, "themes/pi-furry-night.json"), "truecolor");
  editorTheme = themeAPI.getEditorTheme();
  process.env.WT_SESSION = "offline-test-windows-terminal"; delete process.env.TMUX; delete process.env.PI_WINK_RENDER;
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
  const command = (args) => extension.commands.get("mascot").handler(args, ctx);
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
    for(const handler of beforeAgentHandlers){const value=await handler({type:"before_agent_start",prompt:"hello",systemPrompt:originalPrompt},targetCtx);if(value!==undefined)result=value;}
    return result;
  };
  assert.equal(await runBeforeAgent(),undefined,"Persona must be off by default");
  await command("persona on");
  const personaPrompt=await runBeforeAgent();
  const templatePath=join(scratch,"prompts/wumi-persona.md");
  const template=(await readFile(templatePath,"utf8")).trim();
  assert.ok(template.length>0);
  assert.ok(personaPrompt?.systemPrompt.startsWith(originalPrompt+"\n\n"),"The original system prompt must remain an intact prefix");
  assert.ok(personaPrompt.systemPrompt.includes(template),"The saved template must be appended");
  assert.equal(await runBeforeAgent({...ctx,mode:"rpc"}),undefined,"Persona must not inject outside TUI");
  await command("persona status");
  await command("persona off");assert.equal(await runBeforeAgent(),undefined,"Disabling persona must remove injection from the next request");
  assert.equal(JSON.parse(await readFile(join(scratch,"config.json"),"utf8")).persona,false);
  await command("persona on");
  const missingNoticeCount=notices.length;
  await rename(templatePath,templatePath+".saved");
  try{
    assert.equal(await runBeforeAgent(),undefined,"A missing template must fail open without replacing the original prompt");
    assert.ok(notices.length>missingNoticeCount,"A missing template must notify the user");
  }finally{await rename(templatePath+".saved",templatePath);await command("persona off");}
  checks.push("Persona hook defaults off; TUI on appends its template after an intact system prompt, off retracts it, RPC never injects and missing templates fail open with a notice");

  for (const text of ["hello", "你好🙂abc", "第一行🙂\n第二行中文🙂", "中文🙂".repeat(90)]) {
    currentEditor.setText(text); currentEditor.focused = true;
    for (const width of [40,59,60,80,100,160]) {
      terminal.columns = width;
      const lines = currentEditor.render(width), geometry = currentEditor.geometry;
      const baseline = nativeEditor(); baseline.setText(text); const nativeLines = baseline.render(geometry.editorWidth);
      const actual = marker(lines), expected = marker(nativeLines);
      assert.equal(actual.col, expected.col + geometry.leftWidth);
      assert.equal(actual.row, expected.row + geometry.offsetY);
      for (const line of lines) assert.ok(visibleWidth(line) <= width, `editor overflow ${width}`);
      if (width < 60) assert.equal(geometry.leftWidth, 0);
    }
  }
  terminal.columns = 100; currentEditor.setText("你好🙂abc\n第二行🙂xyz");
  let lines = currentEditor.render(100), geometry = currentEditor.geometry;
  let baseline = nativeEditor(); baseline.setText(currentEditor.getText()); baseline.render(geometry.editorWidth);
  for (const x of [0,2,4,6,10]) {
    const productResult = currentEditor.handleMouse(mouse(x+geometry.leftWidth, geometry.offsetY+1, 100, lines.length));
    const nativeResult = baseline.handleMouse(mouse(x,1,geometry.editorWidth,geometry.nativeHeight));
    assert.deepEqual(currentEditor.getCursor(), baseline.getCursor()); assert.deepEqual(productResult,nativeResult);
  }
  const cursorBefore = currentEditor.getCursor();
  currentEditor.handleMouse(mouse(1,1,100,lines.length)); assert.deepEqual(currentEditor.getCursor(),cursorBefore);
  assert.equal(currentEditor.handleMouse(mouse(geometry.leftWidth+2,geometry.offsetY+1,100,lines.length,{type:"drag"})),undefined);
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
  for(const width of [40,60,80,120]) { lines=currentEditor.render(width); for(const line of lines)assert.ok(visibleWidth(line)<=width,`autocomplete overflow ${width}`); }
  lines=currentEditor.render(100);geometry=currentEditor.geometry;
  const autocompleteRow=currentEditor.renderedVisibleLineCount+2;
  currentEditor.handleMouse(mouse(geometry.leftWidth+3,geometry.offsetY+autocompleteRow+1,100,lines.length));
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
  await emit("tool_execution_start",{toolCallId:"one",toolName:"read",args:{path:"src/main.ts",command:"NEVER_ECHO_SECRET"}});
  await emit("tool_execution_start",{toolCallId:"two",toolName:"bash",args:{command:"NEVER_ECHO_SECRET"}});
  assert.ok(!plain(currentEditor.render(160)).join(" ").includes("NEVER_ECHO_SECRET"));
  await emit("tool_execution_end",{toolCallId:"two",isError:false});await emit("tool_execution_end",{toolCallId:"one",isError:false});
  await emit("agent_before_settle",{outcome:"completed"});await emit("agent_settled",{aborted:false});
  checks.push("Real registered state events handle parallel tools without secret payloads; token bursts retain exactly one existing animation deadline");

  const phraseData = JSON.parse(await readFile(join(scratch,"assets/status-phrases.json"),"utf8"));
  currentEditor.setWorkingStatusIndicator({kind:"working",renderInBorder:()=>"Working",renderSpinnerInBorder:()=>"*"});
  await command("demo thinking");currentEditor.setText("");
  const busyLines=plain(currentEditor.render(160));
  const activePhrase=phraseData.phrases.thinking.find((phrase)=>busyLines.some((line)=>line.includes(phrase)));
  assert.ok(activePhrase,"The dynamic Wumi phrase must replace the native busy caption");
  assert.equal(busyLines.filter((line)=>line.includes(activePhrase)).length,1,"The phrase must occur once, in the native top border");
  assert.ok(busyLines.find((line)=>line.includes(activePhrase)).trimStart().startsWith("──"));
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
  for (const style of ["wumi", "wumi-pixel"]) {
    await command(`style ${style}`);
    await command("demo running"); currentEditor.render(100); advanceDock();
    assert.match(currentEditor.displaySheet.frames[0].id, /^work/);
    assert.equal(currentEditor.displaySheet.width, style === "wumi-pixel" ? 80 : 240);
    assert.equal(currentEditor.displaySheet.frames.length, 1);
    const typingKey = currentEditor.displaySheet.frames[0].cacheKey;
    advanceDock(2); assert.notEqual(currentEditor.displaySheet.frames[0].cacheKey, typingKey, "Typing/micro-motion must produce actual new rendered pixels");
    for (const [phase, expectedId] of [["editing", /^work/], ["searching", /^search/], ["compacting", /^search/], ["error", /^error/], ["success", /^happy/]]) {
      const before = currentEditor.displaySheet.frames[0].cacheKey;
      await command(`demo ${phase}`); currentEditor.render(100);
      assert.equal(currentEditor.displaySheet.frames[0].cacheKey, before, "A phase change starts from the displayed frame instead of jumping to a new pose");
      advanceDock(); assert.match(currentEditor.displaySheet.frames[0].id, expectedId);
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
  await command("demo off"); await command("style wumi"); currentEditor.render(100);
  checks.push("Real wumi and crisp wumi-pixel docks render one-frame motion sheets through Sixel: typing, buried searching/compacting, XX error and success transition from the displayed frame, stay bounded and pause completely");

  terminal.columns=100;terminal.rows=40;currentEditor.setText("");historyLength=120;
  renderer.renderNow();assert.ok(renderer.captureRenderState().previousViewportTop>0);
  const headerBefore=currentHeader.render(100);terminalWrites.length=0;
  await command("demo speaking");tick();renderer.renderNow();
  assert.deepEqual(currentHeader.render(100),headerBefore);
  assert.ok(!terminalWrites.join("").includes("\x1b[3J"));assert.ok(dcsCount()>0);
  const rawMarkers=(renderer.captureRenderState().previousLines.join("").match(/\x1b\]777;pi-furry-partner-/g)||[]).length;
  assert.ok(rawMarkers>0);assert.ok(dcsCount()<=rawMarkers,"A differential update can reuse unchanged stripe rows and must never duplicate the full set of retained image anchors");
  checks.push("Long real main-screen history keeps title stable and animates only the visible editor, with no ESC[3J or duplicate Sixel translation");

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

  for(const args of ["pause","play","style pixel","style illustration","style wumi-pixel","style wumi","size small","size large","info native","info compact","layout header","style illustration","style pixel","layout editor","render blocks","render auto","off","on"]){
    await command(args);
    assert.ok(jobs.size<=1,`More than one timer after ${args}`);
    currentEditor.render(100);currentHeader?.render(100);currentFooter?.render(100);
    if(args==="off"){assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);assert.equal(currentFactory,undefined);}
  }
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
  const writeBeforeShutdown=terminal.write;assert.notStrictEqual(writeBeforeShutdown,nativeWrite);
  await emit("session_shutdown",{reason:"reload"});assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);
  detachHostUI();hostDisposed=true;
  // A stale context is never accessed by a timer after teardown.
  assert.equal(jobs.size,0);hostDisposed=false;
  await emit("session_start",{reason:"reload"});assert.equal(jobs.size,1);currentEditor.render(100);
  await emit("session_shutdown",{reason:"quit"});assert.equal(jobs.size,0);assert.strictEqual(terminal.write,nativeWrite);detachHostUI();
  checks.push("Repeated style/layout/size/info/render/off/on changes retain a single timer/hook; reload and quit dispose factories, branch callbacks and restore the original terminal write");

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
