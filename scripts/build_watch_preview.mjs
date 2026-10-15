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
for(time=0;time<6300;time+=100){
  const views=[];
  for(const {style,sheet,player,pixels} of styles){
    const blink=Math.floor(time/170)%29===0;
    const frame=player.frame(sheet,sheet.ids[blink?"watch-blink":"watch"],{phase:"running"});
    pixels.push(Buffer.from(frame.frame.pixels));
    views.push({style,width:sheet.width,height:sheet.height,palette:sheet.palette,motion:frame.motion,blink});
  }
  timeline.push({atMs:time,views});
}
for(const {style,pixels,player}of styles){await writeFile(join(folder,`${style}.bin`),Buffer.concat(pixels));player.dispose();}
await writeFile(join(folder,"manifest.json"),JSON.stringify({durationMs:6300,stepMs:100,
  title:"我拿放大镜看看呀",subtitle:"六张连贯原画循环 · 左右转头查看 · 回到正中轻眨眼",
  detail:"完整画帧切换，镜框与握爪一起转动",timeline},null,2));
const rendered=spawnSync(option("--python","python"),[join(root,"scripts/render_watch_preview.py"),"--input",folder,"--output",output],{encoding:"utf8"});
if(rendered.stdout)process.stdout.write(rendered.stdout);
if(rendered.status!==0)throw new Error(rendered.stderr||`Render failed: ${rendered.status}`);
