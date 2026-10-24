// Routing fixtures exercise real complete-frame pixels; they do not approve art.
import assert from 'node:assert/strict';
import { APPROVED_AUXILIARY_IDS, createApprovedMotionPlayer, normalizeApprovedMotionCatalog } from '../lib/approved-motion.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

for (const id of APPROVED_AUXILIARY_IDS) {
  const { catalog, data } = approvedMotionFixture();
  const clip = structuredClone(catalog.clips.idle);
  clip.id=id;clip.family='gesture';clip.hires.baseUrl=`hires/${id}/`;
  for (const [style,meta] of Object.entries(clip.indexed)) {
    const raw=structuredClone(data[meta.file]);
    raw.clipId=id;meta.file=`indexed/${style}/${id}.json`;
    raw.frames.forEach((frame,i)=>{frame.id=`${id}-${i}`;});
    data[meta.file]=raw;
  }
  catalog.clips[id]=clip;
  const player=createApprovedMotionPlayer({catalog,loadIndexed:path=>data[path]});
  const snap={phase:'idle',gesture:{id,elapsedMs:0}};
  const first=player.sample(snap);assert.equal(first.clipId,id);
  const firstFrame=player.indexedFrame(first);
  const next=player.sample({...snap,gesture:{id,elapsedMs:300}});
  const nextFrame=player.indexedFrame(next);
  assert.notDeepEqual(firstFrame.frame.pixels,nextFrame.frame.pixels,`${id} must use authored frame pixels, not a name or synthetic transform`);
  assert.equal(nextFrame.motion.scale,1);assert.equal(nextFrame.motion.tilt,0);
  assert.equal(player.sample(snap,{animate:false}),null);
  player.dispose();
  const rejected=structuredClone(catalog);rejected.clips[id].qa.accepted=false;
  assert.equal(normalizeApprovedMotionCatalog(rejected).clips[id],undefined);
  const gated=createApprovedMotionPlayer({catalog:rejected,loadIndexed:path=>data[path]});
  assert.equal(gated.sample(snap),null,'Unreviewed footage never becomes a gesture');gated.dispose();
}
console.log('Auxiliary complete-frame routing: eight authored gesture IDs, actual changing pixels, unchanged geometry, pause and QA rejection passed; no new artwork approval implied.');
