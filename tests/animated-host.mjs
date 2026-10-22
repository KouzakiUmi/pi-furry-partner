import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {apply,loadAnimatedCatalog,loadAnimatedAsset,ANIMATED_CATALOG_PATH,ANIMATED_ASSET_PATH} from '../lib/index.js';
import {decodeApprovedMotionNodeResource} from '../lib/approved-motion-node.mjs';
import {FULL_ANIMATION_EDITION} from '../lib/build-profile.mjs';
const testRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../work');
await mkdir(testRoot,{recursive:true});
const scratch=await mkdtemp(join(testRoot,'umi-approved-motion-'));
try {
 await mkdir(join(scratch,'indexed','umi'),{recursive:true});
 await mkdir(join(scratch,'hires','idle'),{recursive:true});
 const catalog={schemaVersion:1,revision:'fixture-motion-r1',logicalCanvas:{width:640,height:640},clips:{
  idle:{qa:{accepted:true},indexed:{umi:{file:'indexed/umi/idle.json'}},hires:{baseUrl:'hires/idle/',frames:[{file:'000.webp',atMs:0}]}},
  rejected:{qa:{accepted:false},indexed:{umi:{file:'indexed/umi/rejected.json'}},hires:{frames:[]}}}};
 await writeFile(join(scratch,'catalog.json'),JSON.stringify(catalog));
 await writeFile(join(scratch,'indexed','umi','idle.json'),'{"fixture":true}');
 await writeFile(join(scratch,'hires','idle','000.webp'),Buffer.from([82,73,70,70]));
 await writeFile(join(scratch,'indexed','umi','rejected.json'),'{"rejected":true}');
 if (FULL_ANIMATION_EDITION) {
 assert.equal(loadAnimatedCatalog(scratch).revision,catalog.revision);
 const asset=loadAnimatedAsset('indexed/umi/idle.json',catalog.revision,scratch);
 assert.equal(JSON.parse(asset.bytes).fixture,true);
 assert.match(asset.contentType,/application\/json/);
 assert.equal(loadAnimatedAsset('hires/idle/000.webp',catalog.revision,scratch).contentType,'image/webp');
 for(const path of ['../config.json','..\\config.json','/config.json','C:/config.json','indexed/umi/../../config.json','indexed/umi/rejected.json','catalog.json','hires/idle/missing.webp'])
  assert.equal(loadAnimatedAsset(path,catalog.revision,scratch),null,path);
 assert.equal(loadAnimatedAsset('indexed/umi/idle.json','stale-revision',scratch),null);
 } else {
  assert.throws(()=>loadAnimatedCatalog(scratch),/disabled/);
  assert.throws(()=>loadAnimatedAsset('indexed/umi/idle.json',catalog.revision,scratch),/disabled/);
 }
 const routes=new Map();
 apply({fiber:{id:'approved-motion-host-test'},on(){},inject(_deps,fn){fn({effect(cb){cb();},settings:{configure(){}},connection:{fetch:{register(spec){routes.set(spec.path,spec);return()=>routes.delete(spec.path);}}}});}});
 assert.ok(routes.has(ANIMATED_CATALOG_PATH));
 assert.ok(routes.has(ANIMATED_ASSET_PATH));
 const catalogResponse=await routes.get(ANIMATED_CATALOG_PATH).fetch(new Request('http://localhost'+ANIMATED_CATALOG_PATH));
 if (FULL_ANIMATION_EDITION) {
 assert.equal(catalogResponse.status,200,'Full-animation package serves its approved catalog');
 const actual=await catalogResponse.json();
 assert.equal(Object.keys(actual.clips).length,19,'17 approved loops plus 2 keyboard transitions');
 for(const clip of Object.values(actual.clips))assert.deepEqual(Object.keys(clip.indexed).sort(),['illustration','umi']);
 const first=actual.clips.idle.indexed.umi.file;
 const url='http://localhost'+ANIMATED_ASSET_PATH+'?path='+encodeURIComponent(first)+'&v='+encodeURIComponent(actual.revision);
 const response=await routes.get(ANIMATED_ASSET_PATH).fetch(new Request(url));
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/immutable/);
 assert.equal(response.headers.has('content-encoding'),false,'Stored gzip is not transparently decompressed by HTTP');
 const body=first.endsWith('.json')?await response.json():decodeApprovedMotionNodeResource(await response.arrayBuffer());assert.equal(body.clipId,'idle');
 if(first.endsWith('.uix.gz'))assert.match(response.headers.get('content-type'),/application\/gzip/);
 const unchanged=await routes.get(ANIMATED_ASSET_PATH).fetch(new Request(url,{headers:{'if-none-match':response.headers.get('etag')}}));
 assert.equal(unchanged.status,304);
 } else {
  assert.equal(catalogResponse.status,404,'HD-remaster cannot expose a complete-animation catalog');
  const denied=await routes.get(ANIMATED_ASSET_PATH).fetch(new Request('http://localhost'+ANIMATED_ASSET_PATH+'?path=indexed%2Fumi%2Fidle.uix.gz'));
  assert.equal(denied.status,404);
 }
 const invalid=await routes.get(ANIMATED_ASSET_PATH).fetch(new Request('http://localhost'+ANIMATED_ASSET_PATH+'?path=..%2Fconfig.json'));
 assert.equal(invalid.status,404);
 console.log(`Approved motion Host: ${FULL_ANIMATION_EDITION?'19 illustration clips, binary/JSON/WebP, ETag and path gates':'HD-remaster catalog/asset denial'} passed.`);
} finally {
 assert.ok(resolve(scratch).startsWith(testRoot+sep),'Temporary cleanup remains within stage/work');
 await rm(scratch,{recursive:true,force:true});
}
