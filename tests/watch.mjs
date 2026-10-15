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
  assert.equal(base.frames.length,21);assert.equal(sheet.frames.length,22+asset.frames.length);
  assert.equal(sheet.ids.poke,21);assert.equal(sheet.ids.watch,22);assert.equal(sheet.ids["watch-blink"],23);
  assert.equal(sheet.palette,base.palette);assert.equal(withWatchFrames(sheet,asset),sheet);
  for(let i=0;i<base.frames.length;i++)assert.equal(sheet.frames[i],base.frames[i]);
  assert.equal(withWatchFrames(base,{...asset,width:1}),base);
  assert.equal(withWatchFrames(base,{...asset,frames:[asset.frames[0]]}),base);
  assert.equal(withWatchFrames(base,{...asset,frames:[...asset.frames,null]}),base);
  assert.equal(withWatchFrames(base,{...asset,frames:[{...asset.frames[0],pixels:[-1]},asset.frames[1]]}),base);
  const open=sheet.frames[sheet.ids.watch].pixels,blink=sheet.frames[sheet.ids["watch-blink"]].pixels;
  let different=0;
  for(let i=0;i<open.length;i++){
    if(!asset.sequence)assert.equal(open[i]===0,blink[i]===0,"Legacy blink preserves alpha/lens/paw silhouette");
    if(open[i]!==blink[i])different++;
  }
  assert.ok(different>10);
  let time=0;const player=createMotionPlayer({now:()=>time});const states=new Set(),faces=new Set();
  for(time=0;time<8400;time+=100){
    const frame=player.frame(sheet,sheet.ids.watch,{phase:"running"});
    assert.equal(frame.sheet.palette,sheet.palette);assert.equal(frame.frame.pixels.length,sheet.width*sheet.height);
    assert.equal(frame.motion.x,0);assert.equal(frame.motion.tilt,0);
    assert.ok(frame.frame.pixels.every((p)=>p>=0&&p<sheet.palette.length));
    assert.equal(frame.motion.watchPhase,undefined,"Lens/head inverse deformation is disabled, including legacy packs");
    assert.equal(frame.motion.earLeft,0);assert.equal(frame.motion.pawLeft,0);
    const selected=sheet.frames[sheet.ids[frame.motion.watchFrameId??"watch"]].pixels;
    const dy=frame.motion.y;
    // Every opaque output pixel comes from exactly the same authored frame.
    // This catches duplicate rims, stale old-position ink, and frame blending.
    for(let y=0;y<sheet.height;y++)for(let x=0;x<sheet.width;x++){
      const sy=y-dy;
      assert.equal(frame.frame.pixels[y*sheet.width+x],sy>=0&&sy<sheet.height?selected[sy*sheet.width+x]:0,
        "Watch output may only apply one rigid whole-frame breath, never lens/paw warping or temporal blending");
    }
    assert.equal(frame.transitioning,false,"Authored internal steps cannot start pose crossfades");
    states.add(Buffer.from(frame.frame.pixels).toString("base64"));faces.add(frame.motion.watchFrameId??"watch");
  }
  if(asset.sequence){assert.equal(faces.size,asset.frames.length);assert.ok(states.size>=asset.frames.length,"Authored poses must actually play");}
  else{assert.equal(faces.size,1);assert.ok(states.size>1,"Legacy fallback keeps a small rigid breathing movement");}
  const last=player.frame(sheet,sheet.ids.watch,{phase:"running",animate:false});time+=50000;
  const paused=player.frame(sheet,sheet.ids["watch-blink"],{phase:"running",animate:false});
  assert.equal(paused.cacheKey,last.cacheKey);assert.equal(paused.nextInMs,Infinity);player.dispose();
  assert.equal(JSON.stringify(base),original,"Main sheet must remain byte-equivalent in memory");
  checks.push(`${style}: append-only authored sequence / legacy fallback, intact 21 source frames and palette, exact whole-frame pixels without doubled rims, no internal crossfade, frozen pause`);
}
{
  // A small synthetic sequence makes timing/compatibility meaningful without
  // depending on the artwork or mirroring its actual pixel arrangement.
  const base={width:4,height:4,palette:[[0,0,0],[250,250,250],[40,50,60]],frames:[{id:"idle-open",pixels:Array(16).fill(0)}],ids:{"idle-open":0},motion:{ears:false,paws:false}};
  const frame=(id,color)=>({id,pixels:Array(16).fill(color)});
  const asset={width:4,height:4,frames:[frame("watch",1),frame("watch-blink",2),frame("watch-left",1)],
    sequence:{steps:[{id:"watch",durationMs:200},{id:"watch-left",durationMs:300},{id:"watch-blink",durationMs:100}],periodMs:600}};
  const sheet=withWatchFrames(base,asset);assert.equal(sheet.frames.length,4);
  for(const invalid of [{...asset,sequence:{steps:[{id:"missing",durationMs:100},{id:"watch",durationMs:200}]}},
    {...asset,sequence:{...asset.sequence,periodMs:700}},
    {...asset,sequence:{steps:[{id:"watch",durationMs:0},{id:"watch-left",durationMs:200}]}},
    {...asset,frames:[...asset.frames,frame("watch-left",2)]}])assert.equal(withWatchFrames(base,invalid),base);
  let time=0;const player=createMotionPlayer({now:()=>time});
  const expected=[[0,"watch"],[199,"watch"],[200,"watch-left"],[499,"watch-left"],[500,"watch-blink"],[599,"watch-blink"],[600,"watch"],[800,"watch-left"]];
  for(const [at,id] of expected){time=at;const value=player.frame(sheet,sheet.ids["watch-blink"],{phase:"running",blink:true});assert.equal(value.frame.id,id);assert.equal(value.transitioning,false);}
  time=900;const paused=player.frame(sheet,sheet.ids.watch,{phase:"running",animate:false});
  time=9000;assert.equal(player.frame(sheet,sheet.ids.watch,{phase:"running",animate:false}).cacheKey,paused.cacheKey);
  player.dispose();checks.push("Authored step durations loop at exact boundaries, external blink cannot jump to center, invalid sequence metadata is rejected");
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
