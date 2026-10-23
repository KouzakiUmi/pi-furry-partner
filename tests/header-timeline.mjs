// Regression for the actual saved-style Pi header resources and their consumer.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHeader, terminalVariants } from '../lib/renderer.mjs';
import { createKittyTransport } from '../lib/kitty.mjs';

const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const expected = [
  [0,false,2200],[-1,false,100],[-2,false,100],[-3,false,100],[-4,false,100],[-5,false,100],
  [-6,false,80],[-6,true,700],[-6,false,120],[-5,false,100],[-4,false,100],[-3,false,100],
  [-2,false,100],[-1,false,100],[0,false,700],
];
const fingerprint = value => createHash('sha256').update(Buffer.from(value)).digest('hex');

for (const [style,file,edge] of [['illustration','assets/illustration/native-frames.json',240]]) {
  const native = await read(file);
  assert.deepEqual([native.width,native.height],[edge,edge],'Keep the current native canvas');
  assert.equal(native.frames.length,15,'A static title replacement must never collapse the header animation');
  assert.equal(native.loopDurationMs,4800);
  assert.deepEqual(native.frames.map(f=>[f.angleDeg,f.wink,f.durationMs]),expected,'Retain the original action clock, not merely frame count');
  assert.equal(native.frames.reduce((n,f)=>n+f.durationMs,0),4800);
  if(style==='illustration') {
  assert.equal(native.headerSourcePose,'idle-open','Use current HD idle artwork instead of restoring an old body');
  assert.deepEqual(native.headerRestoration.anchor,[320,608]);
  assert.equal(native.headerRestoration.scale,1);
  assert.equal(native.headerRestoration.perFrameFit,false);
  assert.equal(native.headerRestoration.dshBrandingModified,false);
  assert.equal(native.headerRestoration.eyePixelsDrawn,false);
  assert.ok(new Set(native.frames.map(f=>fingerprint(f.pixels))).size>=8,'The bank contains visible poses, not repeated static buffers');
  assert.deepEqual(native.frames[0].pixels,native.frames[14].pixels,'Loop returns to the same neutral pose');
  assert.deepEqual(native.frames[6].pixels,native.frames[8].pixels,'The same-angle open holds are identical');
  const open=native.frames[6].pixels,wink=native.frames[7].pixels;
  let eyeChanges=0;
  for(let i=0;i<open.length;i++) {
    assert.equal(open[i]===0,wink[i]===0,'Wink keeps the entire silhouette at the same rigid angle');
    if(open[i]!==wink[i]) {
      eyeChanges++;
      const x=i%edge,y=Math.floor(i/edge);
      assert.ok(x>edge*.45&&y<edge*.62,'Wink changes stay in the right eye, away from other eye/body');
    }
  }
  assert.ok(eyeChanges>0,'The 700ms wink must actually close an eye');
  const blueRightEye=frame=>frame.pixels.reduce((count,p,i)=>{
    const x=i%edge/edge,y=Math.floor(i/edge)/edge,[r,g,b]=native.palette[p];
    return count+Number(p!==0&&x>.54&&x<.76&&y>.38&&y<.57&&b>r+25&&g>r+15);
  },0);
  assert.ok(blueRightEye(native.frames[6])>0&&blueRightEye(native.frames[7])===0,
    'A real eye closure removes the current source blue iris');
  }
  const fallback=terminalVariants(native);
  for(const [name,variant] of Object.entries(fallback.variants)) {
    assert.equal(variant.frames.length,15,`${style}/${name} cannot silently fall back to one frame`);
    assert.deepEqual(variant.frames.map(f=>[f.angleDeg,f.wink,f.durationMs]),expected);
    assert.notDeepEqual(variant.frames[6].pixels,variant.frames[7].pixels,`${style}/${name} wink survives terminal sampling`);
  }
  let serial=0,uploads=[],seen=[];
  const transport=createKittyTransport({getCellDimensions:()=>({widthPx:10,heightPx:20}),getSheet:()=>native,
    getStyle:()=>style,getViewport:()=>[120,60],isAllowed:()=>true,allocateImageId:()=>++serial,
    renderImage(data,_dims,options){uploads.push(data);return {sequence:`png-${data}`,columns:options.maxWidthCells,rows:1};}});
  const header=createHeader({sheet:fallback,getSettings:()=>({size:'normal',language:'en',name:'Umi',subtitle:'Header test'}),
    getSnapshot:()=>({busy:false,status:'Idle'}),getRows:()=>60,theme:{fg:(_token,text)=>text,bold:text=>text},
    visibleWidth:text=>text.length,truncateToWidth:(text,n)=>text.slice(0,n),
    renderAvatar(request){seen.push(request.frameIndex);return transport.render(request);}});
  header.setFrame(6);header.render(120);const openUploads=uploads.splice(0);
  header.setFrame(7);header.render(120);const winkUploads=uploads.splice(0);
  assert.deepEqual(seen,[6,7],'Real header consumer selects the actual native slots');
  assert.ok(openUploads.length>0&&winkUploads.length>0,'Kitty receives actual transparent PNG stripes');
  assert.notDeepEqual(openUploads,winkUploads,'HD Kitty output includes the wink instead of a held static pose');
  transport.dispose();
}
console.log('Pi header restoration: the sole illustrated native style, four fallback sizes, exact historical 15-frame/4800ms clock, same-body wink and actual header→Kitty PNG output passed.');
