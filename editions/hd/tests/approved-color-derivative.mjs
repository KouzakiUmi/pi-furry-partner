// Exact current color derivatives are separate from historical original-source approval tests.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=spawnSync('python',[resolve(root,'tools/verify-approved-color-consistency.py')],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,timeout:600000});
assert.equal(result.status,0,result.stderr||result.error?.message);
const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));
assert.equal(proof.passed,true);assert.equal(proof.clipCount,29);assert.equal(proof.HDWholeRGBAFrames,3048);assert.equal(proof.HDAlphaAndAlpha0RGBExact,true);assert.equal(proof.PiOriginalNoncolorMetadataExact,true);assert.equal(proof.sameReviewedCommonPalette,true);assert.equal(proof.workInputsRequired,false);
console.log('Current approved color derivatives:',JSON.stringify(proof));
