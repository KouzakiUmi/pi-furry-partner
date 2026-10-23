import assert from 'node:assert/strict';
import {createQuickActions} from '../lib/quick-actions.mjs';
let busy=false,blocked=false,choice='all',calls=[],stage=0;
const context={isIdle:()=>!busy,ui:{notify(){},select:async(title,labels)=>{
 stage++;
 if(stage===1)return labels.find(label=>/Play a little gesture/.test(label));
 if(choice==='cancel')return undefined;
 return labels.find(label=>choice==='all'?label==='Show me every gesture':label==='Nuzzle');
}}};
const menu=createQuickActions({ctx:context,pi:{},getEditor:()=>({}),showDetails(){},
 getLanguage:()=> 'en',isBlocked:()=>blocked,onGesture:id=>{calls.push(id);return true;}});
assert.equal(await menu.run(),true);assert.deepEqual(calls,['all']);
stage=1;choice='nuzzle';assert.equal(await menu.run('gestures'),true);assert.deepEqual(calls,['all','nuzzle']);
stage=1;choice='cancel';assert.equal(await menu.run('gestures'),false);assert.equal(calls.length,2);
busy=true;assert.equal(await menu.run('gestures'),false);assert.equal(calls.length,2);
busy=false;blocked=true;assert.equal(await menu.run('gestures'),false);
blocked=false;
context.ui.select=async()=>{busy=true;return 'Show me every gesture';};
assert.equal(await menu.run('gestures'),false,'An agent starting while the picker is open takes priority');
assert.equal(calls.length,2);
menu.dispose();assert.equal(await menu.run('gestures'),false);
console.log('Gesture menu: localized catalogue, loop/single actions, cancellation, busy/overlay guards and disposal passed.');
