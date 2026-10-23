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
const scratch = await mkdtemp(join(work, "tool-error-pi-"));
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
  function hook(){const player=currentEditor.approvedMotion,native=player.sample.bind(player);player.sample=(snapshot,options)=>{actual={phase:snapshot.phase,busy:snapshot.busy,toolCount:snapshot.toolCount,toolName:snapshot.toolName,pendingNextState:snapshot.pendingNextState,visualPhase:snapshot.visualPhase,reaction:snapshot.reaction,face:snapshot.face};selection=native(snapshot,options);return selection;};}
  function paint(at=time){time=at;painted=undefined;for(const t of[currentEditor.transport,currentEditor.kittyTransport])if(t)t.render=f=>{painted=f;return Array.from({length:f.rows},()=> ' '.repeat(f.columns));};currentEditor.render(100);assert.ok(painted,JSON.stringify({editor:currentEditor.constructor.name,transport:Boolean(currentEditor.transport),kitty:Boolean(currentEditor.kittyTransport),sheet:currentEditor.displaySheet?.clipId,selection:selection?.clipId,rows:terminal.rows}));assert.ok(jobs.size<=1,'One Pi redraw timer');assert.ok(currentEditor.approvedMotion.stats().clips<=2);return selection;}
  function clip(s,id){assert.equal(s?.clipId,id);}
  function facts(phase,count=0){assert.equal(actual.phase,phase);assert.equal(actual.toolCount,count);}
  async function fresh(){await emit('session_shutdown');currentFactory=undefined;currentEditor=nativeEditor();currentHeader=undefined;currentFooter=undefined;busy=false;time+=10000;await emit('session_start',{reason:'startup'});hook();time+=6000;paint();await emit('agent_start');}
  const start=(name,id=name)=>emit('tool_execution_start',{toolCallId:id,toolName:name,args:{}});
  const end=id=>emit('tool_execution_end',{toolCallId:id,isError:false});
  async function longTool(name='edit'){await fresh();const at=time;await start(name);paint();if(name==='edit'||name==='bash')paint(at+400);paint(at+2000);await end(name);paint();facts('thinking');assert.equal(actual.pendingNextState?.remainingMs,2000);return{at:time,selection};}

  const {createBashTool}=await load(join(agentPackage,'dist/core/tools/bash.js'));
  // Execute actual Pi1.4 tool serialization using its operations seam; no child
  // process, network, or model is started by the integration test.
  const nativeResult=async exitCode=>createBashTool(scratch,{operations:{exec:async(command,cwd,{onData})=>{onData(Buffer.from('error text is harmless output'));return{exitCode};}}}).execute('native',{command:'exit '+exitCode});
  const exitOne=await nativeResult(1),exitZero=await nativeResult(0);
  assert.equal(exitOne.isError,true);assert.equal(exitOne.structuredContent.exit_code,1);assert.equal(exitZero.structuredContent.exit_code,0);
  async function failed(result=exitOne){await fresh();await start('bash');paint();time+=20;await emit('tool_execution_end',{toolCallId:'bash',toolName:'bash',isError:result.isError===true,result});const s=paint();facts('thinking');assert.equal(actual.busy,true);assert.equal(actual.reaction,'error');assert.equal(actual.face,'error');assert.equal(s,null);assert.equal(actual.pendingNextState,null);return time;}
  {const at=await failed();assert.equal(paint(at+1799),null);assert.equal(actual.reaction,'error');paint(at+1800);assert.equal(actual.reaction,undefined);facts('thinking');}
  {const at=await failed();time=at+50;await start('edit','next');paint();facts('editing',1);assert.equal(actual.reaction,'error');time=at+100;await emit('message_update',{assistantMessageEvent:{type:'thinking_delta',delta:'next thought'}});paint();assert.equal(actual.reaction,'error');paint(at+1800);facts('editing',1);assert.equal(actual.reaction,undefined);clip(selection,'work-enter');}
  for(const mode of ['text','prompt','cancel','reset']){const at=await failed();time=at+50;if(mode==='text')await emit('message_update',{assistantMessageEvent:{type:'text_delta',delta:'answer'}});else if(mode==='prompt')await emit('ui_prompt_start');else if(mode==='cancel'){await emit('agent_before_settle',{outcome:'aborted'});await emit('agent_settled',{aborted:true});}else await emit('session_shutdown');if(mode!=='reset'){paint();assert.notEqual(actual.reaction,'error');}}
  await fresh();await start('bash');paint();await emit('tool_execution_end',{toolCallId:'bash',toolName:'bash',isError:false,result:exitZero});paint();facts('thinking');assert.notEqual(actual.reaction,'error');
  {await fresh();await start('read','a');await start('bash','b');paint();await emit('tool_execution_end',{toolCallId:'b',toolName:'bash',isError:true,result:exitOne});const at=time;paint();facts('reading',1);assert.equal(actual.reaction,'error');time+=100;await emit('tool_execution_end',{toolCallId:'b',toolName:'bash',isError:true,result:exitOne});paint(at+1800);facts('reading',1);assert.equal(actual.reaction,undefined);}
  {await fresh();const command=extension.commands.get('mascot');assert.ok(command);
   await command.handler('pause',ctx);await start('bash');paint();time+=20;await emit('tool_execution_end',{toolCallId:'bash',toolName:'bash',isError:true,result:exitOne});paint();assert.equal(actual.face,'error');assert.equal(actual.reaction,'error');assert.equal(jobs.size,1);const at=time;time=at+1800;const[[id,job]]=[...jobs.entries()];jobs.delete(id);job.fn();paint();assert.equal(actual.reaction,undefined);assert.equal(actual.face,'think');assert.equal(jobs.size,0);}
  await emit('session_shutdown');assert.equal(jobs.size,0);succeeded=true;console.log(`Actual Pi ${version} native bash result + runtime tool-error integration passed, including short failure, realtime facts, readable dwell, next-tool/think, answer/prompt/cancel, parallel/dedupe, exit0, and paused expiry.`);
} finally {
  currentHeader?.dispose?.();currentFooter?.dispose?.();currentEditor?.dispose?.();Math.random=originalRandom;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;Date.now=originalClock;
  if(originalWT===undefined)delete process.env.WT_SESSION;else process.env.WT_SESSION=originalWT;if(originalTMUX===undefined)delete process.env.TMUX;else process.env.TMUX=originalTMUX;if(originalRender===undefined)delete process.env.PI_WINK_RENDER;else process.env.PI_WINK_RENDER=originalRender;
  if(scratch.startsWith(work+sep)&&scratch.slice(work.length+1).startsWith('tool-error-pi-'))await rm(scratch,{recursive:true,force:true});
}
