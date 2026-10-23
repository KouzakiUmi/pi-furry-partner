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
const scratch = await mkdtemp(join(work, "tool-gap-pi-"));
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
  function hook(){const player=currentEditor.approvedMotion,native=player.sample.bind(player);player.sample=(snapshot,options)=>{actual={phase:snapshot.phase,busy:snapshot.busy,toolCount:snapshot.toolCount,toolName:snapshot.toolName,pendingNextState:snapshot.pendingNextState,visualPhase:snapshot.visualPhase};selection=native(snapshot,options);return selection;};}
  function paint(at=time){time=at;painted=undefined;for(const t of[currentEditor.transport,currentEditor.kittyTransport])if(t)t.render=f=>{painted=f;return Array.from({length:f.rows},()=> ' '.repeat(f.columns));};currentEditor.render(100);assert.ok(painted,JSON.stringify({editor:currentEditor.constructor.name,transport:Boolean(currentEditor.transport),kitty:Boolean(currentEditor.kittyTransport),sheet:currentEditor.displaySheet?.clipId,selection:selection?.clipId,rows:terminal.rows}));assert.ok(jobs.size<=1,'One Pi redraw timer');assert.ok(currentEditor.approvedMotion.stats().clips<=2);return selection;}
  function clip(s,id){assert.equal(s?.clipId,id);}
  function facts(phase,count=0){assert.equal(actual.phase,phase);assert.equal(actual.toolCount,count);}
  async function fresh(){await emit('session_shutdown');currentFactory=undefined;currentEditor=nativeEditor();currentHeader=undefined;currentFooter=undefined;busy=false;time+=10000;await emit('session_start',{reason:'startup'});hook();time+=6000;paint();await emit('agent_start');}
  const start=(name,id=name)=>emit('tool_execution_start',{toolCallId:id,toolName:name,args:{}});
  const end=id=>emit('tool_execution_end',{toolCallId:id,isError:false});
  async function longTool(name='edit'){await fresh();const at=time;await start(name);paint();if(name==='edit'||name==='bash')paint(at+400);paint(at+2000);await end(name);paint();facts('thinking');assert.equal(actual.pendingNextState?.remainingMs,2000);return{at:time,selection};}
  for(const name of ['edit','read','bash']){
    const{at}=await longTool(name),expected=name==='read'?'watch':'work';time=at+200;await emit('message_start',{message:{role:'assistant'}});await emit('message_update',{assistantMessageEvent:{type:'text_start'}});await emit('message_update',{assistantMessageEvent:{type:'text_delta',delta:''}});await emit('message_update',{assistantMessageEvent:{type:'thinking_start'}});await emit('message_update',{assistantMessageEvent:{type:'toolcall_start'}});paint();facts('thinking');
    time=at+500;await emit('message_update',{assistantMessageEvent:{type:'text_end'}});await emit('message_end',{message:{role:'assistant'}});paint();assert.equal(actual.pendingNextState?.remainingMs,1500);clip(paint(at+1999),expected);assert.equal(actual.pendingNextState?.remainingMs,1);const expired=paint(at+2000);assert.equal(actual.pendingNextState,null);clip(expired,name==='read'?'think':'work-exit');if(name!=='read')clip(paint(at+2400),'think');
  }
  checks.push('Long tool end keeps only visual work/watch for2s; placeholders neither clear nor renew; exact1999/2000 boundary reaches thinking');
  for(const[first,next]of[['edit','edit'],['edit','bash'],['read','read'],['read','view_file']]){const{at,selection:before}=await longTool(first);time=at+1000;await start(next,'next');const s=paint();facts(next==='bash'?'running':first==='read'?'reading':'editing',1);assert.equal(actual.pendingNextState,null);clip(s,first==='read'?'watch':'work');assert.equal(s.playbackMs,before.playbackMs+1000);assert.equal(s.playbackEpoch,before.playbackEpoch);}
  checks.push('Actual Pi consecutive same-work/watch events keep source clock/epoch and skip repeated enter/exit');
  for(const type of ['thinking_delta','text_delta']){const{at}=await longTool();time=at+500;await emit('message_update',{assistantMessageEvent:{type,delta:'x'}});const s=paint();assert.equal(actual.pendingNextState,null);facts(type==='text_delta'?'speaking':'thinking');if(type==='text_delta')assert.equal(s,null);}
  {const{at}=await longTool();time=at+1999;await start('read','boundary');paint();facts('reading',1);assert.equal(actual.pendingNextState,null);paint(at+2000);assert.equal(actual.pendingNextState,null);}
  for(const target of ['prompt','completed','error','aborted']){const{at}=await longTool();time=at+500;if(target==='prompt')await emit('ui_prompt_start');else{await emit('agent_before_settle',{outcome:target});await emit('agent_settled',{aborted:target==='aborted'});}const s=paint();assert.equal(actual.pendingNextState,null);if(target==='prompt'){facts('waiting');clip(s,'wait');}else{facts(target==='completed'?'success':target==='error'?'error':'cancelled');assert.equal(actual.busy,false);if(target==='error')assert.equal(s,null);}}
  await fresh();await start('read','a');await start('edit','b');paint();await end('b');paint();facts('reading',1);assert.equal(actual.pendingNextState,null);await end('a');paint();facts('thinking');assert.equal(actual.pendingNextState.remainingMs,2000);
  checks.push('Nonempty content/new tool clears gap, urgent prompt/terminal/error/abort supersede it, parallel tools keep true state');
  await emit('session_shutdown');assert.equal(jobs.size,0);succeeded=true;console.log(`Actual Pi ${version} tool-gap integration passed: ${checks.join('; ')}.`);
} finally {
  currentHeader?.dispose?.();currentFooter?.dispose?.();currentEditor?.dispose?.();Math.random=originalRandom;globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;Date.now=originalClock;
  if(originalWT===undefined)delete process.env.WT_SESSION;else process.env.WT_SESSION=originalWT;if(originalTMUX===undefined)delete process.env.TMUX;else process.env.TMUX=originalTMUX;if(originalRender===undefined)delete process.env.PI_WINK_RENDER;else process.env.PI_WINK_RENDER=originalRender;
  if(scratch.startsWith(work+sep)&&scratch.slice(work.length+1).startsWith('tool-gap-pi-'))await rm(scratch,{recursive:true,force:true});
}
