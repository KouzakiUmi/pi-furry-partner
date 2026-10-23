import assert from 'node:assert/strict';
import {loadEncodedSheet} from '../lib/index.js';
const names=['window','setTimeout','clearTimeout'];const before=Object.fromEntries(names.map(n=>[n,globalThis[n]]));
let entry,clock=0,timerSerial=0,controller;const timers=new Map(),cleanups=[];
function store(initial){let value=initial;const subs=new Set();return {getSnapshot:()=>value,subscribe:fn=>{subs.add(fn);return()=>subs.delete(fn)},set:next=>{value=next;for(const fn of [...subs])fn()},subs};}
const flush=async()=>{for(let n=0;n<100;n++)await Promise.resolve();};
try {
 globalThis.window={__ModuleLoader__:{load:e=>entry=e}};
 globalThis.setTimeout=(fn,ms)=>{const id=++timerSerial;timers.set(id,{fn,ms});return id};globalThis.clearTimeout=id=>timers.delete(id);
 await import(new URL('../lib/client.js?root-input-observer',import.meta.url));const plugin=entry.factory(()=>({}));
 const fetchImpl=async(url,init)=>{const path=String(url);
  if(path.includes('/config'))return {ok:true,json:async()=>({style:'umi-pixel',language:'en',companionship:'off'})};
  return {ok:true,json:async()=>loadEncodedSheet('umi-pixel')};};
 controller=plugin.createMascotController({fetchImpl,now:()=>clock});
 const list=store({activeId:'A'}),draftA=store({draft:''}),draftB=store({draft:''});
 const ctxA={tag:'A'},ctxB={tag:'B'},events=new Set();
 const binding=id=>({ctx:id==='A'?ctxA:ctxB,eventSource:{subscribe:fn=>{events.add(fn);return()=>events.delete(fn)}},session:store({id,status:'idle'})});
 const slots=new Map(),effect=fn=>{const off=fn();if(typeof off==='function')cleanups.push(off)};
 const sessions={list,binding};let reads=0;
 const conversation={input:{for:ctx=>{reads++;assert.ok(ctx===ctxA||ctx===ctxB);return {state:ctx===ctxA?draftA:draftB,
  setDraft(){throw new Error('Observer cannot edit input')},submit(){throw new Error('Observer cannot submit input')}}}}};
 const ctx={effect,slots:{inject:(_slot,fn)=>effect(fn),register:spec=>{slots.set(spec.name,spec);return()=>slots.delete(spec.name)}},
  inject:(_deps,fn)=>fn({sessions,conversation,effect})};
 const React={createElement:()=>null};plugin.bindDshRuntime(ctx,React,controller,{});await flush();
 assert.equal([...slots.keys()].some(name=>name.startsWith('conversation.input.')),false);
 assert.equal(draftA.subs.size,1);controller.activity.start({wake:false});controller.notifyChange();
 draftA.set({draft:'a local draft'});assert.equal(controller.getSnapshot().snapshot.reaction,'listening','Typing reaction survives removal of the input-row chip');
 list.set({activeId:'B'});assert.equal(draftA.subs.size,0);assert.equal(draftB.subs.size,1);
 assert.notEqual(controller.getSnapshot().snapshot.reaction,'listening','Session switch clears the former draft reaction');
 draftB.set({draft:'another draft'});assert.equal(controller.getSnapshot().snapshot.reaction,'listening');
 list.set({activeId:null});assert.equal(draftB.subs.size,0);assert.notEqual(controller.getSnapshot().snapshot.reaction,'listening');
 // A static hero mark or its registration subscriber must not keep the pet's
 // JavaScript animation timer alive after the floating pet is disabled.
 let settingsEvents=0;const offSettings=controller.subscribeSettings(()=>settingsEvents++);
 controller.notifyChange();assert.equal(settingsEvents,0,'Title subscription never receives activity redraws');
 controller.applySettingsLocal({enabled:false,heroMark:true});controller.notifyChange();assert.equal(settingsEvents,1);offSettings();
 assert.equal(timers.size,0);assert.equal(controller.getSnapshot().settings.composerPill,undefined);
 assert.ok(reads>=2);for(const dispose of cleanups.reverse())dispose();
 assert.equal(draftA.subs.size,0);assert.equal(draftB.subs.size,0);assert.equal(list.subs.size,0);assert.equal(timers.size,0);
 console.log('DSH root input observer: no composer slot, read-only local typing reaction, session switch/disposal cleanup and static-title-only zero timers passed.');
} finally {controller?.dispose();for(const n of names)if(before[n]===undefined)delete globalThis[n];else globalThis[n]=before[n];}
