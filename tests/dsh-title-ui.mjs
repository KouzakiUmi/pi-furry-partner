import assert from 'node:assert/strict';
const saved=globalThis.window;let entry;
globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
try {
 await import(new URL('../lib/client.js?independent-title-ui',import.meta.url));
 const plugin=entry.factory(()=>({}));
 const forbidden=()=>{throw new Error('Independent title must not read activity, subscribe, poke, use canvas or schedule animation');};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
  useSyncExternalStore:forbidden,useEffect:forbidden,useState:forbidden,useRef:forbidden};
 const components=plugin.createMascotComponents(React,{getSnapshot:forbidden,subscribe:forbidden,poke:forbidden,getRenderLayer:forbidden});
 const node=components.HeroMascotMark({size:112});
 const picture=node.children[0],img=picture.children.find(n=>n.type==='img'),source=picture.children.find(n=>n.type==='source');
 assert.equal(img.props.src,'/api/furry-partner/branding/title');assert.equal(img.props.width,112);assert.equal(img.props.height,112);
 assert.equal(img.props.style.objectFit,'contain');assert.equal(img.props.draggable,false);
 assert.equal(img.props.onClick,undefined);assert.equal(node.props.onClick,undefined);
 assert.equal(source.props.media,'(prefers-reduced-motion: reduce)');assert.match(source.props.srcSet,/variant=static/);
 assert.equal(JSON.stringify(node).includes('canvas'),false);assert.equal(components.ComposerMascotPill,undefined);
 const image={src:img.props.src,dataset:{}};img.props.onError({currentTarget:image});assert.match(image.src,/variant=static/);
 image.src='do-not-loop';img.props.onError({currentTarget:image});assert.equal(image.src,'do-not-loop','Broken static fallback cannot trigger an endless retry loop');
 console.log('DSH title UI: independent routed img, no activity/React animation hooks, no canvas/poke, reduced-motion/static fallback and no composer component passed.');
} finally {if(saved===undefined)delete globalThis.window;else globalThis.window=saved;}
