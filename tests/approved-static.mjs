import { styleAssetDirectory } from '../lib/styles.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { withPokeFrame } from '../lib/poke.mjs';
import { withWatchFrames } from '../lib/watch.mjs';
import { withSearchFrames } from '../lib/search.mjs';
import { withListenFrames } from '../lib/listen.mjs';
import { createMotionPlayer } from '../lib/motion.mjs';
import { loadEncodedSheet, loadTitleBranding } from '../lib/index.js';
import { presentationProfile, presentationMatrix } from '../lib/dsh-presentation.mjs';
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifest = read('Hi-Res/approved-static-20261018/manifest.json');
const revision = createHash('sha256').update(readFileSync(new URL('Hi-Res/approved-static-20261018/manifest.json', root))).digest('hex').slice(0,20);
const approvedActions = {
  watch:{steps:79,fullFrames:158,periodMs:6583,sha:'cec63b8e729e9efd614d42e16c38be8badeb634d6b6b784e6b02df1b625516e4'},
  search:{steps:58,fullFrames:116,periodMs:4833,sha:'9d7e6485d39c6e36ed8e88e8f25efb22483b214316829e612d85a013e18b9a3b'},
};
const hd = read('assets/hires/umi/manifest.json');
for(const [action,expected] of Object.entries(approvedActions)) {
  const animation=hd.animations[action];
  assert.equal(animation.approvedStaticRevision,revision);
  assert.equal(animation.sourceManifestSha256,expected.sha);
  assert.equal(animation.frames.length,expected.fullFrames);
  for(const clip of Object.values(animation.clips)) {
    assert.equal(clip.durationMs,expected.periodMs);
    assert.equal(clip.frames.length,expected.fullFrames);
    assert.equal(clip.frames[0].atMs,0);
    let previous=-1;
    for(const frame of clip.frames) {
      assert.ok(frame.atMs>previous && frame.atMs<clip.durationMs);
      assert.ok(animation.frames.includes(frame.id));previous=frame.atMs;
    }
  }
}
assert.deepEqual(hd.animations.search.clips.searching,hd.animations.search.clips.compacting);
for (const style of ['umi','umi-pixel','pixel','illustration']) {
  const sheet = read(`assets/reactions/${styleAssetDirectory(style)}/reaction-sheet.json`);
  assert.equal(sheet.approvedStaticRevision, revision);
  assert.equal(sheet.frames.length,40);
  assert.deepEqual(Object.keys(sheet.ids).sort(), manifest.records.map(r=>r.id).sort());
  const encoded = loadEncodedSheet(style);
  assert.equal(encoded.approvedStaticRevision, revision, 'Host preserves the source selection guard');
  assert.equal(encoded.motion.approvedWholeFrames, true);
  // The frozen base remains 40 states. The host-loaded bank legitimately
  // includes matching approved clips and repoints only their action aliases.
  const loaded = {...encoded, frames:encoded.frames.map(frame=>{
    const bytes=Buffer.from(frame.pixels,'base64');
    const pixels=encoded.pixelsEncoding==='u16le'
      ? Array.from({length:bytes.length/2},(_,i)=>bytes.readUInt16LE(i*2)) : [...bytes];
    return {...frame,pixels};
  })};
  for(const [action,key,phase] of [['watch','watch','running'],['search','searchVideo','searching']]) {
    const sequence=loaded.motion?.[key]?.sequence;
    const expected=approvedActions[action];
    assert.ok(sequence,`${style}: approved ${action} must actually load`);
    assert.equal(sequence.steps.length,expected.steps);
    assert.equal(sequence.periodMs,expected.periodMs);
    assert.equal(sequence.steps.reduce((sum,step)=>sum+step.durationMs,0),expected.periodMs);
    assert.ok(sequence.steps.every(step=>step.durationMs>=50));
    assert.ok(loaded.frames.length>sheet.frames.length);
    const picked=new Set();let clock=0;
    const playing=createMotionPlayer({now:()=>clock});
    for(const step of sequence.steps) {
      const frame=playing.frame(loaded,loaded.ids[action],{phase});
      assert.equal(frame.motion[`${action}FrameId`],step.id);
      assert.deepEqual(Array.from(frame.frame.pixels),loaded.frames[loaded.ids[step.id]].pixels);
      picked.add(step.id);clock+=step.durationMs;
    }
    assert.equal(picked.size,new Set(sequence.steps.map(step=>step.id)).size);
    const paused=playing.frame(loaded,loaded.ids[action],{phase,animate:false});
    clock+=60000;
    assert.equal(playing.frame(loaded,loaded.ids[action],{phase,animate:false}).cacheKey,paused.cacheKey);
    playing.dispose();
  }
  for(const {id,pixels} of sheet.frames) {
    assert.equal(pixels.length,sheet.width*sheet.height,id);
    assert.ok(pixels.every(p=>Number.isInteger(p)&&p>=0&&p<sheet.palette.length),id);
  }
  for(const [file,augment] of [['poke-patch.json',withPokeFrame],['watch-frames.json',withWatchFrames],
                              ['search-frames.json',withSearchFrames],['listen-frames.json',withListenFrames]]) {
    let old; try { old=read(`assets/reactions/${styleAssetDirectory(style)}/${file}`); } catch { continue; }
    // Even valid-looking old pack files must not overwrite approved complete art.
    if(old.approvedStaticRevision!==revision) assert.equal(augment(sheet,old),sheet,`${style}/${file}`);
  }
  const player = createMotionPlayer({now:()=>3500});
  for(const name of ['talk-closed','talk-small','talk-medium','talk-wide']) {
    player.reset();
    const result=player.frame(sheet,sheet.ids[name],{phase:'speaking',blink:true});
    assert.equal(result.frame.id,`${name}-blink`);
    assert.deepEqual(Array.from(result.frame.pixels),sheet.frames[sheet.ids[`${name}-blink`]].pixels,
      'Speaking blink selects complete approved frame, with no difference-patch construction');
  }
  for(const [name,phase] of [['idle-open','idle'],['work','editing'],['listen','listening'],
    ['watch','running'],['search','searching'],['poke','poked'],['emotion-grumpy','error']]) {
    player.reset();
    const result=player.frame(sheet,sheet.ids[name],{phase,blink:false});
    assert.deepEqual(Array.from(result.frame.pixels),sheet.frames[sheet.ids[name]].pixels,
      `${style}/${name}: no previous-geometry warp or synthetic body distortion`);
    assert.equal(result.transitioning,false);
  }
  // A newly exported matching video may replace the watch alias even though
  // this bank includes a complete approved static watch/watch-blink pair.
  const frames=['watch','watch-blink'].map(id=>sheet.frames[sheet.ids[id]]);
  const asset={width:sheet.width,height:sheet.height,approvedStaticRevision:revision,frames,
    motion:{bakedMotion:true},sequence:{periodMs:1000,steps:frames.map(f=>({id:f.id,durationMs:500}))}};
  const augmented=withWatchFrames(sheet,asset);
  assert.notEqual(augmented,sheet);
  assert.equal(augmented.ids.watch,sheet.frames.length);
  assert.equal(augmented.motion.watch.sequence.periodMs,1000);
  assert.equal(withWatchFrames(augmented,asset),augmented,'Repeated matching augmentation cannot duplicate a clip');
  assert.equal(withWatchFrames(sheet,{...asset,approvedStaticRevision:'old'}),sheet);
  const profile=presentationProfile(style,'search','search',true);
  assert.deepEqual(presentationMatrix(profile),{scale:1,x:0,y:0},'No second 1.30 scale or legacy anchor applied');
}
const title=loadTitleBranding('auto');
assert.equal(title.animated,false,'Auto branding no longer plays withdrawn pre-replacement art');
assert.equal(title.contentType,'image/png');
console.log('Approved static runtime: 40 states, all four styles, old overlays isolated, complete speech blinks, matching video opt-in, unwarped pixels and canonical display profiles passed.');
