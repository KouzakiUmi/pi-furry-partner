import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EXPRESSIONS, withExpressionFrames, expressionFaceFor } from '../lib/expressions.mjs';
import { AUTO_GESTURE_IDS } from '../lib/gestures.mjs';
import { createActivity } from '../lib/activity.mjs';
import { createMotionPlayer } from '../lib/motion.mjs';
import { loadEncodedSheet, loadHiResManifest, loadHiResFrame } from '../lib/index.js';

const read = async p => JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const metadata=await read('../assets/poses/expressions/metadata.json');
let digest;
if(metadata.source==='individual-full-canvas-keyframes') {
  let bundle='';
  for(const [id,entry] of Object.entries(metadata.sourceFiles).sort(([a],[b])=>a.localeCompare(b))) {
    assert.match(entry.file,/^Hi-Res\/sources\/expression-keyframes-[a-f0-9]+\/full-canvas\/emotion-[a-z]+\.png$/);
    const bytes=await readFile(new URL(`../${entry.file}`,import.meta.url));
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,entry.sha256);bundle+=`${id}:${hash}\n`;
  }
  digest=createHash('sha256').update(bundle).digest('hex');
  assert.equal(metadata.processing.version,'source-native-v1');
  assert.equal(metadata.processing.nonUniformScale,false);assert.equal(metadata.processing.colorCorrection,false);
} else {
  const source=await readFile(new URL('../Hi-Res/sources/expression-keyframes-20261018/Umi-nine-expressions-approved.png',import.meta.url));
  digest=createHash('sha256').update(source).digest('hex');
}
assert.equal(metadata.sourceSha256,digest);
assert.equal(metadata.colorCalibration,undefined,'Withdrawn material mapping is absent');
assert.equal(metadata.aspect,undefined,'Withdrawn non-uniform stretch is absent');
assert.equal(EXPRESSIONS.length,9);
for(const e of EXPRESSIONS) {
  assert.equal(AUTO_GESTURE_IDS.includes(e.id),Boolean(e.automatic));
  const geometry=metadata.poses[e.face];
  if(metadata.source==='individual-full-canvas-keyframes') {
    assert.equal(geometry.canvasTransform.nonUniformScale,false);
    assert.equal(geometry.canvasTransform.perFrameFit,false);
    assert.equal(geometry.geometryMargin.withinMargin,true);
  } else {
    assert.equal(geometry.scale,1.24,'Paws and floating marks cannot change character scale');
    assert.equal(geometry.nose[0],288);
    assert.ok(Math.abs(geometry.bounds[3]-603)<=4,'Legacy authored poses share the grounded baseline');
  }
}
for(const style of ['umi','umi-pixel']) {
  const published=await read(`../assets/reactions/${style}/reaction-sheet.json`);
  const pack=await read(`../assets/reactions/${style}/expression-frames.json`);
  // Exercise the legacy augmentation contract with a legacy-shaped fixture.
  // The current approved bank intentionally already owns all emotion IDs and
  // must reject an old pack, rather than append it over the approved art.
  const legacyFrames=published.frames.filter(f=>!f.id.startsWith('emotion-'));
  const base=published.approvedStaticRevision ? {...published, approvedStaticRevision:undefined,
    palette:pack.palette.slice(0,published.palette.length),frames:legacyFrames,
    ids:Object.fromEntries(legacyFrames.map((f,i)=>[f.id,i]))} : published;
  if(published.approvedStaticRevision) assert.equal(withExpressionFrames(published,pack),published);
  assert.equal(pack.sourceSha256,digest);
  const original=JSON.stringify(base),sheet=withExpressionFrames(base,pack);
  assert.notEqual(sheet,base);assert.equal(sheet.frames.length,base.frames.length+9);
  assert.equal(JSON.stringify(base),original);
  assert.equal(withExpressionFrames(sheet,pack),sheet,'No duplicate append');
  assert.equal(withExpressionFrames(base,{...pack,palette:[]}),base,'Palette mismatch rejected');
  assert.equal(withExpressionFrames(base,{...pack,frames:pack.frames.slice(1)}),base,'Incomplete bank rejected');
  assert.equal(withExpressionFrames(base,{...pack,frames:[pack.frames[1],...pack.frames.slice(1)]}),base,'Duplicate ID rejected');
  let time=0;const activity=createActivity({now:()=>time});const player=createMotionPlayer({now:()=>time});
  for(const e of EXPRESSIONS) {
    activity.start({wake:false});assert.equal(activity.playGesture(e.id),true);
    time+=900;const snapshot=activity.snapshot();assert.equal(snapshot.gesture.id,e.id);assert.equal(snapshot.face,e.face);
    const f=player.frame(sheet,sheet.ids[e.face],{gesture:snapshot.gesture});
    assert.equal(f.motion.pawLeft,0);assert.equal(f.motion.pawRight,0);assert.equal(f.motion.earLeft,0);
    assert.ok(f.frame.pixels.every(p=>p>=0&&p<sheet.palette.length));
    activity.handle('agent_start');assert.equal(activity.snapshot().gesture,null,'Real work immediately cancels an expression tour');
  }
  player.dispose();
  assert.equal(expressionFaceFor(sheet,'happy',{phase:'success',elapsedMs:300}),'emotion-joy');
  assert.equal(expressionFaceFor(sheet,'happy',{phase:'success',elapsedMs:1900}),'emotion-joy','Completion holds one readable expression');
  assert.equal(expressionFaceFor(base,'happy',{phase:'success',elapsedMs:300}),'happy','Old packs retain the real task pose');
  assert.equal(expressionFaceFor(sheet,'concern',{phase:'thinking',reaction:'startled'}),'emotion-surprise');
  assert.equal(expressionFaceFor(sheet,'error',{phase:'error'}),'error','Existing XX error pose is preserved');
  const encoded=loadEncodedSheet(style);
  assert.deepEqual(sheet.palette.slice(0,base.palette.length),base.palette,'Original frame colors remain exact');
  for(const e of EXPRESSIONS) {
    const bytes=Buffer.from(encoded.frames[encoded.ids[e.face]].pixels,'base64');
    assert.equal(bytes.length,sheet.width*sheet.height*(encoded.pixelsEncoding==='u16le'?2:1));
    if(encoded.pixelsEncoding==='u16le') {
      const original=published.approvedStaticRevision ? published.frames[published.ids[e.face]].pixels : sheet.frames[sheet.ids[e.face]].pixels;
      for(let i=0;i<original.length;i++)assert.equal(bytes.readUInt16LE(i*2),original[i],'Color indices round-trip without byte truncation');
    }
  }
}
const manifest=loadHiResManifest();
if(manifest.approvedStaticRevision) {
  const approved=await readFile(new URL('../Hi-Res/approved-static-20261018/manifest.json',import.meta.url));
  assert.equal(manifest.staticSourceManifestSha256,createHash('sha256').update(approved).digest('hex'));
} else assert.equal(manifest.expressions.sourceSha256,digest);
for(const e of EXPRESSIONS) {
  assert.ok(manifest.poses.includes(e.face));
  const bytes=loadHiResFrame('poses',e.face);
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
console.log('Authored expressions: approved source, nine poses, fixed scale/baseline, palette validation, priority, Pi/DSH transport and HD assets passed.');
