import assert from 'node:assert/strict';
import { PET_DISPLAY_PROFILES, PET_DISPLAY_TRANSITION_MS, PET_PAINT_INSETS, presentationMatrix,
 presentationProfile, createPresentationPlayer, petPaintGeometry, floatingPetGeometry } from '../lib/dsh-presentation.mjs';
const {ordinary,watch,search}=PET_DISPLAY_PROFILES;
assert.equal(presentationProfile('umi','search-video-000').id,'search');
assert.equal(presentationProfile('umi','error','search').id,'search','Held video uses actual painted family');
assert.equal(presentationProfile('umi','search-video-000','poses/idle-open').id,'ordinary','Pending search cannot rescale a held idle');
assert.equal(presentationProfile('umi','gesture-shy-017','gesture-shy').id,'ordinary','H3 expression frames keep authored scale');
assert.equal(presentationProfile('umi-pixel','watch-000').id,'watch');
assert.equal(presentationProfile('pixel','search').id,'ordinary','Legacy style proportions stay unchanged');
assert.equal(search.scale,1.3);assert.equal(watch.scale,1);
for(const profile of Object.values(PET_DISPLAY_PROFILES)) {
 const m=presentationMatrix(profile);
 assert.equal(profile.sourceAnchor[0]*m.scale+m.x,profile.targetAnchor[0]);
 assert.equal(profile.sourceAnchor[1]*m.scale+m.y,profile.targetAnchor[1]);
}
const paint=petPaintGeometry(640);
function assertFullCanvasFits(m) {
 const xs=[m.x,640*m.scale+m.x],ys=[m.y,640*m.scale+m.y];
 assert.ok(Math.min(...xs)>=paint.left && Math.max(...xs)<=paint.width+paint.left);
 assert.ok(Math.min(...ys)>=paint.top && Math.max(...ys)<=paint.height+paint.top);
}
for(const source of Object.values(PET_DISPLAY_PROFILES))for(const target of Object.values(PET_DISPLAY_PROFILES)) {
 const p=createPresentationPlayer();p.sample('umi',source,0);
 const first=p.sample('umi',target,1000);
 assert.deepEqual({scale:first.scale,x:first.x,y:first.y},presentationMatrix(target),'New asset receives its correct fixed scale from its first frame');
 for(let t=1000;t<=1000+PET_DISPLAY_TRANSITION_MS;t+=10) {const sample=p.sample('umi',target,t);assertFullCanvasFits(sample);assert.equal(sample.scale,target.scale);assert.equal(p.transitioning(t),sample.transitioning);assert.ok(sample.opacity>=.84 && sample.opacity<=1);}
 const final=p.sample('umi',target,1300);
 assert.deepEqual({scale:final.scale,x:final.x,y:final.y},presentationMatrix(target));
 for(let frame=0;frame<198;frame++) {
  const value=p.sample('umi',target,1300+frame*33.33);
  assert.equal(value.scale,final.scale);assert.equal(value.x,final.x);assert.equal(value.y,final.y);
  assert.equal(value.transitioning,false,'No per-frame auto-fit or pumping inside a video');
 }
}
for(const viewport of [{w:1334,h:1057},{w:800,h:600},{w:360,h:640}])for(const requested of [72,140,196,300,640])for(const xRatio of [0,.5,1])for(const yRatio of [0,.76,1]) {
 const ui={xRatio,yRatio};const g=floatingPetGeometry(requested,viewport,ui),extent=petPaintGeometry(g.size);
 assert.ok(g.size<=requested);assert.ok(g.left+extent.left>=8-1e-8);assert.ok(g.top+extent.top>=8-1e-8);
 assert.ok(g.left+extent.left+extent.width<=viewport.w-8+1e-8);assert.ok(g.top+extent.top+extent.height<=viewport.h-8+1e-8);
 assert.deepEqual(ui,{xRatio,yRatio},'Viewport fitting never rewrites saved size/position');
}
const legacy=floatingPetGeometry(640,{w:1334,h:800},{},false);assert.equal(legacy.size,640);
const minimized=floatingPetGeometry(196,{w:800,h:600},{minimized:true,xRatio:0,yRatio:0});assert.equal(minimized.size,44);assert.equal(minimized.left,8);
const p=createPresentationPlayer();p.sample('umi',ordinary,0);p.sample('umi',search,100);
assert.deepEqual(p.sample('umi',search,110,false),{...presentationMatrix(search),profile:'search',opacity:1,transitioning:false},'Paused real state settles without animation');
console.log('DSH presentation: anatomical fixed profiles/anchors, full uncut frame coverage, 220ms single-image entrance, no per-frame pumping and viewport/pref safety passed.');
