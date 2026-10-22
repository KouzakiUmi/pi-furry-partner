import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadTitleBranding} from '../lib/index.js';
let shippedMetadata=null;
try { shippedMetadata=JSON.parse(await readFile(new URL('../assets/branding/title.json',import.meta.url),'utf8')); } catch { /* Static-only distribution. */ }
if(shippedMetadata?.animation?.qa?.accepted===true) {
 const shipped=loadTitleBranding();
 assert.equal(shipped.animated,true,'A shipped approved title loop must pass the real host loader');
 assert.equal(createHash('sha256').update(shipped.bytes).digest('hex'),shippedMetadata.animation.sha256);
}
const folder=await mkdtemp(join(tmpdir(),'umi-branding-test-'));
const png=await readFile(new URL('../assets/branding/umi-title.png',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
 await writeFile(join(folder,'umi-title.png'),png);
 assert.equal(png.readUInt32BE(16),shippedMetadata?.static?.approvedStaticRevision?640:1254);
 assert.equal(png.readUInt32BE(20),shippedMetadata?.static?.approvedStaticRevision?640:1254);
 assert.equal(png[25],6,'Original PNG is true RGBA, with alpha rather than a painted background');
 assert.equal(sha(png),shippedMetadata?.static?.sha256||'1f8b4a57fcfa360bdc869a41eec4015b0b7546838c3f4f7d1dce33fb4e046221','Published static PNG matches its approved-source export record');
 assert.deepEqual(loadTitleBranding('auto',folder).bytes,png,'No animation means original static image');
 // Tiny valid two-frame GIF fixture, assembled as binary rather than used as a
 // production data URI. Actual title images always travel through the host route.
 const head=Buffer.from([...Buffer.from('GIF89a'),1,0,1,0,0x80,0,0,0,0,0,255,255,255]);
 const frame=Buffer.from([0x21,0xf9,4,1,10,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0]);
 const gif=Buffer.concat([head,frame,frame,Buffer.from([0x3b])]);
 await writeFile(join(folder,'umi-title-wave.gif'),gif);
 const approved={schemaVersion:1,animation:{file:'umi-title-wave.gif',sha256:sha(gif),qa:{accepted:true}}};
 const metadata=async value=>writeFile(join(folder,'title.json'),JSON.stringify(value));
 await metadata(approved);const animated=loadTitleBranding('auto',folder);
 assert.equal(animated.animated,true);assert.equal(animated.contentType,'image/gif');assert.deepEqual(animated.bytes,gif);
 assert.deepEqual(loadTitleBranding('static',folder).bytes,png,'Static query cannot be overridden by an approved loop');
 for(const bad of [
  {...approved,animation:{...approved.animation,qa:{accepted:false}}},
  {...approved,animation:{...approved.animation,sha256:'0'.repeat(64)}},
  {...approved,animation:{...approved.animation,file:'../../outside.gif'}},
 ]) {await metadata(bad);assert.deepEqual(loadTitleBranding('auto',folder).bytes,png);}
 await writeFile(join(folder,'umi-title-wave.gif'),Buffer.concat([head,frame,Buffer.from([0x3b])]));
 await metadata({...approved,animation:{...approved.animation,sha256:sha(await readFile(join(folder,'umi-title-wave.gif')))}});
 assert.deepEqual(loadTitleBranding('auto',folder).bytes,png,'A single-frame file cannot masquerade as a reviewed animation');
 const webp=await readFile(new URL('./fixtures/title-two-frame.webp',import.meta.url));
 await writeFile(join(folder,'umi-title-wave.webp'),webp);
 await metadata({schemaVersion:1,animation:{file:'umi-title-wave.webp',sha256:sha(webp),qa:{accepted:true}}});
 const animatedWebp=loadTitleBranding('auto',folder);assert.equal(animatedWebp.animated,true);assert.equal(animatedWebp.contentType,'image/webp');
 assert.deepEqual(animatedWebp.bytes,webp);assert.notEqual(animatedWebp.etag,animated.etag,'Each independent image revision has its own ETag');
 assert.equal(loadTitleBranding('../outside',folder),null);
 console.log('DSH title media: original RGBA PNG, independent reviewed animation, SHA/type/frame checks, fixed path allowlist and static fallback passed.');
} finally {await rm(folder,{recursive:true,force:true});}
