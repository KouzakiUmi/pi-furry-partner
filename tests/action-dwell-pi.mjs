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
const scratch = await mkdtemp(join(work, "action-dwell-pi-"));
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
  for (const name of ["index.ts", "lib", "assets", "themes", "prompts", "package.json"]) await cp(join(root,name),join(scratch,name),{recursive:true,filter:p=>p!==join(root,'assets','animated')});
  await writeFile(join(scratch,'config.json'),JSON.stringify({language:'en',layout:'editor',style:'umi',renderer:'sixel',enabled:true,animation:true,dockSize:'auto'}));
  const {catalog,data}=approvedMotionFixture();
  for(const id of ['idle-center','idle-right']){
    const clip=structuredClone(catalog.clips.idle);clip.id=id;clip.hires.baseUrl=`hires/${id}/`;clip.hires.frames.forEach((f,i)=>f.id=`${id}-${i}`);
    for(const[style,m]of Object.entries(clip.indexed)){const raw=structuredClone(data[m.file]);raw.clipId=id;raw.frames.forEach((f,i)=>f.id=`${id}-${i}`);m.file=`indexed/${style}/${id}.json`;data[m.file]=raw;}catalog.clips[id]=clip;
  }
  catalog.idleVariants=['idle','idle-center','idle-right'];
const authoredIdle=JSON.parse(await readFile(new URL('../assets/animated/catalog.json',import.meta.url),'utf8'));
for(const id of catalog.idleVariants){const c=catalog.clips[id],original=authoredIdle.clips[id];c.periodMs=original.periodMs;c.hires.frames=original.hires.frames.map(f=>({id:f.id,file:f.file,atMs:f.atMs,sourceFrame:f.sourceFrame}));c.frameCount=c.hires.frames.length;
 for(const m of Object.values(c.indexed)){const raw=data[m.file];raw.periodMs=c.periodMs;raw.frames=c.hires.frames.filter(f=>f.sourceFrame%2===0).map(f=>({id:f.id,atMs:f.atMs,sourceFrame:f.sourceFrame,pixels:[0,1,2,0]}));m.frameCount=raw.frames.length;}}
  await mkdir(join(scratch,'assets/animated'),{recursive:true});await writeFile(join(scratch,'assets/animated/catalog.json'),JSON.stringify(catalog));
  for(const[path,raw]of Object.entries(data)){await mkdir(dirname(join(scratch,'assets/animated',path)),{recursive:true});await writeFile(join(scratch,'assets/animated',path),JSON.stringify(raw));}
  themeAPI.setThemeJsonValidator(validateThemeJson);themeAPI.initTheme('dark',false);theme=themeAPI.loadThemeFromPath(join(root,'themes/pi-furry-night.json'),'truecolor');editorTheme=themeAPI.getEditorTheme();
  process.env.WT_SESSION='offline-action-dwell';delete process.env.TMUX;delete process.env.PI_WINK_RENDER;api.setCapabilities({images:null,trueColor:true,hyperlinks:true});
  Date.now=()=>time;
  const result=await loadExtensions([join(scratch,'index.ts')],scratch);assert.deepEqual(result.errors,[]);assert.equal(result.extensions.length,1);result.runtime.getThinkingLevel=()=> 'medium';const extension=result.extensions[0];
  const emit=async(type,event={})=>{if(type==='agent_start')busy=true;if(type==='agent_settled')busy=false;for(const h of extension.handlers.get(type)||[])await h({type,...event},ctx);};
  globalThis.setTimeout=(fn,ms)=>{const id={id:++nextJob,unref(){}};jobs.set(id,{fn,ms});return id;};globalThis.clearTimeout=id=>jobs.delete(id);
  mainRenderer();currentEditor=nativeEditor();
  let painted,actual,selection;
  function hook(){const player=currentEditor.approvedMotion,native=player.sample.bind(player);player.sample=(snapshot,options)=>{actual={phase:snapshot.phase,busy:snapshot.busy,toolCount:snapshot.toolCount,toolName:snapshot.toolName};selection=native(snapshot,options);return selection;};}
  function paint(at=time){time=at;painted=undefined;for(const t of[currentEditor.transport,currentEditor.kittyTransport])if(t)t.render=f=>{painted=f;return Array.from({length:f.rows},()=> ' '.repeat(f.columns));};currentEditor.render(100);assert.ok(painted,JSON.stringify({editor:currentEditor.constructor.name,transport:Boolean(currentEditor.transport),kitty:Boolean(currentEditor.kittyTransport),sheet:currentEditor.displaySheet?.clipId,selection:selection?.clipId,rows:terminal.rows}));assert.ok(jobs.size<=1,'One Pi redraw timer');assert.ok(currentEditor.approvedMotion.stats().clips<=2);return selection;}
  function clip(s,id){assert.equal(s?.clipId,id);}
  function facts(phase,count=0){assert.equal(actual.phase,phase);assert.equal(actual.toolCount,count);}
  async function fresh(){await emit('session_shutdown');currentFactory=undefined;currentEditor=nativeEditor();currentHeader=undefined;currentFooter=undefined;busy=false;time+=10000;await emit('session_start',{reason:'startup'});hook();time+=6000;paint();await emit('agent_start');}
  const start=(name,id=name)=>emit('tool_execution_start',{toolCallId:id,toolName:name,args:{}});
  const end=async id=>{await emit('tool_execution_end',{toolCallId:id,isError:false});await emit('message_update',{assistantMessageEvent:{type:'thinking_delta',delta:'x'}});};
  for(const name of ['edit','bash'])for(const duration of [0,20]){
    await fresh();const at=time;await start(name);time+=duration;await end(name);await emit('message_start',{message:{role:'assistant'}});
    const shown=time;clip(paint(shown),'work-enter');facts('thinking');clip(paint(shown+399),'work-enter');clip(paint(shown+400),'work');clip(paint(shown+1199),'work');facts('thinking');clip(paint(shown+1200),'work-exit');clip(paint(shown+1600),'think');
  }
  checks.push('Actual Pi event handlers retain same-tick/20ms edit/bash without an intervening paint;400enter+800loop+400exit; real thinking/toolCount0');
  for(const[name,id]of[['read','watch'],['grep','search']]){await fresh();await start(name);await end(name);const at=time;clip(paint(at),id);facts('thinking');clip(paint(at+1199),id);clip(paint(at+1200),'think');}
  await fresh();await emit('session_before_compact');await emit('session_compact');const compactAt=time;clip(paint(),'search');clip(paint(compactAt+1199),'search');clip(paint(compactAt+1200),'think');
  checks.push('Short read/search/compaction display at least1200ms through actual editor and image transport');
  await fresh();await start('read','parallel-read');await start('edit','parallel-edit');paint();await end('parallel-edit');paint();facts('reading',1);await end('parallel-read');paint();facts('thinking');
  for(const urgent of ['waiting','speaking']){await fresh();await start('edit');await end('edit');paint();if(urgent==='waiting')await emit('ui_prompt_start');else await emit('message_update',{assistantMessageEvent:{type:'text_delta',delta:'x'}});const s=paint();facts(urgent);if(urgent==='waiting')clip(s,'wait');else assert.equal(s,null);}
  checks.push('Parallel tool results stay independent; waiting/speech preempt presentation hold without altering real facts');
  await fresh();await start('edit');const successAt=time;paint();time+=20;await end('edit');await emit('agent_before_settle',{outcome:'completed'});await emit('agent_settled',{aborted:false});clip(paint(),'work-enter');facts('success');assert.equal(actual.busy,false);clip(paint(successAt+400),'work');clip(paint(successAt+1200),'work-exit');const joy=paint(successAt+1600);clip(joy,'joy');assert.equal(joy.playbackMs,0);clip(paint(successAt+2799),'joy');assert.ok(catalog.idleVariants.includes(paint(successAt+2800).clipId));
  for(const outcome of ['error','aborted']){await fresh();await start('edit');paint();time+=20;await end('edit');await emit('agent_before_settle',{outcome});await emit('agent_settled',{aborted:outcome==='aborted'});const s=paint();facts(outcome==='error'?'error':'cancelled');assert.equal(actual.busy,false);if(outcome==='error')assert.equal(s,null);else clip(s,'rest');}
  checks.push('Real success/busyfalse waits only for finite work cleanup then gets1200ms joy; error/cancellation preempt immediately');
  // Pi indexed files are synchronous; first-paint readiness is asserted above.
  await fresh();const player=currentEditor.approvedMotion;
  player.setCatalog(catalog);
  // Verify no timer or cache accumulation through repeated ordinary action changes.
  for(const[name,id]of[['read','watch'],['grep','search'],['edit','work-enter']]){await start(name,`bounded-${name}`);paint();assert.ok(player.stats().clips<=2);await end(`bounded-${name}`);time+=2000;paint();}
  checks.push('Actual Pi cache and timer remain bounded across repeated action changes; production indexed loads are synchronous');
  await fresh();await emit('agent_settled');time+=3000;const idleAt=time,seen=new Set();let previous;const period=authoredIdle.clips.idle.periodMs;
  for(let cycle=0;cycle<3;cycle++)for(const offset of[0,250,4417,period-1]){const s=paint(idleAt+cycle*period+offset);assert.ok(catalog.idleVariants.includes(s.clipId));if(offset===0){if(previous)assert.notEqual(s.clipId,previous);previous=s.clipId;seen.add(previous);assert.equal(s.frame.sourceFrame,0);}else assert.equal(s.clipId,previous);if(offset>=4417){assert.equal(s.frame.sourceFrame,106,'Native idle source106 before authored boundary');assert.equal(painted.sheet.frames[painted.frameIndex].sourceFrame,106,'Actual Pi indexed output reachessource106');}}
  assert.ok(seen.size>=2);await emit('session_shutdown');assert.equal(jobs.size,0);checks.push('Idle playlist preserves whole authored cycles and shutdown removes the timer');
  succeeded=true;console.log(`Actual Pi ${version} default1200ms action dwell: ${checks.join('; ')}.`);
} finally {
  currentHeader?.dispose?.();currentFooter?.dispose?.();currentEditor?.dispose?.();Math.random=originalRandom;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;Date.now=originalClock;
  if(originalWT===undefined)delete process.env.WT_SESSION;else process.env.WT_SESSION=originalWT;if(originalTMUX===undefined)delete process.env.TMUX;else process.env.TMUX=originalTMUX;if(originalRender===undefined)delete process.env.PI_WINK_RENDER;else process.env.PI_WINK_RENDER=originalRender;
  if(scratch.startsWith(work+sep)&&scratch.slice(work.length+1).startsWith('action-dwell-pi-'))await rm(scratch,{recursive:true,force:true});
}
