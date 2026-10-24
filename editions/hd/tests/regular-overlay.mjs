import assert from "node:assert/strict";
import { cp, readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createVTTerminal } from "./vt-terminal.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work"); await mkdir(work, { recursive: true });
import { agentDir, version, modules } from "./pi-runtime.mjs";
const load = (file) => import(pathToFileURL(file).href);
const agent = join(modules, "@earendil-works/pi-coding-agent");
const { loadExtensions } = await load(join(agent, "dist/core/extensions/loader.js"));
const { createInteractiveTuiReference } = await load(join(agent, "dist/modes/interactive/tui-renderer.js"));
const { createChatViewport } = await load(join(agent, "dist/modes/interactive/chat-viewport.js"));
const themeAPI = await load(join(agent, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agent, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agent, "dist/core/keybindings.js"));
const { CustomEditor } = await load(join(agent, "dist/modes/interactive/components/custom-editor.js"));
const { TuiMainScreen, TuiAltScreen, Container, CURSOR_MARKER, visibleWidth, setKeybindings, getCellDimensions } = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { stripTerminalSequences } = await load(join(modules, "@earendil-works/pi-tui/dist/utils.js"));
const nativeShowOverlay = TuiMainScreen.prototype.showOverlay;
themeAPI.setThemeJsonValidator(validateThemeJson); themeAPI.initTheme("dark", false);
const theme = themeAPI.loadThemeFromPath(join(root, "themes/pi-furry-night.json"), "truecolor");
const editorTheme = themeAPI.getEditorTheme(), keys = new KeybindingsManager(); setKeybindings(keys);
const baseline = process.argv.includes("--baseline"), checks = [], failures = [], cases = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

async function scenario(initialMode, historyLines, switchMode = false, columns = 100) {
  const scratch = await mkdtemp(join(work, "regular-overlay-")); assert.ok(scratch.startsWith(work + sep));
  const models = new Map();
  const modelFor = (mode) => { if (!models.has(mode)) models.set(mode, createVTTerminal({ columns, rows: 40, visibleWidth })); return models.get(mode); };
  let activeModel = modelFor(initialMode), currentEditor, currentHeader, currentFooter, currentFactory, screen, mainState;
  let draws = [], allDraws = [], mode = initialMode, closed = false;
  const terminal = { ...activeModel.terminal, write(data) {
    let offset = 0;
    for (const match of data.matchAll(/\x1bP[\s\S]*?\x1b\\/g)) {
      activeModel.terminal.write(data.slice(offset, match.index));
      const raster = /q"\d+;\d+;(\d+);(\d+)/.exec(match[0]);
      const anchor = { row: activeModel.cursor.y, column: activeModel.cursor.x, mode, rasterWidth: raster ? Number(raster[1]) : undefined };
      draws.push(anchor); allDraws.push(anchor); activeModel.terminal.write(match[0]); offset = match.index + match[0].length;
    }
    activeModel.terminal.write(data.slice(offset));
  } };
  const makeScreen = (nextMode) => {
    const value = nextMode === "regular" ? new TuiMainScreen(terminal, true) : new TuiAltScreen(terminal, true, undefined, { mouse: false });
    value.requestRender = () => {}; return value;
  };
  screen = makeScreen(mode);
  const originalMethods = new Map([[screen, nativeShowOverlay]]);
  const reference = createInteractiveTuiReference(() => screen);
  const header = new Container(), document = new Container(), editor = new Container(), footer = new Container();
  const transcript = { render: () => Array.from({ length: historyLines }, (_, i) => `history ${i}: 中文 transcript`), invalidate() {} };
  document.addChild(header); document.addChild(transcript);
  const empty = { render: () => [], invalidate() {} };
  const mount = () => {
    screen.addChild(header); screen.addChild(transcript); screen.addChild(editor); screen.addChild(footer);
    if (screen.mode === "fullscreen") screen.setLayoutRoot(createChatViewport({ document, editor, footer, status: empty, pendingMessages: empty, scrollbar: "never" }).root);
    screen.start();
  };
  const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map(), getAvailableProviderCount: () => 1, onBranchChange: () => () => {} };
  const manager = { getEntryCount: () => 0, getLeafId: () => "leaf", getSessionId: () => "regular-overlay", getEntries: () => [], getCwd: () => scratch };
  const ctx = { mode: "tui", hasUI: true, cwd: scratch, sessionManager: manager, model: { provider: "test", id: "overlay", contextWindow: 200000 },
    isIdle: () => true, getContextUsage: () => ({ tokens: 0, percent: 0, contextWindow: 200000 }),
    ui: { get theme() { return theme; },
      setHeader(factory) { currentHeader?.dispose?.(); currentHeader = factory?.(reference, theme); header.clear(); if (currentHeader) header.addChild(currentHeader); },
      setFooter(factory) { currentFooter?.dispose?.(); currentFooter = factory?.(reference, theme, footerData); footer.clear(); if (currentFooter) footer.addChild(currentFooter); },
      getEditorComponent: () => currentFactory,
      setEditorComponent(factory) {
        const text = currentEditor?.getText() || ""; currentFactory = factory;
        currentEditor = factory ? factory(reference, editorTheme, keys) : new CustomEditor(reference, editorTheme, keys, { embedWorkingStatus: true });
        currentEditor.setText(text); editor.clear(); editor.addChild(currentEditor); reference.setFocus(currentEditor);
      }, setStatus() {}, notify() {},
    } };
  let extension;
  const emit = async (type, event = {}) => { for (const handler of extension.handlers.get(type) || []) await handler({ type, ...event }, ctx); };
  const command = (value) => extension.commands.get("mascot").handler(value, ctx);
  const draw = () => { draws = []; screen.renderNow(); return draws.slice(); };
  const markerRows = () => {
    const state = screen.mode === "regular" ? screen.captureRenderState() : undefined;
    const lines = state?.previousLines ?? screen.getScreenLines();
    return lines.flatMap((line, row) => line.includes("\x1b]777;pi-furry-partner-") ? [row - (state?.previousViewportTop ?? 0)] : []).filter((row) => row >= 0 && row < terminal.rows - 1);
  };
  const modal = (row, height = 2, col = 0, width = 22) => reference.showOverlay({ render: () => Array.from({ length: height }, (_, i) => `modal ${i}`), invalidate() {} }, { row, col, width, nonCapturing: true });
  const result = { initialMode, historyLines, columns, switched: switchMode, stages: [], modePresentation: [] };
  const modePresentation = () => {
    const instance = currentEditor, text = "模式切换🙂 draft\n第二行中文🙂";
    currentEditor.setText(text);
    const beforeCursor = currentEditor.getCursor(), rows = currentEditor.render(columns), plain = rows.map(stripTerminalSequences).join("\n");
    const fullscreen = mode === "fullscreen", regions = currentEditor.controls.regions;
    if (fullscreen) {
      check(regions.some((region) => region.id === "send") && regions.some((region) => region.id === "menu"), "Fullscreen exposes its clickable Send and More controls through the stable reference");
      check(Boolean(currentEditor.avatarBounds), "Fullscreen retains the avatar animation click region");
      check(plain.includes("[发送]") && plain.includes("[更多]"), "Fullscreen displays clickable button labels");
    } else {
      check(regions.length === 0, "Regular mode has no toolbar click regions");
      check(currentEditor.avatarBounds === undefined, "Regular mode has no avatar click region");
      check(!/\[(发送|换行|换装|语气[开关]|表情：[开关]|模型|思考|更多)\]/.test(plain), "Regular mode never advertises fullscreen mouse buttons");
      check(/Enter|回车/i.test(plain) && /Ctrl\+Alt\+W|\/mascot menu/i.test(plain), "Regular wide editors show real Send and More keyboard entrances");
    }
    const baseline = new CustomEditor(reference, editorTheme, keys, { embedWorkingStatus: true });
    baseline.focused = true; baseline.setText(text);
    const nativeRows = baseline.render(currentEditor.geometry.editorWidth), marker = (lines) => {
      const row = lines.findIndex((line) => line.includes(CURSOR_MARKER));
      check(row >= 0, "Focused native and Umi editors retain their cursor marker");
      return { row, column: row < 0 ? -1 : visibleWidth(lines[row].slice(0, lines[row].indexOf(CURSOR_MARKER))) };
    };
    const actual = marker(rows), expected = marker(nativeRows);
    check(actual.column === expected.column + currentEditor.geometry.contentX && actual.row === expected.row + currentEditor.geometry.offsetY,
      "Mode-dependent border presentation preserves CJK/emoji IME hardware-cursor coordinates plus dock and side-frame insets");
    check(currentEditor === instance && currentEditor.getText() === text && JSON.stringify(currentEditor.getCursor()) === JSON.stringify(beforeCursor), "Mode presentation never replaces the editor or changes the draft/cursor");
    for (const width of [1, 4, 12, 18, 24, 39, 55, 60, 79, 80, 100, 119, 120, 160]) {
      // Pi's native word wrapper cannot fit a two-cell grapheme in one cell.
      // Its pre-existing extreme-width case is exercised with empty input.
      currentEditor.setText(width < 8 ? "" : text);
      const narrow = currentEditor.render(width);
      check(narrow.every((line) => visibleWidth(line) <= width), `Mode-dependent border fits ${mode} width ${width}`);
      if (!fullscreen) check(currentEditor.controls.regions.length === 0 && currentEditor.avatarBounds === undefined, "Regular narrow/collapsed editors remain free of mouse controls");
    }
    currentEditor.setText(text);
    if (!fullscreen) {
      try {
        keys.setUserBindings({ "app.model.select": "alt+m", "app.thinking.cycle": [], "tui.input.submit": "ctrl+enter" });
        const customized = currentEditor.render(240).map(stripTerminalSequences).join("\n");
        check(customized.includes("Alt+M 模型") && customized.includes("Ctrl+Enter 发送") && !customized.includes("Shift+Tab 思考"), "The actual editor reads custom native keybindings at render time and hides an unbound thinking action");
      } finally { keys.setUserBindings({}); }
    }
    currentEditor.setText(Array.from({ length: 35 }, (_, index) => `hidden ${index} 中文🙂`).join("\n"));
    const hidden = currentEditor.render(columns).map(stripTerminalSequences);
    check(currentEditor.scrollOffset > 0 && hidden.some((line) => line.includes(`↑ ${currentEditor.scrollOffset} 行`)), "Mode-dependent bottom border preserves the native hidden-line counter in the top border");
    currentEditor.setText(text); currentEditor.render(columns);
    result.modePresentation.push({ mode, editorWidth: currentEditor.geometry.editorWidth, clickRegions: currentEditor.controls.regions.map((region) => region.id), avatarClickable: Boolean(currentEditor.avatarBounds), cursor: currentEditor.getCursor() });
  };
  try {
    // Exercise the original regular overlay independently of optional motion packs.
    for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), {
      recursive: true, filter: source => source !== join(root, 'assets', 'animated') });
    if (process.env.PI_TEST_OVERLAY_MODULE) await cp(process.env.PI_TEST_OVERLAY_MODULE, join(scratch, "lib/overlay-visibility.mjs"));
    await writeFile(join(scratch, "config.json"), JSON.stringify({ language: "zh-CN", enabled: true, animation: false, persona: false, style: "wumi-pixel", layout: "editor", renderer: "sixel", info: "compact" }));
    const loaded = await loadExtensions([join(scratch, "index.ts")], scratch); assert.deepEqual(loaded.errors, []);
    loaded.runtime.getThinkingLevel = () => "medium"; extension = loaded.extensions[0];
    mount(); await emit("session_start", { reason: "startup" }); draw(); modePresentation(); draw();
    if (switchMode) {
      for (const nextMode of initialMode === "regular" ? ["fullscreen", "regular"] : ["regular"]) {
        assert.equal(screen.hasOverlay(), false);
        const staleToolbar = currentEditor.controls.regions.find((region) => region.id === "send"), staleAvatar = currentEditor.avatarBounds;
        const staleGeometry = currentEditor.geometry, staleToolbarRow = currentEditor.toolbarRow;
        if (screen.mode === "regular") mainState = screen.captureRenderState();
        screen.stop({ preserveScreen: true }); screen.setFocus(null); screen.clear(); screen.setLayoutRoot?.(undefined);
        mode = nextMode; activeModel = modelFor(mode); screen = makeScreen(mode); originalMethods.set(screen, nativeShowOverlay);
        if (mode === "regular" && mainState) screen.restoreRenderState(mainState);
        if (mode === "regular" && staleAvatar) {
          const configBefore = await readFile(join(scratch, "config.json"), "utf8"), draftBefore = currentEditor.getText();
          const event = (x, y) => ({ type: "click", button: "left", x, y, screenX: x, screenY: y, width: terminal.columns, height: terminal.rows, shift: false, alt: false, ctrl: false });
          currentEditor.handleMouse(event(staleAvatar.x + 1, staleAvatar.y));
          if (staleToolbar) currentEditor.handleMouse(event(staleGeometry.contentX + 3 + staleToolbar.start, staleToolbarRow));
          check(await readFile(join(scratch, "config.json"), "utf8") === configBefore && currentEditor.getText() === draftBefore,
            "A regular-mode proxy switch blocks old avatar/toolbar actions before the first render");
        }
        const retainedEditor = currentEditor, retainedText = currentEditor.getText(), retainedCursor = currentEditor.getCursor();
        mount(); screen.setFocus(currentEditor); draw();
        check(currentEditor === retainedEditor && currentEditor.getText() === retainedText && JSON.stringify(currentEditor.getCursor()) === JSON.stringify(retainedCursor), "Live native renderer replacement retains the exact editor, draft and cursor");
        modePresentation(); draw();
      }
    }
    await command("demo speaking"); const initial = draw(), avatar = markerRows();
    check(initial.length > 0, `${initialMode}/${historyLines}/${switchMode}: initial avatar visible`);
    check(initial.every((item) => avatar.includes(item.row)), "Sixel anchors match the actual visible marker rows after subtracting the regular-mode viewport top");
    const imageOffset = columns >= 120 ? 4 : 2;
    const expectedRasterWidth = Math.round(16 * (process.env.WT_SESSION ? 10 : getCellDimensions().widthPx));
    check(initial.every((item) => item.column === imageOffset), `${columns}: Sixel column anchors follow imageOffset independently of the wider caption`);
    check(initial.every((item) => item.rasterWidth === expectedRasterWidth), `${columns}: centering the caption never enlarges the normal 16-column Sixel image`);
    check(avatar.length > 2, "Actual product avatar markers are present in the visible viewport");
    if (screen.mode === "regular" && historyLines >= 120) check(screen.captureRenderState().previousViewportTop > 0, "Regular long-history control has genuinely scrolled");
    result.initialAvatarRows = avatar;
    result.initialAvatarColumns = [...new Set(initial.map((item) => item.column))];
    result.rasterWidths = [...new Set(initial.map((item) => item.rasterWidth))];
    const top = Math.min(...avatar), above = modal(Math.max(0, top - 4));
    await emit("ui_prompt_start"); await command("demo waiting");
    const upperDraws = draw();
    const nativeState = screen.captureRenderState?.();
    const expectedCursorRow = nativeState ? nativeState.hardwareCursorRow - nativeState.previousViewportTop : undefined;
    if (nativeState) check(activeModel.cursor.y === expectedCursorRow, "Modal/Sixel output preserves the native regular renderer's terminal-relative hardware cursor");
    result.stages.push({ name: "modal-above", bounds: above.getBounds(), imageRows: upperDraws.map((item) => item.row), viewportTop: screen.captureRenderState?.().previousViewportTop });
    result.cursorAfterAboveModal = { terminalRow: activeModel.cursor.y, nativeExpectedRow: expectedCursorRow };
    check(upperDraws.length > 0, `${initialMode}/${historyLines}/${switchMode}: modal above the dock must retain the avatar`);
    above.hide(); await emit("ui_prompt_end"); await command("demo thinking"); draw();
    const crossingRow = avatar[Math.floor(avatar.length / 2)], crossing = modal(crossingRow, 1, 3, 3);
    await command("demo error"); const crossingDraws = draw(), bounds = crossing.getBounds();
    result.stages.push({ name: "narrow-intersection", bounds, imageRows: crossingDraws.map((item) => item.row) });
    check(crossingDraws.length > 0, `${initialMode}/${historyLines}/${switchMode}: narrow modal suppresses only overlapping stripes`);
    check(crossingDraws.every((item) => item.row + 2 <= bounds.row || item.row >= bounds.row + bounds.height), "Final terminal-relative stripe bounds include six-band overshoot when checking modal intersections");
    crossing.hide(); await command("demo success"); const resumed = draw();
    result.stages.push({ name: "hide-resumes", imageRows: resumed.map((item) => item.row) });
    check(resumed.some((item) => item.row < bounds.row + bounds.height && item.row + 2 > bounds.row), `${initialMode}/${historyLines}/${switchMode}: hiding the modal restores previously blocked image rows`);
    check([...models.values()].every((model) => model.counters.sixelScrolls === 0), "Overlay rendering never causes a Sixel-induced scroll");
    check(allDraws.every((item) => item.column === imageOffset && item.rasterWidth === expectedRasterWidth), `${columns}: mode switches, overlay hide and pose changes preserve centered image anchors and raster size`);
    await emit("session_shutdown", { reason: "reload" });
    result.methodRestoredAfterReload = [...originalMethods].map(([renderer, original]) => ({ mode: renderer.mode, restored: renderer.showOverlay === original }));
    check(result.methodRestoredAfterReload.every((item) => item.restored), `${initialMode}/${historyLines}/${switchMode}: disposing a proxy-mounted observer restores every affected raw renderer method`);
    ctx.ui.setEditorComponent(undefined); ctx.ui.setHeader(undefined); ctx.ui.setFooter(undefined);
    await emit("session_start", { reason: "reload" }); draw();
    const reloaded = modal(Math.max(0, Math.min(...markerRows()) - 4)); await command("demo speaking"); const afterReload = draw();
    check(afterReload.length > 0, "Reload installs one working observer through the stable TUI reference"); reloaded.hide();
    await emit("session_shutdown", { reason: "quit" }); closed = true;
    result.methodRestoredAfterQuit = [...originalMethods].every(([renderer, original]) => renderer.showOverlay === original);
    check(result.methodRestoredAfterQuit, "Quit restores public overlay methods even when the host reference returns fresh callable wrappers");
    result.totalDcs = allDraws.length; cases.push(result);
  } finally {
    if (extension && !closed) await emit("session_shutdown", { reason: "quit" });
    currentEditor?.dispose?.(); currentHeader?.dispose?.(); currentFooter?.dispose?.(); screen.stop({ preserveScreen: true });
    if (scratch.startsWith(work + sep) && scratch.slice(work.length + 1).startsWith("regular-overlay-")) await rm(scratch, { recursive: true, force: true });
  }
}

await scenario("regular", 4);
await scenario("regular", 120);
checks.push("Real Pi regular mode retains images below native question overlays with short and genuinely scrolled multi-line history, while a narrow modal suppresses only intersecting stripes");
await scenario("fullscreen", 120, true);
await scenario("regular", 120, true);
await scenario("regular", 120, false, 120);
await scenario("fullscreen", 120, true, 120);
checks.push("At actual 100/120-column terminal widths, normal Sixel images remain exactly 16 cells wide and anchor at columns 2/4 across regular/fullscreen rendering, modal overlap and stable-reference mode switches");
checks.push("The actual createInteractiveTuiReference proxy survives fullscreen-to-regular and regular/fullscreen/regular renderer replacements without losing image overlays");
checks.push("Fresh and switched regular renderers show keyboard hints with zero toolbar/avatar click regions; fullscreen immediately restores complete clickable buttons through the same editor instance");
checks.push("Mode-specific bottom borders fit narrow widths, preserve CJK/emoji cursor/IME coordinates and native hidden-line counts, and leave the draft untouched across actual renderer replacements");
checks.push("Hiding question overlays resumes affected rows; reload and quit restore raw public methods despite the host proxy returning a fresh function for each method read");
const report = { testedAt: new Date().toISOString(), piVersion: version, modelRequests: 0, passed: failures.length === 0, baseline,
  verification: "Real Pi loader, Umi editor/Sixel/overlay observer, native main/fullscreen renderers, actual stable InteractiveMode proxy, public modal handles and deterministic VT model; no native-window automation", checks, failures, cases };
await writeFile(baseline ? join(work, "regular-overlay-baseline.json") : join(root, "tests/regular-overlay-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!baseline) assert.deepEqual(failures, []);
