#!/usr/bin/env node
// Offline effect preview for the input-side character. No model requests.
// It reads the exact palette sheets shipped to the extension and shares one
// expression clock across style switches, pause, state changes and speech.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { QUICK_ACTIONS } from "../lib/quick-actions.mjs";
import { STYLES, styleAssetDirectory } from "../lib/styles.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";
import { POKE_DURATION_MS, withPokeFrame } from "../lib/poke.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phrases = JSON.parse(await readFile(join(root, "assets/status-phrases.json"), "utf8"));
const copy = JSON.parse(await readFile(join(root, "assets/status-copy.json"), "utf8"));
// Inline the exact dependency constant and remove its single known import.
// No file: module fetch or duplicated state machine is needed for this preview.
const activitySource = `const POKE_DURATION_MS = ${POKE_DURATION_MS};\nconst LISTEN_DURATION_MS = ${LISTEN_DURATION_MS};\n` + (await readFile(join(root, "lib/activity.mjs"), "utf8"))
  .replace(/^import \{ POKE_DURATION_MS \} from "\.\/poke\.mjs";\r?\n/m, "")
  .replace(/^import \{ LISTEN_DURATION_MS \} from "\.\/listen\.mjs";\r?\n/m, "").replace(/^export\s+/gm, "");
assert.doesNotMatch(activitySource, /^\s*import\s/m, "Offline activity dependencies must be explicitly bundled");
const motionSource = (await readFile(join(root, "lib/motion.mjs"), "utf8")).replace(/^export\s+/gm, "");
const quickActions = QUICK_ACTIONS.map(({ id, label }) => ({ id, label }));
const styles = {};
for (const style of STYLES) {
  const directory = join(root, "assets/reactions", styleAssetDirectory(style));
  const base = JSON.parse(await readFile(join(directory, "reaction-sheet.json"), "utf8"));
  let data = withPokeFrame(base, JSON.parse(await readFile(join(directory, "poke-patch.json"), "utf8")));
  assert.equal(data.frames.length, base.frames.length + 1, "Every style needs a valid poke patch");
  if (["umi", "umi-pixel"].includes(style)) {
    data = withWatchFrames(data, JSON.parse(await readFile(join(directory, "watch-frames.json"), "utf8")));
    assert.equal(data.frames.length, base.frames.length + 3, "Umi needs the two watch poses");
    data = withListenFrames(data, JSON.parse(await readFile(join(directory, "listen-frames.json"), "utf8")));
    assert.equal(data.frames.length, base.frames.length + 5, "Umi needs the two listening poses");
  }
  assert.ok(data.ids["idle-open"] !== undefined && data.ids["talk-wide"] !== undefined);
  styles[style] = { width: data.width, height: data.height, palette: data.palette, ids: data.ids, motion: data.motion,
    frames: data.frames.map((frame) => {
      assert.equal(frame.pixels.length, data.width * data.height);
      assert.ok(frame.pixels.every((pixel) => pixel >= 0 && pixel < data.palette.length && pixel < 256));
      return { id: frame.id, pixels: Buffer.from(frame.pixels).toString("base64") };
    }) };
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>呜咪 · 输入框角色效果预览</title>
<style>
:root{color-scheme:dark;--bg:#0a111c;--panel:#101827;--text:#e5edf5;--muted:#94a6bd;--blue:#89b4e6;--mint:#9bd6c4;--pink:#ed9fa7;--border:#34465f}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1120px;margin:0 auto;padding:35px 26px 30px}.eyebrow{font-size:11px;letter-spacing:.22em;font-weight:700;color:var(--blue)}h1{font-size:27px;font-weight:650;letter-spacing:.02em;margin:6px 0}p{margin:0}.intro{color:var(--muted);font-size:13px}.toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:20px}.group{display:inline-flex;gap:3px;padding:3px;border:1px solid #2c3d55;background:#0c1523;border-radius:10px}button{font:inherit;color:#b2c1d5;border:1px solid transparent;border-radius:7px;background:transparent;cursor:pointer;padding:6px 12px;font-size:13px}button:hover{background:#24364e}button[aria-pressed="true"]{background:#2c425e;border-color:#4b698e;color:#eef5ff}button:focus-visible,textarea:focus-visible,.avatar:focus-visible{outline:2px solid var(--blue);outline-offset:3px}#play{background:#1b2b41;border-color:#344b67}.state-buttons{display:flex;flex-wrap:wrap;gap:6px;margin:15px 0 18px}.state-buttons button{border-color:#2b3c53;background:#111e2f;font-size:12px;padding:5px 10px}.state-buttons button[aria-pressed="true"]{background:#2d4664;color:#eef5ff;border-color:#6386b0}.window{border:1px solid #2b3c53;border-radius:14px;overflow:hidden;background:var(--panel);box-shadow:0 22px 70px #0005}.titlebar{height:40px;display:flex;align-items:center;gap:7px;padding:0 17px;background:#142033;border-bottom:1px solid #26364c}.dot{width:9px;height:9px;border-radius:50%;background:#7793b2}.dot:nth-child(1){background:#d1848b}.dot:nth-child(2){background:#d3b87f}.dot:nth-child(3){background:#83b6a8}.window-label{margin-left:10px;color:#8397b1;font:11px "Cascadia Mono",Consolas,monospace}.terminal{padding:24px 25px 14px;font-family:"Cascadia Mono",Consolas,"Microsoft YaHei",monospace}.example-label{color:#657d9b;font-size:11px;margin-bottom:10px}.user-line{color:#c1d7ef;font-size:14px}.assistant-line{color:#9dacc1;font-size:13px;margin-top:9px;line-height:1.9}.assistant-line strong{color:var(--mint);font-weight:500}.input-row{display:grid;grid-template-columns:208px 1fr;gap:20px;align-items:end;min-height:280px;margin-top:15px}.character{position:relative;width:208px;height:257px;display:flex;justify-content:center;align-items:flex-end}.avatar{cursor:pointer;width:208px;height:208px;display:block;object-fit:contain}.pixel .avatar{image-rendering:pixelated}.thought{position:absolute;left:50%;top:0;transform:translateX(-50%);width:calc(100% - 12px);max-width:192px;min-width:0;min-height:42px;display:flex;justify-content:center;align-items:center;gap:4px;padding:5px 7px;color:#b4cfea;font:14px/1.25 "Cascadia Mono",Consolas,"Microsoft YaHei",monospace;text-align:center;border:1px solid #6c91bb;border-radius:3px;background:#13253c;visibility:hidden}.thought-paw{flex:0 0 1.3em;font-family:"Segoe UI Emoji",sans-serif;text-align:center}.thought-copy{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}.thought.visible{visibility:visible}.editor-column{padding-bottom:16px;min-width:0}.status-line{position:absolute;top:-13px;left:12px;max-width:calc(100% - 24px);display:flex;align-items:center;gap:8px;height:24px;flex-wrap:nowrap;margin:0;padding:0 7px;background:var(--panel)}.status-title{font-size:13px;font-weight:600;color:#bfd5ee;white-space:nowrap;flex:0 0 auto}.phrase{font-size:13px;color:#b1c0d2;min-height:21px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.input-box{container-type:inline-size;border:1px solid #59708c;border-radius:2px;min-height:108px;position:relative;padding:15px 14px 9px;background:#101b2b}.input-label{position:absolute;top:-11px;left:12px;background:#101827;padding:0 7px;font-size:12px;color:#9cb7d9}textarea{display:block;resize:vertical;min-height:48px;width:100%;border:0;outline:0;background:transparent;color:#dbe9fb;font:14px/1.8 "Cascadia Mono",Consolas,"Microsoft YaHei",monospace}textarea::placeholder{color:#7087a3}.input-hint{border-top:1px solid #30435d;margin-top:8px;padding-top:8px;color:#829ab8;font-size:11px;letter-spacing:.01em}.input-hint{position:relative;display:flex;gap:6px;flex-wrap:nowrap;align-items:center}.input-controls-left,.input-controls-right{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;min-width:0}.input-controls-right{margin-left:auto;flex:0 0 auto}.keyboard-hints{display:none;flex-wrap:wrap;gap:3px 12px;min-width:0;font-size:10px;line-height:1.8;color:#8fa4bf}.keyboard-hints span{white-space:nowrap;cursor:default}.keyboard-hints kbd{font:inherit;color:#c3d3e9}.keyboard-hints .hint-more{margin-left:auto}.input-row[data-mode="regular"] .input-controls-left,.input-row[data-mode="regular"] .input-controls-right{display:none}.input-row[data-mode="regular"] .keyboard-hints{display:flex;flex:1}.mode-note{font-size:11px;color:#8098b8}.input-hint button{white-space:nowrap}.preview-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:5;width:min(280px,90vw);max-width:calc(100vw - 40px);max-height:65vh;overflow:auto;padding:7px;border:1px solid #486486;border-radius:8px;background:#142238;box-shadow:0 10px 30px #0007}.preview-menu[hidden]{display:none}.preview-menu .menu-details{padding:5px 8px 10px;white-space:pre-wrap;line-height:1.7;color:#c2d2e8;font-size:12px}.preview-menu .menu-title{padding:5px 8px 8px;color:#91acce;font-size:11px}.preview-menu button{display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;border-color:transparent;background:transparent}.input-hint button{font-size:11px;padding:3px 8px;border-color:#3c5270;background:#17283e;color:#b7cce7}.input-hint button:disabled{opacity:.4;cursor:default}.input-hint .shortcut-hint{width:100%;font-size:10px;color:#728ba9;margin-top:3px}#preview-notice{min-height:17px;margin-top:7px;color:#8fa7c5;font-size:11px}.footer{border-top:1px solid #25364d;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;margin-top:6px;padding-top:12px;color:#6f87a6;font-size:11px}.note{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;color:#8096b2;font-size:12px;margin:16px 0 0}.note strong{color:#b1c5df;font-weight:500}.legend{margin-top:24px;padding:17px 20px;border:1px solid #243750;border-radius:10px;background:#0d1725;color:#8199b7;font-size:12px}.legend strong{color:#a8c3e1;font-weight:500}#frame-label{font:11px "Cascadia Mono",Consolas,monospace;color:#7892b2}
@container(max-width:550px){.hint-newline{display:none}}
@container(max-width:420px){.hint-model{display:none}}
@container(max-width:330px){.hint-thinking{display:none}}
@media(max-width:750px){main{padding:24px 14px}.terminal{padding:18px 14px 14px}.input-row{grid-template-columns:142px 1fr;gap:10px;min-height:245px}.character{width:142px;height:220px}.avatar{width:142px;height:142px}.thought{top:34px;font-size:12px;gap:3px;padding:5px}.input-hint #newline,.input-hint #voice{display:none}.toolbar{gap:7px}.group button{padding:6px 9px}.phrase{font-size:11px}.status-title{font-size:12px}}
@media(max-width:480px){h1{font-size:23px}.input-row{grid-template-columns:105px 1fr}.character{width:105px;height:204px}.avatar{width:105px;height:105px}.thought{top:54px;font-size:11px;min-height:36px;gap:2px;padding:4px}.status-line{gap:6px}.input-hint{font-size:9px}.input-hint #outfit,.input-hint #dock-play,.input-hint #dock-model,.input-hint #dock-thinking{display:none}.terminal{padding-left:10px;padding-right:10px}.window-label{font-size:9px}.input-box{padding:14px 9px 8px}}
.thought{overflow:hidden;column-gap:1ch}.thought:lang(en){column-gap:2ch}.thought-paw{flex:0 0 2ch;min-width:2ch;white-space:nowrap}.thought-copy{overflow:hidden;min-width:0}
.input-row{grid-template-columns:260px 1fr}.character{width:260px}.thought{width:100%;max-width:none}@media(min-width:1200px){.input-row{grid-template-columns:312px 1fr}.character{width:312px}}@media(max-width:750px){.input-row{grid-template-columns:142px 1fr}.character{width:142px}}@media(max-width:480px){.input-row{grid-template-columns:105px 1fr}.character{width:105px}}
</style></head><body><main><div class="eyebrow">UMI × PI</div><h1>呜咪，陪你把想法做出来</h1><p class="intro">输入框左侧角色 · 状态与表情效果预览 · 全部素材离线内嵌</p>
<div class="toolbar"><div class="group" role="group" aria-label="角色风格"><button data-style="umi" aria-pressed="true">呜咪角色版</button><button data-style="umi-pixel" aria-pressed="false">呜咪像素版</button><button data-style="pixel" aria-pressed="false">原像素</button><button data-style="illustration" aria-pressed="false">旧插画</button></div><div class="group" role="group" aria-label="终端模式示意"><button data-preview-mode="regular" aria-pressed="true">regular · 快捷键</button><button data-preview-mode="fullscreen" aria-pressed="false">fullscreen · 按钮</button></div><span class="mode-note">模式示意 · 本页手动切换，不检测真实终端</span><button id="play" aria-pressed="true">表情：开</button><button id="poke" type="button">戳一戳 🐾</button><span id="frame-label"></span></div>
<div id="states" class="state-buttons" role="group" aria-label="模拟运行状态"></div>
<div class="window"><div class="titlebar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="window-label">pi · MiniMax-M3.1-Flash-Preview · minimax-cn</span></div><div class="terminal"><div class="example-label">示例对话</div><p class="user-line">› 帮我把这个项目的启动体验做得更清晰。</p><p class="assistant-line"><strong>呜咪</strong>　我会先了解现有结构，再把合适的调整落到代码里。<br>你可以继续补充想法，我会留在输入框旁边。</p>
<div id="input-row" class="input-row" data-mode="regular"><div class="character"><div id="thought" class="thought" aria-hidden="true"><span class="thought-paw">🐾</span><span id="thought-copy" class="thought-copy"></span><span class="thought-paw">🐾</span></div><canvas id="avatar" class="avatar" width="480" height="480" role="button" tabindex="0" aria-label="戳一戳呜咪" title="戳一戳呜咪"></canvas></div><div class="editor-column"><div class="input-box"><div class="status-line"><span id="status-title" class="status-title"></span><span id="phrase" class="phrase"></span></div><textarea id="preview-input" aria-label="预览输入框" placeholder="接下来，想一起做点什么？"></textarea><div class="input-hint"><div class="keyboard-hints" aria-label="regular 模式快捷键提示"><span class="hint-send"><kbd>Enter</kbd> 发送</span><span class="hint-newline"><kbd>Shift+Enter</kbd> 换行</span><span class="hint-model"><kbd>Ctrl+L</kbd> 模型</span><span class="hint-thinking"><kbd>Shift+Tab</kbd> 思考</span><span class="hint-more"><kbd>Ctrl+Alt+W</kbd> 更多</span></div><div class="input-controls-left"><button id="send" type="button" disabled>发送</button><button id="newline" type="button">换行</button><button id="outfit" type="button">换装</button><button id="voice" type="button" aria-pressed="false">语气：关</button><button id="dock-play" type="button" aria-pressed="true">表情：开</button></div><div class="input-controls-right"><button id="dock-model" type="button" aria-haspopup="menu" aria-expanded="false">模型</button><button id="dock-thinking" type="button">思考</button><button id="dock-menu" type="button" aria-haspopup="menu" aria-expanded="false">更多</button></div><div id="preview-menu" class="preview-menu" role="menu" aria-label="功能菜单演示" hidden></div></div></div><div id="preview-notice" role="status"></div></div></div>
<div class="footer"><span>示例状态 · F:\\Projects\\your-project (main)</span><span>↑ 0　↓ 0　·　$0.0000　·　高清 Sixel</span></div></div></div>
<div class="note"><span><strong>角色固定在输入框左侧</strong> · 思考托腮、说话嘴型、眨眼与状态短句</span><span>本页为效果预览，输入内容不会发送模型请求。</span></div><div class="legend"><strong>试试看：</strong>点击“思考”看托腮与省略号，点击“说话”看四种嘴型连续变化，点击“醒来”看睡醒表情序列；点击“等待”看歪头等候，十秒后会眯一会儿，再切换状态会被轻轻叫醒。选择“就绪”或“等待”后，在输入框里打字，呜咪会竖耳朵点头听你说（表情开启时）。点击头像或“戳一戳”可看 &gt;w&lt; 的小反应：忙时轻一点，闲时更活泼。关闭表情只停循环微动，状态照常切换，主动戳戳仍有短反应。状态短句来自插件内同一份文案，每 6.5 秒随机轮换。</div>
</main><script>
"use strict";
${activitySource}
${motionSource}
const styles=${JSON.stringify(styles)};
const phrases=${JSON.stringify(phrases)};
const copy=${JSON.stringify(copy)};
const quickActions=${JSON.stringify(quickActions)};
const definitions=[
 ["idle","就绪"],["waking","醒来"],["thinking","思考"],["speaking","说话"],["reading","读取"],["editing","修改"],["running","运行"],["searching","搜索"],["waiting","等待"],["success","完成"],["error","错误"],["cancelled","暂停"],["compacting","整理"]
];
for(const data of Object.values(styles))for(const frame of data.frames)frame.pixels=Uint8Array.from(atob(frame.pixels),character=>character.charCodeAt(0));
const cache=new Map();let style="umi",state="waking",previewMode="regular",voiceOn=false,clock,simTime=0,lastWall=performance.now(),paused=matchMedia("(prefers-reduced-motion: reduce)").matches;
const activity=createActivity({phrases:phrases.phrases,labels:copy.labels,bubbles:copy.bubbles,rotationMs:phrases.rotationMs,now:()=>simTime});activity.start({wake:true});activity.setDemo(state);
const motionPlayer=createMotionPlayer({now:()=>simTime,maxFrames:64});
const avatar=document.getElementById("avatar"),row=document.getElementById("input-row"),thought=document.getElementById("thought"),thoughtCopy=document.getElementById("thought-copy");
function bitmap(data,index,key){if(!cache.has(key)){const frame=data.frames[index],palette=frame.palette||data.palette,canvas=document.createElement("canvas");canvas.width=data.width;canvas.height=data.height;const context=canvas.getContext("2d"),pixels=context.createImageData(data.width,data.height);for(let i=0;i<frame.pixels.length;i++){const color=frame.pixels[i];if(color){const rgb=palette[color];pixels.data.set([rgb[0],rgb[1],rgb[2],255],i*4)}}context.putImageData(pixels,0,0);cache.set(key,canvas);if(cache.size>64)cache.delete(cache.keys().next().value)}return cache.get(key)}
function advance(){const wall=performance.now();if((!paused||activity.isPoked())&&!document.hidden)simTime+=wall-lastWall;lastWall=wall}
function draw(){
  const snapshot=activity.snapshot(),sheet=styles[style];let id=snapshot.face;
  row.dataset.mode=previewMode;for(const button of document.querySelectorAll("[data-preview-mode]"))button.setAttribute("aria-pressed",String(button.dataset.previewMode===previewMode));
  if(snapshot.blink&&snapshot.phase==="thinking"&&sheet.ids["think-blink"]!==undefined)id="think-blink";
  if(snapshot.blink&&id==="think"&&sheet.ids["think-blink"]!==undefined)id="think-blink";
  if(id==="idle-blink"&&["reading","editing","running"].includes(snapshot.phase)&&sheet.ids["work-blink"]!==undefined)id="work-blink";
  if(snapshot.blink&&id==="happy"&&sheet.ids["happy-blink"]!==undefined)id="happy-blink";
  if(snapshot.blink&&id==="concern"&&sheet.ids["concern-blink"]!==undefined)id="concern-blink";
  if(snapshot.blink&&id==="idle-open")id="idle-blink";
  if(id==="listen"&&sheet.ids.listen===undefined)id="idle-open";
  if(id==="listen-blink"&&sheet.ids["listen-blink"]===undefined)id="idle-blink";
  if(id==="watch"&&sheet.ids.watch===undefined)id="work";
  if(id==="watch-blink"&&sheet.ids["watch-blink"]===undefined)id=sheet.ids["work-blink"]!==undefined?"work-blink":"idle-blink";
  if(id==="search"&&sheet.ids.search===undefined)id="work";
  if(id==="wait"&&sheet.ids.wait===undefined)id="idle-open";
  if(id==="wait-blink"&&sheet.ids["wait-blink"]===undefined)id="idle-blink";
  if(!(id in sheet.ids))id=id==="error"?"concern":"idle-open";
  const visual=motionPlayer.frame(sheet,sheet.ids[id],{animate:!paused||snapshot.reaction==="poked",phase:snapshot.reaction||(snapshot.drowsy?"dozing":snapshot.visualPhase||snapshot.phase),blink:snapshot.blink,reactionElapsedMs:snapshot.reactionElapsedMs,reactionStrength:snapshot.reactionStrength});
  const image=bitmap(visual.sheet,visual.frameIndex,style+":"+visual.frame.cacheKey),context=avatar.getContext("2d");
  context.clearRect(0,0,480,480);context.imageSmoothingEnabled=!style.includes("pixel");context.imageSmoothingQuality="high";context.drawImage(image,0,0,480,480);row.classList.toggle("pixel",style.includes("pixel"));
  document.getElementById("status-title").textContent=snapshot.glyph+" "+snapshot.label;document.getElementById("phrase").textContent=snapshot.phrase;document.getElementById("status-title").style.color={accent:"#89b4e6",warning:"#e6c68e",success:"#9bd6c4",error:"#ec8b91"}[snapshot.color];
  thought.setAttribute("lang",snapshot.language||"zh-CN");thought.classList.toggle("visible",Boolean(snapshot.bubble));thoughtCopy.textContent=String(snapshot.bubble||"");
  document.getElementById("frame-label").textContent=(paused?"已暂停":"同款微动与过渡")+" · "+id;document.getElementById("play").textContent=paused?"表情：关":"表情：开";document.getElementById("play").setAttribute("aria-pressed",String(!paused));document.getElementById("dock-play").textContent=paused?"表情：关":"表情：开";document.getElementById("dock-play").setAttribute("aria-pressed",String(!paused));document.getElementById("voice").textContent=voiceOn?"语气：开":"语气：关";document.getElementById("voice").setAttribute("aria-pressed",String(voiceOn));
  document.getElementById("dock-model").disabled=Boolean(snapshot.busy);document.getElementById("dock-thinking").disabled=Boolean(snapshot.busy);
  for(const button of document.querySelectorAll("[data-style]"))button.setAttribute("aria-pressed",String(button.dataset.style===style));for(const button of document.querySelectorAll("[data-state]"))button.setAttribute("aria-pressed",String(button.dataset.state===state));return snapshot;
}
function schedule(){clearTimeout(clock);draw();if((!paused||activity.isPoked())&&!document.hidden)clock=setTimeout(()=>{advance();schedule()},50)}
for(const [key,label] of definitions){const button=document.createElement("button");button.type="button";button.dataset.state=key;button.textContent=label;button.setAttribute("aria-pressed",String(key===state));button.addEventListener("click",()=>{advance();state=key;activity.setDemo(key);schedule()});document.getElementById("states").append(button)}
for(const button of document.querySelectorAll("[data-style]"))button.addEventListener("click",()=>{advance();style=button.dataset.style;schedule()});document.getElementById("play").addEventListener("click",()=>{advance();paused=!paused;if(paused)activity.clearTyping();schedule()});document.addEventListener("visibilitychange",()=>{lastWall=performance.now();schedule()});
const input=document.getElementById("preview-input"),send=document.getElementById("send"),notice=document.getElementById("preview-notice");
input.addEventListener("input",()=>{advance();send.disabled=!input.value.trim();if(!paused&&input.value.trim())activity.noteTyping();else activity.clearTyping();schedule()});
send.addEventListener("click",()=>{activity.clearTyping();schedule();notice.textContent="这是效果预览，你的内容会留在输入框里，不会发送给模型。"});
input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!send.disabled)send.click()}});
document.getElementById("newline").addEventListener("click",()=>{input.focus();input.setRangeText(String.fromCharCode(10),input.selectionStart,input.selectionEnd,"end");send.disabled=!input.value.trim()});
document.getElementById("outfit").addEventListener("click",()=>{advance();const names=Object.keys(styles);style=names[(names.indexOf(style)+1)%names.length];schedule();notice.textContent="预览已换装，当前风格："+({umi:"呜咪角色版","umi-pixel":"呜咪像素版",pixel:"原像素",illustration:"旧插画"}[style])});
document.getElementById("voice").addEventListener("click",()=>{voiceOn=!voiceOn;schedule();notice.textContent="语气开关仅作演示；在实际终端中，会从下一轮回答生效。"});
document.getElementById("dock-play").addEventListener("click",()=>{advance();paused=!paused;if(paused)activity.clearTyping();schedule()});
function poke(){advance();activity.poke();schedule();notice.textContent="呜咪会按当前忙闲状态回应；这只是本地互动，不会打断 agent 或发送消息。"}
document.getElementById("poke").addEventListener("click",poke);avatar.addEventListener("click",poke);avatar.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();poke()}});
const previewMenu=document.getElementById("preview-menu");
function closePreviewMenu(){previewMenu.hidden=true;for(const id of ["dock-model","dock-menu"])document.getElementById(id).setAttribute("aria-expanded","false")}
const demoThinkingLevels=["off","low","medium","high"];let demoThinkingIndex=0;
function cyclePreviewThinking(){closePreviewMenu();demoThinkingIndex=(demoThinkingIndex+1)%demoThinkingLevels.length;notice.textContent="思考强度演示："+demoThinkingLevels[demoThinkingIndex]+"（仅在本页轮换，不改真实设置）。"}
function showPreviewDetails(title,lines){
  closePreviewMenu();previewMenu.replaceChildren();
  const heading=document.createElement("div");heading.className="menu-title";heading.textContent=title+" · 示例只读面板";
  const details=document.createElement("div");details.className="menu-details";details.textContent=lines.join(String.fromCharCode(10));
  const back=document.createElement("button");back.type="button";back.textContent="返回更多";back.addEventListener("click",event=>{event.stopPropagation();showPreviewMenu("menu")});previewMenu.append(heading,details,back);previewMenu.hidden=false;document.getElementById("dock-menu").setAttribute("aria-expanded","true");
}
function performPreviewAction(item){
  if(item.id==="model"){showPreviewMenu("model");return}
  if(item.id==="thinking"){cyclePreviewThinking();return}
  if(item.id==="usage"){showPreviewDetails(item.label,["以下均为示例数据，并非实际会话用量。","模型：MiniMax-M3.1-Flash-Preview","思考强度（演示）："+demoThinkingLevels[demoThinkingIndex],"上下文：示例 4,200 / 200,000 tokens","输入 / 输出：示例 1,200 / 380 tokens","费用：示例 $0.0000","","此面板仅演示布局，不读取账户或真实会话。"]);return}
  if(item.id==="tools"){showPreviewDetails(item.label,["示例工具清单 · 只读，不执行工具","● read — 查看文件内容","● edit — 修改文件片段","● bash — 执行命令","○ web_search — 搜索资料","","这些条目仅作界面演示，不代表你的实际工具或启用状态。"]);return}
  closePreviewMenu();
  const message={resume:"会话查找入口示例，实际会话保持不变。",tree:"会话分支入口示例，实际会话保持不变。",fork:"新分支入口示例，没有创建实际会话。",copy:"复制入口示例，未访问或修改剪贴板。",expand:"工具输出展开入口示例，本页内容保持原样。","thinking-text":"思考过程显示入口示例，本页没有真实思考内容。",external:"外部编辑器入口示例，没有启动外部程序。","model-choice":"模型选择演示，不改真实模型或提供商设置。"};
  notice.textContent="「"+item.label+"」"+(message[item.id]||"仅作菜单演示，未执行实际操作。");
}
function showPreviewMenu(kind){
  closePreviewMenu();previewMenu.replaceChildren();
  const title=document.createElement("div");title.className="menu-title";title.textContent=(kind==="model"?"模型菜单":"更多功能")+" · 效果预览";previewMenu.append(title);
  const entries=kind==="model"?[{id:"model-choice",label:"MiniMax-M3.1-Flash-Preview"},{id:"model-choice",label:"其它模型…"}]:quickActions;
  for(const item of entries){const button=document.createElement("button");button.type="button";button.setAttribute("role","menuitem");button.dataset.previewAction=item.id;button.textContent=item.label;button.disabled=(item.id==="model"||item.id==="thinking")&&document.getElementById("dock-model").disabled;button.addEventListener("click",event=>{event.stopPropagation();performPreviewAction(item)});previewMenu.append(button)}
  previewMenu.hidden=false;document.getElementById("dock-"+kind).setAttribute("aria-expanded","true");
}
for(const kind of ["model","menu"])document.getElementById("dock-"+kind).addEventListener("click",()=>{if(!previewMenu.hidden&&document.getElementById("dock-"+kind).getAttribute("aria-expanded")==="true")closePreviewMenu();else showPreviewMenu(kind)});
document.getElementById("dock-thinking").addEventListener("click",cyclePreviewThinking);
for(const button of document.querySelectorAll("[data-preview-mode]"))button.addEventListener("click",()=>{previewMode=button.dataset.previewMode;closePreviewMenu();schedule();notice.textContent="当前为 "+previewMode+" 模式示意；本页没有检测或切换真实终端模式。"});
document.addEventListener("click",event=>{if(event.target instanceof Element&&!event.target.closest(".input-hint"))closePreviewMenu()});
document.addEventListener("keydown",event=>{if(event.ctrlKey&&event.altKey&&!event.shiftKey&&(event.code==="KeyW"||event.key.toLowerCase()==="w")){event.preventDefault();event.stopPropagation();if(previewMenu.hidden)showPreviewMenu("menu");else closePreviewMenu();return}if(event.key==="Escape"&&!previewMenu.hidden){event.preventDefault();closePreviewMenu()}});
schedule();
</script></body></html>`;
await writeFile(join(root,"preview.html"),html,"utf8");
console.log(JSON.stringify({output:join(root,"preview.html"),styles:Object.keys(styles),defaultStyle:"umi",states:13,offline:true,bytes:Buffer.byteLength(html)},null,2));
