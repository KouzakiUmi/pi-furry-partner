// Historical source approval tests intentionally inspect the immutable pre-color source29.
// Current shipped derivatives are checked separately by approved-color-derivative.mjs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
export const HISTORICAL_COLOR_SOURCE='Hi-Res/production/color-consistency-20261024/source29';
export function readHistoricalColorSource(root,path){
 const base=resolve(root,'assets/animated'),rel=relative(base,resolve(path)).split(sep).join('/');
 const frozen=rel==='catalog.json'||rel.startsWith('hires/')||rel.startsWith('indexed/');
 return readFileSync(frozen?resolve(root,HISTORICAL_COLOR_SOURCE,rel):path);
}
export function loadHistoricalColorSourceCatalog(root){
 const bytes=readHistoricalColorSource(root,resolve(root,'assets/animated/catalog.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'f8de911e18da73a6d091a9193c667dfcf6350374c0509b5c1c69c82b133150c1','Historical pixel tests require the exact frozen pre-color29 catalog');
 return JSON.parse(bytes);
}
