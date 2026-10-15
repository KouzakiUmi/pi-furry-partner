#!/usr/bin/env node
// Export the exact runtime magnifier rig for an offline two-style preview.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { withWatchFrames } from "../lib/watch.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { styleAssetDirectory } from "../lib/styles.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args=process.argv.slice(2), option=(key,value)=>args.includes(key)?args[args.indexOf(key)+1]:value;
const folder=resolve(option("--work",join(root,"work/watch-preview")));
const output=resolve(option("--output",join(folder,"Umi-magnifier-preview.gif")));
await mkdir(folder,{recursive:true});
const read=async(path)=>JSON.parse(await readFile(path,"utf8"));
let time=0;
const styles=await Promise.all(["umi","umi-pixel"].map(async(style)=>{
  const directory=join(root,"assets/reactions",styleAssetDirectory(style));
  const sheet=withWatchFrames(await read(join(directory,"reaction-sheet.json")),await read(join(directory,"watch-frames.json")));
  return {style,sheet,player:createMotionPlayer({now:()=>time}),pixels:[]};
}));
const timeline=[];
const stepMs=50;
const durationMs=Math.max(...styles.map(({sheet})=>sheet.motion?.watch?.sequence?.periodMs||4200))*2;
for(time=0;time<durationMs;time+=stepMs){
  const views=[];
  for(const {style,sheet,player,pixels} of styles){
    const blink=Math.floor(time/170)%29===0;
    const frame=player.frame(sheet,sheet.ids[blink?"watch-blink":"watch"],{phase:"running"});
    pixels.push(Buffer.from(frame.frame.pixels));
    views.push({style,width:sheet.width,height:sheet.height,palette:sheet.palette,motion:frame.motion,blink});
  }
  timeline.push({atMs:time,durationMs:Math.min(stepMs,durationMs-time),views});
}
for(const {style,pixels,player}of styles){await writeFile(join(folder,`${style}.bin`),Buffer.concat(pixels));player.dispose();}
await writeFile(join(folder,"manifest.json"),JSON.stringify({durationMs,stepMs,
  title:"我拿放大镜看看呀",subtitle:"连续视频离线抽帧 · 头部与握爪联动 · 镜片里的眼瞳放大",
  detail:"播放完整透明画帧，镜框和斗篷保持清楚",timeline},null,2));
const rendered=spawnSync(option("--python","python"),[join(root,"scripts/render_watch_preview.py"),"--input",folder,"--output",output],{encoding:"utf8"});
if(rendered.stdout)process.stdout.write(rendered.stdout);
if(rendered.status!==0)throw new Error(rendered.stderr||`Render failed: ${rendered.status}`);
