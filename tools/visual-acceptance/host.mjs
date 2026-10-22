// Offline fixture host: production extension + real Pi TUI + real terminal PTY.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const session = path.resolve(process.argv[2]);
const options = JSON.parse(fs.readFileSync(path.join(session, 'session.json'), 'utf8'));
const source = path.join(session, 'source');
const modules = options.modules;
const load = p => import(pathToFileURL(p).href);
const agent = path.join(modules, '@earendil-works/pi-coding-agent');
const api = await load(path.join(modules, '@earendil-works/pi-tui/dist/index.js'));
const { loadExtensions } = await load(path.join(agent, 'dist/core/extensions/loader.js'));
const themes = await load(path.join(agent, 'dist/modes/interactive/theme/theme.js'));
const { validateThemeJson } = await load(path.join(agent, 'dist/modes/interactive/theme/theme-schema.js'));
const { KeybindingsManager } = await load(path.join(agent, 'dist/core/keybindings.js'));
const { CustomEditor } = await load(path.join(agent, 'dist/modes/interactive/components/custom-editor.js'));
const { createInteractiveTuiReference } = await load(path.join(agent, 'dist/modes/interactive/tui-renderer.js'));
const { createChatViewport } = await load(path.join(agent, 'dist/modes/interactive/chat-viewport.js'));
const { graphicsMode } = await load(path.join(source, 'lib/sixel.mjs'));
const { dockGeometry } = await load(path.join(source, 'lib/editor-layout.mjs'));
const { stripTerminalSequences } = await load(path.join(modules, '@earendil-works/pi-tui/dist/utils.js'));
const { ProcessTerminal, TuiMainScreen, TuiAltScreen, Container, SelectList, truncateToWidth, matchesKey, setKeybindings } = api;

themes.setThemeJsonValidator(validateThemeJson);
themes.initTheme('dark', false);
const theme = themes.loadThemeFromPath(path.join(source, 'themes/pi-furry-night.json'), 'truecolor');
const editorTheme = themes.getEditorTheme();
const keys = new KeybindingsManager();
setKeybindings(keys);
const terminal = new ProcessTerminal();
let mode = options.mode, screen, currentEditor, currentHeader, currentFooter, currentFactory;
let extension, busy = false, stopped = false, historyCount = options.history, selectedValue;
const notices = [], submissions = [], statuses = new Map();
const header = new Container(), document = new Container(), editor = new Container(), footer = new Container();
const empty = { render: () => [], invalidate() {} };
const transcript = {
  render: width => Array.from({ length: historyCount }, (_, i) => truncateToWidth(
    `${String(i + 1).padStart(3)} │ 离线视觉场景 / fixture transcript — 中文 ABC 🙂`, width, '')),
  invalidate() {},
};
document.addChild(header); document.addChild(transcript);
const makeScreen = () => mode === 'regular' ? new TuiMainScreen(terminal, true, session)
  : new TuiAltScreen(terminal, true, session, { mouse: true, copyOnSelect: false });
screen = makeScreen();
const reference = createInteractiveTuiReference(() => screen);
const footerData = { getGitBranch: () => 'visual-fixture', getExtensionStatuses: () => statuses,
  getAvailableProviderCount: () => 0, onBranchChange: () => () => {} };
const manager = { getEntryCount: () => 0, getLeafId: () => 'fixture', getSessionId: () => options.id,
  getEntries: () => [], getCwd: () => source };
let activeOverlay;
function dismiss() {
  if (activeOverlay) { const old = activeOverlay; activeOverlay = undefined; old.handle.hide(); old.resolve?.(undefined); }
  screen.setFocus(currentEditor); screen.requestRender();
}
function framed(title, child) {
  return {
    render(width) {
      const inner = Math.max(1, width - 4);
      const line = value => '│ ' + truncateToWidth(value, inner, '') + ' '.repeat(Math.max(0, inner - api.visibleWidth(truncateToWidth(value, inner, '')))) + ' │';
      return ['╭' + '─'.repeat(Math.max(0, width - 2)) + '╮', line(title),
        ...child.render(inner).map(line), line('Esc 返回 / close'), '╰' + '─'.repeat(Math.max(0, width - 2)) + '╯'];
    },
    invalidate() { child.invalidate?.(); },
    handleInput(data) { if (matchesKey(data, 'escape')) dismiss(); else { child.handleInput?.(data); screen.requestRender(); } },
    handleMouse(event) { return child.handleMouse?.({ ...event, x: event.x - 2, y: event.y - 2, width: Math.max(1, event.width - 4) }); },
  };
}
function select(title, choices) {
  dismiss();
  return new Promise(resolve => {
    const tint = token => value => theme.fg(token, value);
    const list = new SelectList(choices.map(value => ({ value, label: value })), 7,
      { selectedPrefix: tint('accent'), selectedText: tint('accent'), description: tint('muted'), scrollInfo: tint('dim'), noMatch: tint('warning') });
    const handle = screen.showOverlay(framed(title, list), { width: '70%', maxHeight: '85%', anchor: 'center', margin: 1 });
    activeOverlay = { handle, resolve, kind: 'native-select' };
    list.onCancel = dismiss;
    list.onSelect = item => { selectedValue = item.value; activeOverlay = undefined; handle.hide(); resolve(item.value); screen.requestRender(); };
    screen.requestRender();
  });
}
const ctx = { mode: 'tui', hasUI: true, cwd: source, sessionManager: manager,
  model: { id: 'offline-fixture-no-model', provider: 'fixture', contextWindow: 200000 },
  isIdle: () => !busy, getContextUsage: () => ({ tokens: 0, percent: 0, contextWindow: 200000 }),
  ui: {
    get theme() { return theme; },
    setHeader(factory) { currentHeader?.dispose?.(); currentHeader = factory?.(reference, theme); header.clear(); if (currentHeader) header.addChild(currentHeader); },
    setFooter(factory) { currentFooter?.dispose?.(); currentFooter = factory?.(reference, theme, footerData); footer.clear(); if (currentFooter) footer.addChild(currentFooter); },
    getEditorComponent: () => currentFactory,
    setEditorComponent(factory) {
      const text = currentEditor?.getText() || '';
      currentFactory = factory;
      currentEditor = factory ? factory(reference, editorTheme, keys) : new CustomEditor(reference, editorTheme, keys, { embedWorkingStatus: true });
      currentEditor.setText(text);
      currentEditor.onSubmit = value => {
        submissions.push(value);
        if (value.startsWith('/mascot ')) void command(value.slice(8)).catch(recordError);
        // Deliberately no AgentSession or model/tool execution.
        screen.requestRender();
      };
      currentEditor.onEscape = dismiss;
      editor.clear(); editor.addChild(currentEditor); reference.setFocus(currentEditor);
    },
    setStatus: (key, value) => value === undefined ? statuses.delete(key) : statuses.set(key, value),
    notify: (message, type) => { notices.push({ message, type }); if (notices.length > 20) notices.shift(); },
    addAutocompleteProvider() {},
    select,
    custom: async (factory, customOptions = {}) => {
      dismiss();
      return new Promise(resolve => {
        const done = value => { const old = activeOverlay; activeOverlay = undefined; old?.handle.hide(); resolve(value); screen.requestRender(); };
        const component = factory(reference, theme, keys, done);
        const handle = screen.showOverlay(component, customOptions.overlayOptions || { width: '80%', margin: 1 });
        activeOverlay = { handle, resolve, kind: 'extension-custom' }; screen.requestRender();
      });
    },
  },
};
const emit = async (type, event = {}) => {
  if (type === 'agent_start') busy = true;
  if (type === 'agent_settled') busy = false;
  for (const handler of extension.handlers.get(type) || []) await handler({ type, ...event }, ctx);
};
const command = value => extension.commands.get('mascot').handler(value, ctx);
function mount() {
  screen.addChild(header); screen.addChild(transcript); screen.addChild(editor); screen.addChild(footer);
  if (mode === 'fullscreen') screen.setLayoutRoot(createChatViewport({ document, editor, footer, status: empty, pendingMessages: empty, scrollbar: 'never' }).root);
  screen.addInputListener(data => {
    if (matchesKey(data, 'ctrl+c')) { void shutdown(); return { consume: true }; }
  });
  screen.setFocus(currentEditor); screen.start(); screen.requestRender();
}
function recordError(error) { fs.appendFileSync(path.join(session, 'host-errors.log'), `${error.stack || error}\n`); }
function state() {
  const config = JSON.parse(fs.readFileSync(path.join(source, 'config.json'), 'utf8'));
  const renderState = mode === 'regular' ? screen.captureRenderState() : undefined;
  const lines = renderState?.previousLines || screen.getScreenLines();
  const viewportTop = renderState?.previousViewportTop || 0;
  const visible = lines.slice(viewportTop, viewportTop + terminal.rows);
  const renderedEditor = currentEditor?.render(terminal.columns) || [];
  const marker = renderedEditor[0] ? stripTerminalSequences(renderedEditor[0]) : '';
  const editorRow = marker ? visible.findIndex(line => stripTerminalSequences(line) === marker) : -1;
  const geometry = dockGeometry(terminal.columns, terminal.rows, config.dockSize || 'auto');
  return { ready: true, id: options.id, fixture: true, modelRequests: 0, visualAcceptance: 'not-evaluated',
    mode, config, renderer: graphicsMode(config.renderer, process.env, api.getCapabilities().images),
    columns: terminal.columns, rows: terminal.rows, cellDimensions: api.getCellDimensions(),
    text: currentEditor?.getText() || '', cursor: currentEditor?.getCursor(), editorRow,
    editorGeometry: currentEditor?.geometry ? Object.fromEntries(Object.entries(currentEditor.geometry).filter(([key]) => key !== 'lines')) : null,
    avatar: !geometry.collapsed && editorRow >= 0 ? { x: geometry.imageOffset, y: editorRow + 3, width: geometry.columns, height: geometry.rows } : null,
    overlay: activeOverlay ? { kind: activeOverlay.kind, bounds: activeOverlay.handle.getBounds() } : null,
    selectionActive: mode === 'fullscreen' ? screen.hasActiveSelection() : null,
    selectedValue, submissions: submissions.slice(-10), notices: notices.slice(-3),
    screenText: visible.map(stripTerminalSequences), pid: process.pid };
}
async function scene(request) {
  dismiss();
  if (request.mode && request.mode !== mode) {
    screen.stop({ preserveScreen: true }); screen.setFocus(null); screen.clear(); screen.setLayoutRoot?.(undefined);
    mode = request.mode; screen = makeScreen(); mount();
  }
  for (const [field, sub] of [['renderer', 'render'], ['style', 'style'], ['language', 'language'], ['layout', 'layout']]) {
    if (request[field]) await command(`${sub} ${request[field]}`);
  }
  if (request.history !== undefined) historyCount = request.history;
  if (request.phase) await command(`demo ${request.phase}`);
  if (request.animation !== undefined) await command(request.animation ? 'play' : 'pause');
  if (request.text !== undefined) currentEditor.setText(request.text);
  screen.renderNow();
  if (request.overlay && request.overlay !== 'off') {
    const current = state(), avatar = current.avatar;
    const row = request.row ?? Math.max(1, avatar ? avatar.y + 2 : terminal.rows - 9);
    const col = request.col ?? (request.overlay === 'right' ? Math.max(26, (avatar?.x || 0) + (avatar?.width || 16) + 6) : 3);
    const component = framed('OVERLAY — 原生合成验收', { render: width => ['POPUP ROW 1 / 弹层第一行', 'POPUP ROW 2 / 弹层第二行', '↑ ↓ Enter Esc'].map(v => truncateToWidth(v, width, '')), invalidate() {} });
    activeOverlay = { kind: request.overlay, handle: screen.showOverlay(component, { width: Math.min(44, terminal.columns - col), row, col }) };
  }
  if (request.menu) void command('menu').catch(recordError);
  screen.renderNow();
  return state();
}
let server;
async function shutdown() {
  if (stopped) return;
  stopped = true; dismiss();
  try { await emit('session_shutdown', { reason: 'visual-fixture-stop' }); } catch (error) { recordError(error); }
  currentEditor?.dispose?.(); currentHeader?.dispose?.(); currentFooter?.dispose?.();
  screen.stop(); server?.close();
  await terminal.drainInput(150, 30);
  setTimeout(() => process.exit(0), 50);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
process.on('uncaughtException', error => { recordError(error); void shutdown(); });
process.on('unhandledRejection', error => { recordError(error); void shutdown(); });
const loaded = await loadExtensions([path.join(source, 'index.ts')], source);
if (loaded.errors.length) throw new Error(JSON.stringify(loaded.errors));
extension = loaded.extensions[0];
loaded.runtime.getThinkingLevel = () => 'medium';
ctx.ui.setEditorComponent(undefined);
mount();
await emit('session_start', { reason: 'visual-fixture-start' });
await command('demo idle');
screen.renderNow();
server = net.createServer(socket => {
  let data = '';
  socket.setTimeout(10000, () => socket.destroy());
  socket.on('data', chunk => {
    data += chunk;
    if (data.length > 131072) { socket.destroy(); return; }
    if (!data.includes('\n')) return;
    socket.pause();
    void (async () => {
      try {
        const request = JSON.parse(data.split('\n')[0]);
        let result;
        if (request.op === 'status') { screen.renderNow(); result = state(); }
        else if (request.op === 'scene') result = await scene(request);
        else if (request.op === 'stop') { result = { stopping: true }; setTimeout(() => void shutdown(), 50); }
        else throw new Error('Unknown fixture operation');
        socket.end(JSON.stringify({ ok: true, result }) + '\n');
      } catch (error) { socket.end(JSON.stringify({ ok: false, error: error.message }) + '\n'); }
    })();
  });
});
server.listen(options.hostSocket, () => fs.chmodSync(options.hostSocket, 0o600));
setTimeout(() => void shutdown(), options.ttl * 1000).unref();
