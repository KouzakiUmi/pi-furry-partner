import assert from "node:assert/strict";
import { cp, readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { approvedMotionFixture } from "./approved-motion-fixture.mjs";
import { decodeApprovedMotionNodeResource } from "../lib/approved-motion-node.mjs";

// Run actual extension factories and Pi rendering without a model/session runtime.
// Commands save only to a temporary package copy under this workspace's work/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work");
await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "state-motion-routing-"));
assert.ok(scratch.startsWith(work + sep));
import { version, modules } from "./pi-runtime.mjs";
const agentPackage = join(modules, "@earendil-works/pi-coding-agent");
const load = (file) => import(pathToFileURL(file).href);
const { loadExtensions } = await load(join(agentPackage, "dist/core/extensions/loader.js"));
const themeAPI = await load(join(agentPackage, "dist/modes/interactive/theme/theme.js"));
const { validateThemeJson } = await load(join(agentPackage, "dist/modes/interactive/theme/theme-schema.js"));
const { KeybindingsManager } = await load(join(agentPackage, "dist/core/keybindings.js"));
const { CustomEditor } = await load(join(agentPackage, "dist/modes/interactive/components/custom-editor.js"));
const api = await load(join(modules, "@earendil-works/pi-tui/dist/index.js"));
const { TuiMainScreen, setKeybindings } = api;
const originalRandom=Math.random;let randomDraw=0;Math.random=()=>[0,0,.999,0][randomDraw++%4];
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

try {
  // The actual Pi extension receives a tiny validated complete-motion fixture;
  // preserved static sources remain the real shipped assets for fallback tests.
  for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), {
    recursive: true, filter: source => source !== join(root, 'assets', 'animated') });
  await writeFile(join(scratch, "config.json"), JSON.stringify({ language:"zh-CN", layout:"editor", style:"wumi", renderer:"auto", info:"compact", enabled:true, animation:true, dockSize:"auto" }));
  const { catalog: routingCatalog, data: routingData } = approvedMotionFixture();
  for (const frame of routingData["indexed/umi/watch.json"].frames) frame.pixels = [2, 0, 2, 1];
  const realCatalog=JSON.parse(await readFile(join(root,"assets/animated/catalog.json"),"utf8"));
  const realNod=structuredClone(realCatalog.clips.nod);assert.ok(realNod,'Current shipped catalog includes approved nod');
  const nodRaw=decodeApprovedMotionNodeResource(await readFile(join(root,"assets/animated",realNod.indexed.umi.file)));
  nodRaw.revision=routingCatalog.revision;nodRaw.frames.forEach(frame=>frame.pixels=Array.from(frame.pixels));
  for(const meta of Object.values(realNod.indexed))meta.file="indexed/umi/nod.json";
  routingCatalog.clips.nod=realNod;routingData["indexed/umi/nod.json"]=nodRaw;
  for(const id of ['idle','idle-center','idle-right','wave','stretch','peek','head-shake','ear-flick','bounce','nuzzle']){
    const clip=structuredClone(realCatalog.clips[id]);const raw=decodeApprovedMotionNodeResource(await readFile(join(root,'assets/animated',clip.indexed.umi.file)));
    raw.revision=routingCatalog.revision;raw.frames.forEach(frame=>frame.pixels=Array.from(frame.pixels));
    for(const meta of Object.values(clip.indexed))meta.file=`indexed/umi/${id}.json`;
    routingCatalog.clips[id]=clip;routingData[`indexed/umi/${id}.json`]=raw;
  }
  routingCatalog.idleVariants=realCatalog.idleVariants.slice();
  await mkdir(join(scratch, "assets/animated"), { recursive: true });
  await writeFile(join(scratch, "assets/animated/catalog.json"), JSON.stringify(routingCatalog));
  for (const [name, asset] of Object.entries(routingData)) {
    await mkdir(dirname(join(scratch, "assets/animated", name)), { recursive: true });
    await writeFile(join(scratch, "assets/animated", name), JSON.stringify(asset));
  }
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

  let painted;
  const paint = () => {
    for (const transport of [currentEditor.transport, currentEditor.kittyTransport]) if (transport) transport.render = frame => {
      painted = frame; return Array.from({ length: frame.rows }, () => " ".repeat(frame.columns));
    };
    currentEditor.render(100);
    assert.ok(painted, "Actual Pi image transport must receive the selected frame");
  };
  await command("render sixel");
  time += 6000;
  await emit("agent_start");
  await emit("tool_execution_start", { toolCallId: "read-route", toolName: "read", args: {} });
  paint();
  assert.equal(currentEditor.displaySheet.clipId, "watch", "Actual Pi read loads magnifier pixels, without keyboard entry");
  assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels), [2, 0, 2, 1], "Transport receives the distinct magnifier pixels, not only its ID");
  assert.equal(currentEditor.approvedMotion.stats().keyboardStage, null);
  await command("pause"); paint();
  assert.equal(painted.sheet.frames[painted.frameIndex].id, "watch", "Pi paused reading keeps preserved static magnifier");
  await emit("tool_execution_end", { toolCallId: "read-route", isError: false });
  await emit("message_update", { assistantMessageEvent: { type: "thinking_delta", delta: "x" } });
  // Finish paused reading before resuming the independent execution fixture.
  await command("play");
  await emit("tool_execution_start", { toolCallId: "run-route", toolName: "bash", args: {} });
  paint(); const entered = time;
  assert.equal(currentEditor.displaySheet.clipId, "work-enter", "Actual Pi execution starts keyboard entry");
  time = entered + 399; paint(); assert.equal(currentEditor.displaySheet.clipId, "work-enter");
  time = entered + 400; paint(); assert.equal(currentEditor.displaySheet.clipId, "work");
  await command("pause"); paint();
  assert.equal(painted.sheet.frames[painted.frameIndex].id, "work", "Pi paused execution keeps keyboard static artwork");
  await command("play"); paint();
  time += 400; paint(); assert.equal(currentEditor.displaySheet.clipId, "work");
  await emit("tool_execution_start", { toolCallId: "read-preempt", toolName: "read", args: {} });
  paint(); assert.equal(currentEditor.displaySheet.clipId, "work", "A short loop remains readable before the latest ordinary reading target");
  time += 800; paint(); assert.equal(currentEditor.displaySheet.clipId, "work-exit");
  time += 400; paint(); assert.equal(currentEditor.displaySheet.clipId, "watch", "Reading follows finite keyboard cleanup with its own magnifier pixels");
  assert.equal(currentEditor.approvedMotion.stats().keyboardStage, null);
  await emit("tool_execution_end", { toolCallId: "read-preempt", isError: false });
  paint(); assert.equal(currentEditor.displaySheet.clipId, "watch", "Reading gets its visible1200ms before returning to the still-active command");
  time += 1200; paint(); assert.equal(currentEditor.displaySheet.clipId, "work-enter");
  time += 400; paint(); assert.equal(currentEditor.displaySheet.clipId, "work");
  await emit("tool_execution_end", { toolCallId: "run-route", isError: false });
  await emit("message_update", { assistantMessageEvent: { type: "thinking_delta", delta: "x" } });
  paint(); assert.equal(currentEditor.displaySheet.clipId, "work", "Tool completion cannot skip the readable keyboard loop");
  time += 800; paint(); const exited = time;
  assert.equal(currentEditor.displaySheet.clipId, "work-exit");
  time = exited + 399; paint(); assert.equal(currentEditor.displaySheet.clipId, "work-exit");
  time = exited + 400; paint(); assert.equal(currentEditor.displaySheet.clipId, "think");
  // Actual command -> activity -> indexed pixels -> image transport uses the
  // real approved nod payload (only its fixture container revision is replaced).
  await emit("agent_before_settle",{outcome:"completed"});await emit("agent_settled",{aborted:false});
  time+=3000;paint();await command("action nod");const nodAt=time;paint();
  assert.equal(painted.sheet.clipId,"nod");const nodPixels=Array.from(painted.sheet.frames[painted.frameIndex].pixels);
  time=nodAt+3000;paint();assert.equal(painted.sheet.clipId,"nod","Nod must survive the old2.6s deadline");
  assert.notDeepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),nodPixels,"Real nod changes pixels");
  time=nodAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=nodAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId),"Manual nod ends at actual duration into an approved idle");
  // Real three-idle cycle handoff through Pi editor image transport.
  currentEditor.approvedMotion.setCatalog(routingCatalog);randomDraw=0;paint();
  const idleSeen=new Set();let idleAt=time;
  for(let cycle=0;cycle<3;cycle++){
    paint();const id=painted.sheet.clipId;idleSeen.add(id);assert.ok(routingCatalog.idleVariants.includes(id));
    assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),routingData[`indexed/umi/${id}.json`].frames[0].pixels);
    time=idleAt+3000;paint();assert.equal(painted.sheet.clipId,id);
    time=idleAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
    assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),routingData[`indexed/umi/${id}.json`].frames.at(-1).pixels);
    time=idleAt+4457;paint();assert.equal(painted.sheet.clipId,id);
    time=idleAt+4458;paint();assert.notEqual(painted.sheet.clipId,id);idleAt=time;
  }
  assert.deepEqual([...idleSeen].sort(),routingCatalog.idleVariants.slice().sort());
  await command('action wave');const waveAt=time;paint();assert.equal(painted.sheet.clipId,'wave');
  const firstWave=Array.from(painted.sheet.frames[painted.frameIndex].pixels);
  time=waveAt+3000;paint();assert.equal(painted.sheet.clipId,'wave');assert.notDeepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),firstWave);
  time=waveAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=waveAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  // Actual automatic activity schedule also supplies the complete wave clip.
  await emit("session_start",{reason:"reload"});paint();
  const autoWaveAt=time+45000;
  // Establish the real first presentation before checking the authored ending.
  time=autoWaveAt;paint();assert.equal(painted.sheet.clipId,'wave');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoWaveAt+3000;paint();assert.equal(painted.sheet.clipId,'wave');
  time=autoWaveAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoWaveAt+4458;paint();assert.notEqual(painted.sheet.clipId,'wave');
  // Current approved peek pixels flow through actual Pi activity/editor/transport.
  await command('action peek');const peekAt=time;paint();
  const rawPeek=routingData['indexed/umi/peek.json'];
  const peekPixels=new Set();
  for(const authored of rawPeek.frames){
    time=peekAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'peek');
    assert.equal(painted.sheet.width,240);assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),authored.pixels,'Actual Pi transport receives each approved peek frame');
    peekPixels.add(JSON.stringify(authored.pixels));
  }
  assert.ok(peekPixels.size>20,'Peek uses real changing pixels, not only an actionID');
  time=peekAt+4457;paint();assert.equal(painted.sheet.clipId,'peek');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=peekAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();const autoPeekAt=time+45000+2*120000;
  // Establish the real first presentation before checking the authored ending.
  time=autoPeekAt;paint();assert.equal(painted.sheet.clipId,'peek');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoPeekAt+3500;paint();assert.equal(painted.sheet.clipId,'peek','Catalog duration overrides old3400ms default');
  time=autoPeekAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoPeekAt+4458;paint();assert.notEqual(painted.sheet.clipId,'peek');
  // Current approved head-shake pixels flow through actual Pi activity/editor/transport.
  await command('action head-shake');const headAt=time;paint();
  const rawHead=routingData['indexed/umi/head-shake.json'];
  const headPixels=new Set();
  for(const authored of rawHead.frames){
    time=headAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'head-shake');
    assert.equal(painted.sheet.width,240);assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),authored.pixels,'Actual Pi transport receives each approved head-shake frame');
    headPixels.add(JSON.stringify(authored.pixels));
  }
  assert.ok(headPixels.size>20,'Head-shake uses real changing pixels, not only an actionID');
  time=headAt+4457;paint();assert.equal(painted.sheet.clipId,'head-shake');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=headAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();const autoHeadAt=time+45000+7*120000;
  // Establish the real first presentation before checking the authored ending.
  time=autoHeadAt;paint();assert.equal(painted.sheet.clipId,'head-shake');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoHeadAt+3500;paint();assert.equal(painted.sheet.clipId,'head-shake','Catalog duration overrides old2800ms default');
  time=autoHeadAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoHeadAt+4458;paint();assert.notEqual(painted.sheet.clipId,'head-shake');
  // Current approved ear-flick pixels flow through actual Pi activity/editor/transport.
  await command('action ear-flick');const earAt=time;paint();
  const rawEar=routingData['indexed/umi/ear-flick.json'];
  const earPixels=new Set();
  for(const authored of rawEar.frames){
    time=earAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'ear-flick');
    assert.equal(painted.sheet.width,240);assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,authored.sourceFrame);
    assert.deepEqual(Array.from(painted.sheet.frames[painted.frameIndex].pixels),authored.pixels,'Actual Pi transport receives each approved ear-flick frame');
    earPixels.add(JSON.stringify(authored.pixels));
  }
  assert.ok(earPixels.size>2,'Ear-flick uses real changing pixels, not only an actionID');
  time=earAt+4457;paint();assert.equal(painted.sheet.clipId,'ear-flick');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=earAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();const autoEarAt=time+45000+4*120000;
  // Establish the real first presentation before checking the authored ending.
  time=autoEarAt;paint();assert.equal(painted.sheet.clipId,'ear-flick');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoEarAt+3500;paint();assert.equal(painted.sheet.clipId,'ear-flick','Catalog duration overrides old2600ms default');
  time=autoEarAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoEarAt+4458;paint();assert.notEqual(painted.sheet.clipId,'ear-flick');
  // Real full896 stretch is registered into the caption lane, not shrunk
  // into the old core width and not cropped before reaching image transport.
  const baselineScale=painted.columns/painted.sheet.width,baselineRows=painted.rows;
  await command('action stretch');const stretchAt=time;paint();
  const rawStretch=routingData['indexed/umi/stretch.json'];let maxOutside=0;
  for(const authored of rawStretch.frames){
    time=stretchAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'stretch');
    const shown=painted.sheet.frames[painted.frameIndex];assert.equal(shown.sourceFrame,authored.sourceFrame);
    assert.equal(painted.sheet.height,240);assert.equal(painted.rows,baselineRows);
    assert.ok(Math.abs(painted.columns/painted.sheet.width-baselineScale)<1e-9,'Actual Pi source pixels retain the original world display density/character scale');
    const occupied=p=>p.reduce((n,v)=>n+(v!==0),0);
    assert.equal(occupied(shown.pixels),occupied(authored.pixels),'All actual indexed foreground, including extreme paws, reaches Pi image transport');
    let outside=0;for(let y=0;y<336;y++)for(let x=0;x<336;x++)if((x<48||x>=288)&&authored.pixels[y*336+x])outside++;
    maxOutside=Math.max(maxOutside,outside);assert.deepEqual(painted.sheet.palette,rawStretch.palette);
  }
  assert.ok(maxOutside>100,'Test covers real paws outside the previous640world, not only metadata');
  time=stretchAt+4457;paint();assert.equal(painted.sheet.clipId,'stretch');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=stretchAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();
  const autoStretchAt=time+45000+3*120000;
  // Establish the real first presentation before checking the authored ending.
  time=autoStretchAt;paint();assert.equal(painted.sheet.clipId,'stretch');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoStretchAt+3000;paint();assert.equal(painted.sheet.clipId,'stretch');
  time=autoStretchAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoStretchAt+4458;paint();assert.notEqual(painted.sheet.clipId,'stretch');
  // Real full896 bounce is registered into the caption lane, not shrunk
  // into the old core width and not cropped before reaching image transport.
  const bounceBaselineScale=painted.columns/painted.sheet.width,bounceBaselineRows=painted.rows;
  await command('action bounce');const bounceAt=time;paint();
  const rawBounce=routingData['indexed/umi/bounce.json'];let maxBounceOutside=0;
  for(const authored of rawBounce.frames){
    time=bounceAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'bounce');
    const shown=painted.sheet.frames[painted.frameIndex];assert.equal(shown.sourceFrame,authored.sourceFrame);
    assert.equal(painted.sheet.height,240);assert.equal(painted.rows,bounceBaselineRows);
    assert.ok(Math.abs(painted.columns/painted.sheet.width-bounceBaselineScale)<1e-9,'Actual Pi source pixels retain the original world display density/character scale');
    const occupied=p=>p.reduce((n,v)=>n+(v!==0),0);
    assert.equal(occupied(shown.pixels),occupied(authored.pixels),'All actual indexed foreground, including extreme paws, reaches Pi image transport');
    let outside=0;for(let y=0;y<336;y++)for(let x=0;x<336;x++)if((x<48||x>=288)&&authored.pixels[y*336+x])outside++;
    maxBounceOutside=Math.max(maxBounceOutside,outside);assert.deepEqual(painted.sheet.palette,rawBounce.palette);
  }
  assert.equal(rawBounce.width,336);assert.equal(rawBounce.height,336);assert.deepEqual(rawBounce.viewport.worldRect,[-128,-128,896,896]);
  time=bounceAt+4457;paint();assert.equal(painted.sheet.clipId,'bounce');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=bounceAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();
  const autoBounceAt=time+45000+6*120000;
  // Establish the real first presentation before checking the authored ending.
  time=autoBounceAt;paint();assert.equal(painted.sheet.clipId,'bounce');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoBounceAt+3500;paint();assert.equal(painted.sheet.clipId,'bounce');
  time=autoBounceAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoBounceAt+4458;paint();assert.notEqual(painted.sheet.clipId,'bounce');
  // Real nuzzle replaces the old bitmap wobble in manual and automatic routes.
  await command('action nuzzle');const nuzzleAt=time;paint();
  const rawNuzzle=routingData['indexed/umi/nuzzle.json'];
  assert.equal(rawNuzzle.frames.length,54);assert.equal(rawNuzzle.width,240);assert.equal(rawNuzzle.height,240);
  assert.deepEqual(routingCatalog.clips.nuzzle.qa.pivot,[320,608]);
  assert.deepEqual(routingCatalog.clips.nuzzle.paintRect,{x:0,y:0,width:640,height:640});
  const nuzzlePixels=new Set();
  for(const [i,authored] of rawNuzzle.frames.entries()){
    time=nuzzleAt+Math.ceil(authored.atMs);paint();assert.equal(painted.sheet.clipId,'nuzzle');
    const shown=painted.sheet.frames[painted.frameIndex];assert.equal(shown.sourceFrame,i*2);
    assert.deepEqual(Array.from(shown.pixels),Array.from(authored.pixels));
    assert.deepEqual(painted.sheet.palette,rawNuzzle.palette);assert.equal(painted.sheet.width,240);
    nuzzlePixels.add(Buffer.from(shown.pixels).toString('base64'));
  }
  assert.ok(nuzzlePixels.size>2,'Actual nuzzle changes authored pixels rather than applying the former bitmap motion');
  time=nuzzleAt+4457;paint();assert.equal(painted.sheet.clipId,'nuzzle');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=nuzzleAt+4458;paint();assert.ok(routingCatalog.idleVariants.includes(painted.sheet.clipId));
  await emit('session_start',{reason:'reload'});paint();const autoNuzzleAt=time+45000+5*120000;
  time=autoNuzzleAt;paint();assert.equal(painted.sheet.clipId,'nuzzle');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,0);
  time=autoNuzzleAt+3500;paint();assert.equal(painted.sheet.clipId,'nuzzle','Approved duration overrides the former3000ms bitmap gesture');
  time=autoNuzzleAt+4417;paint();assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106);
  time=autoNuzzleAt+4458;paint();assert.notEqual(painted.sheet.clipId,'nuzzle');
  await emit("agent_start");
  // Cold indexed/HD fallback: reset catalog to remove the chosen clip while
  // retaining source assets. The activity and ordinary render must agree too.
  const withoutWatch = structuredClone(routingCatalog); delete withoutWatch.clips.watch;
  currentEditor.approvedMotion.setCatalog(withoutWatch);
  await emit("tool_execution_start", { toolCallId: "read-fallback", toolName: "read", args: {} });
  paint(); assert.match(painted.sheet.frames[painted.frameIndex].id, /^watch/, "No complete clip falls back to reading artwork, never keyboard");
  assert.equal(currentEditor.getText(), "");
  await emit("session_shutdown");
  succeeded = true;
  console.log(`Actual Pi ${version}: read magnifier/execution keyboard,400ms entry/exit with readable ordinary action dwell, pause/fallback, real3-idle complete4458ms cycle handoff and manual/auto nuzzle+bounce+ear-flick+head-shake+peek+wave+full896 stretch through source106 and all54 actual stretch foreground/scale at image transport passed.`);
} finally {
  currentHeader?.dispose?.(); currentFooter?.dispose?.(); currentEditor?.dispose?.();
  Math.random=originalRandom;globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; Date.now = originalClock;
  if (originalWT === undefined) delete process.env.WT_SESSION; else process.env.WT_SESSION = originalWT;
  if (originalTMUX === undefined) delete process.env.TMUX; else process.env.TMUX = originalTMUX;
  if (originalRender === undefined) delete process.env.PI_WINK_RENDER; else process.env.PI_WINK_RENDER = originalRender;
  if (succeeded && scratch.startsWith(work + sep) && scratch.slice(work.length + 1).startsWith("state-motion-routing-")) await rm(scratch, { recursive: true, force: true });
}
