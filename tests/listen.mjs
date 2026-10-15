import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LISTEN_DURATION_MS, withListenFrames } from "../lib/listen.mjs";
import { withWatchFrames } from "../lib/watch.mjs";
import { withPokeFrame } from "../lib/poke.mjs";
import { createActivity, DEMO_SEQUENCE } from "../lib/activity.mjs";
import { createMotionPlayer } from "../lib/motion.mjs";

const read=async(path)=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),"utf8"));
const checks=[];
{
  let time=1000;const activity=createActivity({now:()=>time,random:()=>.25,phrases:{listening:["I am listening"]},bubbles:{listening:"All ears"}});
  activity.start({wake:false});assert.equal(activity.noteTyping(),true);let state=activity.snapshot();
  assert.equal(state.phase,"idle");assert.equal(state.reaction,"listening");assert.match(state.face,/^listen/);assert.equal(state.phrase,"I am listening");
  time+=1000;assert.equal(activity.isListening(),true);activity.noteTyping();time+=LISTEN_DURATION_MS-1;
  assert.equal(activity.snapshot().reaction,"listening");time++;assert.equal(activity.snapshot().reaction,undefined);assert.equal(activity.isListening(),false);
  activity.noteTyping();activity.clearTyping();assert.equal(activity.snapshot().reaction,undefined);
  activity.noteTyping();activity.poke();assert.equal(activity.snapshot().reaction,"poked");
  time+=1100;activity.handle("agent_start");activity.handle("tool_execution_start",{toolCallId:"work",toolName:"bash"});assert.equal(activity.noteTyping(),false);assert.equal(activity.snapshot().phase,"running");assert.equal(activity.snapshot().reaction,undefined);
  activity.handle("ui_prompt_start");assert.equal(activity.noteTyping(),false,"A question overlay cannot interrupt another active work tool");
  activity.handle("tool_execution_end",{toolCallId:"work"});assert.equal(activity.noteTyping(),true);state=activity.snapshot();assert.equal(state.phase,"waiting");assert.equal(state.awaitingUser,true);assert.equal(state.reaction,"listening");
  activity.handle("session_shutdown");assert.equal(activity.isListening(),false);
  activity.setDemo("idle");assert.equal(activity.noteTyping(),true);assert.equal(activity.snapshot().reaction,"listening");
  activity.setDemo("running");assert.equal(activity.noteTyping(),false);assert.equal(activity.snapshot().reaction,undefined);
  activity.setDemo("waiting");activity.snapshot();time+=10000;assert.equal(activity.snapshot().drowsy,true);activity.noteTyping();assert.equal(activity.snapshot().drowsy,false);assert.equal(activity.snapshot().reaction,"listening");
  activity.clearTyping();activity.setDemo("all");const initialTour=activity.snapshot();
  assert.equal(activity.noteTyping(),false,"The automatic tour keeps its fixed timeline instead of accepting a real typing override");
  assert.equal(activity.snapshot().demoEpoch,initialTour.demoEpoch);assert.equal(activity.snapshot().phase,"waking");assert.equal(activity.snapshot().reaction,undefined);
  time+=DEMO_SEQUENCE.slice(0,DEMO_SEQUENCE.findIndex(step=>step.reaction==="listening")).reduce((sum,step)=>sum+step.durationMs,0);
  assert.equal(activity.snapshot().reaction,"listening","The tour still presents its scheduled listening gesture");
  const listeningTour=activity.snapshot();assert.equal(activity.noteTyping(),false);assert.equal(activity.snapshot().demoEpoch,listeningTour.demoEpoch);
  activity.setDemo("off");assert.equal(activity.snapshot().reaction,undefined,"The tour's virtual listening slot cannot start a real typing gesture");
  activity.setDemo("idle");time+=5000;activity.poke();assert.equal(activity.snapshot().reaction,"poked");assert.equal(activity.snapshot().reactionElapsedMs,0);
  time+=100;assert.equal(activity.snapshot().reactionElapsedMs,100,"An explicit poke during a single-state demo retains its own reaction clock");
  activity.setDemo("off");time+=1100;
  activity.start();assert.equal(activity.snapshot().phase,"waking");assert.equal(activity.noteTyping(),true);assert.equal(activity.snapshot().phase,"idle");assert.equal(activity.snapshot().reaction,"listening","Real typing takes priority over the startup wake sequence");
  checks.push("Draft activity stays local, refreshes a finite 1800ms gesture, clears on empty/submit, gives poke priority, leaves running tools intact and listens during real/demo user waits including dozing");
}
for(const style of ["wumi","wumi-pixel"]){
  const base=await read(`assets/reactions/${style}/reaction-sheet.json`),original=JSON.stringify(base);
  const asset=await read(`assets/reactions/${style}/listen-frames.json`);
  const watch=await read(`assets/reactions/${style}/watch-frames.json`);
  const sheet=withListenFrames(withWatchFrames(withPokeFrame(base,await read(`assets/reactions/${style}/poke-patch.json`)),watch),asset);
  const listenStart=base.frames.length+1+watch.frames.length;
  assert.equal(base.frames.length,21);assert.equal(sheet.frames.length,listenStart+asset.frames.length);assert.equal(sheet.ids.listen,listenStart);assert.equal(sheet.ids["listen-blink"],listenStart+1);assert.equal(sheet.palette,base.palette);
  assert.equal(withListenFrames(sheet,asset),sheet);assert.equal(withListenFrames(base,{...asset,width:1}),base);
  const open=sheet.frames[sheet.ids.listen].pixels,closed=sheet.frames[sheet.ids["listen-blink"]].pixels;let changes=0;
  for(let i=0;i<open.length;i++){
    assert.equal(open[i]===0,closed[i]===0);
    if(open[i]!==closed[i]){changes++;const x=i%sheet.width,y=Math.floor(i/sheet.width);assert.ok(x>sheet.width*.25&&x<sheet.width*.59&&y>sheet.height*.32&&y<sheet.height*.54,"Eyelids keep the hood/raised paw/resting paw unchanged");}
  }assert.ok(changes>10);
  let time=0;const player=createMotionPlayer({now:()=>time}),states=new Set();
  for(time=0;time<6000;time+=100){const result=player.frame(sheet,sheet.ids.listen,{phase:"listening"});assert.equal(result.motion.x,0);assert.equal(result.motion.tilt,0);assert.ok(Number.isInteger(result.motion.listenPhase));states.add(Buffer.from(result.frame.pixels).toString("base64"));assert.ok(result.frame.pixels.every((p)=>p>=0&&p<sheet.palette.length));}
  assert.ok(states.size>10);assert.equal(JSON.stringify(base),original);player.dispose();
  checks.push(`${style}: immutable 21-frame base + watch/poke/listen append chain, clean tilted blink, fixed palette and actual upper-body nod/ear micro-motion`);
}
process.stdout.write(JSON.stringify({passed:true,checks},null,2)+"\n");
