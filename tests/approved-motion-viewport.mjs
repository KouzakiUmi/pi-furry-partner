import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAnimatedCatalog } from '../lib/pi-resources.mjs';
import { decodeApprovedMotionNodeResource } from '../lib/approved-motion-node.mjs';
import { approvedMotionIndexedRect, decodeApprovedMotionIndexed } from '../lib/hd/player.mjs';
import { dockGeometry, prepareApprovedDockFrame, renderDock } from '../lib/editor-layout.mjs';

const palette = [[0,0,0],[255,255,255],[255,0,0],[0,200,255]];
const original = new Uint8Array(240*240);
for(let y=100;y<145;y++) for(let x=100;x<140;x++) original[y*240+x]=1;
original[228*240+120]=3;
const full = new Uint8Array(336*336);
for(let y=0;y<240;y++) full.set(original.subarray(y*240,(y+1)*240),(y+48)*336+48);
full[160*336+36]=2; full[160*336+295]=2;
const sheet={width:336,height:336,transparentIndex:0,palette,motion:{approvedWholeFrames:true},
 viewport:{worldRect:[-128,-128,896,896]},frames:[{id:'pose',cacheKey:'viewport-fixture',pixels:full}],ids:{pose:0}};
const before=full.slice();
assert.deepEqual(approvedMotionIndexedRect(sheet),{x:-128,y:-128,width:896,height:896});
assert.equal(prepareApprovedDockFrame({...sheet,viewport:{worldRect:[0,0,640,640]}},0,16,20),null,'canonical original path stays untouched');
for(const caption of [20,24]){
 const view=prepareApprovedDockFrame(sheet,0,16,caption),f=view.sheet.frames[0];
 assert.equal(view.sheet.height,240);assert.equal(view.columns,caption);
 const offset=(view.sheet.width-240)/2;
 for(let y=0;y<240;y++) assert.deepEqual(f.pixels.subarray(y*view.sheet.width+offset,y*view.sheet.width+offset+240),original.subarray(y*240,(y+1)*240),'core exactly retains original scale/anchor');
 assert.equal(Array.from(f.pixels).filter(x=>x===2).length,2,'both out-of640 paws survive');
 assert.equal(prepareApprovedDockFrame(sheet,0,16,caption),view,'bounded presentation reuse');
}
assert.deepEqual(full,before,'presentation never edits the original decoded source');
const legacy=dockGeometry(60,30),registered=dockGeometry(60,30,'auto',{registeredMotion:true});
assert.equal(registered.rows,legacy.rows);assert.equal(registered.columns,legacy.columns);
assert.ok(registered.captionColumns>=registered.columns+2*Math.ceil(registered.columns*.1));
assert.deepEqual(dockGeometry(120,30,'auto',{registeredMotion:true}).leftWidth,dockGeometry(120,30).leftWidth,'wide terminal keeps existing editor lane');
let captured;
renderDock({geometry:dockGeometry(100,30,'auto',{registeredMotion:true}),sheet:{...sheet,ids:{'idle-open':0}},snapshot:{face:'idle-open',phase:'idle',bubble:'',color:'accent'},
 motionPlayer:{frame:()=>({sheet,frameIndex:0})},renderAvatar:x=>{captured=x;return Array(8).fill(' '.repeat(x.columns));},
 theme:{fg:(_,s)=>s},visibleWidth:s=>s.length,truncateToWidth:(s,w)=>s.slice(0,w)});
assert.equal(captured.columns,20);assert.equal(captured.rows,8);assert.equal(captured.sheet.width,300);assert.equal(captured.sheet.height,240);

const catalog=loadAnimatedCatalog(),clip=catalog.clips.stretch;
assert.ok(clip,'actual approved stretch resource required');
const raw=decodeApprovedMotionNodeResource(readFileSync(new URL('../assets/animated/'+clip.indexed.umi.file,import.meta.url)));
const decoded=decodeApprovedMotionIndexed(raw,catalog,clip,'umi');assert.ok(decoded);
for(const shape of [[-128,-128,NaN,896],[-128,-128,896],[-128,-128,0,896],[-128,-128,896,640],[0,0,896,896]]){
 assert.equal(decodeApprovedMotionIndexed({...raw,viewport:{worldRect:shape}},catalog,clip,'umi'),null,'reject malformed or mismatched registered source geometry');
}
let checked=0;
for(const columns of [60,80,120]) for(const size of ['small','compact','auto','large']){
 const g=dockGeometry(columns,35,size,{registeredMotion:true});
 for(let i=0;i<decoded.frames.length;i++){
  const view=prepareApprovedDockFrame(decoded,i,g.columns,g.captionColumns),out=view.sheet.frames[0].pixels;
  const count=a=>{let n=0;for(const x of a)if(x!==decoded.transparentIndex)n++;return n;};
  assert.equal(count(out),count(decoded.frames[i].pixels),'every actual foreground index survives full896 presentation, including extremal paw frames');
  assert.equal(view.sheet.height,240); checked++;
 }
}
console.log('Registered indexed viewport: exact core size/anchor, complete out-of640 paws, unchanged source buffers, legacy path, malformed rectangle rejection and '+checked+' actual stretch/frame/size presentations passed.');
