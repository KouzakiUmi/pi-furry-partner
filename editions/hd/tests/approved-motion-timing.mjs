// Load the real Pi extension with controlled indexed timestamps and a fake clock.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { modules } from './pi-runtime.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
import { approvedMotionFrameAt } from '../lib/hd/player.mjs';

// Real native24fps timestamps: positive modulo must not select the previous
// frame at83.333ms merely by adding/subtracting the4458ms period.
const fractionalFrames = [0, 41.667, 83.333, 4416.667].map((atMs, i) => ({ id: `fractional-${i}`, atMs }));
const fractionalAt = (time, loop = true) => approvedMotionFrameAt(fractionalFrames, time, 4458, loop);
assert.equal(fractionalAt(83.333).index, 2);
assert.equal(fractionalAt(83.333).elapsedMs, 83.333);
assert.equal(fractionalAt(83.333).nextInMs, 4416.667 - 83.333);
assert.equal(fractionalAt(83.333 - .001).index, 1, 'Do not round a genuinely earlier clock forward');
assert.equal(fractionalAt(4457).index, 3);
assert.equal(fractionalAt(4457).nextInMs, 1);
assert.equal(fractionalAt(4458).index, 0);
assert.equal(fractionalAt(4458 * 2 + 100).index, 2);
assert.equal(fractionalAt(-1).index, 3);
assert.equal(fractionalAt(-1).elapsedMs, 4457);
assert.equal(fractionalAt(-4458).index, 0);
assert.equal(Object.is(fractionalAt(-4458).elapsedMs, -0), false);
assert.equal(fractionalAt(-1, false).index, 0);
assert.equal(fractionalAt(4458, false).index, 3);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, 'work'), { recursive: true });
const scratch = await mkdtemp(join(root, 'work/approved-pi-timing-'));
const load = file => import(pathToFileURL(file));
const agent = join(modules, '@earendil-works/pi-coding-agent');
const { loadExtensions } = await load(join(agent, 'dist/core/extensions/loader.js'));
const themeAPI = await load(join(agent, 'dist/modes/interactive/theme/theme.js'));
const { validateThemeJson } = await load(join(agent, 'dist/modes/interactive/theme/theme-schema.js'));
const { KeybindingsManager } = await load(join(agent, 'dist/core/keybindings.js'));
const api = await load(join(modules, '@earendil-works/pi-tui/dist/index.js'));
const saved = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
let time = 100000, serial = 0, editor, header, footer, factory, extension, ctx;
const jobs = new Map();
const terminal = { columns: 100, rows: 40, write() {}, start() {}, stop() {}, hideCursor() {}, showCursor() {},
  moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {} };
const facade = { mode: 'regular', terminal, requestRender() {}, hasOverlay: () => false,
  captureRenderState: () => ({ previousViewportTop: 0 }) };
const keybindings = new KeybindingsManager(); api.setKeybindings(keybindings);
const { catalog, data } = approvedMotionFixture();
// Alternating83/84ms boundaries expose the old50/100ms polling cadence.
const timestamps = [0,83,167,250,333,417,500,583,667,750,833,917];
for (const meta of Object.values(catalog.clips.idle.indexed)) {
  meta.frameCount = timestamps.length;
  data[meta.file].frames = timestamps.map((atMs, i) => ({ id: `idle-${i}`, atMs, pixels: [0,1,i%2?2:1,0] }));
}
try {
  for (const name of ['index.ts','lib','assets','themes','prompts','package.json']) await cp(join(root,name),join(scratch,name),{
    recursive: true, filter: source => !['animated','hires','poses','branding','profile'].some(folder => source === join(root,'assets',folder)) });
  await writeFile(join(scratch,'config.json'),JSON.stringify({ language:'en',chineseUI:false,compactPrompt:false,style:'umi',layout:'editor',renderer:'blocks',enabled:true,animation:true }));
  await mkdir(join(scratch,'assets/animated'),{recursive:true});
  await writeFile(join(scratch,'assets/animated/catalog.json'),JSON.stringify(catalog));
  for(const [path,raw] of Object.entries(data)) { await mkdir(dirname(join(scratch,'assets/animated',path)),{recursive:true});await writeFile(join(scratch,'assets/animated',path),JSON.stringify(raw)); }
  themeAPI.setThemeJsonValidator(validateThemeJson);themeAPI.initTheme('dark',false);
  const theme=themeAPI.loadThemeFromPath(join(root,'themes/pi-furry-night.json'),'truecolor');
  const editorTheme=themeAPI.getEditorTheme();api.setCapabilities({images:null,trueColor:true,hyperlinks:true});
  ctx={mode:'tui',hasUI:true,cwd:scratch,model:{id:'offline',provider:'test',contextWindow:200000},isIdle:()=>true,
    sessionManager:{getEntryCount:()=>0,getLeafId:()=>null,getSessionId:()=> 'timing',getEntries:()=>[],getCwd:()=>scratch},
    getContextUsage:()=>({tokens:0,percent:0,contextWindow:200000}),ui:{theme,
      setHeader:f=>{header?.dispose?.();header=f?.(facade,theme);},
      setFooter:f=>{footer?.dispose?.();footer=f?.(facade,theme,{getGitBranch:()=>null,getExtensionStatuses:()=>new Map(),getAvailableProviderCount:()=>1,onBranchChange:()=>()=>{}});},
      getEditorComponent:()=>factory,setEditorComponent:f=>{factory=f;if(f)editor=f(facade,editorTheme,keybindings);},
      setStatus(){},notify(){},}};
  const result=await loadExtensions([join(scratch,'index.ts')],scratch);assert.deepEqual(result.errors,[]);extension=result.extensions[0];
  result.runtime.getThinkingLevel=()=> 'medium';
  Date.now=()=>time;
  globalThis.setTimeout=(fn,ms)=>{const id={serial:++serial,unref(){}};jobs.set(id,{fn,due:time+ms});return id;};
  globalThis.clearTimeout=id=>jobs.delete(id);
  for(const h of extension.handlers.get('session_start')||[])await h({type:'session_start',reason:'startup'},ctx);
  const command=args=>extension.commands.get('mascot').handler(args,ctx);
  await command('demo idle');editor.render(100);
  const base=time;
  const due=()=>{assert.equal(jobs.size,1,'Exactly one animation deadline');return [...jobs.values()][0].due;};
  assert.equal(due(),base+83,'First indexed timestamp determines deadline, not50ms');
  for(let i=1;i<timestamps.length;i++) {
    assert.equal(due(),base+timestamps[i]);
    const [id,job]=jobs.entries().next().value;jobs.delete(id);time=job.due;job.fn();editor.render(100);
    assert.equal(editor.displaySheet.clipId,'idle');
    const frame=editor.displaySheet.frames.find(f=>f.id===`idle-${i}`);assert.ok(frame);
  }
  assert.equal(due(),base+1000,'Loop wrap keeps the exact catalog period');
  const deadline=due(),timer=[...jobs.keys()][0];
  for(let n=0;n<10;n++){time+=2;editor.render(100);assert.equal(due(),deadline);assert.equal([...jobs.keys()][0],timer,'Same frame redraws preserve the existing deadline');}
  await command('pause');assert.equal(jobs.size,0);
  await command('play');editor.render(100);assert.equal(jobs.size,1);
  for(const h of extension.handlers.get('session_shutdown')||[])await h({type:'session_shutdown'},ctx);
  assert.equal(jobs.size,0,'Disposal cancels the frame deadline');
  console.log('Approved Pi timing: real extension50ms quantization removed,83/84ms frame deadlines, exact loop wrap, same-frame deadline stability, pause and disposal passed.');
} finally {
  if(extension&&ctx)for(const h of extension.handlers.get('session_shutdown')||[])await h({type:'session_shutdown'},ctx);
  Date.now=saved.now;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;
  await rm(scratch,{recursive:true,force:true});
}
