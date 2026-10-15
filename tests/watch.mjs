import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withWatchFrames } from "../lib/watch.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";
import { createActivity } from "../lib/activity.mjs";
import { renderDock } from "../lib/editor-layout.mjs";

const read=async(path)=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),"utf8"));
const checks=[];
for(const style of ["wumi","wumi-pixel"]){
  const base=await read(`assets/reactions/${style}/reaction-sheet.json`);
  const asset=await read(`assets/reactions/${style}/watch-frames.json`);
  const original=JSON.stringify(base),sheet=withWatchFrames(withPokeFrame(base,await read(`assets/reactions/${style}/poke-patch.json`)),asset);
  assert.equal(base.frames.length,21);assert.equal(sheet.frames.length,24);
  assert.equal(sheet.ids.poke,21);assert.equal(sheet.ids.watch,22);assert.equal(sheet.ids["watch-blink"],23);
  assert.equal(sheet.palette,base.palette);assert.equal(withWatchFrames(sheet,asset),sheet);
  for(let i=0;i<base.frames.length;i++)assert.equal(sheet.frames[i],base.frames[i]);
  assert.equal(withWatchFrames(base,{...asset,width:1}),base);
  assert.equal(withWatchFrames(base,{...asset,frames:[asset.frames[0]]}),base);
  assert.equal(withWatchFrames(base,{...asset,frames:[{...asset.frames[0],pixels:[-1]},asset.frames[1]]}),base);
  const open=sheet.frames[sheet.ids.watch].pixels,blink=sheet.frames[sheet.ids["watch-blink"]].pixels;
  let different=0;
  for(let i=0;i<open.length;i++){
    assert.equal(open[i]===0,blink[i]===0,"Blink cannot change alpha/lens/paw silhouette");
    if(open[i]!==blink[i]){different++;const x=i%sheet.width,y=Math.floor(i/sheet.width);assert.ok(x>sheet.width*.28&&x<sheet.width*.69&&y>sheet.height*.32&&y<sheet.height*.53,"Only authored full eye sockets may change for a blink");}
  }
  assert.ok(different>10);
  let time=0;const player=createMotionPlayer({now:()=>time});const states=new Set(),phases=new Set();
  for(time=0;time<8400;time+=100){
    const frame=player.frame(sheet,sheet.ids.watch,{phase:"running"});
    assert.equal(frame.sheet.palette,sheet.palette);assert.equal(frame.frame.pixels.length,sheet.width*sheet.height);
    assert.equal(frame.motion.x,0);assert.equal(frame.motion.tilt,0);
    assert.ok(frame.frame.pixels.every((p)=>p>=0&&p<sheet.palette.length));
    states.add(Buffer.from(frame.frame.pixels).toString("base64"));phases.add(frame.motion.watchPhase);
  }
  assert.equal(phases.size,42);assert.ok(states.size>20,"The lens and head must actually scan across readable pixel states");
  const last=player.frame(sheet,sheet.ids.watch,{phase:"running",animate:false});time+=50000;
  const paused=player.frame(sheet,sheet.ids["watch-blink"],{phase:"running",animate:false});
  assert.equal(paused.cacheKey,last.cacheKey);assert.equal(paused.nextInMs,Infinity);player.dispose();
  assert.equal(JSON.stringify(base),original,"Main sheet must remain byte-equivalent in memory");
  checks.push(`${style}: append-only watch/blink, intact 21 source frames/palette/alpha, isolated eye blink, 42-step connected scan and frozen pause`);
}
{
  let time=1000;const activity=createActivity({now:()=>time,random:()=>.25});activity.start({wake:false});activity.handle("agent_start");
  activity.handle("tool_execution_start",{toolCallId:"run",toolName:"bash"});assert.equal(activity.snapshot().face,"watch");
  activity.handle("tool_execution_end",{toolCallId:"run"});assert.equal(activity.snapshot().face,"watch");
  time+=1199;assert.equal(activity.snapshot().visualPhase,"running");time++;assert.equal(activity.snapshot().visualPhase,"thinking");
  activity.handle("tool_execution_start",{toolCallId:"edit",toolName:"apply_patch"});assert.match(activity.snapshot().face,/work|idle-blink/);
  const base=await read("assets/reactions/pixel/reaction-sheet.json");let chosen;
  renderDock({geometry:{collapsed:false,columns:16,rows:8},sheet:base,snapshot:{face:"watch",phase:"running",bubble:"",color:"accent"},
    theme:{fg:(_token,text)=>text},visibleWidth:(text)=>[...text].length,truncateToWidth:(text,width)=>text.slice(0,width),
    renderAvatar:({frameIndex})=>{chosen=base.frames[frameIndex].id;return Array(8).fill("");}});
  assert.equal(chosen,"work");checks.push("Running uses the magnifier through its 1200ms hold, editing retains typing, and older styles safely fall back to work");
}
process.stdout.write(JSON.stringify({passed:true,checks},null,2)+"\n");
