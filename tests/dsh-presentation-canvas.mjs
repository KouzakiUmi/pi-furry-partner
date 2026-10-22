import assert from 'node:assert/strict';
const before=globalThis.window;let entry;
globalThis.window={devicePixelRatio:1,innerWidth:1334,innerHeight:1057,__ModuleLoader__:{load:e=>entry=e}};
try {
 await import(new URL('../lib/client.js?presentation-canvas',import.meta.url));
 const plugin=entry.factory(()=>({}));let effects=[],calls=[],stack=[],matrix={s:1,x:0,y:0};
 const context={clearRect(){},save(){stack.push({...matrix})},restore(){matrix=stack.pop()},
  translate(x,y){matrix.x+=x*matrix.s;matrix.y+=y*matrix.s},scale(x,y){assert.equal(x,y,'Only uniform display scaling');matrix.s*=x},
  rotate(){throw new Error('No invented rotation on whole video')},
  drawImage(_bmp,x,y,w,h){calls.push({alpha:context.globalAlpha,x:matrix.x+x*matrix.s,y:matrix.y+y*matrix.s,w:w*matrix.s,h:h*matrix.s})}};
 const canvas={width:0,height:0,getContext:()=>context};
 const state={revision:1,settings:{style:'umi',size:'normal',scale:1,language:'en',enabled:true,animation:true,companionship:'off'},
  visual:{sheet:{width:240}},hiResReady:true,ui:{xRatio:.9,yRatio:.76},snapshot:{phase:'searching',face:'search',label:'Searching'}};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
  useSyncExternalStore:(_sub,get)=>get(),useRef:()=>({current:canvas}),useEffect:fn=>effects.push(fn),
  useState:init=>[typeof init==='function'?init():init,()=>{}]};
 const controller={getSnapshot:()=>state,subscribe:()=>()=>{},getRenderLayer:()=>({bitmap:{},width:640,height:640,
  transform:null,display:{scale:1.3,x:-148,y:-152,opacity:.84,profile:'search'}})};
 const components=plugin.createMascotComponents(React,controller);
 const node=components.MascotCanvas({size:196,desktop:true});canvas.width=node.props.width;canvas.height=node.props.height;
 for(const effect of effects)effect();
 assert.equal(node.props.width,928);assert.equal(node.props.height,928);
 assert.equal(node.props.style.position,'absolute');assert.equal(node.props.style.pointerEvents,'none');
 assert.equal(node.props.style.width,'284.2px');assert.equal(node.props.style.left,'-58.8px');
 assert.equal(calls.length,1,'One real source frame, no frame blending');assert.equal(calls[0].alpha,.84,'Entrance fades only the single current image');
 const draw=calls[0];assert.ok(draw.x>=0 && draw.y>=0 && draw.x+draw.w<=canvas.width && draw.y+draw.h<=canvas.height,'Entire source frame survives expanded canvas');
 effects=[];calls=[];matrix={s:1,x:0,y:0};
 const hero=components.MascotCanvas({size:84});canvas.width=hero.props.width;canvas.height=hero.props.height;
 for(const effect of effects)effect();
 assert.equal(hero.props.style.width,'84px');assert.equal(hero.props.style.position,undefined,'Small header slot never receives floating overflow');
 assert.equal(calls[0].x,0);assert.equal(calls[0].y,0);assert.equal(calls[0].w,640);
 const overlay=components.FloatingMascotOverlay({});
 function find(node,test){if(test(node))return node;for(const child of node?.children||[])if(child&&typeof child==='object'){const v=find(child,test);if(v)return v;}}
 const wrap=find(overlay,n=>n?.props?.className==='furry-dsh-canvas-wrap');
 assert.equal(wrap.props.style.width,'196px');assert.equal(wrap.props.style.height,'196px','Interaction footprint stays at saved size');
 const floating=find(overlay,n=>n?.type===components.MascotCanvas);assert.equal(floating.props.desktop,true);
 console.log('DSH actual canvas: uniform display matrix, one untouched video frame, full overflow coverage, pointer-transparent paint and stable interactive footprint passed.');
} finally {if(before===undefined)delete globalThis.window;else globalThis.window=before;}
