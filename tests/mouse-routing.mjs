import assert from "node:assert/strict";
import { cp, readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEditorControls, renderKeyboardHints } from "../lib/editor-controls.mjs";
import { DOCK_CAPTION_ROWS } from "../lib/editor-layout.mjs";
import { createVTTerminal } from "./vt-terminal.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work"); await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "mouse-routing-")); assert.ok(scratch.startsWith(work + sep));
import { agentDir, version, modules } from "./pi-runtime.mjs";
const load = (path) => import(pathToFileURL(path).href);
const agent = join(modules, "@earendil-works/pi-coding-agent");
const { loadExtensions } = await load(join(agent, "dist/core/extensions/loader.js"));
const themeAPI = await load(join(agent, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agent, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agent, "dist/core/keybindings.js"));
const { CustomEditor } = await load(join(agent, "dist/modes/interactive/components/custom-editor.js"));
const { createInteractiveTuiReference } = await load(join(agent, "dist/modes/interactive/tui-renderer.js"));
const { createChatViewport } = await load(join(agent, "dist/modes/interactive/chat-viewport.js"));
const api = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
const { TuiMainScreen, TuiAltScreen, Container, CombinedAutocompleteProvider, visibleWidth, sliceByColumn, setKeybindings } = api;
const oldCellDimensions={...api.getCellDimensions()};api.setCellDimensions({widthPx:10,heightPx:20});
const keys = new KeybindingsManager(); setKeybindings(keys);
const checks = [], writes = [], submits = [], notices = [], actions = [], nativeActions = [];
const originalClock = Date.now;
let clock = originalClock();
let input, currentEditor, currentHeader, currentFooter, currentFactory, succeeded = false, selected = 0, busy = false;
let nextMenuChoice, activeDetails;
const nativeActionHandlers = new Map(["app.model.select", "app.thinking.cycle", "app.session.resume", "app.session.tree", "app.session.fork", "app.message.copy", "app.tools.expand", "app.thinking.toggle", "app.editor.external"].map((id) => [id, () => nativeActions.push(id)]));
const vt=createVTTerminal({columns:110,rows:42,visibleWidth});
const terminal = { columns: 110, rows: 42, kittyProtocolActive: false,
  start(onInput) { input = onInput; }, stop() {}, hideCursor() {}, showCursor() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {},
  setTitle() {}, setProgress() {}, setProgramStatus() {}, async drainInput() {}, write(data) { writes.push(data);vt.terminal.columns=this.columns;vt.terminal.rows=this.rows;vt.terminal.write(data); } };
const copiedSelections=[];let clipboardResult=true;
const screen = new TuiAltScreen(terminal, true, undefined, { mouse: true, copyOnSelect: true, copySelection: async(text)=>{copiedSelections.push(text);return clipboardResult;} }); screen.requestRender = () => {};
let activeRenderer=screen;const stableTui=createInteractiveTuiReference(()=>activeRenderer);
const nativeShowOverlay = screen.showOverlay;
const header = new Container(), editorBox = new Container(), footer = new Container(), document = new Container();
const transcript = { render: () => Array.from({ length: 100 }, (_, i) => `history ${i}: transcript text`), invalidate() {} };
document.addChild(header); document.addChild(transcript);
const empty = { render: () => [], invalidate() {} };
const viewport = createChatViewport({ document, editor: editorBox, footer, status: empty, pendingMessages: empty, scrollbar: "never" });
screen.setLayoutRoot(viewport.root);
let editorTheme, theme;
const nativeEditor = () => { const editor = new CustomEditor(stableTui, editorTheme, keys, { embedWorkingStatus: true }); editor.onSubmit = (text) => submits.push(text); return editor; };
const manager = { getEntryCount: () => 0, getLeafId: () => "leaf", getSessionId: () => "mouse", getEntries: () => [], getCwd: () => scratch };
const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map(), getAvailableProviderCount: () => 1, onBranchChange: () => () => {} };
const ctx = { mode: "tui", hasUI: true, cwd: scratch, sessionManager: manager, model: { provider: "test", id: "mouse", contextWindow: 200000 },
  isIdle: () => !busy, getContextUsage: () => ({ tokens: 0, percent: 0, contextWindow: 200000 }),
  ui: {
    get theme() { return theme; },
    setHeader(factory) { currentHeader?.dispose?.(); currentHeader = factory?.(stableTui, theme); header.clear(); if (currentHeader) header.addChild(currentHeader); },
    setFooter(factory) { currentFooter?.dispose?.(); currentFooter = factory?.(stableTui, theme, footerData); footer.clear(); if (currentFooter) footer.addChild(currentFooter); },
    getEditorComponent: () => currentFactory,
    setEditorComponent(factory) {
      const text = currentEditor?.getText() || ""; currentFactory = factory;
      currentEditor = factory ? factory(stableTui, editorTheme, keys) : nativeEditor();
      currentEditor.onSubmit = (text) => submits.push(text); currentEditor.setText(text);
      // InteractiveMode copies these public handlers after the factory returns.
      for (const [id, handler] of nativeActionHandlers) currentEditor.actionHandlers.set(id, handler);
      editorBox.clear(); editorBox.addChild(currentEditor); screen.setFocus(currentEditor);
    },
    setStatus() {}, notify: (message, type) => notices.push({ message, type }),
    async select(title, options) {
      selected++;
      if (nextMenuChoice) {
        const choose = Array.isArray(nextMenuChoice) ? nextMenuChoice.shift() : nextMenuChoice;
        if (!Array.isArray(nextMenuChoice) || !nextMenuChoice.length) nextMenuChoice = undefined;
        return options.find(choose);
      }
      if (/换/.test(title)) return options.find((option) => /pixel|像素/.test(option)) || options[1] || options[0];
      return undefined;
    },
    async custom(factory, options) {
      assert.equal(options?.overlay, true, "Read-only detail panels use the public overlay API");
      return new Promise((resolve, reject) => {
        let handle, component;
        const done = (value) => { handle?.hide(); component?.dispose?.(); activeDetails = undefined; resolve(value); };
        Promise.resolve(factory(screen, theme, keys, done)).then((value) => {
          component = value;
          const layout = typeof options.overlayOptions === "function" ? options.overlayOptions() : options.overlayOptions;
          handle = screen.showOverlay(component, layout); activeDetails = { component, handle };
        }).catch(reject);
      });
    },
  },
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const draw = () => { screen.renderNow(); return screen.getScreenLines().map(stripTerminalSequences); };
const sgr = (button, x, y, release = false) => input(`\x1b[<${button};${x + 1};${y + 1}${release ? "m" : "M"}`);
const click = (x, y) => { sgr(0, x, y); sgr(0, x, y, true); };
const find = (text) => {
  const lines = draw();
  for (let y = 0; y < lines.length; y++) { const i = lines[y].indexOf(text); if (i >= 0) return { x: visibleWidth(lines[y].slice(0, i)) + 1, y }; }
  throw new Error(`Missing visible mouse control: ${text}`);
};
const readConfig = async () => JSON.parse(await readFile(join(scratch, "config.json"), "utf8"));

try {
  Date.now = () => clock;
  // Pure hit-testing covers every width without needing the application host.
  let state = { hasText: true, animation: true, persona: false, mode: "fullscreen" };
  const controls = createEditorControls({ visibleWidth, getState: () => state, onAction: (id) => actions.push(id) });
  for (let width = 0; width <= 120; width++) {
    const rendered = controls.render(width);
    assert.equal(visibleWidth(rendered), width, "The toolbar occupies exactly its allocated width, including the gap before the right group");
    const regions = controls.regions;
    for (const [index, region] of regions.entries()) {
      assert.ok(region.start >= 0 && region.end <= width);
      if (index) assert.ok(region.start > regions[index - 1].end, "Toolbar buttons never touch or overlap");
      assert.match(sliceByColumn(rendered, region.start, region.end - region.start), /^\[[^\[\]]+\]$/, "Responsive clipping preserves entire clickable labels");
    }
    const right = regions.filter((region) => ["model", "thinking", "menu"].includes(region.id));
    if (right.length) assert.equal(right.at(-1).end, width, "The final right-side action is truly aligned to the allocated right edge");
    if (width >= 13) assert.ok(regions.some((region) => region.id === "send") && regions.some((region) => region.id === "menu"), "Send and More survive before optional actions on narrow toolbars");
  }
  controls.render(80);
  const send = controls.regions.find((region) => region.id === "send");
  controls.handleMouse({ type: "press", button: "left", x: send.start, y: 3 }, { row: 3 }); assert.equal(actions.length, 0);
  controls.handleMouse({ type: "release", button: "left", x: send.start, y: 3 }, { row: 3 }); assert.equal(actions.length, 0);
  const clicked = controls.handleMouse({ type: "click", button: "left", x: send.start, y: 3 }, { row: 3 });
  assert.deepEqual(actions, ["send"]); assert.equal(clicked.focus, undefined, "Control actions must not refocus a replaced old editor");
  state = { ...state, hasText: false }; controls.render(80);
  assert.equal(controls.handleMouse({ type: "click", button: "left", x: 0, y: 3 }, { row: 3 }), undefined);
  state = { ...state, busy: true }; controls.render(80);
  for (const id of ["model", "thinking"]) {
    const region = controls.regions.find((region) => region.id === id); assert.equal(region.enabled, false);
    const before = actions.length;
    assert.equal(controls.handleMouse({ type: "press", button: "left", x: region.start, y: 3 }, { row: 3 }), undefined);
    assert.equal(controls.handleMouse({ type: "click", button: "left", x: region.start, y: 3 }, { row: 3 }), undefined);
    assert.equal(actions.length, before);
  }
  assert.equal(controls.regions.find((region) => region.id === "menu").enabled, true);
  controls.dispose(); checks.push("Control hit zones fill widths 0–120 exactly with whole labels and a right-aligned group; narrow screens preserve Send/More, busy model/thinking and empty Send are disabled, and each click activates once without stale focus");

  const wholeHints = ["Enter 发送", "Shift+Enter 换行", "/mascot 设置", "Ctrl+L 模型", "Shift+Tab 思考", "Ctrl+Alt+W 更多"];
  for (let width = 0; width <= 180; width++) {
    const line = renderKeyboardHints(width, { visibleWidth });
    assert.equal(visibleWidth(line), width, "Regular keyboard hints pad exactly to the allocated width");
    let rest = line;
    for (const hint of wholeHints) rest = rest.replace(hint, "");
    assert.equal(rest.trim(), "", "Narrow regular borders contain whole keyboard hints, never a cut-off key or label");
    if (width >= visibleWidth("Ctrl+Alt+W 更多")) assert.ok(line.includes("Ctrl+Alt+W 更多"), "The extension menu remains the first keyboard entrance on narrow regular borders");
  }
  const bindings = new Map([["tui.input.submit", ["ctrl+enter", "alt+enter"]], ["app.model.select", ["alt+m"]], ["app.thinking.cycle", []]]);
  const customHints = () => renderKeyboardHints(180, { visibleWidth, getKeys: (action) => bindings.get(action) });
  let hints = customHints();
  assert.ok(hints.includes("Ctrl+Enter 发送") && hints.includes("Alt+M 模型") && hints.includes("Shift+Enter 换行"));
  assert.ok(!hints.includes("Ctrl+L") && !hints.includes("Shift+Tab") && !hints.includes("Alt+Enter"));
  bindings.set("tui.input.submit", []); bindings.set("app.model.select", ["ctrl+alt+k"]);
  hints = customHints(); assert.ok(!hints.includes("发送") && hints.includes("Ctrl+Alt+K 模型"), "Hints read changed bindings immediately, including explicit unbound actions");
  const unbound = renderKeyboardHints(100, { visibleWidth, getKeys: () => [] });
  assert.ok(unbound.includes("Ctrl+Alt+W 更多") && unbound.includes("/mascot 设置"));
  assert.ok(!/发送|换行|模型|思考/.test(unbound), "An explicit empty native binding must never advertise its fallback");
  checks.push("Regular keyboard hints fit widths 0–180 using whole items, prioritize the menu, track live custom native bindings and omit explicitly unbound actions instead of inventing shortcuts");

  const modeActions = []; state = { ...state, mode: "fullscreen", busy: false, hasText: true };
  const modeControls = createEditorControls({ visibleWidth, getState: () => state, onAction: (action) => modeActions.push(action) });
  modeControls.render(80); const staleSend = modeControls.regions.find((region) => region.id === "send");
  const toolbarLayout = { row: 3, avatar: { x: 0, y: 5, width: 12, height: 10 } };
  modeControls.handleMouse({ type: "press", button: "left", x: staleSend.start, y: 3 }, toolbarLayout);
  state = { ...state, mode: "regular" };
  for (const event of [{ type: "release", x: staleSend.start, y: 3 }, { type: "click", x: staleSend.start, y: 3 }, { type: "click", x: 1, y: 5 }]) {
    assert.equal(modeControls.handleMouse({ button: "left", ...event }, toolbarLayout), undefined, "A live switch blocks stale toolbar/avatar regions even before a new render");
  }
  assert.deepEqual(modeActions, []); assert.deepEqual(modeControls.regions, []);
  for (const width of [0, 1, 12, 24, 40, 80, 120]) {
    const line = modeControls.render(width); assert.equal(visibleWidth(line), width); assert.deepEqual(modeControls.regions, []);
    assert.ok(!/\[(发送|模型|思考|更多)\]/.test(line));
  }
  state = { ...state, mode: "fullscreen" }; modeControls.render(80);
  assert.ok(modeControls.regions.some((region) => region.id === "menu"));
  modeControls.handleMouse({ type: "click", button: "left", x: 1, y: 5 }, toolbarLayout); assert.deepEqual(modeActions, ["poke"]);
  modeControls.dispose();
  checks.push("Live fullscreen/regular changes immediately block stale press/release, toolbar and avatar clicks, clear all regular hit regions, and restore clickable fullscreen controls after switching back");

  for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), { recursive: true });
  await writeFile(join(scratch, "config.json"), JSON.stringify({ language: "zh-CN", enabled: true, animation: false, persona: false, style: "wumi-pixel", layout: "editor", renderer: "blocks", info: "compact" }));
  themeAPI.setThemeJsonValidator(validateThemeJson); themeAPI.initTheme("dark", false);
  theme = themeAPI.loadThemeFromPath(join(root, "themes/pi-furry-night.json"), "truecolor"); editorTheme = themeAPI.getEditorTheme();
  const loaded = await loadExtensions([join(scratch, "index.ts")], scratch); assert.deepEqual(loaded.errors, []); loaded.runtime.getThinkingLevel = () => "medium";
  loaded.runtime.getActiveTools = () => ["read"];
  loaded.runtime.getAllTools = () => [{ name: "read", description: Array.from({ length: 200 }, (_, i) => `Long tool detail ${i} 中文🙂`).join(" "), parameters: { type: "object", properties: { path: { type: "string", description: "Target file" } }, required: ["path"] } }];
  const extension = loaded.extensions[0];
  const emit = async (type, event = {}) => { for (const handler of extension.handlers.get(type) || []) await handler({ type, ...event }, ctx); };
  screen.start(); await emit("session_start", { reason: "startup" }); draw();
  assert.ok(writes.join("").includes("\x1b[?1006h") && writes.join("").includes("\x1b[?1000h"));
  const mainWrites = [], regularTerminal = { ...terminal, write: (data) => mainWrites.push(data) };
  const regular = new TuiMainScreen(regularTerminal); regular.requestRender = () => {}; regular.start(); regular.stop({ preserveScreen: true });
  assert.ok(!mainWrites.join("").includes("\x1b[?1006h"), "Regular mode does not enable native SGR mouse capture");
  // Restore the real fullscreen terminal callback after the regular control case.
  terminal.start((data) => screen.handleTerminalInput(data));
  checks.push("Actual terminal start enables SGR mouse only in fullscreen; input bytes route through TuiAltScreen rather than directly invoking editor.handleMouse");

  currentEditor.setWorkingStatusIndicator({kind:"working",renderInBorder:()=>"Working",renderSpinnerInBorder:()=>"*"});
  await extension.commands.get("mascot").handler("demo thinking",ctx);
  const phraseData=JSON.parse(await readFile(join(scratch,"assets/status-phrases.json"),"utf8"));
  const busyRows=draw();const phrase=phraseData.phrases.thinking.find((value)=>busyRows.some((line)=>line.includes(value)));
  assert.ok(phrase);assert.equal(busyRows.filter((line)=>line.includes(phrase)).length,1);
  assert.ok(!busyRows.join("\n").includes("Working"));
  assert.ok(sliceByColumn(busyRows.find((line)=>line.includes(phrase)),currentEditor.geometry.leftWidth,terminal.columns).trimStart().startsWith("╭──"));
  checks.push("Actual fullscreen product input shows one dynamic Umi phrase in its top border and suppresses the native Working caption without adding a status row");

  currentEditor.setText("native action draft🙂"); draw();
  const actionEditor = currentEditor, beforeActionSubmit = submits.length;
  for (const [label, action] of [["[模型]", "app.model.select"], ["[思考]", "app.thinking.cycle"]]) {
    const point = find(label), before = nativeActions.length;
    click(point.x, point.y); await flush();
    assert.equal(nativeActions.length, before + 1); assert.equal(nativeActions.at(-1), action);
    assert.equal(currentEditor.getText(), "native action draft🙂"); assert.equal(currentEditor, actionEditor);
  }
  nextMenuChoice = (option) => /复制/.test(option);
  let more = find("[更多]"); click(more.x, more.y); await flush();
  assert.equal(nativeActions.at(-1), "app.message.copy"); assert.equal(submits.length, beforeActionSubmit);
  busy = true; draw();
  const beforeBusyActions = nativeActions.length;
  for (const label of ["[模型]", "[思考]"]) { const point = find(label); click(point.x, point.y); await flush(); }
  assert.equal(nativeActions.length, beforeBusyActions, "Busy model/thinking buttons must never dispatch a native handler");
  nextMenuChoice = (option) => /复制/.test(option);
  more = find("[更多]"); click(more.x, more.y); await flush();
  assert.equal(nativeActions.length, beforeBusyActions + 1); assert.equal(nativeActions.at(-1), "app.message.copy", "Read-only native actions remain available while busy");
  assert.equal(currentEditor.getText(), "native action draft🙂"); assert.equal(submits.length, beforeActionSubmit);
  busy = false; draw();
  checks.push("Real SGR Model/Thinking/More clicks use native public action handlers copied after the factory, keep draft input intact and never submit it; busy model/thinking stay disabled while More can still copy");

  nextMenuChoice = (option) => /用量/.test(option);
  more = find("[更多]"); click(more.x, more.y); await flush();
  assert.ok(activeDetails && screen.hasOverlay());
  assert.ok(draw().join("\n").includes("会话用量"));
  for (const width of [20, 40, 80]) for (const line of activeDetails.component.render(width)) assert.ok(visibleWidth(line) <= width);
  input("\r"); await flush(); draw(); assert.equal(activeDetails, undefined); assert.equal(screen.getFocusedComponent(), currentEditor);
  nextMenuChoice = [(option) => /可用的工具/.test(option), (option) => option.includes("read")];
  more = find("[更多]"); click(more.x, more.y); await flush();
  assert.ok(activeDetails && screen.hasOverlay());
  const beforeDetailPage = draw().join("\n");
  input("\x1b[6~"); const afterDetailPage = draw().join("\n");
  assert.notEqual(afterDetailPage, beforeDetailPage, "PageDown reaches the real product detail panel through the terminal callback");
  input("\r"); await flush(); draw();
  assert.equal(activeDetails, undefined); assert.equal(screen.hasOverlay(), false); assert.equal(screen.getFocusedComponent(), currentEditor);
  assert.equal(currentEditor.getText(), "native action draft🙂"); assert.equal(submits.length, beforeActionSubmit);
  checks.push("More opens real read-only usage/tool overlays, fits their widths, scrolls a long tool definition via native PageDown and restores editor focus/draft on close without submitting input");

  currentEditor.setText("你好🙂abc\nsecond line"); draw();
  const geometry = currentEditor.geometry;
  const textPoint = find("你好🙂abc");
  const beforeCaret = currentEditor.getCursor();
  const baselineEditor = nativeEditor(); baselineEditor.setText(currentEditor.getText()); baselineEditor.render(geometry.editorWidth);
  baselineEditor.handleMouse({ type: "click", button: "left", x: 4, y: 1, screenX: 0, screenY: 0, width: geometry.editorWidth, height: geometry.nativeHeight, shift: false, alt: false, ctrl: false });
  click(geometry.contentX + 4, textPoint.y);
  assert.deepEqual(currentEditor.getCursor(), baselineEditor.getCursor()); assert.notDeepEqual(currentEditor.getCursor(), beforeCaret);
  assert.equal(screen.getFocusedComponent(), currentEditor);
  checks.push("Real SGR press/release reaches nested editor containers, offsets CJK/emoji caret coordinates correctly and preserves keyboard focus");

  const wallCursor = currentEditor.getCursor(), wallSubmits = submits.length, wallActions = nativeActions.length;
  click(geometry.leftWidth, textPoint.y); click(terminal.columns - 1, textPoint.y);
  assert.deepEqual(currentEditor.getCursor(), wallCursor, "Side-wall clicks must not be forwarded as text cells");
  assert.equal(submits.length, wallSubmits); assert.equal(nativeActions.length, wallActions);
  const wallRows = draw(), wallInput = wallRows[textPoint.y];
  assert.equal(sliceByColumn(wallInput, geometry.leftWidth, 1), "│");
  assert.equal(sliceByColumn(wallInput, terminal.columns - 1, 1), "│");
  checks.push("Real fullscreen input visibly retains both side walls, and SGR clicks on either wall cannot move the caret, submit a draft or activate a toolbar action");

  currentEditor.setText("drag this native input text"); const dragPoint = find("drag this native input text");
  const cursorBeforeDrag = currentEditor.getCursor();
  sgr(0, dragPoint.x, dragPoint.y); sgr(32, dragPoint.x + 5, dragPoint.y); sgr(0, dragPoint.x + 5, dragPoint.y, true);
  assert.deepEqual(currentEditor.getCursor(), cursorBeforeDrag, "Dragging input text must remain a native selection gesture, not a caret click");
  assert.equal(screen.hasActiveSelection(), true);
  checks.push("Unhandled input press/drag/release stays available for native fullscreen text selection without moving the caret or triggering a toolbar action");

  currentEditor.setText("send exactly once"); const sendPoint = find("[发送]"); click(sendPoint.x, sendPoint.y);
  assert.deepEqual(submits, ["send exactly once"]);
  currentEditor.setText("ab"); const newline = find("[换行]"); click(newline.x, newline.y); assert.equal(currentEditor.getText(), "ab\n");
  const persona = find("[语气关]"); click(persona.x, persona.y); await flush(); assert.equal((await readConfig()).persona, true);
  const toolbar = find("[语气开]");
  sgr(0, toolbar.x, toolbar.y); sgr(32, toolbar.x + 2, toolbar.y); sgr(0, toolbar.x + 2, toolbar.y, true);
  assert.equal((await readConfig()).persona, true, "Dragging a button must not activate it");
  const overlay = screen.showOverlay({ render: () => ["covered"], invalidate() {}, handleMouse: () => ({ handled: true }) }, { width: 12, row: toolbar.y, col: toolbar.x - 1, nonCapturing: true });
  draw(); click(toolbar.x, toolbar.y); await flush();
  assert.equal((await readConfig()).persona, true, "An overlay must shield the underlying toolbar"); overlay.hide(); draw();
  checks.push("Toolbar send/newline/persona receive real click gestures exactly once; dragging over a control cannot trigger its action");

  draw(); const footerHeight = footer.render(terminal.columns).length, editorHeight = editorBox.render(terminal.columns).length;
  const dockTop = terminal.rows - footerHeight - editorHeight;
  const beforeCaptionClick = (await readConfig()).animation;
  for (let row = 0; row < DOCK_CAPTION_ROWS; row++) {
    click(5, dockTop + row); await flush();
    assert.equal((await readConfig()).animation, beforeCaptionClick, "Clicking any caption row must not activate the avatar");
  }
  const avatar = { x: 5, y: dockTop + DOCK_CAPTION_ROWS };
  const sameEditor = currentEditor;
  const beforePokeConfig = await readFile(join(scratch, "config.json"), "utf8"), beforePokeText = currentEditor.getText();
  click(avatar.x, avatar.y); await flush(); draw(); assert.equal((await readConfig()).animation, false);
  assert.equal(currentEditor.displaySheet.frames[0].id, "poke");
  const pokeBubbles = JSON.parse(await readFile(join(root, "assets/status-copy.json"), "utf8")).bubbles;
  assert.ok(draw().some((line) => [pokeBubbles.poke_idle, pokeBubbles.poke_busy, pokeBubbles.poke_waiting].some((bubble) => line.includes(bubble))), "A real avatar click displays the local poke caption");
  click(avatar.x, avatar.y); await flush(); draw();
  assert.equal(await readFile(join(scratch, "config.json"), "utf8"), beforePokeConfig, "Poking is transient and never writes preferences");
  assert.equal(currentEditor.getText(), beforePokeText);
  assert.equal(currentEditor, sameEditor, "Poking preserves the editor instance, animation preference and current draft");
  clock += 1200; draw();
  assert.notEqual(currentEditor.displaySheet.frames[0].id, "poke", "An expired poke restores the actual pose before another UI operation");
  for (const width of [79, 80, 100, 110, 119, 120, 160]) {
    terminal.columns = width; draw();
    const expectedOffset = width >= 120 ? 4 : width >= 80 ? 2 : 0;
    const bounds = currentEditor.avatarBounds;
    assert.deepEqual(bounds, { x: expectedOffset, y: DOCK_CAPTION_ROWS, width: 16, height: 8 }, `${width}: hit bounds follow the centered 16-column image, independently of the caption width`);
    const imageTop = terminal.rows - footer.render(width).length - editorBox.render(width).length + bounds.y;
    const preservedText = currentEditor.getText(), preservedConfig = await readFile(join(scratch, "config.json"), "utf8");
    for (const x of [bounds.x - 1, bounds.x + bounds.width].filter((x) => x >= 0)) {
      clock += 1200; draw();
      click(x, imageTop); await flush(); draw();
      assert.notEqual(currentEditor.displaySheet.frames[0].id, "poke", `${width}: blank cell ${x} beside the image must not trigger a poke`);
    }
    for (const x of [bounds.x, bounds.x + bounds.width - 1]) {
      clock += 1200; draw();
      click(x, imageTop); await flush(); draw();
      assert.equal(currentEditor.displaySheet.frames[0].id, "poke", `${width}: both inclusive image edges remain clickable after centering`);
    }
    assert.equal(currentEditor.getText(), preservedText);
    assert.equal(await readFile(join(scratch, "config.json"), "utf8"), preservedConfig);
  }
  clock += 1200; terminal.columns = 110; draw();
  checks.push("Real SGR clicks at widths 79/80/100/110/119/120/160 follow the fixed 16-column avatar at offsets 0/2/4: image edges poke, neighboring blank cells do not, and the native draft and preferences remain intact");
  const stylePoint = find("[换装]"); click(stylePoint.x, stylePoint.y); await flush(); draw();
  assert.ok(selected > 0); assert.equal(screen.getFocusedComponent(), currentEditor, "Style selection must not refocus the detached old editor");
  checks.push("All three caption rows stay outside the avatar hit box; real SGR clicks on its first image row show a >w< poke reaction and caption even while animation is paused, without changing preferences/input; style selection preserves text/focus");

  const provider = new CombinedAutocompleteProvider(Array.from({ length: 12 }, (_, i) => ({ name: `mouse-${i}`, description: `item ${i}` })), scratch, null);
  currentEditor.setAutocompleteProvider(provider); currentEditor.setText("/"); currentEditor.handleInput("\t"); await flush(); draw();
  assert.equal(currentEditor.isShowingAutocomplete(), true);
  const firstItem = currentEditor.autocompleteList.getSelectedItem();
  const menu = find("mouse-1"); sgr(65, menu.x, menu.y); draw();
  assert.notDeepEqual(currentEditor.autocompleteList.getSelectedItem(), firstItem, "Wheel at the menu must reach the native select list");
  click(menu.x, menu.y); assert.ok(currentEditor.getText().startsWith("/mouse-")); assert.equal(currentEditor.isShowingAutocomplete(), false);
  const scrollBefore = viewport.transcript.scrollTop; sgr(64, 3, 3); draw(); assert.ok(viewport.transcript.scrollTop < scrollBefore);
  checks.push("Native autocomplete receives routed wheel/click events, while wheel over output scrolls only the official transcript viewport");

  terminal.columns = 55; draw(); assert.equal(currentEditor.geometry.leftWidth, 0);
  currentEditor.setText("narrow input"); const narrow = find("narrow input"); click(currentEditor.geometry.contentX + 3, narrow.y);
  assert.equal(screen.getFocusedComponent(), currentEditor); assert.equal(currentEditor.getCursor().col, 3);
  terminal.columns = 110; draw();
  checks.push("A 55-column window collapses the avatar dock and still routes clicks through the one-cell frame inset to the native caret");

  await extension.commands.get("mascot").handler("render sixel",ctx);currentEditor.setText("");draw();
  assert.notEqual(screen.showOverlay,nativeShowOverlay,"Actual product editor must observe native public overlay handles");
  const countDcs=()=> (writes.join("").match(/\x1bP/g)||[]).length;
  const assertAvatarCells=(stage)=>{
    const bounds=currentEditor.avatarBounds;
    const top=terminal.rows-footer.render(terminal.columns).length-editorBox.render(terminal.columns).length+bounds.y;
    const missing=[];
    for(let y=top;y<top+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++)if(!vt.imageCells[y]?.[x])missing.push([x,y]);
    assert.deepEqual(missing,[],`${stage}: EL/overwrites must not leave a missing Sixel stripe in the software display model`);
  };
  // Unlike block-only hit testing, exercise native selection after the real
  // product transport has translated image markers into Sixel output.
  await extension.commands.get("mascot").handler("demo off",ctx);
  const selectionDraft="selection first input row\nselection middle input row\nselection final input row";
  currentEditor.setText(selectionDraft);draw();assertAvatarCells("before selection");
  const selectionStart=find("selection first"),selectionEnd=find("selection final");
  // A caret before the dragged range is essential: native selection copies
  // that zero-width APC into later runs, unlike a caret at the draft's end.
  click(currentEditor.geometry.contentX+1,selectionStart.y);draw();screen.resetTextSelection();
  const selectedEditor=currentEditor,selectionCursor=currentEditor.getCursor(),selectionSubmits=submits.length;
  const nativeSelectionEditor=nativeEditor();nativeSelectionEditor.setText(selectionDraft);nativeSelectionEditor.render(currentEditor.geometry.editorWidth);
  nativeSelectionEditor.handleMouse({type:"click",button:"left",x:1,y:1,screenX:0,screenY:0,width:currentEditor.geometry.editorWidth,height:currentEditor.geometry.nativeHeight,shift:false,alt:false,ctrl:false});
  const verifySelectionDraw=()=>{
    const columns=[...writes.join("").matchAll(/\x1b\[(\d+)G\x1bP/g)].map((match)=>Number(match[1])-1);
    assert.ok(columns.length>0,"Selecting across input rows must exercise image stripe repainting");
    assert.ok(columns.length<=currentEditor.avatarBounds.height,"One selection redraw must never duplicate a stripe into the input area");
    assert.ok(columns.every((column)=>column===currentEditor.avatarBounds.x),"All Sixel repaint columns must remain inside the original avatar lane");
    assert.ok(!writes.join("").includes("\x1b]777;pi-furry-partner-"),"Private marker copies must never escape to the terminal");
  };
  writes.length=0;
  sgr(0,selectionStart.x+3,selectionStart.y);
  sgr(32,selectionEnd.x+8,selectionEnd.y);draw();verifySelectionDraw();assertAvatarCells("while dragging");
  assert.equal(screen.hasActiveSelection(),true);
  writes.length=0;
  sgr(0,selectionEnd.x+8,selectionEnd.y,true);await flush();draw();assertAvatarCells("after drag/copy release");
  assert.ok(copiedSelections.at(-1)?.includes("selection middle"));
  assert.equal(screen.hasActiveSelection(),true,"Releasing a native drag preserves its selected text");
  assert.equal(currentEditor,selectedEditor);assert.equal(currentEditor.getText(),selectionDraft);
  assert.deepEqual(currentEditor.getCursor(),selectionCursor);assert.equal(submits.length,selectionSubmits);
  const selectedRows=screen.getScreenLines();
  assert.ok(selectedRows.some((line)=>(line.match(/pi-furry-partner-/g)||[]).length>1),"The real fullscreen selection path must reproduce duplicated zero-width image markers");
  input("Z");nativeSelectionEditor.handleInput("Z");draw();
  assert.equal(currentEditor.getText(),nativeSelectionEditor.getText(),"Typing after Sixel selection must retain native editor semantics instead of entering a mouse-capture dead end");
  assert.deepEqual(currentEditor.getCursor(),nativeSelectionEditor.getCursor());
  const afterSelectionDraft=currentEditor.getText(),afterSelectionNativeActions=nativeActions.length;
  const selectionModel=find("[模型]");click(selectionModel.x,selectionModel.y);await flush();draw();
  assert.equal(nativeActions.length,afterSelectionNativeActions+1);assert.equal(nativeActions.at(-1),"app.model.select");
  assert.equal(currentEditor.getText(),afterSelectionDraft);assert.equal(screen.getFocusedComponent(),currentEditor);
  const previousEscape=currentEditor.onEscape;let selectionEscapes=0;currentEditor.onEscape=()=>{selectionEscapes++;};
  input("\x1b");assert.equal(selectionEscapes,1,"Escape must reach the editor after releasing the drag");currentEditor.onEscape=previousEscape;
  input("\r");assert.equal(submits.length,selectionSubmits+1);assert.equal(submits.at(-1),afterSelectionDraft);
  screen.resetTextSelection();currentEditor.setText("");draw();
  checks.push("Real stable-proxy fullscreen caret-before-selection SGR drag with copy-on-select keeps selection/caret/draft, leaves no missing avatar cells after EL/overwrite, strips private APC markers and remains responsive to typing, toolbar actions, Escape and one Enter submission");
  await extension.commands.get("mascot").handler("play",ctx);
  await extension.commands.get("mascot").handler("demo speaking",ctx);
  currentEditor.setText("animated first input row\nanimated middle input row\nanimated final input row");draw();
  const animatedStart=find("animated first"),animatedEnd=find("animated final");
  click(currentEditor.geometry.contentX+1,animatedStart.y);screen.resetTextSelection();draw();
  const animatedDraft=currentEditor.getText(),copiedBeforeAnimation=copiedSelections.length;
  sgr(0,animatedStart.x+4,animatedStart.y);
  for(let step=0;step<24;step++){
    clock+=75;sgr(32,animatedEnd.x+4+step%8,step%3===0?animatedStart.y:animatedEnd.y);writes.length=0;draw();
    assertAvatarCells(`animated selection ${step}`);
    const output=writes.join("");
    assert.ok(!["\x1b_pi:c\x07","\x1b_pi:fc\x07","\x1b_pi:/fc\x07"].some((marker)=>output.includes(marker)));
    assert.equal((output.match(/\x1b\[\?2026h/g)||[]).length,(output.match(/\x1b\[\?2026l/g)||[]).length,"Every animated selection repaint must close synchronized output");
    assert.equal(vt.cursor.pending,0);assert.equal(currentEditor.getText(),animatedDraft);
  }
  clipboardResult="Injected copy failure";
  sgr(0,animatedEnd.x+9,animatedEnd.y,true);await flush();draw();
  assert.equal(copiedSelections.length,copiedBeforeAnimation+1);assertAvatarCells("animated copy failure flash");
  clipboardResult=true;
  terminal.columns=100;draw();assertAvatarCells("selection resize narrower");
  terminal.columns=110;draw();assertAvatarCells("selection resize restored");
  screen.resetTextSelection();clock+=75;draw();assertAvatarCells("selection cleared while animation continues");
  // Selection in the transcript uses a different scroll-view coordinate path.
  sgr(0,20,3);sgr(32,32,5);clock+=75;draw();assertAvatarCells("transcript selection during animation");
  sgr(0,32,5,true);await flush();screen.resetTextSelection();draw();
  input("Z");assert.ok(currentEditor.getText().includes("Z"));
  await extension.commands.get("mascot").handler("pause",ctx);await extension.commands.get("mascot").handler("demo off",ctx);
  currentEditor.setText("");draw();
  checks.push("Twenty-four animated selection repaints through the stable proxy preserve every software-model avatar cell and close sync; async copy failure/success, resize, clear and transcript selection leave typing live without changing real draft semantics");
  const upperModal=screen.showOverlay({render:()=>["upper modal","options"],invalidate(){}},{row:2,col:0,width:22,nonCapturing:true});
  draw();writes.length=0;
  await extension.commands.get("mascot").handler("demo speaking",ctx);draw();
  assert.ok(countDcs()>0,"A native overlay above the fixed dock must leave the animated avatar visible");
  upperModal.hide();draw();
  const avatarTop=terminal.rows-footer.render(terminal.columns).length-editorBox.render(terminal.columns).length+DOCK_CAPTION_ROWS;
  const crossing=screen.showOverlay({render:()=>Array.from({length:8},()=>"POP"),invalidate(){}},{row:avatarTop,col:3,width:3,nonCapturing:true});
  draw();writes.length=0;
  await extension.commands.get("mascot").handler("demo error",ctx);draw();
  assert.equal(countDcs(),0,"A narrow modal crossing every avatar stripe must suppress all retained image anchors");
  crossing.hide();writes.length=0;
  await extension.commands.get("mascot").handler("demo success",ctx);draw();assert.ok(countDcs()>0);
  checks.push("Actual native modal bounds allow Sixel animation above the dock, suppress intersecting retained stripe anchors and restore images after hide");

  await extension.commands.get("mascot").handler("language en",ctx);
  currentEditor.setText("English framed draft"); draw();
  const englishCopy = nativeActions.length;
  nextMenuChoice = (option) => /^Copy /.test(option);
  const englishMore = find("[More]"); click(englishMore.x, englishMore.y); await flush();
  assert.equal(nativeActions.length, englishCopy + 1); assert.equal(nativeActions.at(-1), "app.message.copy");
  assert.equal(currentEditor.getText(), "English framed draft");
  const englishSubmits = submits.length, englishSend = find("[Send]"); click(englishSend.x, englishSend.y); await flush();
  assert.equal(submits.length, englishSubmits + 1); assert.equal(submits.at(-1), "English framed draft");
  await extension.commands.get("mascot").handler("language zh-CN",ctx); draw();
  checks.push("English framed More/Send controls receive real terminal SGR gestures at their rendered cells, preserve native copy semantics and submit once; switching back restores the Chinese controls");

  await emit("session_shutdown",{reason:"reload"});assert.equal(screen.showOverlay,nativeShowOverlay,"Reload teardown must restore the exact original public method");
  // The native host resets its mounted extension factories between reloads.
  ctx.ui.setEditorComponent(undefined);ctx.ui.setHeader(undefined);ctx.ui.setFooter(undefined);
  await emit("session_start",{reason:"reload"});draw();assert.notEqual(screen.showOverlay,nativeShowOverlay);
  await emit("session_shutdown",{reason:"quit"});assert.equal(screen.showOverlay,nativeShowOverlay);
  checks.push("Actual product reload and quit remove the owned overlay observer, then a reload installs exactly one new observer");
  const report = { testedAt: new Date().toISOString(), piVersion: version, modelRequests: 0, passed: true, verification: "Real Pi loader, official fullscreen ChatViewport, terminal input callback, SGR press/release/drag/wheel parser, layout hit testing and actual product editor; no native-window automation", checks };
  await writeFile(join(root, "tests/mouse-routing-validation.json"), JSON.stringify(report, null, 2) + "\n");
  succeeded = true; console.log(JSON.stringify(report, null, 2));
} finally {
  api.setCellDimensions(oldCellDimensions);
  Date.now = originalClock;
  currentEditor?.dispose?.(); currentHeader?.dispose?.(); currentFooter?.dispose?.(); screen.stop({ preserveScreen: true });
  if (succeeded && scratch.startsWith(work + sep) && scratch.slice(work.length + 1).startsWith("mouse-routing-")) await rm(scratch, { recursive: true, force: true });
}
