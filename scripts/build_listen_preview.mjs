#!/usr/bin/env node
// Export listening from the same local activity, dock and motion used in Pi.
import { readFile,writeFile,mkdir }from"node:fs/promises";
import{resolve,dirname,join}from"node:path";
import{fileURLToPath}from"node:url";
import{spawnSync}from"node:child_process";
import{withListenFrames}from"../lib/listen.mjs";
import{withWatchFrames}from"../lib/watch.mjs";
import{withPokeFrame}from"../lib/poke.mjs";
import{createActivity}from"../lib/activity.mjs";
import{createMotionPlayer}from"../lib/motion.mjs";
import{renderDock}from"../lib/editor-layout.mjs";
import{styleAssetDirectory}from"../lib/styles.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2),option=(key,value)=>args.includes(key)?args[args.indexOf(key)+1]:value;
const folder=resolve(option("--work",join(root,"work/listen-preview"))),output=resolve(option("--output",join(folder,"Umi-listening-preview.gif")));
await mkdir(folder,{recursive:true});const read=async(path)=>JSON.parse(await readFile(path,"utf8"));let time=0;
const copy=await read(join(root,"assets/status-copy.json")),phrases=await read(join(root,"assets/status-phrases.json"));
const styles=await Promise.all(["umi","umi-pixel"].map(async(style)=>{
 const dir=join(root,"assets/reactions",styleAssetDirectory(style));
 const sheet=withListenFrames(withWatchFrames(withPokeFrame(await read(join(dir,"reaction-sheet.json")),await read(join(dir,"poke-patch.json"))),await read(join(dir,"watch-frames.json"))),await read(join(dir,"listen-frames.json")));
 const activity=createActivity({now:()=>time,random:()=>.25,phrases:phrases.phrases,labels:copy.labels,bubbles:copy.bubbles});activity.start({wake:false});
 return{style,sheet,activity,player:createMotionPlayer({now:()=>time}),pixels:[]};
}));const timeline=[];
for(time=0;time<6300;time+=100){const views=[];
 for(const{style,sheet,activity,player,pixels}of styles){
  if(time>=600&&time<=4200&&time%300===0)activity.noteTyping();
  let display;const snapshot=activity.snapshot();
  renderDock({geometry:{collapsed:false,columns:120,rows:120},sheet,snapshot,motionPlayer:player,
   renderAvatar(value){display=value;return Array(120).fill("");},theme:{fg:(_token,text)=>text},visibleWidth:(text)=>[...text].length,truncateToWidth:(text,width)=>text.slice(0,width)});
  const frame=display.sheet.frames[display.frameIndex];pixels.push(Buffer.from(frame.pixels));
  views.push({style,width:sheet.width,height:sheet.height,palette:sheet.palette,phrase:snapshot.reaction==="listening"?"你正在输入 · 我听着呢":"输入停下后 · 我在这儿等你",reaction:snapshot.reaction||"idle"});
 }timeline.push({atMs:time,views});}
for(const{style,pixels,player}of styles){await writeFile(join(folder,`${style}.bin`),Buffer.concat(pixels));player.dispose();}
await writeFile(join(folder,"manifest.json"),JSON.stringify({durationMs:6300,stepMs:100,title:"你一打字，我就竖起耳朵听",subtitle:"灰爪放耳边 · 轻轻点头回应 · 停止输入 1.8 秒后自然回到等待",detail:"只观察本地输入变化，不提交消息、不调用模型",timeline},null,2));
const rendered=spawnSync(option("--python","python"),[join(root,"scripts/render_watch_preview.py"),"--input",folder,"--output",output],{encoding:"utf8"});if(rendered.stdout)process.stdout.write(rendered.stdout);if(rendered.status!==0)throw new Error(rendered.stderr||`Render failed: ${rendered.status}`);
